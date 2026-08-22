export type ProviderId = "google" | "anthropic" | "groq" | "openrouter";

export const PROVIDERS: Record<ProviderId, {
  label: string; keyUrl: string; keyPrefix: string;
  models: { id: string; label: string; free: boolean; vision: boolean }[];
}> = {
  google: {
    label: "Google Gemini", keyUrl: "https://aistudio.google.com/apikey", keyPrefix: "AIza",
    models: [
      { id: "gemini-3-flash",   label: "Gemini 3 Flash — free, 1,500/day", free: true, vision: true },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash — free, 1M TPM",  free: true, vision: true },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash — free",          free: true, vision: true },
    ],
  },
  anthropic: {
    label: "Anthropic Claude", keyUrl: "https://console.anthropic.com/settings/keys", keyPrefix: "sk-ant-",
    models: [
      { id: "claude-sonnet-5",  label: "Claude Sonnet 5 — best quality", free: false, vision: true },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 — cheap, fast", free: false, vision: true },
    ],
  },
  groq: {
    label: "Groq — fast, low token limits", keyUrl: "https://console.groq.com/keys", keyPrefix: "gsk_",
    models: [{ id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B — extraction only", free: true, vision: false }],
  },
  openrouter: {
    label: "OpenRouter", keyUrl: "https://openrouter.ai/keys", keyPrefix: "sk-or-",
    models: [{ id: "google/gemini-2.0-flash-exp:free", label: "Gemini 2.0 Flash (free)", free: true, vision: true }],
  },
};
export const DEFAULTS = { provider: "google" as ProviderId, model: "gemini-3-flash" };
