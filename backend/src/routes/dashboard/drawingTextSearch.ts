type SearchableDrawing = {
  name?: unknown;
  elements?: unknown;
};

const parseElements = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const getTypedCanvasText = (elements: unknown): string =>
  parseElements(elements)
    .filter(
      (element): element is Record<string, unknown> =>
        typeof element === "object" &&
        element !== null &&
        (element as Record<string, unknown>).type === "text" &&
        (element as Record<string, unknown>).isDeleted !== true,
    )
    .map((element) => {
      if (typeof element.text === "string") return element.text;
      return typeof element.originalText === "string" ? element.originalText : "";
    })
    .filter(Boolean)
    .join("\n");

export const matchesDrawingSearch = (
  drawing: SearchableDrawing,
  searchTerm: string,
): boolean => {
  const needle = searchTerm.trim().toLocaleLowerCase();
  if (!needle) return true;
  const name = typeof drawing.name === "string" ? drawing.name : "";
  return (
    name.toLocaleLowerCase().includes(needle) ||
    getTypedCanvasText(drawing.elements).toLocaleLowerCase().includes(needle)
  );
};

export const paginateSearchResults = <T>(
  rows: T[],
  offset?: number,
  limit?: number,
): T[] => {
  const start = offset ?? 0;
  return rows.slice(start, limit === undefined ? undefined : start + limit);
};
