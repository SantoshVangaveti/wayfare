/** Browser-only. Shrinks a photo before it is sent to a Server Action.
 *
 *  A raw phone screenshot is 4–6 MB, and base64 inflates it by a third on the
 *  way to the server — comfortably past the request body limit, where the
 *  action dies before it ever reaches our code. A booking screenshot only ever
 *  needs to be legible to a vision model, so we cap the longest edge and
 *  re-encode as JPEG. A 5 MB screenshot lands around 200–400 KB.
 *
 *  Only images are re-encoded. A PDF passes through byte-for-byte — its text
 *  layer is what gets read, and re-encoding would destroy it. */

const MAX_EDGE = 1600;
const QUALITY = 0.8;

/** Hard ceiling on the data URL we hand to a Server Action. Well under the
 *  smallest request body limit we might land on. */
export const MAX_UPLOAD_CHARS = 3_500_000;

/** Progressively harder squeezes, in case the first pass is still too big. */
const PASSES: { edge: number; quality: number }[] = [
  { edge: MAX_EDGE, quality: QUALITY },
  { edge: 1200, quality: 0.7 },
  { edge: 900, quality: 0.6 },
];

async function decode(file: File): Promise<
  { width: number; height: number; draw: CanvasImageSource; done: () => void }
> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: bitmap,
      done: () => bitmap.close(),
    };
  }
  // Safari fallback.
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("could not decode image"));
      el.src = url;
    });
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: img,
      done: () => URL.revokeObjectURL(url),
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("could not read file"));
    reader.readAsDataURL(file);
  });
}

/** Returns a JPEG data URL under MAX_UPLOAD_CHARS, or throws if the image
 *  can't be decoded or won't shrink far enough. */
export async function shrinkImageToDataUrl(file: File): Promise<string> {
  const source = await decode(file);
  try {
    const longest = Math.max(source.width, source.height);

    for (const pass of PASSES) {
      const scale = Math.min(1, pass.edge / longest);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(source.width * scale));
      canvas.height = Math.max(1, Math.round(source.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas context");
      // JPEG has no alpha — paint white so transparent screenshots don't
      // come out with black behind the text.
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(source.draw, 0, 0, canvas.width, canvas.height);

      const out = canvas.toDataURL("image/jpeg", pass.quality);
      if (out.length <= MAX_UPLOAD_CHARS) return out;
    }

    throw new Error("image is still too large after resizing");
  } finally {
    source.done();
  }
}

/** Images get shrunk and capped; a small PDF is read byte-for-byte, because
 *  its text layer is the whole point. Throws if the image can't be made small
 *  enough — the caller shows that to the user. */
export async function fileToUploadDataUrl(file: File): Promise<string> {
  if (file.type.startsWith("image/")) return shrinkImageToDataUrl(file);
  return readAsDataUrl(file);
}

/** A PDF's own text, pulled out in the browser.
 *
 *  Airline and hotel PDFs are routinely 1–5 MB, and base64 pushes them past
 *  the request body limit — the upload dies before any of our code runs. The
 *  words are all we actually need, so we read them here and send a few KB of
 *  text instead of megabytes of document. pdfjs is imported only when someone
 *  actually drops a PDF, so nobody else pays for it.
 *
 *  Returns null when there is no text layer (a scan), so the caller can fall
 *  back to uploading it as an image. */
export async function pdfToText(file: File): Promise<string | null> {
  try {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await getDocumentProxy(bytes);
    const { text } = await extractText(doc, { mergePages: true });
    const out = String(text).replace(/\s+\n/g, "\n").trim();
    return out.length >= 20 ? out.slice(0, 20_000) : null;
  } catch {
    return null;
  }
}
