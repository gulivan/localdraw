import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Project } from "./Project";

const mocks = vi.hoisted(() => ({
  deleteCollection: vi.fn(),
  deleteDrawing: vi.fn(),
  getCollections: vi.fn(),
  getDrawing: vi.fn(),
  getDrawings: vi.fn(),
  placeDrawing: vi.fn(),
  updateCollection: vi.fn(),
  updateDrawing: vi.fn(),
  uploadFiles: vi.fn(),
  exportDrawingToFile: vi.fn(),
}));

vi.mock("../api", () => mocks);
vi.mock("../context/UploadContext", () => ({
  useUpload: () => ({ uploadFiles: mocks.uploadFiles }),
}));
vi.mock("../components/UploadStatus", () => ({ UploadStatus: () => null }));
vi.mock("../utils/exportUtils", () => ({
  exportDrawingToFile: mocks.exportDrawingToFile,
}));
vi.mock("../components/workspace/ProjectSlideCard", () => ({
  ProjectSlideCard: ({
    slide,
    index,
    onDelete,
    onOpen,
    onReorder,
    isSelected,
    onToggleSelection,
  }: {
    slide: { name: string };
    index: number;
    onDelete: () => void;
    onOpen: () => void;
    onReorder: (targetIndex: number) => void;
    isSelected: boolean;
    onToggleSelection: () => void;
  }) => (
    <article>
      <span>{slide.name}</span>
      <button
        type="button"
        aria-pressed={isSelected}
        onClick={onToggleSelection}
      >
        {isSelected ? "Deselect" : "Select"} {slide.name}
      </button>
      <button type="button" onClick={() => onReorder(index - 1)}>
        Move {slide.name} earlier
      </button>
      <button type="button" onClick={onDelete}>
        Trash {slide.name}
      </button>
      <button type="button" onClick={onOpen}>
        Open {slide.name}
      </button>
    </article>
  ),
}));

const EditorDestination = () => {
  const location = useLocation();
  const state = location.state as {
    disposableDraft?: { drawingId?: string; updatedAt?: number };
  } | null;
  return <div>Editor draft {state?.disposableDraft?.drawingId ?? "none"}</div>;
};

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
    mocks.getDrawing.mockImplementation(async (id: string) => ({
      ...slides.find((slide) => slide.id === id),
      elements: [],
      appState: {},
      files: {},
    }));
    mocks.placeDrawing.mockResolvedValue({ drawing: {}, orders: [] });
    mocks.deleteCollection.mockResolvedValue({ success: true });
    mocks.deleteDrawing.mockResolvedValue({ success: true });
    mocks.updateCollection.mockResolvedValue({
      id: "project-1",
      name: "Storyboard",
      color: "#0284c7",
      createdAt: 1,
    });
    mocks.updateDrawing.mockResolvedValue({});
  });

  it("loads canvases in project order and exposes accessible organization actions", async () => {
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

  it("forwards a new project's initial canvas draft marker to the editor", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/projects/project-1",
            state: {
              disposableDraft: { drawingId: "slide-1", updatedAt: 1 },
            },
          },
        ]}
      >
        <Routes>
          <Route path="/projects/:id" element={<Project />} />
          <Route path="/editor/:id" element={<EditorDestination />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Open First" }));

    expect(await screen.findByText("Editor draft slide-1")).toBeInTheDocument();
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

  it("offers to move canvases to Trash when deleting a project", async () => {
    render(
      <MemoryRouter initialEntries={["/projects/project-1"]}>
        <Routes>
          <Route path="/projects/:id" element={<Project />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Delete project" }));
    expect(screen.getByText("Delete project “Storyboard”?")).toBeInTheDocument();
    expect(screen.getByText("Its canvases will move to Other.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Delete canvases too." }));
    expect(screen.getByText("Its canvases will move to Trash.")).toBeInTheDocument();
    const deleteButtons = screen.getAllByRole("button", { name: "Delete project" });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);

    await waitFor(() =>
      expect(mocks.deleteCollection).toHaveBeenCalledWith("project-1", {
        deleteSlides: true,
      }),
    );
  });

  it("selects multiple canvases for bulk export and deletion", async () => {
    render(
      <MemoryRouter initialEntries={["/projects/project-1"]}>
        <Routes>
          <Route path="/projects/:id" element={<Project />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText("First");
    expect(screen.queryByRole("button", { name: "Export bulk" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select First" }));
    fireEvent.click(screen.getByRole("button", { name: "Select Second" }));

    fireEvent.click(screen.getByRole("button", { name: "Export bulk" }));
    await waitFor(() => {
      expect(mocks.getDrawing).toHaveBeenCalledWith("slide-1");
      expect(mocks.getDrawing).toHaveBeenCalledWith("slide-2");
      expect(mocks.exportDrawingToFile).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete bulk" }));
    expect(
      screen.getByText("Delete 2 selected canvases?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The selected canvases will move to Trash."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Move to Trash" }));
    await waitFor(() => {
      expect(mocks.updateDrawing).toHaveBeenCalledWith("slide-1", {
        collectionId: "trash",
      });
      expect(mocks.updateDrawing).toHaveBeenCalledWith("slide-2", {
        collectionId: "trash",
      });
    });
    expect(screen.queryByText("First")).not.toBeInTheDocument();
    expect(screen.queryByText("Second")).not.toBeInTheDocument();
  });

  it("can permanently bulk delete selected canvases instead of using Trash", async () => {
    render(
      <MemoryRouter initialEntries={["/projects/project-1"]}>
        <Routes>
          <Route path="/projects/:id" element={<Project />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText("First");
    fireEvent.click(screen.getByRole("button", { name: "Select First" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete bulk" }));
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Skip Trash and delete permanently.",
      }),
    );

    expect(
      screen.getByText(
        "The selected canvases will be permanently deleted. This cannot be undone.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Delete permanently" }),
    );

    await waitFor(() =>
      expect(mocks.deleteDrawing).toHaveBeenCalledWith("slide-1"),
    );
    expect(mocks.updateDrawing).not.toHaveBeenCalled();
  });
});
