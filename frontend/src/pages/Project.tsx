import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  FilePlus2,
  Folder,
  Loader2,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import * as api from "../api";
import { ConfirmModal } from "../components/ConfirmModal";
import { PROJECT_COLORS } from "../components/workspace/projectColors";
import { ProjectSlideCard } from "../components/workspace/ProjectSlideCard";
import {
  disposableDraftNavigationState,
  readDisposableDraft,
} from "./editor/disposableDraft";
import { UploadStatus } from "../components/UploadStatus";
import { useUpload } from "../context/UploadContext";
import type { Collection, DrawingSummary } from "../types";
import { exportDrawingToFile } from "../utils/exportUtils";

export const Project = ({ unfiled = false }: { unfiled?: boolean }) => {
  const { id } = useParams<{ id: string }>();
  const collectionId: string | null = unfiled ? null : (id ?? null);
  const navigate = useNavigate();
  const location = useLocation();
  const { uploadFiles } = useUpload();
  const fileRef = useRef<HTMLInputElement>(null);
  const colorPickerRef = useRef<HTMLDetailsElement>(null);
  const [projects, setProjects] = useState<Collection[]>([]);
  const [project, setProject] = useState<Collection | null>(null);
  const [slides, setSlides] = useState<DrawingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteSlides, setDeleteSlides] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkExporting, setBulkExporting] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [deleteBulkPermanently, setDeleteBulkPermanently] = useState(false);

  const load = useCallback(async () => {
    if (!unfiled && !id) return;
    setLoading(true);
    setError(null);
    try {
      const [collections, drawingRows] = await Promise.all([
        api.getCollections({ includeOverview: true }),
        api.getDrawings(undefined, collectionId, {
          includePreview: true,
          limit: 200,
          sortField: "sortOrder",
          sortDirection: "asc",
        }),
      ]);
      const active = unfiled
        ? { id: "unorganized", name: "Other", color: "#71717a", createdAt: Date.now() }
        : collections.find((item) => item.id === id) ?? null;
      if (!active) throw new Error("Project not found");
      setProjects(collections.filter((item) => item.id !== "trash"));
      setProject(active);
      setName(active.name);
      setSlides(drawingRows.drawings);
      setSelectedIds(new Set());
    } catch (loadError) {
      console.error(loadError);
      setError("This project could not be opened.");
    } finally {
      setLoading(false);
    }
  }, [collectionId, id, unfiled]);

  useEffect(() => void load(), [load]);

  const place = async (slideId: string, collectionId: string | null, targetIndex: number) => {
    const previous = slides;
    if (collectionId === (unfiled ? null : id)) {
      const next = slides.filter((slide) => slide.id !== slideId);
      const moved = slides.find((slide) => slide.id === slideId);
      if (!moved) return;
      next.splice(Math.max(0, Math.min(targetIndex, next.length)), 0, moved);
      setSlides(next.map((slide, sortOrder) => ({ ...slide, sortOrder })));
    } else {
      setSlides((current) => current.filter((slide) => slide.id !== slideId));
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(slideId);
        return next;
      });
    }
    try {
      await api.placeDrawing(slideId, collectionId, targetIndex);
    } catch (placementError) {
      console.error(placementError);
      setSlides(previous);
    }
  };

  const createSlide = async () => {
    const drawing = await api.createDrawing(`Canvas ${slides.length + 1}`, collectionId);
    navigate(`/editor/${drawing.id}`, {
      state: disposableDraftNavigationState(drawing),
    });
  };

  const openCanvas = (canvas: DrawingSummary) => {
    const initialDraft = readDisposableDraft(location.state, canvas.id);
    navigate(
      `/editor/${canvas.id}`,
      initialDraft ? { state: { disposableDraft: initialDraft } } : undefined,
    );
  };

  const saveName = async () => {
    if (unfiled || !project || !name.trim()) return;
    const updated = await api.updateCollection(project.id, { name: name.trim() });
    setProject((current) => (current ? { ...current, name: updated.name } : current));
    setRenaming(false);
  };

  const updateColor = async (color: string) => {
    if (unfiled || !project) return;
    setProject({ ...project, color });
    try {
      await api.updateCollection(project.id, { color });
    } catch {
      await load();
    }
  };

  const renameSlide = async (slide: DrawingSummary) => {
    const nextName = window.prompt("Rename canvas", slide.name)?.trim();
    if (!nextName) return;
    setSlides((current) =>
      current.map((item) =>
        item.id === slide.id ? { ...item, name: nextName } : item,
      ),
    );
    try {
      await api.updateDrawing(slide.id, { name: nextName });
    } catch {
      await load();
    }
  };

  const moveSlideToTrash = async (slideId: string) => {
    setSlides((current) => current.filter((item) => item.id !== slideId));
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(slideId);
      return next;
    });
    try {
      await api.updateDrawing(slideId, { collectionId: "trash" });
    } catch {
      await load();
    }
  };

  const duplicateSlide = async (slideId: string) => {
    try {
      await api.duplicateDrawing(slideId);
      await load();
    } catch (duplicateError) {
      console.error("Failed to duplicate canvas", duplicateError);
    }
  };

  const toggleSlideSelection = (slideId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(slideId)) next.delete(slideId);
      else next.add(slideId);
      return next;
    });
  };

  const exportSelected = async () => {
    if (selectedIds.size === 0 || bulkExporting) return;
    setBulkExporting(true);
    try {
      const drawings = await Promise.all(
        slides
          .filter((slide) => selectedIds.has(slide.id))
          .map((slide) => api.getDrawing(slide.id)),
      );
      drawings.forEach((drawing) => exportDrawingToFile(drawing));
    } catch (exportError) {
      console.error("Failed bulk export", exportError);
    } finally {
      setBulkExporting(false);
    }
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0 || bulkDeleting) return;
    const ids = Array.from(selectedIds);
    setBulkDeleteModalOpen(false);
    setBulkDeleting(true);
    setSlides((current) =>
      current.filter((slide) => !selectedIds.has(slide.id)),
    );
    setSelectedIds(new Set());
    try {
      if (deleteBulkPermanently) {
        await Promise.all(ids.map((slideId) => api.deleteDrawing(slideId)));
      } else {
        await Promise.all(
          ids.map((slideId) =>
            api.updateDrawing(slideId, { collectionId: "trash" }),
          ),
        );
      }
    } catch (deleteError) {
      console.error("Failed bulk delete", deleteError);
      await load();
    } finally {
      setBulkDeleting(false);
      setDeleteBulkPermanently(false);
    }
  };

  const closeBulkDeleteModal = () => {
    setBulkDeleteModalOpen(false);
    setDeleteBulkPermanently(false);
  };

  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    await uploadFiles(Array.from(files), collectionId);
    await load();
  };

  const removeProject = async () => {
    if (!project) return;
    await api.deleteCollection(project.id, { deleteSlides });
    navigate("/");
  };

  const closeDeleteModal = () => {
    setDeleteModalOpen(false);
    setDeleteSlides(false);
  };

  if (loading) {
    return <div className="workspace-shell flex min-h-screen items-center justify-center"><Loader2 className="animate-spin text-violet-600" aria-label="Loading project" /></div>;
  }
  if (error || !project) {
    return <div className="workspace-shell flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center"><Folder size={32} className="text-zinc-400" /><p className="font-semibold">{error || "Project not found"}</p><button type="button" onClick={() => navigate("/")} className="workspace-focus rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">Back home</button></div>;
  }

  return (
    <div className="workspace-shell min-h-screen">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <button type="button" onClick={() => navigate("/")} className="workspace-focus flex h-9 w-9 items-center justify-center rounded-xl text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800" aria-label="Back to Home"><ArrowLeft size={19} /></button>
          {!unfiled && <details ref={colorPickerRef} className="relative"><summary aria-label="Change project color" className="workspace-focus h-8 w-1.5 cursor-pointer list-none rounded-full [&::-webkit-details-marker]:hidden" style={{ backgroundColor: project.color || "#7c3aed" }} /><div className="absolute left-0 top-10 z-50 flex gap-2 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">{PROJECT_COLORS.map((color) => <button key={color} type="button" onClick={() => { colorPickerRef.current?.removeAttribute("open"); void updateColor(color); }} aria-label={`Use project color ${color}`} aria-pressed={project.color === color} className={`workspace-focus h-6 w-6 rounded-full border-2 border-white dark:border-zinc-900 ${project.color === color ? "ring-2 ring-zinc-900 ring-offset-1 dark:ring-zinc-100 dark:ring-offset-zinc-900" : ""}`} style={{ backgroundColor: color }} />)}</div></details>}
          <div className="min-w-0 flex-1">
            {renaming ? (
              <form onSubmit={(event) => { event.preventDefault(); void saveName(); }}><input autoFocus value={name} onChange={(event) => setName(event.target.value)} onBlur={() => void saveName()} className="workspace-focus h-10 w-full max-w-md rounded-lg border border-violet-300 bg-zinc-100 px-2 text-2xl font-bold tracking-[-0.02em] dark:bg-zinc-800" /></form>
            ) : (
              <button type="button" onDoubleClick={() => !unfiled && setRenaming(true)} className="workspace-focus block max-w-full truncate rounded text-left text-2xl font-bold tracking-[-0.02em]">{project.name}</button>
            )}
          </div>
          {!unfiled && <button type="button" onClick={() => setRenaming(true)} className="workspace-focus hidden h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800 sm:flex"><Pencil size={14} /> Rename</button>}
          <button type="button" onClick={() => fileRef.current?.click()} className="workspace-focus flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200 px-3 text-xs font-semibold hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"><Upload size={14} /><span className="hidden sm:inline">Import</span></button>
          <button type="button" onClick={() => void createSlide()} className="workspace-focus flex h-9 items-center gap-1.5 rounded-xl bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-700"><FilePlus2 size={14} /> Add canvas</button>
          <input ref={fileRef} type="file" accept=".json,.excalidraw" multiple className="hidden" onChange={(event) => { void importFiles(event.target.files); event.target.value = ""; }} />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6">
        {(!unfiled || selectedIds.size > 0) && <div className="mb-6 flex min-h-9 justify-end gap-2">
          {selectedIds.size > 0 && (
            <>
              <button type="button" disabled={bulkExporting} onClick={() => void exportSelected()} className="workspace-focus flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:cursor-wait disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">
                {bulkExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Export bulk
              </button>
              <button type="button" disabled={bulkDeleting} onClick={() => setBulkDeleteModalOpen(true)} className="workspace-focus flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950/40">
                {bulkDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete bulk
              </button>
            </>
          )}
          {!unfiled && <button type="button" onClick={() => setDeleteModalOpen(true)} className="workspace-focus flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"><Trash2 size={14} /> Delete project</button>}
        </div>}
        {slides.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 py-20 text-center dark:border-zinc-700">
            <FilePlus2 className="mx-auto text-zinc-400" />
            <h2 className="mt-3 text-sm font-semibold">No canvases yet</h2>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              Add a canvas to start this project.
            </p>
            <button type="button" onClick={() => void createSlide()} className="workspace-focus mt-4 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white">
              Add first canvas
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {slides.map((slide, index) => <ProjectSlideCard key={slide.id} slide={slide} index={index} projects={projects} canOrganize isSelected={selectedIds.has(slide.id)} onToggleSelection={() => toggleSlideSelection(slide.id)} onOpen={() => openCanvas(slide)} onRename={() => void renameSlide(slide)} onDelete={() => void moveSlideToTrash(slide.id)} onDuplicate={() => void duplicateSlide(slide.id)} onMove={(targetCollectionId) => void place(slide.id, targetCollectionId, projects.find((item) => item.id === targetCollectionId)?.drawingCount ?? 0)} onReorder={(targetIndex) => void place(slide.id, collectionId, targetIndex)} onDropAt={(draggedId, targetIndex) => void place(draggedId, collectionId, targetIndex)} />)}
          </div>
        )}
      </main>
      <UploadStatus />
      <ConfirmModal
        isOpen={bulkDeleteModalOpen}
        title={`Delete ${selectedIds.size} selected ${selectedIds.size === 1 ? "canvas" : "canvases"}?`}
        message={
          <div className="space-y-4">
            <p>
              {deleteBulkPermanently
                ? "The selected canvases will be permanently deleted. This cannot be undone."
                : "The selected canvases will move to Trash."}
            </p>
            <label className="workspace-focus flex cursor-pointer items-center justify-center gap-2 rounded-lg p-2 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800">
              <input
                type="checkbox"
                checked={deleteBulkPermanently}
                onChange={(event) => setDeleteBulkPermanently(event.target.checked)}
                className="h-4 w-4 accent-rose-600"
              />
              <span>Skip Trash and delete permanently.</span>
            </label>
          </div>
        }
        confirmText={deleteBulkPermanently ? "Delete permanently" : "Move to Trash"}
        onConfirm={() => void deleteSelected()}
        onCancel={closeBulkDeleteModal}
      />
      <ConfirmModal
        isOpen={deleteModalOpen}
        title={`Delete project “${project.name}”?`}
        message={<div className="space-y-4"><p>{deleteSlides ? "Its canvases will move to Trash." : "Its canvases will move to Other."}</p><label className="workspace-focus flex cursor-pointer items-center justify-center gap-2 rounded-lg p-2 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"><input type="checkbox" checked={deleteSlides} onChange={(event) => setDeleteSlides(event.target.checked)} className="h-4 w-4 accent-rose-600" /><span>Delete canvases too.</span></label></div>}
        confirmText="Delete project"
        onConfirm={() => void removeProject()}
        onCancel={closeDeleteModal}
      />
    </div>
  );
};
