import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RecentCanvasesSettingsCard } from "./RecentCanvasesSettingsCard";

describe("RecentCanvasesSettingsCard", () => {
  it("commits a new maximum when the field loses focus", () => {
    const onChange = vi.fn();
    render(<RecentCanvasesSettingsCard value={5} onChange={onChange} />);

    const input = screen.getByRole("spinbutton", {
      name: "Maximum recent canvases",
    });
    fireEvent.change(input, { target: { value: "8" } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith(8);
  });
});
