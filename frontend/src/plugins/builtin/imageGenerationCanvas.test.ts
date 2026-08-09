import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { IMMEDIATELY: "immediately" },
  convertToExcalidrawElements: vi.fn(),
}));

import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import {
  createImageGenerationPlaceholders,
  failImageGenerationPlaceholder,
  recoverInterruptedImageGeneration,
  replaceImageGenerationPlaceholder,
  type ImageGenerationPlaceholder,
} from "./imageGenerationCanvas";

const placeholder: ImageGenerationPlaceholder = {
  elementIds: ["placeholder", "placeholder-label"],
  rectangleId: "placeholder",
  x: 100,
  y: 200,
  width: 384,
  height: 384,
};

describe("image generation canvas placeholders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("places multiple loading frames beside the current selection", async () => {
    let call = 0;
    vi.mocked(convertToExcalidrawElements).mockImplementation((skeletons: any) => {
      const rectangle = skeletons[0];
      const id = `placeholder-${call++}`;
      return [
        { ...rectangle, id, type: "rectangle", isDeleted: false },
        { id: `${id}-label`, type: "text", isDeleted: false },
      ] as any;
    });
    const api = {
      getAppState: () => ({ selectedElementIds: { selected: true } }),
      getSceneElements: () => [{ id: "selected", x: 10, y: 20, width: 100, height: 80 }],
      getSceneElementsIncludingDeleted: () => [{ id: "selected" }],
      updateScene: vi.fn(),
      scrollToContent: vi.fn(),
    };

    const placeholders = await createImageGenerationPlaceholders(api, 4);

    expect(placeholders).toHaveLength(4);
    expect(convertToExcalidrawElements).toHaveBeenNthCalledWith(
      1,
      [expect.objectContaining({ x: 158, y: 20, width: 384, height: 384 })],
    );
    expect(convertToExcalidrawElements).toHaveBeenNthCalledWith(
      4,
      [expect.objectContaining({ x: 158, y: 428 })],
    );
    expect(api.updateScene).toHaveBeenCalledWith(expect.objectContaining({
      elements: expect.arrayContaining([expect.objectContaining({ id: "placeholder-3" })]),
      captureUpdate: "immediately",
    }));
  });

  it("replaces a loading frame in place without changing the user's selection", async () => {
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
    vi.mocked(convertToExcalidrawElements).mockReturnValue([
      { id: "generated", type: "image", isDeleted: false },
    ] as any);
    const elements = [
      { id: "placeholder", type: "rectangle", x: 120, y: 240, width: 384, height: 384, version: 1, isDeleted: false },
      { id: "placeholder-label", type: "text", version: 1, isDeleted: false },
      { id: "user-work", type: "line", isDeleted: false },
    ];
    const api = {
      getSceneElementsIncludingDeleted: () => elements,
      addFiles: vi.fn(),
      updateScene: vi.fn(),
    };

    await replaceImageGenerationPlaceholder(api, placeholder, new Blob(["png"], { type: "image/png" }));

    expect(convertToExcalidrawElements).toHaveBeenCalledWith([
      expect.objectContaining({ x: 120, y: 336, width: 384, height: 192 }),
    ]);
    expect(api.updateScene).toHaveBeenCalledWith(expect.not.objectContaining({ appState: expect.anything() }));
    expect(api.updateScene.mock.calls[0][0].elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "placeholder", isDeleted: true }),
      expect.objectContaining({ id: "placeholder-label", isDeleted: true }),
      expect.objectContaining({ id: "generated" }),
      expect.objectContaining({ id: "user-work", isDeleted: false }),
    ]));
    vi.unstubAllGlobals();
  });

  it("turns a failed loading frame into an on-canvas error", async () => {
    const elements = [
      { id: "placeholder", type: "rectangle", x: 100, y: 200, width: 384, height: 384, version: 1, isDeleted: false },
      { id: "placeholder-label", type: "text", version: 1, isDeleted: false },
    ];
    vi.mocked(convertToExcalidrawElements).mockReturnValue([
      { id: "error-placeholder", type: "rectangle", isDeleted: false },
      { id: "error-label", type: "text", isDeleted: false },
    ] as any);
    const api = {
      getSceneElementsIncludingDeleted: () => elements,
      updateScene: vi.fn(),
    };

    await expect(failImageGenerationPlaceholder(api, placeholder, "Provider quota exceeded")).resolves.toBe(true);
    expect(convertToExcalidrawElements).toHaveBeenCalledWith([
      expect.objectContaining({
        backgroundColor: "#fff1f2",
        label: expect.objectContaining({ text: expect.stringContaining("Provider quota exceeded") }),
      }),
    ]);
  });

  it("marks placeholders left behind by an interrupted app session", async () => {
    const loading = {
      id: "interrupted",
      type: "rectangle",
      x: 20,
      y: 30,
      width: 384,
      height: 384,
      version: 1,
      isDeleted: false,
      boundElements: [{ id: "interrupted-label", type: "text" }],
      customData: { localdrawImageGeneration: { state: "loading" } },
    };
    vi.mocked(convertToExcalidrawElements).mockReturnValue([
      { id: "error", type: "rectangle", isDeleted: false },
    ] as any);
    const api = {
      getSceneElements: () => [loading],
      getSceneElementsIncludingDeleted: () => [loading, { id: "interrupted-label", isDeleted: false }],
      updateScene: vi.fn(),
    };

    await expect(recoverInterruptedImageGeneration(api)).resolves.toBe(1);
    expect(convertToExcalidrawElements).toHaveBeenCalledWith([
      expect.objectContaining({
        label: expect.objectContaining({ text: expect.stringContaining("interrupted") }),
      }),
    ]);
  });
});
