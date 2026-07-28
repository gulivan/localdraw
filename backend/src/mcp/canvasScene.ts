import { randomInt, randomUUID } from "crypto";

type SceneElement = Record<string, any>;
export type ArrangeInput = {
  action: "align" | "distribute" | "group" | "ungroup" | "lock" | "unlock" | "duplicate";
  elementIds: string[];
  alignment?: "left" | "center" | "right" | "top" | "middle" | "bottom";
  direction?: "horizontal" | "vertical";
  groupId?: string;
  offsetX?: number;
  offsetY?: number;
};

const findLive = (scene: SceneElement[], id?: string) =>
  id ? scene.find((element) => element.id === id && !element.isDeleted) : undefined;
const nextId = () => randomUUID().replace(/-/g, "").slice(0, 20);
const nextSeed = () => randomInt(1, 2_147_483_647);
const bump = (element: SceneElement) => {
  element.version = Number(element.version ?? 0) + 1;
  element.versionNonce = nextSeed();
  element.updated = Date.now();
};
const moveBoundText = (scene: SceneElement[], element: SceneElement, previousX: number, previousY: number) => {
  const textId = (element.boundElements ?? []).find((entry: any) => entry.type === "text")?.id;
  const label = findLive(scene, textId);
  if (!label) return;
  label.x += element.x - previousX;
  label.y += element.y - previousY;
  bump(label);
};

