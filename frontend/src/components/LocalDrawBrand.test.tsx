import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LocalDrawBrand } from "./LocalDrawBrand";

describe("LocalDrawBrand", () => {
  it("shows linked project provenance from the help control", () => {
    render(<LocalDrawBrand />);

    const trigger = screen.getByRole("button", { name: "About LocalDraw" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("link", { name: "ExcaliDash" }),
    ).toHaveAttribute("href", "https://github.com/ZimengXiong/ExcaliDash");
    expect(
      screen.getByRole("link", { name: "Excalidraw" }),
    ).toHaveAttribute("href", "https://github.com/excalidraw/excalidraw");
  });

  it("closes an opened provenance card with Escape", () => {
    render(<LocalDrawBrand compact />);

    const trigger = screen.getByRole("button", { name: "About LocalDraw" });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("opens on hover and closes when the pointer leaves", () => {
    const { container } = render(<LocalDrawBrand />);
    const brand = container.firstElementChild as HTMLElement;
    const trigger = screen.getByRole("button", { name: "About LocalDraw" });

    fireEvent.mouseEnter(brand);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.mouseLeave(brand);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
