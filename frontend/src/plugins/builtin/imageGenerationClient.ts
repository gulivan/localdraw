export type ImageGenerationConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

type ImageApiResponse = {
  data?: Array<{ b64_json?: string; url?: string }>;
  error?: { message?: string } | string;
  message?: string;
  detail?: string;
};

export const IMAGE_GENERATION_TIMEOUT_MS = 180_000;

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

export const buildImagePrompt = (prompt: string, selectionContext?: string): string => {
  const request = prompt.trim();
  if (!selectionContext?.trim()) return request;
  return `${request}

Use the attached selected-canvas image as a visual and composition reference. Preserve the semantic meaning of the selected elements described below. Canvas labels are annotations: treat a label as the identity or meaning of its surrounding shape unless the request explicitly asks to render the label as typography. Depict the labeled subject itself; do not merely print the label on an unrelated object.

Selected canvas elements:
${selectionContext.trim()}`;
};

const responseError = async (response: Response): Promise<Error> => {
  let message = `Image provider returned ${response.status}`;
  try {
    const raw = await response.text();
    const body = JSON.parse(raw) as ImageApiResponse;
    const providerMessage = typeof body.error === "string"
      ? body.error
      : body.error?.message || body.message || body.detail;
    if (providerMessage) message = providerMessage.slice(0, 1000);
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
  selectionContext,
  signal,
  timeoutMs = IMAGE_GENERATION_TIMEOUT_MS,
}: {
  config: ImageGenerationConfig;
  prompt: string;
  reference?: Blob;
  selectionContext?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<Blob> => {
  if (!config.apiKey.trim()) throw new Error("Add an OpenAI API key first");
  if (!config.model.trim()) throw new Error("Add an image model name first");
  const baseUrl = normalizeOpenAiBaseUrl(config.baseUrl);
  const endpoint = `${baseUrl}/images/${reference ? "edits" : "generations"}`;
  const effectivePrompt = buildImagePrompt(prompt, selectionContext);
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort(signal?.reason);
  if (signal?.aborted) cancel();
  else signal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  let response: Response;
  try {
    if (reference) {
      const body = new FormData();
      body.set("model", config.model.trim());
      body.set("prompt", effectivePrompt);
      body.set("image", new File([reference], "selection.png", { type: "image/png" }));
      body.set("output_format", "png");
      response = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey.trim()}` },
        body,
        signal: controller.signal,
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
          prompt: effectivePrompt,
          output_format: "png",
        }),
        signal: controller.signal,
      });
    }
    if (!response.ok) throw await responseError(response);
    return imageResultToBlob(await response.json() as ImageApiResponse);
  } catch (error) {
    if (timedOut) throw new Error("Image provider timed out after 3 minutes");
    if (signal?.aborted) throw new Error("Image generation cancelled");
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
};

const selectedElementsWithLabels = (api: any): any[] => {
  const scene = (api.getSceneElements?.() || []).filter((element: any) => !element.isDeleted);
  const selectedIds = api.getAppState?.()?.selectedElementIds || {};
  const selected = scene.filter((element: any) => selectedIds[element.id]);
  if (selected.length === 0) return [];

  const includedIds = new Set(selected.map((element: any) => element.id));
  for (const element of selected) {
    for (const binding of element.boundElements || []) {
      if (binding?.type === "text" && typeof binding.id === "string") includedIds.add(binding.id);
    }
    if (element.type === "text" && typeof element.containerId === "string") includedIds.add(element.containerId);
  }

  const selectedShapes = selected.filter((element: any) => element.type !== "text");
  for (const element of scene) {
    if (element.type !== "text") continue;
    if (typeof element.containerId === "string" && includedIds.has(element.containerId)) {
      includedIds.add(element.id);
      continue;
    }
    const centerX = Number(element.x) + Number(element.width) / 2;
    const centerY = Number(element.y) + Number(element.height) / 2;
    if (selectedShapes.some((shape: any) => (
      centerX >= Number(shape.x) && centerX <= Number(shape.x) + Number(shape.width) &&
      centerY >= Number(shape.y) && centerY <= Number(shape.y) + Number(shape.height)
    ))) includedIds.add(element.id);
  }
  return scene.filter((element: any) => includedIds.has(element.id));
};

const textValue = (element: any): string => String(element.text ?? element.originalText ?? "").trim().slice(0, 500);

export const describeSelectedElements = (api: any): string => {
  const elements = selectedElementsWithLabels(api);
  if (elements.length === 0) return "";
  const labelsByContainer = new Map<string, string[]>();
  const consumedTextIds = new Set<string>();
  for (const text of elements.filter((element: any) => element.type === "text")) {
    const value = textValue(text);
    if (!value) continue;
    let containerId = typeof text.containerId === "string" ? text.containerId : null;
    if (!containerId) {
      const centerX = Number(text.x) + Number(text.width) / 2;
      const centerY = Number(text.y) + Number(text.height) / 2;
      containerId = elements.find((shape: any) => shape.type !== "text" && (
        centerX >= Number(shape.x) && centerX <= Number(shape.x) + Number(shape.width) &&
        centerY >= Number(shape.y) && centerY <= Number(shape.y) + Number(shape.height)
      ))?.id ?? null;
    }
    if (containerId) {
      labelsByContainer.set(containerId, [...(labelsByContainer.get(containerId) || []), value]);
      consumedTextIds.add(text.id);
    }
  }
  return elements
    .filter((element: any) => !consumedTextIds.has(element.id))
    .slice(0, 80)
    .map((element: any) => {
      const labels = labelsByContainer.get(element.id);
      if (labels?.length) return `- ${element.type} labeled ${labels.map((label) => JSON.stringify(label)).join(", ")}`;
      if (element.type === "text") return `- text ${JSON.stringify(textValue(element))}`;
      return `- ${element.type}`;
    })
    .join("\n")
    .slice(0, 4000);
};

export const exportSelectedElements = async (api: any): Promise<Blob | undefined> => {
  const { exportToBlob } = await import("@excalidraw/excalidraw");
  const appState = api.getAppState?.();
  const elements = selectedElementsWithLabels(api);
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
