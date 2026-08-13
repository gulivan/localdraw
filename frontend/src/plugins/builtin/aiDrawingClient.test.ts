import { afterEach, describe, expect, it, vi } from "vitest";
import { AiProviderError, generateDrawingElements } from "./aiDrawingClient";

const profile = {
  id: "profile-1",
  name: "OpenAI",
  providerId: "openai",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "test-key",
  chatModel: "gpt-5.2",
  imageModel: "gpt-image-2",
};

describe("AI drawing client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns editable element skeletons", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ elements: [{ type: "rectangle", x: 0, y: 0, width: 100, height: 80 }] }) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    await expect(generateDrawingElements(profile, "Draw a box")).resolves.toEqual([
      { type: "rectangle", x: 0, y: 0, width: 100, height: 80 },
    ]);
  });

  it("turns an unauthorized response into an actionable configuration error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: "Incorrect API key provided" },
    }), { status: 401, headers: { "Content-Type": "application/json" } })));

    const request = generateDrawingElements(profile, "Draw a box");
    await expect(request).rejects.toThrow("Check the connection used by AI drawing");
    await expect(request).rejects.toMatchObject<Partial<AiProviderError>>({ status: 401 });
  });
});
