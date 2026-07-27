import { randomInt, randomUUID } from "crypto";
import { z } from "zod";

const pointSchema = z.tuple([z.number().finite(), z.number().finite()]);
const styleSchema = z.object({
  strokeColor: z.string().max(32).optional(),
  backgroundColor: z.string().max(32).optional(),
  fillStyle: z.enum(["solid", "hachure", "cross-hatch", "dots"]).optional(),
  strokeWidth: z.number().min(0).max(20).optional(),
  strokeStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
  roughness: z.number().min(0).max(3).optional(),
  opacity: z.number().min(0).max(100).optional(),
});

export const createElementSchema = styleSchema.extend({
  id: z.string().min(1).max(200).optional(),
  type: z.enum(["rectangle", "ellipse", "diamond", "text", "line", "arrow"]),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive().max(100_000).optional(),
  height: z.number().positive().max(100_000).optional(),
  points: z.array(pointSchema).min(2).max(100).optional(),
  text: z.string().max(5_000).optional(),
  fontSize: z.number().min(8).max(200).optional(),
  fontFamily: z.number().int().min(1).max(10).optional(),
  startElementId: z.string().min(1).max(200).optional(),
  endElementId: z.string().min(1).max(200).optional(),
  startArrowhead: z.enum(["arrow", "bar", "dot", "triangle"]).nullable().optional(),
  endArrowhead: z.enum(["arrow", "bar", "dot", "triangle"]).nullable().optional(),
  locked: z.boolean().optional(),
});

export const updateElementSchema = styleSchema.extend({
  id: z.string().min(1).max(200),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  width: z.number().positive().max(100_000).optional(),
  height: z.number().positive().max(100_000).optional(),
  points: z.array(pointSchema).min(2).max(100).optional(),
  text: z.string().max(5_000).optional(),
  fontSize: z.number().min(8).max(200).optional(),
  fontFamily: z.number().int().min(1).max(10).optional(),
  startElementId: z.string().min(1).max(200).nullable().optional(),
  endElementId: z.string().min(1).max(200).nullable().optional(),
  startArrowhead: z.enum(["arrow", "bar", "dot", "triangle"]).nullable().optional(),
  endArrowhead: z.enum(["arrow", "bar", "dot", "triangle"]).nullable().optional(),
});

export type AgentElementCreate = z.infer<typeof createElementSchema>;
export type AgentElementUpdate = z.infer<typeof updateElementSchema>;
type SceneElement = Record<string, any>;

const nextSeed = () => randomInt(1, 2_147_483_647);
const nextId = () => randomUUID().replace(/-/g, "").slice(0, 20);

const baseElement = (input: AgentElementCreate, id: string): SceneElement => ({
  id,
  type: input.type,
  x: input.x,
  y: input.y,
  width: input.width ?? (input.type === "text" ? 160 : 180),
  height: input.height ?? (input.type === "text" ? 30 : 80),
  angle: 0,
  strokeColor: input.strokeColor ?? "#1e1e1e",
  backgroundColor: input.backgroundColor ?? "transparent",
  fillStyle: input.fillStyle ?? "solid",
  strokeWidth: input.strokeWidth ?? 2,
  strokeStyle: input.strokeStyle ?? "solid",
  roughness: input.roughness ?? 1,
  opacity: input.opacity ?? 100,
  groupIds: [],
  frameId: null,
  roundness: input.type === "rectangle" ? { type: 3 } : null,
  seed: nextSeed(),
  version: 1,
  versionNonce: nextSeed(),
  isDeleted: false,
  boundElements: null,
  updated: Date.now(),
  link: null,
  locked: input.locked ?? false,
});

const textDimensions = (text: string, fontSize: number, maxWidth?: number) => {
  const lines = text.split("\n");
  const naturalWidth = Math.max(20, ...lines.map((line) => line.length * fontSize * 0.58));
  const width = maxWidth ? Math.min(naturalWidth, maxWidth) : naturalWidth;
  const wrappedLines = maxWidth
    ? lines.reduce((count, line) => count + Math.max(1, Math.ceil((line.length * fontSize * 0.58) / maxWidth)), 0)
    : lines.length;
  return { width, height: Math.max(fontSize * 1.25, wrappedLines * fontSize * 1.25) };
};

