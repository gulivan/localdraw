import type { Drawing } from "../../types";

export type DisposableDraft = {
  drawingId: string;
  updatedAt: number;
};

export const disposableDraftNavigationState = (
  drawing: Pick<Drawing, "id" | "updatedAt">,
) => ({
  disposableDraft: {
    drawingId: drawing.id,
    updatedAt: drawing.updatedAt,
  } satisfies DisposableDraft,
});

export const readDisposableDraft = (
  state: unknown,
  drawingId: string | undefined,
): DisposableDraft | null => {
  if (!drawingId || typeof state !== "object" || state === null) return null;
  const candidate = (state as { disposableDraft?: unknown }).disposableDraft;
  if (typeof candidate !== "object" || candidate === null) return null;
  const draft = candidate as Partial<DisposableDraft>;
  if (
    draft.drawingId !== drawingId ||
    typeof draft.updatedAt !== "number" ||
    !Number.isFinite(draft.updatedAt)
  ) {
    return null;
  }
  return { drawingId: draft.drawingId, updatedAt: draft.updatedAt };
};
