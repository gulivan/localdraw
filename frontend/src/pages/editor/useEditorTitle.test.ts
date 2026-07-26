import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useEditorTitle } from "./useEditorTitle";

describe("useEditorTitle", () => {
  it("updates the canvas id and name atomically", () => {
    const { result } = renderHook(() => useEditorTitle());

    act(() => result.current.setDrawingTitle("canvas-2", "Element 2"));

    expect(result.current.drawingNameSourceId).toBe("canvas-2");
    expect(result.current.drawingName).toBe("Element 2");
  });
});
