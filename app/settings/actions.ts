"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { testConnection } from "@/lib/ai";
import { decrypt, encrypt, hint } from "@/lib/crypto";
import type { ProviderId } from "@/lib/providers";

export async function saveSettings(
  provider: ProviderId,
  model: string,
  apiKey?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let key = apiKey?.trim();
  const existing = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
  if (!key) {
    if (!existing?.apiKeyEnc) return { ok: false, error: "Enter an API key first." };
    key = decrypt(existing.apiKeyEnc);
  }

  // Test BEFORE storing — a saved key that doesn't work is worse than none.
  const test = await testConnection(provider, model, key);
  if (!test.ok) return { ok: false, error: test.error };

  await prisma.appSettings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton", provider, model,
      apiKeyEnc: encrypt(key), apiKeyHint: hint(key),
    },
    update: { provider, model, apiKeyEnc: encrypt(key), apiKeyHint: hint(key) },
  });
  revalidatePath("/settings");
  return { ok: true };
}

export async function removeKey() {
  await prisma.appSettings
    .update({
      where: { id: "singleton" },
      data: { apiKeyEnc: null, apiKeyHint: null },
    })
    .catch(() => {});
  revalidatePath("/settings");
}
