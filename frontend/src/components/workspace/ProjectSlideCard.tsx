import {
  ArrowDown,
  ArrowUp,
  FolderInput,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Collection, DrawingSummary } from "../../types";
import { SlideThumbnail } from "./SlideThumbnail";

export const ProjectSlideCard = ({
  slide,
  index,
  projects,
  canOrganize,
  onOpen,
  onRename,
  onDelete,
  onMove,
  onReorder,
  onDropAt,
}: {
  slide: DrawingSummary;
  index: number;
  projects: Collection[];
  canOrganize: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onMove: (collectionId: string | null) => void;
  onReorder: (targetIndex: number) => void;
  onDropAt: (draggedId: string, targetIndex: number) => void;
}) => (
  <article
    id={`slide-card-${slide.id}`}
    draggable={canOrganize}
    onDragStart={(event) => event.dataTransfer.setData("application/x-excalidash-slide", slide.id)}
    onDragOver={(event) => canOrganize && event.preventDefault()}
    onDrop={(event) => {
      event.preventDefault();
      const id = event.dataTransfer.getData("application/x-excalidash-slide");
      if (id && id !== slide.id) onDropAt(id, index);
    }}
    className="group flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_4px_8px_rgba(24,24,27,0.10)] dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
  >
    <button type="button" onClick={onOpen} className="workspace-focus relative h-40 w-full">
      <SlideThumbnail drawing={slide} className="h-full w-full" />
      <span className="absolute left-3 top-3 flex h-7 min-w-7 items-center justify-center rounded-lg bg-white px-2 text-xs font-bold text-zinc-700 shadow-sm dark:bg-zinc-900 dark:text-zinc-200">
        {index + 1}
      </span>
    </button>
    <div className="flex items-start gap-2 p-4">
      <button type="button" onClick={onOpen} className="workspace-focus min-w-0 flex-1 rounded text-left">
        <span className="block truncate text-sm font-semibold">{slide.name}</span>
        <span className="mt-1 block text-[11px] text-zinc-600 dark:text-zinc-400">
          Updated {formatDistanceToNow(slide.updatedAt)} ago
        </span>
      </button>
      {canOrganize && (
        <details className="relative">
          <summary className="workspace-focus flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
            <MoreHorizontal size={17} />
            <span className="sr-only">Slide actions</span>
          </summary>
          <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-[0_4px_8px_rgba(24,24,27,0.12)] dark:border-zinc-700 dark:bg-zinc-900">
            <Action icon={<Pencil size={14} />} label="Rename" onClick={onRename} />
            <Action icon={<ArrowUp size={14} />} label="Move earlier" disabled={index === 0} onClick={() => onReorder(index - 1)} />
            <Action icon={<ArrowDown size={14} />} label="Move later" onClick={() => onReorder(index + 1)} />
            <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
            <div className="px-2 py-1 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Move to project</div>
            <Action icon={<FolderInput size={14} />} label="Unfiled" onClick={() => onMove(null)} />
            {projects.filter((project) => project.id !== slide.collectionId).map((project) => (
              <Action key={project.id} icon={<span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: project.color || "#7c3aed" }} />} label={project.name} onClick={() => onMove(project.id)} />
            ))}
            <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
            <Action danger icon={<Trash2 size={14} />} label="Move to Trash" onClick={onDelete} />
          </div>
        </details>
      )}
    </div>
  </article>
);

const Action = ({ icon, label, onClick, disabled = false, danger = false }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={`workspace-focus flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium disabled:opacity-40 ${
      danger
        ? "text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
        : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
    }`}
  >
    {icon}<span className="truncate">{label}</span>
  </button>
);
