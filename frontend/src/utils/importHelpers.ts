import { exportToSvg } from "@excalidraw/excalidraw";

type ExcalidrawLikeData = {
  type?: unknown;
  version?: unknown;
  source?: unknown;
  elements?: unknown;
  appState?: unknown;
  files?: unknown;
  data?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

const parseOptionalJson = <T>(raw: unknown, fallback: T): T => {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  if (typeof raw === "object" && raw !== null) return raw as T;
  return fallback;
};

export const extractDrawingData = (
  input: unknown
): { elements: any[]; appState: Record<string, any>; files: Record<string, any> } | null => {
  if (typeof input !== "object" || input === null) return null;
  const raw = input as ExcalidrawLikeData;
  const maybeNested = raw.data;
  const candidate: ExcalidrawLikeData =
    typeof maybeNested === "object" && maybeNested !== null ? (maybeNested as ExcalidrawLikeData) : raw;
  const elements = parseOptionalJson<any[]>(candidate.elements, []);
  const appState = parseOptionalJson<Record<string, any>>(candidate.appState, {});
  const files = parseOptionalJson<Record<string, any>>(candidate.files, {});
  if (!Array.isArray(elements)) return null;
  if (typeof appState !== "object" || appState === null) return null;
  if (typeof files !== "object" || files === null) return null;
  return { elements, appState, files };
};

export const makeSvgPreview = async (
  elements: any[],
  appState: Record<string, any>,
  files: Record<string, any>
) => {
  return exportToSvg({
    elements,
    appState: {
      ...appState,
      exportBackground: true,
      viewBackgroundColor: appState.viewBackgroundColor || "#ffffff",
    },
    files: files || {},
    exportPadding: 10,
  });
};
