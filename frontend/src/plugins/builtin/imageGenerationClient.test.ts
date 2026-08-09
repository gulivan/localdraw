import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { IMMEDIATELY: "immediately" },
  convertToExcalidrawElements: vi.fn(),
  exportToBlob: vi.fn(),
}));
import {
  buildImagePrompt,
  describeSelectedElements,
  exportSelectedElements,
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
      selectionContext: '- rectangle labeled "ICE CUBE"',
    });
    expect(fetchMock).toHaveBeenCalledWith("https://provider.example/v1/images/edits", expect.objectContaining({ method: "POST" }));
    const request = fetchMock.mock.calls[0][1];
    expect(request.body).toBeInstanceOf(FormData);
    expect(request.body.get("model")).toBe("gpt-image-2");
    expect(request.body.get("prompt")).toContain("Refine this sketch");
    expect(request.body.get("prompt")).toContain('rectangle labeled "ICE CUBE"');
    expect(request.body.get("prompt")).toContain("treat a label as the identity or meaning of its surrounding shape");
    expect(request.body.get("image")).toBeInstanceOf(File);
  });

  it("surfaces provider API errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: "Your image request was rejected" },
    }), { status: 400, headers: { "Content-Type": "application/json" } })));
    await expect(generateImage({
      config: { apiKey: "test-key", baseUrl: "https://api.openai.com/v1", model: "gpt-image-2" },
      prompt: "Rejected prompt",
    })).rejects.toThrow("Your image request was rejected");
  });

  it("times out a stalled provider request", async () => {
    vi.stubGlobal("fetch", vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    })));
    await expect(generateImage({
      config: { apiKey: "test-key", baseUrl: "https://api.openai.com/v1", model: "gpt-image-2" },
      prompt: "Stalled prompt",
      timeoutMs: 5,
    })).rejects.toThrow("timed out after 3 minutes");
  });

  it("describes text inside a selected shape as its semantic label", () => {
    const api = {
      getAppState: () => ({ selectedElementIds: { rectangle: true } }),
      getSceneElements: () => [
        { id: "rectangle", type: "rectangle", x: 10, y: 20, width: 220, height: 140, boundElements: [] },
        { id: "label", type: "text", text: "ICE CUBE", x: 70, y: 75, width: 90, height: 24 },
        { id: "outside", type: "text", text: "ignore me", x: 400, y: 400, width: 90, height: 24 },
      ],
    };
    expect(describeSelectedElements(api)).toBe('- rectangle labeled "ICE CUBE"');
  });

  it("does not alter prompts without selected canvas context", () => {
    expect(buildImagePrompt("  A paper airplane  ")).toBe("A paper airplane");
  });

  it("includes selected canvas images and their files in the visual reference", async () => {
    const excalidraw = await import("@excalidraw/excalidraw");
    const reference = new Blob(["selection"], { type: "image/png" });
    vi.mocked(excalidraw.exportToBlob).mockResolvedValue(reference);
    const image = { id: "image", type: "image", fileId: "file-1", x: 0, y: 0, width: 320, height: 200 };
    const files = { "file-1": { id: "file-1", dataURL: "data:image/png;base64,cG5n" } };
    const result = await exportSelectedElements({
      getAppState: () => ({ selectedElementIds: { image: true } }),
      getSceneElements: () => [image, { id: "other", type: "rectangle", x: 500, y: 0, width: 100, height: 100 }],
      getFiles: () => files,
    });
    expect(result).toBe(reference);
    expect(excalidraw.exportToBlob).toHaveBeenCalledWith(expect.objectContaining({ elements: [image], files }));
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
