import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GENERAL_AI_PROVIDERS,
  IMAGE_AI_PROVIDERS,
  readActiveAiProfileId,
  readAiProfiles,
  writeActiveAiProfileId,
  writeAiProfiles,
} from "./aiProfiles";

describe("AI profile stores", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("crypto", { randomUUID: () => "generated-id" });
    vi.stubGlobal("localStorage", {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps general and image providers independent", () => {
    writeAiProfiles([{ id: "general", name: "DeepSeek", providerId: "deepseek", baseUrl: "https://api.deepseek.com", apiKey: "general-key", chatModel: "deepseek-chat", imageModel: "" }], "general");
    writeAiProfiles([{ id: "image", name: "OpenAI Images", providerId: "openai", baseUrl: "https://api.openai.com/v1", apiKey: "image-key", chatModel: "", imageModel: "gpt-image-2" }], "image");
    writeActiveAiProfileId("general", "general");
    writeActiveAiProfileId("image", "image");

    expect(readAiProfiles("general")[0].apiKey).toBe("general-key");
    expect(readAiProfiles("image")[0].apiKey).toBe("image-key");
    expect(readActiveAiProfileId("general")).toBe("general");
    expect(readActiveAiProfileId("image")).toBe("image");
  });

  it("offers DeepSeek only for general AI", () => {
    expect(GENERAL_AI_PROVIDERS.map((provider) => provider.id)).toContain("deepseek");
    expect(IMAGE_AI_PROVIDERS.map((provider) => provider.id)).not.toContain("deepseek");
  });
});
