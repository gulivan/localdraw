import { normalizeOpenAiBaseUrl } from "./imageGenerationClient";
import type { AiProfile } from "../aiProfiles";

const SYSTEM_PROMPT = `You create Excalidraw elements for LocalDraw. Return only a JSON object with an "elements" array. Each element may be rectangle, ellipse, diamond, line, arrow, or text and must include type, x, y, width, height. Text elements also include text and fontSize. Use a clear layout, concise labels, and no markdown fences.`;

export class AiProviderError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AiProviderError";
    this.status = status;
  }
}

const readProviderError = async (response: Response): Promise<string | null> => {
  try {
    const body = await response.clone().json();
    const message = body?.error?.message ?? body?.message;
    return typeof message === "string" && message.trim() ? message.trim() : null;
  } catch {
    return null;
  }
};

export const generateDrawingElements = async (profile: AiProfile, prompt: string): Promise<Record<string, unknown>[]> => {
  if (!profile.chatModel.trim()) throw new Error("Choose a chat model first");
  const endpoint = `${normalizeOpenAiBaseUrl(profile.baseUrl)}/chat/completions`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(profile.apiKey.trim() ? { Authorization: `Bearer ${profile.apiKey.trim()}` } : {}),
    },
    body: JSON.stringify({
      model: profile.chatModel.trim(),
      messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: prompt.trim() }],
      response_format: { type: "json_object" },
    }),
  });
  if (!response.ok) {
    const providerMessage = await readProviderError(response);
    const message = response.status === 401
      ? "The AI provider rejected this API key. Check the connection used by AI drawing."
      : providerMessage || `AI provider returned ${response.status}`;
    throw new AiProviderError(response.status, message);
  }
  const body = await response.json();
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("AI provider returned no drawing");
  const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed?.elements) || parsed.elements.length === 0) throw new Error("AI response did not contain elements");
  return parsed.elements.slice(0, 300);
};
