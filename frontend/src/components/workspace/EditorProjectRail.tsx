import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  FilePlus2,
  Folder,
  Home,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import * as api from "../../api";
import type { Collection, DrawingSummary } from "../../types";
import { productName } from "../../utils/productBrand";
import { Logo } from "../Logo";
import type { DisposableDraft } from "../../pages/editor/disposableDraft";
import type { EditorSidebarScope } from "../../utils/editorSidebar";
import { useDesktopWorkspaceChange } from "../../hooks/useDesktopWorkspaceEvents";

const OTHER_PROJECT_KEY = "__other__";
const NUMBERED_CANVAS_NAME = /^Canvas\s+(\d+)$/i;

const slideRowTone = (active: boolean) =>
  active
    ? "bg-violet-100 text-violet-900 dark:bg-violet-950/60 dark:text-violet-100"
    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800";

export const EditorProjectRail = ({
  drawingId,
  drawingName,
  drawingNameSourceId,
  canEdit,
  projectScope,
  onSelectDrawing,
  onNavigateTo,
  onNavigate,
  onDrawingRenamed,
}: {
  drawingId?: string;
  drawingName: string;
  drawingNameSourceId: string | null;
  canEdit: boolean;
  projectScope: EditorSidebarScope;
  onSelectDrawing: (
    drawingId: string,
    drawingName: string,
    disposableDraft?: DisposableDraft,
  ) => Promise<boolean>;
  onNavigateTo: (destination: string) => Promise<boolean>;
  onNavigate?: () => void;
  onDrawingRenamed?: (drawingId: string, drawingName: string) => void;
}) => {
  const [projects, setProjects] = useState<Collection[]>([]);
  const [slides, setSlides] = useState<DrawingSummary[]>([]);
  const [slidesByProject, setSlidesByProject] = useState<
    Record<string, DrawingSummary[]>
  >({});
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    new Set(),
  );
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [renamingSlideId, setRenamingSlideId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const hasLoadedRef = useRef(false);
  const isCreatingRef = useRef(false);

  const loadProjectSlides = useCallback(
    async (collectionId: string | null) => {
      const rows = await api.getDrawings(undefined, collectionId, {
        includePreview: false,
        limit: 200,
        sortField: "sortOrder",
        sortDirection: "asc",
      });
      const key = collectionId ?? OTHER_PROJECT_KEY;
      setSlidesByProject((current) => ({
        ...current,
        [key]: rows.drawings,
      }));
      return rows.drawings;
    },
    [],
  );

  const load = useCallback(async () => {
    if (!drawingId) return;
    if (!hasLoadedRef.current) setLoading(true);
    try {
      const drawing = await api.getDrawing(drawingId);
      const collectionId = drawing.collectionId;
      setActiveCollectionId(collectionId);
      const [collectionRows, drawingRows, otherRows] = await Promise.all([
        api.getCollections({ includeOverview: true }),
        api.getDrawings(undefined, collectionId, {
          includePreview: false,
          limit: 200,
          sortField: "sortOrder",
          sortDirection: "asc",
        }),
        projectScope === "all" && collectionId !== null
          ? api.getDrawings(undefined, null, {
              includePreview: false,
              limit: 200,
              sortField: "sortOrder",
              sortDirection: "asc",
            })
          : Promise.resolve(null),
      ]);
      setProjects(collectionRows.filter((project) => project.id !== "trash"));
      setSlides(drawingRows.drawings);
      const activeKey = collectionId ?? OTHER_PROJECT_KEY;
      setSlidesByProject((current) => ({
        ...current,
        [activeKey]: drawingRows.drawings,
        ...(otherRows
          ? { [OTHER_PROJECT_KEY]: otherRows.drawings }
          : {}),
      }));
      setExpandedProjects((current) => new Set(current).add(activeKey));
    } catch (error) {
      console.error("Failed to load editor project rail", error);
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, [drawingId, projectScope]);

  const toggleProject = useCallback(
    async (collectionId: string | null) => {
      const key = collectionId ?? OTHER_PROJECT_KEY;
      const willExpand = !expandedProjects.has(key);
      setExpandedProjects((current) => {
        const next = new Set(current);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      if (willExpand && !slidesByProject[key]) {
        try {
          await loadProjectSlides(collectionId);
        } catch (error) {
          console.error("Failed to load project canvases", error);
        }
      }
    },
    [expandedProjects, loadProjectSlides, slidesByProject],
  );

  useEffect(() => void load(), [load]);
  useDesktopWorkspaceChange(() => void load());
  useEffect(() => {
    if (!drawingId || drawingNameSourceId !== drawingId) return;
    setSlides((current) =>
      current.map((slide) =>
        slide.id === drawingId ? { ...slide, name: drawingName } : slide,
      ),
    );
  }, [drawingId, drawingName, drawingNameSourceId]);
  const go = async (
    id: string,
    name: string,
    disposableDraft?: DisposableDraft,
  ) => {
    const switched = await onSelectDrawing(id, name, disposableDraft);
    if (switched) onNavigate?.();
    return switched;
  };

  const place = async (slideId: string, collectionId: string | null, targetIndex: number) => {
    try {
      await api.placeDrawing(slideId, collectionId, targetIndex);
      if (collectionId !== activeCollectionId) {
        setSlides((current) => current.filter((slide) => slide.id !== slideId));
      } else {
        await load();
      }
    } catch (error) {
      console.error("Failed to place canvas", error);
    }
  };

  const createSlide = async () => {
    if (isCreatingRef.current) return;
    isCreatingRef.current = true;
    setIsCreating(true);
    let created: DrawingSummary | null = null;
    let switched = false;
    try {
      const highestCanvasNumber = slides.reduce((highest, canvas) => {
        const match = NUMBERED_CANVAS_NAME.exec(canvas.name.trim());
        return match ? Math.max(highest, Number(match[1])) : highest;
      }, 0);
      const name = `Canvas ${Math.max(slides.length, highestCanvasNumber) + 1}`;
      created = await api.createDrawing(name, activeCollectionId);
      switched = await go(created.id, name, {
        drawingId: created.id,
        updatedAt: created.updatedAt,
      });
      if (!switched) {
        await api.deleteDrawingIfUntouched(created.id, created.updatedAt);
        return;
      }
      const refreshed = await loadProjectSlides(activeCollectionId);
      setSlides(refreshed);
    } catch (error) {
      console.error("Failed to create canvas", error);
      if (created && !switched) {
        try {
          await api.deleteDrawingIfUntouched(created.id, created.updatedAt);
        } catch {
          // The server keeps the canvas if it changed before cleanup.
        }
      }
    } finally {
      isCreatingRef.current = false;
      setIsCreating(false);
    }
  };

  const duplicateSlide = async (slideId: string) => {
    try {
      await api.duplicateDrawing(slideId);
      await load();
    } catch (error) {
      console.error("Failed to duplicate canvas", error);
    }
  };

  const startRename = (slide: DrawingSummary) => {
    setRenamingSlideId(slide.id);
    setRenameValue(slide.name);
  };

  const cancelRename = () => {
    setRenamingSlideId(null);
    setRenameValue("");
  };

  const submitRename = async (slideId: string) => {
    const name = renameValue.trim();
    if (!name) return;
    try {
      await api.updateDrawing(slideId, { name });
      setSlides((current) =>
        current.map((slide) =>
          slide.id === slideId ? { ...slide, name } : slide,
        ),
      );
      setSlidesByProject((current) =>
        Object.fromEntries(
          Object.entries(current).map(([projectId, projectSlides]) => [
            projectId,
            projectSlides.map((slide) =>
              slide.id === slideId ? { ...slide, name } : slide,
            ),
          ]),
        ),
      );
      onDrawingRenamed?.(slideId, name);
      cancelRename();
    } catch (error) {
      console.error("Failed to rename canvas", error);
    }
  };

  const deleteSlide = async (slideId: string, index: number) => {
    try {
      await api.updateDrawing(slideId, { collectionId: "trash" });
      if (slideId !== drawingId) {
        await load();
        return;
      }
      const nextSlide = slides[index + 1] ?? slides[index - 1];
      if (nextSlide) {
        await go(nextSlide.id, nextSlide.name);
      } else if (activeCollectionId) {
        await onNavigateTo(`/projects/${activeCollectionId}`);
        onNavigate?.();
      } else {
        await onNavigateTo("/collections?id=unorganized");
        onNavigate?.();
      }
    } catch (error) {
      console.error("Failed to delete canvas", error);
    }
  };

  const renderCanvasRow = (
    slide: DrawingSummary,
    index: number,
    collectionId: string | null,
    enumerated: boolean,
  ) => {
    const active = collectionId === activeCollectionId;
    const isRenaming = renamingSlideId === slide.id;
    return (
      <div
        key={slide.id}
        draggable={canEdit && active && !isRenaming}
        onDragStart={(event) =>
          event.dataTransfer.setData("application/x-excalidash-slide", slide.id)
        }
        onDragOver={(event) => canEdit && event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const dragged = event.dataTransfer.getData(
            "application/x-excalidash-slide",
          );
          if (dragged && dragged !== slide.id) {
            void place(dragged, collectionId, index);
          }
        }}
        className={`group flex items-center gap-1 rounded-lg ${slideRowTone(slide.id === drawingId)}`}
      >
        {isRenaming ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1"
            onSubmit={(event) => {
              event.preventDefault();
              void submitRename(slide.id);
            }}
          >
            {enumerated && (
              <span className="w-4 shrink-0 text-right text-[10px] text-zinc-500">
                {index + 1}.
              </span>
            )}
            <input
              autoFocus
              aria-label={`Rename ${slide.name}`}
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onBlur={cancelRename}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  cancelRename();
                }
              }}
              onPointerDown={(event) => event.stopPropagation()}
              className="workspace-focus min-w-0 flex-1 rounded-md border border-violet-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-zinc-900 dark:border-violet-700 dark:bg-zinc-950 dark:text-white"
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => void go(slide.id, slide.name)}
            onDoubleClick={() => canEdit && active && startRename(slide)}
            className="workspace-focus flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[11px] font-medium"
          >
            {enumerated && (
              <span className="w-4 shrink-0 text-right text-[10px] text-zinc-500">
                {index + 1}.
              </span>
            )}
            <span className="truncate">{slide.name}</span>
          </button>
        )}
        {canEdit && active && slide.id === drawingId && (
          <span className="mr-1 hidden gap-0.5 group-hover:flex">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => void place(slide.id, collectionId, index - 1)}
              className="workspace-focus rounded p-1 hover:bg-white disabled:opacity-30 dark:hover:bg-zinc-700"
              aria-label="Move canvas earlier"
            >
              <ArrowUp size={11} />
            </button>
            <button
              type="button"
              onClick={() => void place(slide.id, collectionId, index + 1)}
              className="workspace-focus rounded p-1 hover:bg-white dark:hover:bg-zinc-700"
              aria-label="Move canvas later"
            >
              <ArrowDown size={11} />
            </button>
          </span>
        )}
        {canEdit && active && (
          <EditorRailActions
            slideName={slide.name}
            onRename={() => startRename(slide)}
            onDuplicate={() => void duplicateSlide(slide.id)}
            onDelete={() => void deleteSlide(slide.id, index)}
          />
        )}
      </div>
    );
  };

  const visibleProjects =
    projectScope === "all"
      ? projects
      : projects.filter((project) => project.id === activeCollectionId);
  const showOther = projectScope === "all" || activeCollectionId === null;
  const otherExpanded = expandedProjects.has(OTHER_PROJECT_KEY);
  const otherSlides =
    activeCollectionId === null
      ? slides
      : (slidesByProject[OTHER_PROJECT_KEY] ?? []);

  return (
    <aside className="workspace-shell flex h-full w-64 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex h-14 items-center gap-2 border-b border-zinc-200 px-3 dark:border-zinc-800">
        <button type="button" onClick={() => void onNavigateTo("/")} className="workspace-focus flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left">
          <Logo className="h-7 w-7" />
          <span className="truncate text-sm font-semibold">{productName}</span>
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3" aria-label="Projects and canvases">
        <button type="button" onClick={() => void onNavigateTo("/")} className="workspace-focus mb-3 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 dark:text-zinc-200 dark:hover:bg-zinc-800"><Home size={15} /> Home</button>
        {loading ? (
          <div className="flex justify-center py-8 text-violet-600"><Loader2 size={18} className="animate-spin" /></div>
        ) : (
          <div className="space-y-1">
            {visibleProjects.map((project) => {
              const active = project.id === activeCollectionId;
              const expanded = expandedProjects.has(project.id);
              const projectSlides = active
                ? slides
                : (slidesByProject[project.id] ?? []);
              return (
                <div
                  key={project.id}
                  onDragOver={(event) => canEdit && event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const slideId = event.dataTransfer.getData("application/x-excalidash-slide");
                    if (slideId) void place(slideId, project.id, project.drawingCount ?? 0);
                  }}
                  className={active ? "rounded-xl bg-white dark:bg-zinc-900" : ""}
                >
                  <div className="group flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => void toggleProject(project.id)}
                      aria-expanded={expanded}
                      className={`workspace-focus flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold ${active ? "text-zinc-950 dark:text-white" : "text-zinc-700 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800"}`}
                    >
                      {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: project.color || "#7c3aed" }} />
                      <span className="min-w-0 flex-1 truncate">{project.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void onNavigateTo(`/projects/${project.id}`)}
                      aria-label={`Open ${project.name} project page`}
                      title="Open project page"
                      className="workspace-focus flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 opacity-0 hover:bg-zinc-200 hover:text-zinc-900 focus-visible:opacity-100 group-hover:opacity-100 dark:hover:bg-zinc-700 dark:hover:text-white"
                    >
                      <ExternalLink size={13} />
                    </button>
                    <span className="mr-2 w-5 text-right text-[10px] font-medium text-zinc-500">
                      {project.drawingCount ?? 0}
                    </span>
                  </div>
                  {expanded && (
                    <div className="pb-2 pl-3 pr-1">
                      {projectSlides.map((slide, index) =>
                        renderCanvasRow(slide, index, project.id, true),
                      )}
                      {canEdit && active && <button type="button" disabled={isCreating} onClick={() => void createSlide()} className="workspace-focus mt-1 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-100 hover:text-violet-700 disabled:cursor-wait disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-violet-300">{isCreating ? <Loader2 size={13} className="animate-spin" /> : <FilePlus2 size={13} />} Add canvas</button>}
                    </div>
                  )}
                </div>
              );
            })}
            {showOther && (
              <div className={activeCollectionId === null ? "rounded-xl bg-white p-1 dark:bg-zinc-900" : ""}>
                <div className="group flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => void toggleProject(null)}
                    aria-expanded={otherExpanded}
                    className="workspace-focus flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold text-zinc-700 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    {otherExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    <Folder size={14} />
                    <span className="min-w-0 flex-1 truncate">Other</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void onNavigateTo("/collections?id=unorganized")}
                    aria-label="Open Other project page"
                    title="Open project page"
                    className="workspace-focus flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 opacity-0 hover:bg-zinc-200 hover:text-zinc-900 focus-visible:opacity-100 group-hover:opacity-100 dark:hover:bg-zinc-700 dark:hover:text-white"
                  >
                    <ExternalLink size={13} />
                  </button>
                  <span className="mr-2 w-5 text-right text-[10px] font-medium text-zinc-500">
                    {otherSlides.length}
                  </span>
                </div>
                {otherExpanded && (
                  <div className="pb-2 pl-3 pr-1">
                    {otherSlides.map((slide, index) =>
                      renderCanvasRow(slide, index, null, false),
                    )}
                    {canEdit && activeCollectionId === null && (
                      <button type="button" disabled={isCreating} onClick={() => void createSlide()} className="workspace-focus mt-1 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-100 hover:text-violet-700 disabled:cursor-wait disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-violet-300">{isCreating ? <Loader2 size={13} className="animate-spin" /> : <FilePlus2 size={13} />} Add canvas</button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </nav>

    </aside>
  );
};

const EditorRailActions = ({
  slideName,
  onRename,
  onDuplicate,
  onDelete,
}: {
  slideName: string;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) => {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!position) return;
    const close = () => setPosition(null);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [position]);

  const open = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setPosition({
      top: Math.min(rect.bottom + 4, window.innerHeight - 124),
      left: Math.max(8, rect.right - 144),
    });
  };

  const run = (action: () => void) => {
    setPosition(null);
    action();
  };

  return (
    <>
      <button
        type="button"
        draggable={false}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={open}
        className="workspace-focus mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-white hover:text-zinc-900 dark:hover:bg-zinc-700 dark:hover:text-white"
        aria-label={`Actions for ${slideName}`}
      >
        <MoreHorizontal size={14} />
      </button>
      {position
        ? createPortal(
            <>
              <button
                type="button"
                className="fixed inset-0 z-[90] cursor-default"
                onClick={() => setPosition(null)}
                aria-label="Close canvas actions"
              />
              <div
                className="fixed z-[100] w-36 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-[0_8px_24px_rgba(24,24,27,0.16)] dark:border-zinc-700 dark:bg-zinc-900"
                style={position}
              >
                <button type="button" onClick={() => run(onRename)} className="workspace-focus flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800">
                  <Pencil size={14} /> Rename
                </button>
                <button type="button" onClick={() => run(onDuplicate)} className="workspace-focus flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800">
                  <Copy size={14} /> Duplicate
                </button>
                <button type="button" onClick={() => run(onDelete)} className="workspace-focus flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40">
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
};