export const describeScene = (scene: SceneElement[]): string => {
  const live = scene.filter((element) => !element.isDeleted);
  if (live.length === 0) return "The canvas is empty.";
  const bounds = live.reduce((acc, element) => ({
    minX: Math.min(acc.minX, element.x), minY: Math.min(acc.minY, element.y),
    maxX: Math.max(acc.maxX, element.x + (element.width ?? 0)),
    maxY: Math.max(acc.maxY, element.y + (element.height ?? 0)),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const lines = [`Canvas: ${live.length} live elements; bounds (${Math.round(bounds.minX)}, ${Math.round(bounds.minY)}) to (${Math.round(bounds.maxX)}, ${Math.round(bounds.maxY)}).`];
  for (const element of [...live].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const label = element.type === "text" ? element.text : (element.boundElements ?? [])
      .map((entry: any) => findLive(live, entry.type === "text" ? entry.id : undefined)?.text).find(Boolean);
    const connection = element.type === "arrow" ? ` ${element.startBinding?.elementId ?? "?"} -> ${element.endBinding?.elementId ?? "?"}` : "";
    lines.push(`[${element.id}] ${element.type} at (${Math.round(element.x)},${Math.round(element.y)}) ${Math.round(element.width ?? 0)}x${Math.round(element.height ?? 0)}` +
      `${label ? ` text=${JSON.stringify(label)}` : ""}${connection}${element.locked ? " locked" : ""}`);
  }
  return lines.join("\n");
};

export const queryScene = (scene: SceneElement[], query: {
  type?: string; text?: string; locked?: boolean;
  bbox?: { xMin: number; yMin: number; xMax: number; yMax: number };
}) => scene.filter((element) => {
  if (element.isDeleted || (query.type && element.type !== query.type)) return false;
  if (query.locked !== undefined && Boolean(element.locked) !== query.locked) return false;
  if (query.text) {
    const needle = query.text.toLowerCase();
    const text = `${element.text ?? ""} ${(element.boundElements ?? [])
      .map((entry: any) => findLive(scene, entry.type === "text" ? entry.id : undefined)?.text ?? "").join(" ")}`.toLowerCase();
    if (!text.includes(needle)) return false;
  }
  if (query.bbox && (element.x > query.bbox.xMax || element.y > query.bbox.yMax ||
    element.x + (element.width ?? 0) < query.bbox.xMin || element.y + (element.height ?? 0) < query.bbox.yMin)) return false;
  return true;
});

export const arrangeScene = (scene: SceneElement[], input: ArrangeInput): string[] => {
  const selected = input.elementIds.map((id) => {
    const element = findLive(scene, id);
    if (!element) throw new Error(`Element ${id} not found`);
    return element;
  });
  if (input.action === "align") {
    if (selected.length < 2 || !input.alignment) throw new Error("Align needs at least two elements and an alignment");
    const left = Math.min(...selected.map((element) => element.x));
    const right = Math.max(...selected.map((element) => element.x + element.width));
    const top = Math.min(...selected.map((element) => element.y));
    const bottom = Math.max(...selected.map((element) => element.y + element.height));
    const center = selected.reduce((sum, element) => sum + element.x + element.width / 2, 0) / selected.length;
    const middle = selected.reduce((sum, element) => sum + element.y + element.height / 2, 0) / selected.length;
    for (const element of selected) {
      const previousX = element.x;
      const previousY = element.y;
      if (input.alignment === "left") element.x = left;
      if (input.alignment === "right") element.x = right - element.width;
      if (input.alignment === "center") element.x = center - element.width / 2;
      if (input.alignment === "top") element.y = top;
      if (input.alignment === "bottom") element.y = bottom - element.height;
      if (input.alignment === "middle") element.y = middle - element.height / 2;
      bump(element);
      moveBoundText(scene, element, previousX, previousY);
    }
  } else if (input.action === "distribute") {
    if (selected.length < 3 || !input.direction) throw new Error("Distribute needs at least three elements and a direction");
    const key = input.direction === "horizontal" ? "x" : "y";
    const size = input.direction === "horizontal" ? "width" : "height";
    selected.sort((a, b) => a[key] - b[key]);
    const span = selected.at(-1)![key] + selected.at(-1)![size] - selected[0][key];
    const gap = (span - selected.reduce((sum, element) => sum + element[size], 0)) / (selected.length - 1);
    let cursor = selected[0][key];
    for (const element of selected) {
      const previousX = element.x;
      const previousY = element.y;
      element[key] = cursor;
      cursor += element[size] + gap;
      bump(element);
      moveBoundText(scene, element, previousX, previousY);
    }
  } else if (input.action === "group" || input.action === "ungroup") {
    const groupId = input.action === "group" ? input.groupId ?? nextId() : input.groupId;
    if (!groupId) throw new Error("Ungroup requires groupId");
    for (const element of selected) {
      element.groupIds = input.action === "group" ? Array.from(new Set([...(element.groupIds ?? []), groupId])) :
        (element.groupIds ?? []).filter((id: string) => id !== groupId);
      bump(element);
    }
  } else if (input.action === "lock" || input.action === "unlock") {
    for (const element of selected) { element.locked = input.action === "lock"; bump(element); }
  } else if (input.action === "duplicate") {
    const originals = [...selected];
    for (const element of selected) {
      const textId = (element.boundElements ?? []).find((entry: any) => entry.type === "text")?.id;
      const label = findLive(scene, textId);
      if (label && !originals.includes(label)) originals.push(label);
    }
    const idMap = new Map(originals.map((element) => [element.id, nextId()]));
    const createdIds = originals.map((element) => {
      const duplicate = structuredClone(element);
      Object.assign(duplicate, { id: idMap.get(element.id), x: element.x + (input.offsetX ?? 20),
        y: element.y + (input.offsetY ?? 20), version: 1, versionNonce: nextSeed(), seed: nextSeed(),
        containerId: idMap.get(element.containerId) ?? null,
        boundElements: (element.boundElements ?? []).filter((entry: any) => entry.type === "text" && idMap.has(entry.id))
          .map((entry: any) => ({ ...entry, id: idMap.get(entry.id) })) || null,
        startBinding: null, endBinding: null });
      if (duplicate.boundElements?.length === 0) duplicate.boundElements = null;
      scene.push(duplicate);
      return duplicate.id;
    });
    return createdIds;
  }
  return selected.map((element) => element.id);
};
