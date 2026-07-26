import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  FilePlus2,
  Folder,
  FolderPlus,
  Home,
  Loader2,
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
  canEdit,
  onNavigate,
}: {
  drawingId?: string;
  canEdit: boolean;
  onNavigate?: () => void;
}) => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Collection[]>([]);
  const [slides, setSlides] = useState<DrawingSummary[]>([]);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!drawingId) return;
    setLoading(true);
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
      setLoading(false);
    }
  }, [drawingId]);

  useEffect(() => void load(), [load]);
  const go = (id: string) => {
    navigate(`/editor/${id}`);
    onNavigate?.();
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
    const created = await api.createDrawing(
      `Slide ${slides.length + 1}`,
      activeCollectionId,
    );
    go(created.id);
  };

  const createProject = async () => {
    const name = window.prompt("Project name");
    if (!name?.trim()) return;
    const project = await api.createCollection(name.trim(), {
      createInitialDrawing: true,
    });
    if (project.initialDrawingId) go(project.initialDrawingId);
  };

  return (
    <aside className="workspace-shell flex h-full w-64 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex h-14 items-center gap-2 border-b border-zinc-200 px-3 dark:border-zinc-800">
        <button type="button" onClick={() => navigate("/")} className="workspace-focus flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left">
          <Logo className="h-7 w-7" />
          <span className="truncate text-sm font-semibold">{productName}</span>
        </button>
        {canEdit && <button type="button" onClick={() => void createProject()} className="workspace-focus flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800" aria-label="New project"><FolderPlus size={16} /></button>}
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
                          <button type="button" onClick={() => go(slide.id)} className="workspace-focus flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[11px] font-medium"><span className="w-4 shrink-0 text-right text-[10px] text-zinc-500">{index + 1}.</span><span className="truncate">{slide.name}</span></button>
                          {canEdit && slide.id === drawingId && <span className="mr-1 hidden gap-0.5 group-hover:flex"><button type="button" disabled={index === 0} onClick={() => void place(slide.id, activeCollectionId, index - 1)} className="workspace-focus rounded p-1 hover:bg-white disabled:opacity-30 dark:hover:bg-zinc-700" aria-label="Move slide earlier"><ArrowUp size={11} /></button><button type="button" onClick={() => void place(slide.id, activeCollectionId, index + 1)} className="workspace-focus rounded p-1 hover:bg-white dark:hover:bg-zinc-700" aria-label="Move slide later"><ArrowDown size={11} /></button></span>}
                        </div>
                      ))}
                      {canEdit && <button type="button" onClick={() => void createSlide()} className="workspace-focus mt-1 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-100 hover:text-violet-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-violet-300"><FilePlus2 size={13} /> Add slide</button>}
                    </div>
                  )}
                </div>
              );
            })}
            {!activeCollectionId && (
              <div className="rounded-xl bg-white p-2 dark:bg-zinc-900"><div className="flex items-center gap-2 px-1 pb-1 text-xs font-semibold"><Folder size={14} /> Unfiled</div>{slides.map((slide) => <button key={slide.id} type="button" onClick={() => go(slide.id)} className={`workspace-focus block w-full truncate rounded-lg px-2 py-1.5 text-left text-[11px] ${slideRowTone(slide.id === drawingId)}`}>{slide.name}</button>)}</div>
            )}
          </div>
        )}
      </nav>

    </aside>
  );
};
