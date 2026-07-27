import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_RECENT_CANVASES_LIMIT,
  readRecentCanvasesLimit,
  writeRecentCanvasesLimit,
} from "./recentCanvases";

describe("recent canvas preference", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
  });

  it("defaults to five canvases", () => {
    expect(readRecentCanvasesLimit()).toBe(DEFAULT_RECENT_CANVASES_LIMIT);
  });

  it("persists the selected limit and constrains invalid ranges", () => {
    expect(writeRecentCanvasesLimit(12)).toBe(12);
    expect(readRecentCanvasesLimit()).toBe(12);
    expect(writeRecentCanvasesLimit(100)).toBe(20);
    expect(writeRecentCanvasesLimit(0)).toBe(1);
  });
});
