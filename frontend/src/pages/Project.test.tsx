import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Project } from "./Project";

const mocks = vi.hoisted(() => ({
  deleteCollection: vi.fn(),
  getCollections: vi.fn(),
  getDrawings: vi.fn(),
  placeDrawing: vi.fn(),
  updateCollection: vi.fn(),
  updateDrawing: vi.fn(),
  uploadFiles: vi.fn(),
}));

vi.mock("../api", () => mocks);
vi.mock("../context/UploadContext", () => ({
  useUpload: () => ({ uploadFiles: mocks.uploadFiles }),
}));
vi.mock("../components/UploadStatus", () => ({ UploadStatus: () => null }));
vi.mock("../components/workspace/ProjectSlideCard", () => ({
  ProjectSlideCard: ({
    slide,
    index,
    onDelete,
    onReorder,
  }: {
    slide: { name: string };
    index: number;
    onDelete: () => void;
    onReorder: (targetIndex: number) => void;
  }) => (
    <article>
      <span>{slide.name}</span>
      <button type="button" onClick={() => onReorder(index - 1)}>
        Move {slide.name} earlier
      </button>
      <button type="button" onClick={onDelete}>
        Trash {slide.name}
      </button>
    </article>
  ),
}));

const slides = [
  {
    id: "slide-1",
    name: "First",
    collectionId: "project-1",
    sortOrder: 0,
    version: 1,
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: "slide-2",
    name: "Second",
    collectionId: "project-1",
    sortOrder: 1,
    version: 1,
    createdAt: 2,
    updatedAt: 2,
  },
];

describe("Project workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCollections.mockResolvedValue([
      {
        id: "project-1",
        name: "Storyboard",
        color: "#7c3aed",
        drawingCount: 2,
        createdAt: 1,
      },
    ]);
    mocks.getDrawings.mockResolvedValue({ drawings: slides, totalCount: 2 });
    mocks.placeDrawing.mockResolvedValue({ drawing: {}, orders: [] });
    mocks.deleteCollection.mockResolvedValue({ success: true });
    mocks.updateCollection.mockResolvedValue({
      id: "project-1",
      name: "Storyboard",
      color: "#0284c7",
      createdAt: 1,
    });
    mocks.updateDrawing.mockResolvedValue({});
  });

  it("loads slides in project order and exposes accessible organization actions", async () => {
    render(
      <MemoryRouter initialEntries={["/projects/project-1"]}>
        <Routes>
          <Route path="/projects/:id" element={<Project />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("First")).toBeInTheDocument();
    expect(mocks.getDrawings).toHaveBeenCalledWith(undefined, "project-1", {
      includePreview: true,
      limit: 200,
      sortField: "sortOrder",
      sortDirection: "asc",
    });

    fireEvent.click(screen.getByRole("button", { name: "Move Second earlier" }));
    await waitFor(() =>
      expect(mocks.placeDrawing).toHaveBeenCalledWith(
        "slide-2",
        "project-1",
        0,
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Trash Second" }));
    await waitFor(() =>
      expect(mocks.updateDrawing).toHaveBeenCalledWith("slide-2", {
        collectionId: "trash",
      }),
    );
  });

  it("uses one large editable project title and reveals colors on demand", async () => {
    render(
      <MemoryRouter initialEntries={["/projects/project-1"]}>
        <Routes>
          <Route path="/projects/:id" element={<Project />} />
        </Routes>
      </MemoryRouter>,
    );

    const title = await screen.findByRole("button", { name: "Storyboard" });
    expect(title).toHaveClass("text-2xl");
    expect(screen.queryByRole("heading", { name: "Storyboard" })).not.toBeInTheDocument();

    const colorTrigger = screen.getByLabelText("Change project color");
    const colorPicker = colorTrigger.closest("details");
    expect(colorPicker).not.toHaveAttribute("open");
    fireEvent.click(colorTrigger);
    expect(colorPicker).toHaveAttribute("open");
    fireEvent.click(screen.getByRole("button", { name: "Use project color #0284c7" }));
    expect(colorPicker).not.toHaveAttribute("open");

    await waitFor(() =>
      expect(mocks.updateCollection).toHaveBeenCalledWith("project-1", {
        color: "#0284c7",
      }),
    );
  });

  it("offers to move slides to Trash when deleting a project", async () => {
    render(
      <MemoryRouter initialEntries={["/projects/project-1"]}>
        <Routes>
          <Route path="/projects/:id" element={<Project />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Delete project" }));
    expect(screen.getByText("Delete project “Storyboard”?")).toBeInTheDocument();
    expect(screen.getByText("Its slides will move to Unfiled.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Delete slides too." }));
    expect(screen.getByText("Its slides will move to Trash.")).toBeInTheDocument();
    const deleteButtons = screen.getAllByRole("button", { name: "Delete project" });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);

    await waitFor(() =>
      expect(mocks.deleteCollection).toHaveBeenCalledWith("project-1", {
        deleteSlides: true,
      }),
    );
  });
});
