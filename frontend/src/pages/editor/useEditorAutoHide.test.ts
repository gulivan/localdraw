import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorAutoHide } from "./useEditorAutoHide";

describe("useEditorAutoHide", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: vi.fn(() => values.clear()),
        getItem: vi.fn((key: string) => values.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      },
    });
  });

  it("persists one header preference across editor instances", () => {
    const first = renderHook(() => useEditorAutoHide());

    act(() => first.result.current.setAutoHideEnabled(false));
    first.unmount();

    const second = renderHook(() => useEditorAutoHide());
    expect(second.result.current.autoHideEnabled).toBe(false);
  });
});
