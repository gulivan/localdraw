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
const updateDrawing = vi.fn();
const createDrawing = vi.fn();
const duplicateDrawing = vi.fn();
const placeDrawing = vi.fn();
const deleteDrawingIfUntouched = vi.fn();

vi.mock("../../api", () => ({
  getDrawing: (...args: unknown[]) => getDrawing(...args),
  getCollections: (...args: unknown[]) => getCollections(...args),
  getDrawings: (...args: unknown[]) => getDrawings(...args),
  placeDrawing: (...args: unknown[]) => placeDrawing(...args),
  createDrawing: (...args: unknown[]) => createDrawing(...args),
  duplicateDrawing: (...args: unknown[]) => duplicateDrawing(...args),
  updateDrawing: (...args: unknown[]) => updateDrawing(...args),
  deleteDrawingIfUntouched: (...args: unknown[]) =>
    deleteDrawingIfUntouched(...args),
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

const renderRail = (
  projectScope: "current" | "all",
  drawing = otherSlide,
  onSelectDrawing = vi.fn().mockResolvedValue(true),
) => {
  const onNavigateTo = vi.fn().mockResolvedValue(true);
  const onDrawingRenamed = vi.fn();
  render(
    <EditorProjectRail
      drawingId={drawing.id}
      drawingName={drawing.name}
      drawingNameSourceId={drawing.id}
      canEdit
      projectScope={projectScope}
      onSelectDrawing={onSelectDrawing}
      onNavigateTo={onNavigateTo}
      onDrawingRenamed={onDrawingRenamed}
    />,
  );
  return { onNavigateTo, onDrawingRenamed, onSelectDrawing };
};

describe("EditorProjectRail project visibility", () => {
  beforeEach(() => {
    getDrawing.mockReset();
    getCollections.mockReset();
    getDrawings.mockReset();
    updateDrawing.mockReset();
    updateDrawing.mockResolvedValue(undefined);
    createDrawing.mockReset();
    createDrawing.mockResolvedValue({
      id: "canvas-new",
      updatedAt: 2,
    });
    duplicateDrawing.mockReset();
    duplicateDrawing.mockResolvedValue(undefined);
    placeDrawing.mockReset();
    placeDrawing.mockResolvedValue(undefined);
    deleteDrawingIfUntouched.mockReset();
    deleteDrawingIfUntouched.mockResolvedValue(true);
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

  it("renames a canvas inline on double click", async () => {
    getDrawing.mockResolvedValue({
      ...projectSlide,
      elements: [],
      appState: {},
      files: {},
    });
    const { onDrawingRenamed } = renderRail("current", projectSlide);

    const canvas = (await screen.findByText("Project canvas")).closest("button");
    expect(canvas).not.toBeNull();
    fireEvent.doubleClick(canvas!);
    const input = screen.getByRole("textbox", { name: "Rename Project canvas" });
    fireEvent.change(input, { target: { value: "Roadmap" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() =>
      expect(updateDrawing).toHaveBeenCalledWith(projectSlide.id, {
        name: "Roadmap",
      }),
    );
    expect(onDrawingRenamed).toHaveBeenCalledWith(projectSlide.id, "Roadmap");
    expect(await screen.findByText("Roadmap")).toBeVisible();
  });

  it("offers Rename in the canvas actions menu", async () => {
    getDrawing.mockResolvedValue({
      ...projectSlide,
      elements: [],
      appState: {},
      files: {},
    });
    renderRail("current", projectSlide);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Actions for Project canvas",
      }),
    );
    const rename = screen.getByRole("button", { name: "Rename" });
    expect(rename.querySelector(".lucide-pencil")).not.toBeNull();
    fireEvent.click(rename);

    expect(
      screen.getByRole("textbox", { name: "Rename Project canvas" }),
    ).toHaveFocus();
  });

  it("creates new items with canvas terminology", async () => {
    getDrawing.mockResolvedValue({
      ...projectSlide,
      elements: [],
      appState: {},
      files: {},
    });
    renderRail("current", projectSlide);

    fireEvent.click(await screen.findByRole("button", { name: "Add canvas" }));

    await waitFor(() =>
      expect(createDrawing).toHaveBeenCalledWith("Untitled canvas", project.id),
    );
  });

  it("uses the highest numbered canvas name after earlier drafts are removed", async () => {
    const canvasThree = {
      ...projectSlide,
      id: "canvas-3",
      name: "Canvas 3",
    };
    getDrawing.mockResolvedValue({
      ...canvasThree,
      elements: [],
      appState: {},
      files: {},
    });
    getDrawings.mockResolvedValue({
      drawings: [
        { ...projectSlide, name: "Canvas 1" },
        canvasThree,
      ],
      totalCount: 2,
    });
    renderRail("current", canvasThree);

    fireEvent.click(await screen.findByRole("button", { name: "Add canvas" }));

    await waitFor(() =>
      expect(createDrawing).toHaveBeenCalledWith("Untitled canvas", project.id),
    );
  });

  it("allows only one canvas creation request at a time", async () => {
    let finishCreation!: (drawing: { id: string; updatedAt: number }) => void;
    createDrawing.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishCreation = resolve;
        }),
    );
    getDrawing.mockResolvedValue({
      ...projectSlide,
      elements: [],
      appState: {},
      files: {},
    });
    renderRail("current", projectSlide);

    const addCanvas = await screen.findByRole("button", { name: "Add canvas" });
    fireEvent.click(addCanvas);
    fireEvent.click(addCanvas);

    expect(createDrawing).toHaveBeenCalledTimes(1);
    expect(addCanvas).toBeDisabled();

    finishCreation({ id: "canvas-new", updatedAt: 2 });
    await waitFor(() => expect(addCanvas).toBeEnabled());
  });

  it("cancels inline renaming when focus moves elsewhere", async () => {
    getDrawing.mockResolvedValue({
      ...projectSlide,
      elements: [],
      appState: {},
      files: {},
    });
    renderRail("current", projectSlide);

    const canvas = (await screen.findByText("Project canvas")).closest("button");
    fireEvent.doubleClick(canvas!);
    const input = screen.getByRole("textbox", { name: "Rename Project canvas" });
    fireEvent.change(input, { target: { value: "Discarded name" } });
    fireEvent.blur(input);

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("Project canvas")).toBeVisible();
    expect(updateDrawing).not.toHaveBeenCalled();
  });

  it("gives Other canvases the same actions without numbering them", async () => {
    renderRail("current");

    const canvas = await screen.findByRole("button", {
      name: "Current canvas",
    });
    expect(canvas).toHaveTextContent("Current canvas");
    expect(canvas).not.toHaveTextContent("1.");
    expect(
      screen.getByRole("button", { name: "Move canvas earlier" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Move canvas later" }),
    ).toBeEnabled();

    fireEvent.doubleClick(canvas);
    expect(
      screen.getByRole("textbox", { name: "Rename Current canvas" }),
    ).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Current canvas" }),
    );
    expect(screen.getByRole("button", { name: "Rename" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Duplicate" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Delete" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));

    await waitFor(() =>
      expect(duplicateDrawing).toHaveBeenCalledWith(otherSlide.id),
    );
  });
});
