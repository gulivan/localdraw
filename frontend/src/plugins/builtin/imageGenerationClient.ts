export type ImageGenerationConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

type ImageApiResponse = {
  data?: Array<{ b64_json?: string; url?: string }>;
  error?: { message?: string };
};

export const DEFAULT_IMAGE_GENERATION_CONFIG: ImageGenerationConfig = {
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-image-2",
};

export const normalizeOpenAiBaseUrl = (value: string): string => {
  const url = new URL(value.trim());
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("Provider host must use HTTPS");
  }
  return url.href.replace(/\/$/, "");
};

const responseError = async (response: Response): Promise<Error> => {
  let message = `Image provider returned ${response.status}`;
  try {
    const body = await response.json() as ImageApiResponse;
    if (body.error?.message) message = body.error.message;
  } catch {
    // Keep the status-only error when the provider does not return JSON.
  }
  return new Error(message);
};

const imageResultToBlob = async (body: ImageApiResponse): Promise<Blob> => {
  const result = body.data?.[0];
  if (result?.b64_json) {
    const binary = atob(result.b64_json);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: "image/png" });
  }
  if (result?.url) {
    const response = await fetch(result.url, { credentials: "omit" });
    if (!response.ok) throw new Error("Could not download the generated image");
    return response.blob();
  }
  throw new Error("Image provider returned no image");
};

export const generateImage = async ({
  config,
  prompt,
  reference,
}: {
  config: ImageGenerationConfig;
  prompt: string;
  reference?: Blob;
}): Promise<Blob> => {
  if (!config.apiKey.trim()) throw new Error("Add an OpenAI API key first");
  if (!config.model.trim()) throw new Error("Add an image model name first");
  const baseUrl = normalizeOpenAiBaseUrl(config.baseUrl);
  const endpoint = `${baseUrl}/images/${reference ? "edits" : "generations"}`;
  let response: Response;
  if (reference) {
    const body = new FormData();
    body.set("model", config.model.trim());
    body.set("prompt", prompt.trim());
    body.set("image", new File([reference], "selection.png", { type: "image/png" }));
    body.set("output_format", "png");
    response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey.trim()}` },
      body,
    });
  } else {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model.trim(),
        prompt: prompt.trim(),
        output_format: "png",
      }),
    });
  }
  if (!response.ok) throw await responseError(response);
  return imageResultToBlob(await response.json() as ImageApiResponse);
};

export const exportSelectedElements = async (api: any): Promise<Blob | undefined> => {
  const { exportToBlob } = await import("@excalidraw/excalidraw");
  const appState = api.getAppState?.();
  const selectedIds = appState?.selectedElementIds || {};
  const elements = (api.getSceneElements?.() || []).filter((element: any) => selectedIds[element.id] && !element.isDeleted);
  if (elements.length === 0) return undefined;
  return exportToBlob({
    elements,
    appState: { ...appState, exportBackground: true },
    files: api.getFiles?.() || {},
    mimeType: "image/png",
    exportPadding: 32,
    maxWidthOrHeight: 1536,
  });
};

const blobToDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(reader.error || new Error("Could not read generated image"));
  reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read generated image"));
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

export const insertGeneratedImage = async (api: any, blob: Blob): Promise<void> => {
  const { CaptureUpdateAction, convertToExcalidrawElements } = await import("@excalidraw/excalidraw");
  const [dataURL, dimensions] = await Promise.all([blobToDataUrl(blob), imageDimensions(blob)]);
  const fileId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `generated-${Date.now()}`;
  const appState = api.getAppState?.() || {};
  const selectedIds = appState.selectedElementIds || {};
  const selected = (api.getSceneElements?.() || []).filter((element: any) => selectedIds[element.id] && !element.isDeleted);
  const selectionRight = selected.length ? Math.max(...selected.map((element: any) => element.x + element.width)) : -(appState.scrollX || 0) + 120;
  const selectionTop = selected.length ? Math.min(...selected.map((element: any) => element.y)) : -(appState.scrollY || 0) + 120;
  const maxSide = 720;
  const scale = Math.min(1, maxSide / Math.max(dimensions.width, dimensions.height));
  const width = Math.max(1, Math.round(dimensions.width * scale));
  const height = Math.max(1, Math.round(dimensions.height * scale));
  api.addFiles([{ id: fileId, mimeType: blob.type || "image/png", dataURL, created: Date.now() }]);
  const [element] = convertToExcalidrawElements([{
    type: "image",
    x: selectionRight + 48,
    y: selectionTop,
    width,
    height,
    fileId: fileId as any,
    scale: [1, 1],
    status: "saved",
  }]);
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), element],
    appState: { selectedElementIds: { [element.id]: true } },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  api.scrollToContent?.(element, { fitToContent: true, animate: true });
};
