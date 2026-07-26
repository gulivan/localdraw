import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Project } from "./Project";

const mocks = vi.hoisted(() => ({
  deleteCollection: vi.fn(),
  getCollections: vi.fn(),
  getDrawings: vi.fn(),
  placeDrawing: vi.fn(),
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
});
