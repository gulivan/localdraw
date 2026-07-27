import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectSlideCard } from "./ProjectSlideCard";

vi.mock("./SlideThumbnail", () => ({
  SlideThumbnail: () => <div data-testid="slide-preview" />,
}));

const renderCard = (isSelected = false) => {
  const onToggleSelection = vi.fn();
  render(
    <ProjectSlideCard
      slide={{
        id: "canvas-1",
        name: "Opening",
        collectionId: "project-1",
        createdAt: 1,
        updatedAt: 1,
        version: 1,
      }}
      index={0}
      projects={[]}
      canOrganize
      isSelected={isSelected}
      onToggleSelection={onToggleSelection}
      onOpen={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      onDuplicate={vi.fn()}
      onMove={vi.fn()}
      onReorder={vi.fn()}
      onDropAt={vi.fn()}
    />,
  );
  return onToggleSelection;
};

describe("ProjectSlideCard selection", () => {
  it("reveals a top-right selection control on hover or keyboard focus", () => {
    const onToggleSelection = renderCard();
    const select = screen.getByRole("button", { name: "Select Opening" });

    expect(select).toHaveClass("absolute", "right-3", "top-3", "opacity-0");
    expect(select).toHaveClass("group-hover:opacity-100", "focus-visible:opacity-100");
    expect(select).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(select);
    expect(onToggleSelection).toHaveBeenCalledOnce();
  });

  it("keeps the checkmark visible while selected", () => {
    renderCard(true);
    const deselect = screen.getByRole("button", { name: "Deselect Opening" });

    expect(deselect).toHaveClass("opacity-100", "bg-violet-600");
    expect(deselect).toHaveAttribute("aria-pressed", "true");
    expect(deselect.querySelector(".lucide-check")).not.toBeNull();
  });
});
