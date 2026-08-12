export type ImageGenerationConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  count: number;
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
  count: 1,
};

export const normalizeImageCount = (value: number): number => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("Number of images must be a whole number greater than zero");
  }
  return value;
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

const imageResultToBlob = async (result: NonNullable<ImageApiResponse["data"]>[number]): Promise<Blob> => {
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

export const generateImages = async ({
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
}): Promise<Blob[]> => {
  if (!config.model.trim()) throw new Error("Add an image model name first");
  const baseUrl = normalizeOpenAiBaseUrl(config.baseUrl);
  const endpoint = `${baseUrl}/images/${reference ? "edits" : "generations"}`;
  const effectivePrompt = buildImagePrompt(prompt, selectionContext);
  const count = normalizeImageCount(config.count);
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
      body.set("n", String(count));
      response = await fetch(endpoint, {
        method: "POST",
        headers: config.apiKey.trim() ? { Authorization: `Bearer ${config.apiKey.trim()}` } : undefined,
        body,
        signal: controller.signal,
      });
    } else {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          ...(config.apiKey.trim() ? { Authorization: `Bearer ${config.apiKey.trim()}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model.trim(),
          prompt: effectivePrompt,
          output_format: "png",
          n: count,
        }),
        signal: controller.signal,
      });
    }
    if (!response.ok) throw await responseError(response);
    const body = await response.json() as ImageApiResponse;
    if (!body.data?.length) throw new Error("Image provider returned no image");
    return Promise.all(body.data.map(imageResultToBlob));
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
  const appState = api.getAppState?.();
  const elements = selectedElementsWithLabels(api);
  const files = api.getFiles?.() || {};
  if (elements.length === 0) return undefined;
  const { exportToBlob } = await import("@excalidraw/excalidraw");
  return exportToBlob({
    elements,
    appState: { ...appState, exportBackground: true },
    files,
    mimeType: "image/png",
    exportPadding: 32,
    maxWidthOrHeight: 1536,
  });
};
