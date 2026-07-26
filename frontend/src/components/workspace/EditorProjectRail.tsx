import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  FilePlus2,
  Folder,
  Home,
  Loader2,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import * as api from "../../api";
import type { Collection, DrawingSummary } from "../../types";
import { productName } from "../../utils/productBrand";
import { Logo } from "../Logo";

const slideRowTone = (active: boolean) =>
  active
    ? "bg-violet-100 text-violet-900 dark:bg-violet-950/60 dark:text-violet-100"
    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800";

export const EditorProjectRail = ({
  drawingId,
  drawingName,
  drawingNameSourceId,
  canEdit,
  onSelectDrawing,
  onNavigate,
}: {
  drawingId?: string;
  drawingName: string;
  drawingNameSourceId: string | null;
  canEdit: boolean;
  onSelectDrawing: (drawingId: string, drawingName: string) => Promise<boolean>;
  onNavigate?: () => void;
}) => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Collection[]>([]);
  const [slides, setSlides] = useState<DrawingSummary[]>([]);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const hasLoadedRef = useRef(false);

  const load = useCallback(async () => {
    if (!drawingId) return;
    if (!hasLoadedRef.current) setLoading(true);
    try {
      const drawing = await api.getDrawing(drawingId);
      const collectionId = drawing.collectionId;
      setActiveCollectionId(collectionId);
      const [collectionRows, drawingRows] = await Promise.all([
        api.getCollections({ includeOverview: true }),
        api.getDrawings(undefined, collectionId, {
          includePreview: false,
          limit: 200,
          sortField: "sortOrder",
          sortDirection: "asc",
        }),
      ]);
      setProjects(collectionRows.filter((project) => project.id !== "trash"));
      setSlides(drawingRows.drawings);
    } catch (error) {
      console.error("Failed to load editor project rail", error);
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, [drawingId]);

  useEffect(() => void load(), [load]);
  useEffect(() => {
    if (!drawingId || drawingNameSourceId !== drawingId) return;
    setSlides((current) =>
      current.map((slide) =>
        slide.id === drawingId ? { ...slide, name: drawingName } : slide,
      ),
    );
  }, [drawingId, drawingName, drawingNameSourceId]);
  const go = async (id: string, name: string) => {
    const switched = await onSelectDrawing(id, name);
    if (switched) onNavigate?.();
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
      console.error("Failed to place slide", error);
    }
  };

  const createSlide = async () => {
    const name = `Slide ${slides.length + 1}`;
    const created = await api.createDrawing(
      name,
      activeCollectionId,
    );
    await go(created.id, name);
  };

  const duplicateSlide = async (slideId: string) => {
    try {
      await api.duplicateDrawing(slideId);
      await load();
    } catch (error) {
      console.error("Failed to duplicate slide", error);
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
        navigate(`/projects/${activeCollectionId}`);
        onNavigate?.();
      } else {
        navigate("/collections?id=unorganized");
        onNavigate?.();
      }
    } catch (error) {
      console.error("Failed to delete slide", error);
    }
  };

  return (
    <aside className="workspace-shell flex h-full w-64 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex h-14 items-center gap-2 border-b border-zinc-200 px-3 dark:border-zinc-800">
        <button type="button" onClick={() => navigate("/")} className="workspace-focus flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left">
          <Logo className="h-7 w-7" />
          <span className="truncate text-sm font-semibold">{productName}</span>
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3" aria-label="Projects and slides">
        <button type="button" onClick={() => navigate("/")} className="workspace-focus mb-3 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 dark:text-zinc-200 dark:hover:bg-zinc-800"><Home size={15} /> Home</button>
        {loading ? (
          <div className="flex justify-center py-8 text-violet-600"><Loader2 size={18} className="animate-spin" /></div>
        ) : (
          <div className="space-y-1">
            {projects.map((project) => {
              const active = project.id === activeCollectionId;
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
                  <button type="button" onClick={() => navigate(`/projects/${project.id}`)} className={`workspace-focus flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold ${active ? "text-zinc-950 dark:text-white" : "text-zinc-700 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800"}`}>
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: project.color || "#7c3aed" }} />
                    <span className="min-w-0 flex-1 truncate">{project.name}</span>
                    <span className="text-[10px] font-medium text-zinc-500">{project.drawingCount ?? 0}</span>
                  </button>
                  {active && (
                    <div className="pb-2 pl-3 pr-1">
                      {slides.map((slide, index) => (
                        <div
                          key={slide.id}
                          draggable={canEdit}
                          onDragStart={(event) => event.dataTransfer.setData("application/x-excalidash-slide", slide.id)}
                          onDragOver={(event) => canEdit && event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault();
                            const dragged = event.dataTransfer.getData("application/x-excalidash-slide");
                            if (dragged && dragged !== slide.id) void place(dragged, activeCollectionId, index);
                          }}
                          className={`group flex items-center gap-1 rounded-lg ${slideRowTone(slide.id === drawingId)}`}
                        >
                          <button type="button" onClick={() => void go(slide.id, slide.name)} className="workspace-focus flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[11px] font-medium"><span className="w-4 shrink-0 text-right text-[10px] text-zinc-500">{index + 1}.</span><span className="truncate">{slide.name}</span></button>
                          {canEdit && slide.id === drawingId && <span className="mr-1 hidden gap-0.5 group-hover:flex"><button type="button" disabled={index === 0} onClick={() => void place(slide.id, activeCollectionId, index - 1)} className="workspace-focus rounded p-1 hover:bg-white disabled:opacity-30 dark:hover:bg-zinc-700" aria-label="Move slide earlier"><ArrowUp size={11} /></button><button type="button" onClick={() => void place(slide.id, activeCollectionId, index + 1)} className="workspace-focus rounded p-1 hover:bg-white dark:hover:bg-zinc-700" aria-label="Move slide later"><ArrowDown size={11} /></button></span>}
                          {canEdit && (
                            <EditorRailActions
                              slideName={slide.name}
                              onDuplicate={() => void duplicateSlide(slide.id)}
                              onDelete={() => void deleteSlide(slide.id, index)}
                            />
                          )}
                        </div>
                      ))}
                      {canEdit && <button type="button" onClick={() => void createSlide()} className="workspace-focus mt-1 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-100 hover:text-violet-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-violet-300"><FilePlus2 size={13} /> Add slide</button>}
                    </div>
                  )}
                </div>
              );
            })}
            {!activeCollectionId && (
              <div className="rounded-xl bg-white p-2 dark:bg-zinc-900"><div className="flex items-center gap-2 px-1 pb-1 text-xs font-semibold"><Folder size={14} /> Unfiled</div>{slides.map((slide) => <button key={slide.id} type="button" onClick={() => void go(slide.id, slide.name)} className={`workspace-focus block w-full truncate rounded-lg px-2 py-1.5 text-left text-[11px] ${slideRowTone(slide.id === drawingId)}`}>{slide.name}</button>)}</div>
            )}
          </div>
        )}
      </nav>

    </aside>
  );
};

const EditorRailActions = ({
  slideName,
  onDuplicate,
  onDelete,
}: {
  slideName: string;
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
      top: Math.min(rect.bottom + 4, window.innerHeight - 92),
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