const makeText = (
  text: string,
  input: AgentElementCreate,
  options?: { id?: string; container?: SceneElement },
): SceneElement => {
  const fontSize = input.fontSize ?? 20;
  const container = options?.container;
  const dims = textDimensions(text, fontSize, container ? Math.max(20, container.width - 20) : input.width);
  const x = container ? container.x + (container.width - dims.width) / 2 : input.x;
  const y = container ? container.y + (container.height - dims.height) / 2 : input.y;
  return {
    ...baseElement({ ...input, type: "text", x, y, width: dims.width, height: dims.height }, options?.id ?? nextId()),
    text,
    originalText: text,
    fontSize,
    fontFamily: input.fontFamily ?? 5,
    textAlign: container ? "center" : "left",
    verticalAlign: "middle",
    containerId: container?.id ?? null,
    autoResize: !container,
    lineHeight: 1.25,
    baseline: Math.round(fontSize),
    roundness: null,
  };
};

const addBoundElement = (element: SceneElement, id: string, type: "text" | "arrow") => {
  const current = Array.isArray(element.boundElements) ? element.boundElements : [];
  if (!current.some((entry: any) => entry?.id === id)) {
    element.boundElements = [...current, { id, type }];
  }
};

const removeBoundElement = (element: SceneElement, id: string) => {
  const current = Array.isArray(element.boundElements) ? element.boundElements : [];
  element.boundElements = current.filter((entry: any) => entry?.id !== id);
  if (element.boundElements.length === 0) element.boundElements = null;
};

const findLive = (elements: SceneElement[], id: string | null | undefined) =>
  id ? elements.find((element) => element.id === id && !element.isDeleted) : undefined;

const bindLinearElement = (
  element: SceneElement,
  elements: SceneElement[],
  startElementId?: string | null,
  endElementId?: string | null,
) => {
  const previousStart = element.startBinding?.elementId;
  const previousEnd = element.endBinding?.elementId;
  if (previousStart && previousStart !== startElementId) {
    const previous = findLive(elements, previousStart);
    if (previous) removeBoundElement(previous, element.id);
  }
  if (previousEnd && previousEnd !== endElementId) {
    const previous = findLive(elements, previousEnd);
    if (previous) removeBoundElement(previous, element.id);
  }

  const start = findLive(elements, startElementId);
  const end = findLive(elements, endElementId);
  if (startElementId && !start) throw new Error(`Start element ${startElementId} not found`);
  if (endElementId && !end) throw new Error(`End element ${endElementId} not found`);
  if (start) {
    element.startBinding = { elementId: start.id, focus: 0, gap: 5 };
    addBoundElement(start, element.id, "arrow");
  } else if (startElementId === null) {
    element.startBinding = null;
  }
  if (end) {
    element.endBinding = { elementId: end.id, focus: 0, gap: 5 };
    addBoundElement(end, element.id, "arrow");
  } else if (endElementId === null) {
    element.endBinding = null;
  }

  if (start && end) {
    const startCenter = { x: start.x + start.width / 2, y: start.y + start.height / 2 };
    const endCenter = { x: end.x + end.width / 2, y: end.y + end.height / 2 };
    element.x = startCenter.x;
    element.y = startCenter.y;
    element.points = [[0, 0], [endCenter.x - startCenter.x, endCenter.y - startCenter.y]];
    element.width = Math.abs(endCenter.x - startCenter.x);
    element.height = Math.abs(endCenter.y - startCenter.y);
  }
};

export const createSceneElements = (
  input: AgentElementCreate,
  scene: SceneElement[],
): { elements: SceneElement[]; primaryId: string } => {
  const id = input.id ?? nextId();
  if (scene.some((element) => element.id === id && !element.isDeleted)) {
    throw new Error(`Element ${id} already exists`);
  }
  if (input.type === "text") {
    return { elements: [makeText(input.text ?? "", input, { id })], primaryId: id };
  }
  const primary = baseElement(input, id);
  if (input.type === "line" || input.type === "arrow") {
    primary.points = input.points ?? [[0, 0], [input.width ?? 100, input.height ?? 0]];
    primary.lastCommittedPoint = null;
    primary.startBinding = null;
    primary.endBinding = null;
    primary.startArrowhead = input.startArrowhead ?? null;
    primary.endArrowhead = input.type === "arrow" ? input.endArrowhead ?? "arrow" : input.endArrowhead ?? null;
    bindLinearElement(primary, [...scene, primary], input.startElementId, input.endElementId);
  }
  const created = [primary];
  if (input.text) {
    const label = makeText(input.text, input, { container: primary });
    addBoundElement(primary, label.id, "text");
    created.push(label);
  }
  return { elements: created, primaryId: id };
};

