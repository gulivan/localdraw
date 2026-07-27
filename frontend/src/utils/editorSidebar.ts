export const EDITOR_SIDEBAR_SCOPE_KEY = "excalidash-editor-sidebar-scope";

export type EditorSidebarScope = "current" | "all";

export const readEditorSidebarScope = (): EditorSidebarScope => {
  if (typeof window === "undefined") return "current";
  try {
    return window.localStorage?.getItem?.(EDITOR_SIDEBAR_SCOPE_KEY) === "all"
      ? "all"
      : "current";
  } catch {
    return "current";
  }
};

export const writeEditorSidebarScope = (scope: EditorSidebarScope) => {
  try {
    window.localStorage?.setItem?.(EDITOR_SIDEBAR_SCOPE_KEY, scope);
  } catch {
    // Ignore unavailable storage in private/embedded contexts.
  }
};
