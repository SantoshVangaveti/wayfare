// The ONLY file that talks to an AI provider. Five call sites use askAI().
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "./db";
import { decrypt } from "./crypto";
import type { ProviderId } from "./providers";

export class AiNotConfigured extends Error {
  constructor() { super("No AI provider configured. Add a key in Settings."); }
}

async function config() {
  const s = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
  if (!s?.apiKeyEnc) throw new AiNotConfigured();
  return { provider: s.provider as ProviderId, model: s.model, apiKey: decrypt(s.apiKeyEnc) };
}

function buildModel(p: ProviderId, model: string, apiKey: string) {
  switch (p) {
    case "google":     return createGoogleGenerativeAI({ apiKey })(model);
    case "anthropic":  return createAnthropic({ apiKey })(model);
    // groq + openrouter: add @ai-sdk/groq and @openrouter/ai-sdk-provider when needed
    default:           return createGoogleGenerativeAI({ apiKey })(model);
  }
}

export async function askAI<T>(opts: {
  feature: string;                 // for the usage meter
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  images?: string[];               // data URLs or public URLs
  cache?: boolean;
  timeoutMs?: number;
}): Promise<T> {
  const { feature, system, prompt, schema, images, cache = true, timeoutMs = 20_000 } = opts;
  const { provider, model, apiKey } = await config();

  const key = crypto.createHash("sha256")
    .update([provider, model, system, prompt, ...(images ?? [])].join("|")).digest("hex");

  if (cache) {
    const hit = await prisma.aiCache.findUnique({ where: { key } });
    if (hit) {
      await prisma.aiUsage.create({
        data: { feature, provider, model, cached: true },
      }).catch(() => {});
      return hit.value as T;
    }
  }

  const messages = images?.length
    ? [{ role: "user" as const, content: [
        { type: "text" as const, text: prompt },
        ...images.map((image) => ({ type: "image" as const, image })),
      ] }]
    : undefined;

  const { object, usage } = await generateObject({
    model: buildModel(provider, model, apiKey),
    schema, system,
    ...(messages ? { messages } : { prompt }),
    abortSignal: AbortSignal.timeout(timeoutMs),
  });

  await Promise.all([
    cache ? prisma.aiCache.create({ data: { key, value: object as any } }).catch(() => {}) : null,
    prisma.aiUsage.create({ data: {
      feature, provider, model,
      inTokens: usage?.inputTokens ?? 0,
      outTokens: usage?.outputTokens ?? 0,
    } }).catch(() => {}),
  ]);
  return object;
}

export async function testConnection(provider: ProviderId, model: string, apiKey: string) {
  try {
    await generateObject({
      model: buildModel(provider, model, apiKey),
      schema: z.object({ ok: z.boolean() }),
      prompt: "Reply with ok: true",
      abortSignal: AbortSignal.timeout(15_000),
    });
    return { ok: true as const };
  } catch (e: any) {
    return { ok: false as const, error: e?.message ?? "Connection failed" };
  }
}
