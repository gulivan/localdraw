import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditorProjectRail } from "./EditorProjectRail";

const getDrawing = vi.fn();
const getCollections = vi.fn();
const getDrawings = vi.fn();

vi.mock("../../api", () => ({
  getDrawing: (...args: unknown[]) => getDrawing(...args),
  getCollections: (...args: unknown[]) => getCollections(...args),
  getDrawings: (...args: unknown[]) => getDrawings(...args),
  placeDrawing: vi.fn(),
  createDrawing: vi.fn(),
  duplicateDrawing: vi.fn(),
  updateDrawing: vi.fn(),
}));

const project = {
  id: "project-1",
  name: "Private project",
  color: "#7c3aed",
  createdAt: 1,
  drawingCount: 1,
};
const otherSlide = {
  id: "canvas-other",
  name: "Current canvas",
  collectionId: null,
  createdAt: 1,
  updatedAt: 1,
  version: 1,
};
const projectSlide = {
  ...otherSlide,
  id: "canvas-project",
  name: "Project canvas",
  collectionId: project.id,
};

const renderRail = (projectScope: "current" | "all") => {
  const onNavigateTo = vi.fn().mockResolvedValue(true);
  render(
    <EditorProjectRail
      drawingId={otherSlide.id}
      drawingName={otherSlide.name}
      drawingNameSourceId={otherSlide.id}
      canEdit
      projectScope={projectScope}
      onSelectDrawing={vi.fn().mockResolvedValue(true)}
      onNavigateTo={onNavigateTo}
    />,
  );
  return { onNavigateTo };
};

describe("EditorProjectRail project visibility", () => {
  beforeEach(() => {
    getDrawing.mockReset();
    getCollections.mockReset();
    getDrawings.mockReset();
    getDrawing.mockResolvedValue({ ...otherSlide, elements: [], appState: {}, files: {} });
    getCollections.mockResolvedValue([project]);
    getDrawings.mockImplementation(
      async (_search: unknown, collectionId: string | null) => ({
        drawings: collectionId === project.id ? [projectSlide] : [otherSlide],
        totalCount: 1,
      }),
    );
  });

  it("shows only Other when the current canvas has no project", async () => {
    renderRail("current");

    expect(
      await screen.findByRole("button", { name: /Other/, expanded: true }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", {
        name: /Private project/,
        expanded: false,
      }),
    ).not.toBeInTheDocument();
  });

  it("expands projects inline and uses the link control for page navigation", async () => {
    const { onNavigateTo } = renderRail("all");
    const projectToggle = await screen.findByRole("button", {
      name: /Private project/,
      expanded: false,
    });

    expect(screen.queryByText("Project canvas")).not.toBeInTheDocument();
    fireEvent.click(projectToggle);
    expect(await screen.findByText("Project canvas")).toBeVisible();
    expect(onNavigateTo).not.toHaveBeenCalled();

    const projectLink = screen.getByRole("button", {
      name: "Open Private project project page",
    });
    expect(projectLink.querySelector(".lucide-external-link")).not.toBeNull();
    fireEvent.click(projectLink);
    await waitFor(() =>
      expect(onNavigateTo).toHaveBeenCalledWith("/projects/project-1"),
    );
  });

  it("shows the Other count before Other is expanded", async () => {
    getDrawing.mockResolvedValue({
      ...projectSlide,
      elements: [],
      appState: {},
      files: {},
    });
    renderRail("all");

    const otherToggle = await screen.findByRole("button", {
      name: "Other",
      expanded: false,
    });
    const otherRow = otherToggle.parentElement;
    expect(otherRow).not.toBeNull();
    expect(within(otherRow!).getByText("1")).toBeVisible();
    expect(getDrawings).toHaveBeenCalledWith(
      undefined,
      null,
      expect.objectContaining({ limit: 200 }),
    );
  });
});