const bump = (element: SceneElement) => {
  element.version = Number(element.version ?? 0) + 1;
  element.versionNonce = nextSeed();
  element.updated = Date.now();
};

export const updateSceneElement = (
  input: AgentElementUpdate,
  scene: SceneElement[],
): string[] => {
  const element = findLive(scene, input.id);
  if (!element) throw new Error(`Element ${input.id} not found`);
  if (element.locked) throw new Error(`Element ${input.id} is locked`);
  const {
    id: _id,
    text,
    fontSize,
    fontFamily,
    startElementId,
    endElementId,
    ...updates
  } = input;
  Object.assign(element, updates);
  if ((element.type === "arrow" || element.type === "line") &&
      (startElementId !== undefined || endElementId !== undefined)) {
    bindLinearElement(
      element,
      scene,
      startElementId === undefined ? element.startBinding?.elementId : startElementId,
      endElementId === undefined ? element.endBinding?.elementId : endElementId,
    );
  }
  bump(element);
  const changed = [element.id];
  if (element.type === "text" && (text !== undefined || fontSize !== undefined || fontFamily !== undefined)) {
    const nextText = text ?? element.text ?? "";
    const nextFontSize = fontSize ?? element.fontSize ?? 20;
    const dims = textDimensions(nextText, nextFontSize, element.autoResize === false ? element.width : undefined);
    Object.assign(element, { text: nextText, originalText: nextText, fontSize: nextFontSize,
      fontFamily: fontFamily ?? element.fontFamily, width: dims.width, height: dims.height });
  } else if (element.type !== "text") {
    const labelRef = (element.boundElements ?? []).find((entry: any) => entry.type === "text");
    const label = findLive(scene, labelRef?.id);
    if (label && (text !== undefined || fontSize !== undefined || fontFamily !== undefined ||
      input.x !== undefined || input.y !== undefined || input.width !== undefined || input.height !== undefined)) {
      const nextText = text ?? label.text ?? "";
      const nextFontSize = fontSize ?? label.fontSize ?? 20;
      const dims = textDimensions(nextText, nextFontSize, Math.max(20, element.width - 20));
      Object.assign(label, { text: nextText, originalText: nextText, fontSize: nextFontSize,
        fontFamily: fontFamily ?? label.fontFamily, width: dims.width, height: dims.height,
        x: element.x + (element.width - dims.width) / 2,
        y: element.y + (element.height - dims.height) / 2 });
      bump(label);
      changed.push(label.id);
    } else if (!label && text) {
      const created = makeText(text, { ...input, type: "text", x: element.x, y: element.y } as AgentElementCreate,
        { container: element });
      addBoundElement(element, created.id, "text");
      scene.push(created);
      changed.push(created.id);
    }
  }
  return changed;
};

export const deleteSceneElement = (id: string, scene: SceneElement[]): string[] => {
  const element = findLive(scene, id);
  if (!element) throw new Error(`Element ${id} not found`);
  if (element.locked) throw new Error(`Element ${id} is locked`);
  const changed = [id];
  element.isDeleted = true;
  bump(element);
  for (const bound of element.boundElements ?? []) {
    const child = findLive(scene, bound.id);
    if (child?.containerId === id) {
      child.isDeleted = true;
      bump(child);
      changed.push(child.id);
    } else if (child?.startBinding?.elementId === id || child?.endBinding?.elementId === id) {
      if (child.startBinding?.elementId === id) child.startBinding = null;
      if (child.endBinding?.elementId === id) child.endBinding = null;
      bump(child);
      changed.push(child.id);
    }
  }
  if (element.startBinding?.elementId) {
    const start = findLive(scene, element.startBinding.elementId);
    if (start) removeBoundElement(start, id);
  }
  if (element.endBinding?.elementId) {
    const end = findLive(scene, element.endBinding.elementId);
    if (end) removeBoundElement(end, id);
  }
  return changed;
};
