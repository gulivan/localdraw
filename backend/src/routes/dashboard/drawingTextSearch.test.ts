import { describe, expect, it } from "vitest";
import {
  getTypedCanvasText,
  matchesDrawingSearch,
  paginateSearchResults,
} from "./drawingTextSearch";

describe("typed canvas text search", () => {
  const elements = JSON.stringify([
    { type: "rectangle", id: "metadata-needle", label: "ignore this" },
    { type: "text", text: "Quarterly Roadmap", originalText: "Quarterly Roadmap" },
    { type: "text", text: "Deleted secret", isDeleted: true },
    { type: "image", fileId: "roadmap-image", alt: "ignore image text" },
  ]);

  it("extracts only live typed text elements", () => {
    expect(getTypedCanvasText(elements)).toBe("Quarterly Roadmap");
  });

  it("matches names and typed text case-insensitively", () => {
    expect(matchesDrawingSearch({ name: "Launch", elements: "[]" }, "launch")).toBe(true);
    expect(matchesDrawingSearch({ name: "Untitled", elements }, "ROADMAP")).toBe(true);
  });

  it("does not match shape metadata, deleted text, or image metadata", () => {
    expect(matchesDrawingSearch({ name: "Untitled", elements }, "metadata-needle")).toBe(false);
    expect(matchesDrawingSearch({ name: "Untitled", elements }, "Deleted secret")).toBe(false);
    expect(matchesDrawingSearch({ name: "Untitled", elements }, "roadmap-image")).toBe(false);
  });

  it("paginates after text filtering", () => {
    expect(paginateSearchResults([1, 2, 3, 4], 1, 2)).toEqual([2, 3]);
  });
});
