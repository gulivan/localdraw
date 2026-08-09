import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { IMMEDIATELY: "immediately" },
  convertToExcalidrawElements: vi.fn(),
  exportToBlob: vi.fn(),
}));
import {
  generateImage,
  insertGeneratedImage,
  normalizeOpenAiBaseUrl,
} from "./imageGenerationClient";

describe("image generation client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("allows HTTPS providers and local development hosts", () => {
    expect(normalizeOpenAiBaseUrl("https://api.openai.com/v1/")).toBe("https://api.openai.com/v1");
    expect(normalizeOpenAiBaseUrl("http://localhost:11434/v1")).toBe("http://localhost:11434/v1");
    expect(() => normalizeOpenAiBaseUrl("http://provider.example/v1")).toThrow("must use HTTPS");
  });

  it("calls the OpenAI-compatible generation endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ b64_json: btoa("png") }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await generateImage({
      config: { apiKey: "test-key", baseUrl: "https://api.openai.com/v1", model: "gpt-image-2" },
      prompt: "A paper airplane",
    });
    expect(result.type).toBe("image/png");
    expect(fetchMock).toHaveBeenCalledWith("https://api.openai.com/v1/images/generations", expect.objectContaining({ method: "POST" }));
    const request = fetchMock.mock.calls[0][1];
    expect(JSON.parse(request.body)).toMatchObject({ model: "gpt-image-2", prompt: "A paper airplane" });
  });

  it("uses image edits when selected canvas content is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ b64_json: btoa("edited") }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await generateImage({
      config: { apiKey: "test-key", baseUrl: "https://provider.example/v1", model: "gpt-image-2" },
      prompt: "Refine this sketch",
      reference: new Blob(["png"], { type: "image/png" }),
    });
    expect(fetchMock).toHaveBeenCalledWith("https://provider.example/v1/images/edits", expect.objectContaining({ method: "POST" }));
    const request = fetchMock.mock.calls[0][1];
    expect(request.body).toBeInstanceOf(FormData);
    expect(request.body.get("model")).toBe("gpt-image-2");
    expect(request.body.get("prompt")).toBe("Refine this sketch");
    expect(request.body.get("image")).toBeInstanceOf(File);
  });

  it("adds the generated image beside the current selection", async () => {
    class MockReader {
      result: string | null = null;
      error: Error | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() {
        this.result = "data:image/png;base64,cG5n";
        this.onload?.();
      }
    }
    class MockImage {
      naturalWidth = 1024;
      naturalHeight = 512;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal("FileReader", MockReader);
    vi.stubGlobal("Image", MockImage);
    const excalidraw = await import("@excalidraw/excalidraw");
    vi.mocked(excalidraw.convertToExcalidrawElements).mockReturnValue([{ id: "generated-element", type: "image" }] as any);
    const api = {
      addFiles: vi.fn(),
      getAppState: vi.fn(() => ({ selectedElementIds: { selected: true } })),
      getSceneElements: vi.fn(() => [{ id: "selected", x: 10, y: 20, width: 100, height: 80 }]),
      getSceneElementsIncludingDeleted: vi.fn(() => [{ id: "selected" }]),
      updateScene: vi.fn(),
      scrollToContent: vi.fn(),
    };
    await insertGeneratedImage(api, new Blob(["png"], { type: "image/png" }));
    expect(api.addFiles).toHaveBeenCalledWith([expect.objectContaining({ dataURL: "data:image/png;base64,cG5n" })]);
    expect(excalidraw.convertToExcalidrawElements).toHaveBeenCalledWith([expect.objectContaining({ x: 158, y: 20, width: 720, height: 360 })]);
    expect(api.updateScene).toHaveBeenCalledWith(expect.objectContaining({
      elements: [{ id: "selected" }, { id: "generated-element", type: "image" }],
      appState: { selectedElementIds: { "generated-element": true } },
    }));
  });
});
