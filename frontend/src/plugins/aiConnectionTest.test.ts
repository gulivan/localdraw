import { afterEach, describe, expect, it, vi } from "vitest";
import { testAiConnection } from "./aiConnectionTest";

const profile = {
  id: "profile",
  name: "DeepSeek",
  providerId: "deepseek",
  baseUrl: "https://api.deepseek.com",
  apiKey: "secret",
  chatModel: "deepseek-chat",
  imageModel: "",
};

describe("AI connection test", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("checks authorization and the selected model through the models endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: "deepseek-chat" }] }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(testAiConnection(profile, "chat")).resolves.toEqual({ modelFound: true, message: "Connected. deepseek-chat is available." });
    expect(fetchMock).toHaveBeenCalledWith("https://api.deepseek.com/models", expect.objectContaining({ headers: { Authorization: "Bearer secret" } }));
  });

  it("reports accepted credentials when the selected model is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: "deepseek-reasoner" }] }), { status: 200, headers: { "Content-Type": "application/json" } })));
    await expect(testAiConnection(profile, "chat")).resolves.toMatchObject({ modelFound: false });
  });

  it("turns rejected credentials into a focused error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "invalid key" } }), { status: 401, headers: { "Content-Type": "application/json" } })));
    await expect(testAiConnection(profile, "chat")).rejects.toThrow("rejected this API key");
  });
});
