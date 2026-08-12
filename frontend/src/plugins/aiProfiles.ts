export type AiProfile = {
  id: string;
  name: string;
  providerId: string;
  baseUrl: string;
  apiKey: string;
  chatModel: string;
  imageModel: string;
};

export const AI_PROVIDERS = [
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "togetherai", name: "Together AI", baseUrl: "https://api.together.xyz/v1" },
  { id: "groq", name: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
  { id: "fireworks-ai", name: "Fireworks AI", baseUrl: "https://api.fireworks.ai/inference/v1" },
  { id: "xai", name: "xAI", baseUrl: "https://api.x.ai/v1" },
  { id: "custom", name: "Custom / local", baseUrl: "http://localhost:11434/v1" },
] as const;

const KEY = "localdraw.ai-profiles.v1";
const ACTIVE_KEY = "localdraw.ai-profile-active.v1";

export const defaultAiProfile = (): AiProfile => ({
  id: crypto.randomUUID(),
  name: "OpenAI",
  providerId: "openai",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  chatModel: "gpt-5.2",
  imageModel: "gpt-image-2",
});

export const readAiProfiles = (): AiProfile[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(parsed) && parsed.length ? parsed : [defaultAiProfile()];
  } catch {
    return [defaultAiProfile()];
  }
};

export const writeAiProfiles = (profiles: AiProfile[]): void => localStorage.setItem(KEY, JSON.stringify(profiles));
export const readActiveAiProfileId = (): string | null => localStorage.getItem(ACTIVE_KEY);
export const writeActiveAiProfileId = (id: string): void => localStorage.setItem(ACTIVE_KEY, id);

export const providerFor = (providerId: string) => AI_PROVIDERS.find((provider) => provider.id === providerId) || AI_PROVIDERS.at(-1)!;
