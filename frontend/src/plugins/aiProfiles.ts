export type AiProfile = {
  id: string;
  name: string;
  providerId: string;
  baseUrl: string;
  apiKey: string;
  chatModel: string;
  imageModel: string;
};

export type AiProfileKind = "general" | "image";

export const GENERAL_AI_PROVIDERS = [
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "togetherai", name: "Together AI", baseUrl: "https://api.together.xyz/v1" },
  { id: "groq", name: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
  { id: "fireworks-ai", name: "Fireworks AI", baseUrl: "https://api.fireworks.ai/inference/v1" },
  { id: "xai", name: "xAI", baseUrl: "https://api.x.ai/v1" },
  { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com" },
  { id: "custom", name: "Custom / local", baseUrl: "http://localhost:11434/v1" },
] as const;

export const IMAGE_AI_PROVIDERS = [
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { id: "xai", name: "xAI", baseUrl: "https://api.x.ai/v1" },
  { id: "custom", name: "Custom / local", baseUrl: "http://localhost:11434/v1" },
] as const;

const GENERAL_KEY = "localdraw.ai-profiles.v1";
const GENERAL_ACTIVE_KEY = "localdraw.ai-profile-active.v1";
const IMAGE_KEY = "localdraw.image-ai-profiles.v1";
const IMAGE_ACTIVE_KEY = "localdraw.image-ai-profile-active.v1";

export const defaultAiProfile = (): AiProfile => ({
  id: crypto.randomUUID(),
  name: "OpenAI",
  providerId: "openai",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  chatModel: "gpt-5.2",
  imageModel: "gpt-image-2",
});

export const defaultImageAiProfile = (): AiProfile => ({
  ...defaultAiProfile(),
  name: "OpenAI Images",
  chatModel: "",
});

const keysFor = (kind: AiProfileKind) => kind === "image"
  ? { profiles: IMAGE_KEY, active: IMAGE_ACTIVE_KEY }
  : { profiles: GENERAL_KEY, active: GENERAL_ACTIVE_KEY };

export const providersFor = (kind: AiProfileKind) => kind === "image" ? IMAGE_AI_PROVIDERS : GENERAL_AI_PROVIDERS;

export const providerFor = (providerId: string, kind: AiProfileKind = "general") => {
  const providers = providersFor(kind);
  return providers.find((provider) => provider.id === providerId) || providers.at(-1)!;
};

export const readAiProfiles = (kind: AiProfileKind = "general"): AiProfile[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(keysFor(kind).profiles) || "[]");
    return Array.isArray(parsed) && parsed.length ? parsed : [kind === "image" ? defaultImageAiProfile() : defaultAiProfile()];
  } catch {
    return [kind === "image" ? defaultImageAiProfile() : defaultAiProfile()];
  }
};

export const writeAiProfiles = (profiles: AiProfile[], kind: AiProfileKind = "general"): void => localStorage.setItem(keysFor(kind).profiles, JSON.stringify(profiles));
export const readActiveAiProfileId = (kind: AiProfileKind = "general"): string | null => localStorage.getItem(keysFor(kind).active);
export const writeActiveAiProfileId = (id: string, kind: AiProfileKind = "general"): void => localStorage.setItem(keysFor(kind).active, id);
