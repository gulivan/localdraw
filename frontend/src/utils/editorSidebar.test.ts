import { beforeEach, describe, expect, it } from "vitest";
import {
  EDITOR_SIDEBAR_SCOPE_KEY,
  readEditorSidebarScope,
  writeEditorSidebarScope,
} from "./editorSidebar";

describe("editor sidebar scope", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: () => values.clear(),
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
  });

  it("defaults to the current project only", () => {
    expect(readEditorSidebarScope()).toBe("current");
  });

  it("persists the all-projects preference", () => {
    writeEditorSidebarScope("all");

    expect(window.localStorage.getItem(EDITOR_SIDEBAR_SCOPE_KEY)).toBe("all");
    expect(readEditorSidebarScope()).toBe("all");
  });
});
