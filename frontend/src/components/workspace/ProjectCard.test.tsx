import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectCard } from "./ProjectCard";

vi.mock("./SlideThumbnail", () => ({
  SlideThumbnail: () => <div data-testid="project-preview" />,
}));

describe("ProjectCard", () => {
  it("uses the whole card as one project action", () => {
    const onView = vi.fn();
    render(
      <ProjectCard
        project={{
          id: "project-1",
          name: "Team roadmap",
          color: "#7c3aed",
          createdAt: 1,
          lastActivityAt: Date.now() - 60_000,
          drawingCount: 1,
        }}
        onView={onView}
      />,
    );

    const cardAction = screen.getByRole("button", {
      name: "Open Team roadmap project",
    });
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(cardAction).toContainElement(screen.getByTestId("project-preview"));
    expect(cardAction).toHaveTextContent("1 canvas");
    expect(cardAction.querySelector(".lucide-layers-2")).not.toBeNull();

    fireEvent.click(cardAction);
    expect(onView).toHaveBeenCalledOnce();
  });

  it("uses an explicit plural count label", () => {
    render(
      <ProjectCard
        project={{
          id: "project-2",
          name: "Launch",
          createdAt: 1,
          drawingCount: 3,
        }}
        onView={vi.fn()}
      />,
    );

    expect(screen.getByText("3 canvases")).toBeVisible();
    expect(screen.getByText("No recent activity")).toBeVisible();
  });
});
