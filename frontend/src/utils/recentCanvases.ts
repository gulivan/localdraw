export const DEFAULT_RECENT_CANVASES_LIMIT = 5;
export const MIN_RECENT_CANVASES_LIMIT = 1;
export const MAX_RECENT_CANVASES_LIMIT = 20;

const RECENT_CANVASES_LIMIT_KEY = "excalidash-recent-canvases-limit";

export const normalizeRecentCanvasesLimit = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_RECENT_CANVASES_LIMIT;
  return Math.min(
    MAX_RECENT_CANVASES_LIMIT,
    Math.max(MIN_RECENT_CANVASES_LIMIT, Math.round(parsed)),
  );
};

export const readRecentCanvasesLimit = (): number => {
  if (typeof window === "undefined") return DEFAULT_RECENT_CANVASES_LIMIT;
  try {
    const stored = window.localStorage?.getItem?.(RECENT_CANVASES_LIMIT_KEY);
    return stored === null
      ? DEFAULT_RECENT_CANVASES_LIMIT
      : normalizeRecentCanvasesLimit(stored);
  } catch {
    return DEFAULT_RECENT_CANVASES_LIMIT;
  }
};

export const writeRecentCanvasesLimit = (value: number): number => {
  const normalized = normalizeRecentCanvasesLimit(value);
  try {
    window.localStorage?.setItem?.(RECENT_CANVASES_LIMIT_KEY, String(normalized));
  } catch {
    // Keep the in-memory preference when storage is unavailable.
  }
  return normalized;
};
