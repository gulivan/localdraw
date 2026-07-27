import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Home } from "./Home";

const mocks = vi.hoisted(() => ({
  createCollection: vi.fn(),
  createDrawing: vi.fn(),
  getCollections: vi.fn(),
  getDrawings: vi.fn(),
  projectCard: vi.fn(),
  uploadFiles: vi.fn(),
}));

vi.mock("../api", () => ({
  createCollection: mocks.createCollection,
  createDrawing: mocks.createDrawing,
  getCollections: mocks.getCollections,
  getDrawings: mocks.getDrawings,
}));

vi.mock("../context/UploadContext", () => ({
  useUpload: () => ({ uploadFiles: mocks.uploadFiles }),
}));

vi.mock("../components/UploadStatus", () => ({ UploadStatus: () => null }));

vi.mock("../components/workspace/SlideThumbnail", () => ({
  SlideThumbnail: () => <div data-testid="slide-thumbnail" />,
}));

vi.mock("../components/workspace/ProjectCard", () => ({
  ProjectCard: ({ project }: { project: { name: string } }) => {
    mocks.projectCard(project);
    return <article>{project.name}</article>;
  },
}));

vi.mock("../components/workspace/WorkspaceHeader", () => ({
  WorkspaceHeader: ({
    query,
    onQueryChange,
  }: {
    query: string;
    onQueryChange: (value: string) => void;
  }) => (
    <header>
      <input
        aria-label="Search workspace"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
    </header>
  ),
}));

vi.mock("../components/workspace/NewProjectDialog", () => ({
  NewProjectDialog: ({
    open,
    onCreate,
  }: {
    open: boolean;
    onCreate: (name: string, color: string) => Promise<void>;
  }) =>
    open ? (
      <button
        type="button"
        onClick={() => void onCreate("Roadmap", "#7c3aed")}
      >
        Confirm project
      </button>
    ) : null,
}));

const drawing = (overrides: Record<string, unknown> = {}) => ({
  id: "slide-1",
  name: "Opening canvas",
  collectionId: "project-1",
  sortOrder: 0,
  version: 1,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
});

describe("Home workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCollections.mockResolvedValue([
      {
        id: "project-1",
        name: "Product story",
        color: "#0ea5e9",
        drawingCount: 1,
        latestDrawing: drawing(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);
    mocks.getDrawings.mockImplementation((query?: string, collectionId?: string | null) => {
      if (query) {
        return Promise.resolve({
          drawings: [drawing({ id: "search-slide", name: "Needle sketch" })],
          totalCount: 1,
        });
      }
      if (collectionId === null) {
        return Promise.resolve({ drawings: [], totalCount: 0 });
      }
      return Promise.resolve({ drawings: [drawing()], totalCount: 1 });
    });
    mocks.createCollection.mockResolvedValue({ id: "project-new" });
  });

  it("loads resume content and searches canvases without losing project context", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Recent")).toBeInTheDocument();
    expect(screen.getByText("Product story")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All items" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Opening canvas/ })).not.toHaveClass(
      "hover:-translate-y-0.5",
    );
    expect(mocks.getDrawings).toHaveBeenCalledWith(
      undefined,
      undefined,
      expect.objectContaining({ limit: 5 }),
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Search workspace" }), {
      target: { value: "needle" },
    });

    expect(await screen.findByText("Needle sketch")).toBeInTheDocument();
    expect(screen.getByText("Results for “needle”")).toBeInTheDocument();
  });

  it("creates a project with its initial canvas option", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/projects/:id" element={<div>Project destination</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText("Recent");
    fireEvent.click(screen.getByRole("button", { name: "New project" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm project" }));

    await waitFor(() =>
      expect(mocks.createCollection).toHaveBeenCalledWith("Roadmap", {
        color: "#7c3aed",
        createInitialDrawing: true,
      }),
    );
    expect(await screen.findByText("Project destination")).toBeInTheDocument();
  });

  it("models Other with the same project card metadata", async () => {
    const unfiledSlide = drawing({
      id: "other-canvas",
      name: "Loose canvas",
      collectionId: null,
      updatedAt: Date.now() - 180_000,
    });
    mocks.getDrawings.mockImplementation(
      (_query?: string, collectionId?: string | null) =>
        collectionId === null
          ? Promise.resolve({ drawings: [unfiledSlide], totalCount: 8 })
          : Promise.resolve({ drawings: [drawing()], totalCount: 1 }),
    );

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText("Other");
    expect(mocks.projectCard).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Other",
        drawingCount: 8,
        lastActivityAt: unfiledSlide.updatedAt,
        latestDrawing: unfiledSlide,
      }),
    );
  });
});
