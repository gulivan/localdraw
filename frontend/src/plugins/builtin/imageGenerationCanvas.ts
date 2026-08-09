export type ImageGenerationPlaceholder = {
  elementIds: string[];
  rectangleId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

const PLACEHOLDER_SIZE = 384;
const PLACEHOLDER_GAP = 24;

const sceneElements = (api: any): any[] => api.getSceneElementsIncludingDeleted?.() || [];

const tombstone = (element: any) => ({
  ...element,
  isDeleted: true,
  updated: Date.now(),
  version: Number(element.version || 0) + 1,
  versionNonce: Math.floor(Math.random() * 2 ** 31),
});

const currentPlacement = (api: any, placeholder: ImageGenerationPlaceholder) => {
  const rectangle = sceneElements(api).find(
    (element) => element.id === placeholder.rectangleId && !element.isDeleted,
  );
  return rectangle
    ? { x: rectangle.x, y: rectangle.y, width: rectangle.width, height: rectangle.height }
    : null;
};

const placeholderSkeleton = ({ x, y, index, count }: {
  x: number;
  y: number;
  index: number;
  count: number;
}) => ({
  type: "rectangle" as const,
  x,
  y,
  width: PLACEHOLDER_SIZE,
  height: PLACEHOLDER_SIZE,
  backgroundColor: "#ede9fe",
  strokeColor: "#8b5cf6",
  fillStyle: "solid" as const,
  roughness: 0,
  roundness: { type: 3 as const },
  customData: { localdrawImageGeneration: { state: "loading", index } },
  label: {
    text: count === 1 ? "Generating image…\nYou can keep drawing" : `Generating option ${index + 1} of ${count}…\nYou can keep drawing`,
    fontSize: 20,
    textAlign: "center" as const,
    verticalAlign: "middle" as const,
    strokeColor: "#5b21b6",
  },
});

export const createImageGenerationPlaceholders = async (
  api: any,
  count: number,
): Promise<ImageGenerationPlaceholder[]> => {
  const { CaptureUpdateAction, convertToExcalidrawElements } = await import("@excalidraw/excalidraw");
  const appState = api.getAppState?.() || {};
  const selectedIds = appState.selectedElementIds || {};
  const selected = (api.getSceneElements?.() || []).filter(
    (element: any) => selectedIds[element.id] && !element.isDeleted,
  );
  const startX = selected.length
    ? Math.max(...selected.map((element: any) => element.x + element.width)) + 48
    : -(appState.scrollX || 0) + 120;
  const startY = selected.length
    ? Math.min(...selected.map((element: any) => element.y))
    : -(appState.scrollY || 0) + 120;
  const columns = Math.min(count, 3);
  const placeholders: ImageGenerationPlaceholder[] = [];
  const added: any[] = [];

  for (let index = 0; index < count; index += 1) {
    const x = startX + (index % columns) * (PLACEHOLDER_SIZE + PLACEHOLDER_GAP);
    const y = startY + Math.floor(index / columns) * (PLACEHOLDER_SIZE + PLACEHOLDER_GAP);
    const elements = convertToExcalidrawElements([
      placeholderSkeleton({ x, y, index, count }),
    ] as any[]);
    const rectangle = elements.find((element: any) => element.type === "rectangle");
    if (!rectangle) throw new Error("Could not create an image placeholder");
    added.push(...elements);
    placeholders.push({
      elementIds: elements.map((element: any) => element.id),
      rectangleId: rectangle.id,
      x,
      y,
      width: PLACEHOLDER_SIZE,
      height: PLACEHOLDER_SIZE,
    });
  }

  api.updateScene({
    elements: [...sceneElements(api), ...added],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  api.scrollToContent?.(added[0], { fitToContent: false, animate: true });
  return placeholders;
};

const blobToDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(reader.error || new Error("Could not read generated image"));
  reader.onload = () => typeof reader.result === "string"
    ? resolve(reader.result)
    : reject(new Error("Could not read generated image"));
  reader.readAsDataURL(blob);
});

const imageDimensions = (blob: Blob): Promise<{ width: number; height: number }> => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(url);
    resolve({ width: image.naturalWidth || 1024, height: image.naturalHeight || 1024 });
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error("Could not decode generated image"));
  };
  image.src = url;
});

