import { normalizeOpenAiBaseUrl } from "./builtin/imageGenerationClient";
import type { AiProfile } from "./aiProfiles";

type ModelsResponse = { data?: Array<{ id?: string }> };

export type AiConnectionTestResult = {
  modelFound: boolean;
  message: string;
};

export const testAiConnection = async (
  profile: AiProfile,
  modelKind: "chat" | "image",
  timeoutMs = 15_000,
): Promise<AiConnectionTestResult> => {
  const model = (modelKind === "image" ? profile.imageModel : profile.chatModel).trim();
  if (!model) throw new Error("Choose a model before testing this connection.");
  if (profile.providerId !== "custom" && !profile.apiKey.trim()) throw new Error("Add an API key before testing this connection.");
  let response: Response;
  try {
    response = await fetch(`${normalizeOpenAiBaseUrl(profile.baseUrl)}/models`, {
      headers: profile.apiKey.trim() ? { Authorization: `Bearer ${profile.apiKey.trim()}` } : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") throw new Error("The provider did not respond within 15 seconds.");
    throw new Error("Could not reach this provider. Check the endpoint and your network connection.");
  }
  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.clone().json();
      detail = typeof body?.error?.message === "string" ? body.error.message : typeof body?.message === "string" ? body.message : "";
    } catch {
      // Status text is enough when the endpoint does not return JSON.
    }
    if (response.status === 401 || response.status === 403) throw new Error("The provider rejected this API key.");
    throw new Error(detail || `The provider returned ${response.status} while listing models.`);
  }
  const body = await response.json() as ModelsResponse;
  const returnedIds = Array.isArray(body.data) ? body.data.map((item) => item.id).filter(Boolean) : [];
  if (returnedIds.length === 0) return { modelFound: false, message: "Connected, but the provider returned no model list." };
  if (!returnedIds.includes(model)) return { modelFound: false, message: `Connected, but ${model} was not found for this key.` };
  return { modelFound: true, message: `Connected. ${model} is available.` };
};