const withoutPlaceholder = (elements: any[], placeholder: ImageGenerationPlaceholder) => {
  const ids = new Set(placeholder.elementIds);
  return elements.map((element) => ids.has(element.id) && !element.isDeleted
    ? tombstone(element)
    : element);
};

export const replaceImageGenerationPlaceholder = async (
  api: any,
  placeholder: ImageGenerationPlaceholder,
  blob: Blob,
): Promise<boolean> => {
  const { CaptureUpdateAction, convertToExcalidrawElements } = await import("@excalidraw/excalidraw");
  const placement = currentPlacement(api, placeholder);
  if (!placement) return false;
  const [dataURL, dimensions] = await Promise.all([blobToDataUrl(blob), imageDimensions(blob)]);
  const fileId = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `generated-${Date.now()}`;
  const scale = Math.min(
    placement.width / dimensions.width,
    placement.height / dimensions.height,
  );
  const width = Math.max(1, Math.round(dimensions.width * scale));
  const height = Math.max(1, Math.round(dimensions.height * scale));
  api.addFiles([{ id: fileId, mimeType: blob.type || "image/png", dataURL, created: Date.now() }]);
  const [image] = convertToExcalidrawElements([{
    type: "image",
    x: placement.x + (placement.width - width) / 2,
    y: placement.y + (placement.height - height) / 2,
    width,
    height,
    fileId,
    scale: [1, 1],
    status: "saved",
  }] as any[]);
  api.updateScene({
    elements: [...withoutPlaceholder(sceneElements(api), placeholder), image],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  return true;
};

const errorCopy = (message: string) => {
  const compact = message.replace(/\s+/g, " ").trim().slice(0, 180);
  return `Image generation failed\n${compact || "Try again with a different prompt or provider."}`;
};

export const failImageGenerationPlaceholder = async (
  api: any,
  placeholder: ImageGenerationPlaceholder,
  message: string,
): Promise<boolean> => {
  const { CaptureUpdateAction, convertToExcalidrawElements } = await import("@excalidraw/excalidraw");
  const placement = currentPlacement(api, placeholder);
  if (!placement) return false;
  const errorElements = convertToExcalidrawElements([{
    type: "rectangle",
    ...placement,
    backgroundColor: "#fff1f2",
    strokeColor: "#e11d48",
    fillStyle: "solid",
    roughness: 0,
    roundness: { type: 3 },
    customData: { localdrawImageGeneration: { state: "error" } },
    label: {
      text: errorCopy(message),
      fontSize: 18,
      textAlign: "center",
      verticalAlign: "middle",
      strokeColor: "#9f1239",
    },
  }] as any[]);
  api.updateScene({
    elements: [...withoutPlaceholder(sceneElements(api), placeholder), ...errorElements],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  return true;
};

export const recoverInterruptedImageGeneration = async (
  api: any,
  activeIds: ReadonlySet<string> = new Set(),
): Promise<number> => {
  const interrupted = (api.getSceneElements?.() || []).filter((element: any) => (
    element.type === "rectangle" &&
    element.customData?.localdrawImageGeneration?.state === "loading" &&
    !activeIds.has(element.id)
  ));
  let recovered = 0;
  for (const rectangle of interrupted) {
    const placeholder: ImageGenerationPlaceholder = {
      rectangleId: rectangle.id,
      elementIds: [
        rectangle.id,
        ...(rectangle.boundElements || []).map((binding: any) => binding.id),
      ],
      x: rectangle.x,
      y: rectangle.y,
      width: rectangle.width,
      height: rectangle.height,
    };
    if (await failImageGenerationPlaceholder(
      api,
      placeholder,
      "Generation was interrupted. Delete this placeholder and try again.",
    )) recovered += 1;
  }
  return recovered;
};
