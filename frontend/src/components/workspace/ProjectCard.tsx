import { formatDistanceToNow } from "date-fns";
import type { Collection } from "../../types";
import { SlideThumbnail } from "./SlideThumbnail";

export const ProjectCard = ({
  project,
  onView,
}: {
  project: Collection;
  onView: () => void;
}) => {
  const count = project.drawingCount ?? 0;
  return (
    <article className="group h-[226px] overflow-hidden rounded-2xl border border-zinc-200 bg-white transition duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_4px_8px_rgba(24,24,27,0.10)] dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700">
      <button type="button" onClick={onView} className="workspace-focus relative h-36 w-full overflow-hidden text-left">
        <SlideThumbnail drawing={project.latestDrawing} className="h-full w-full" />
        <span
          className="absolute left-3 top-3 inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold text-white"
          style={{ backgroundColor: project.color || "#7c3aed" }}
          aria-label={`${count} ${count === 1 ? "canvas" : "canvases"}`}
          title={`${count} ${count === 1 ? "canvas" : "canvases"}`}
        >
          {count}
        </span>
      </button>
      <div className="flex h-20 flex-col justify-center p-4">
        <button type="button" onClick={onView} className="workspace-focus block truncate rounded text-left text-base font-semibold">
          {project.name}
        </button>
        <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
          {project.lastActivityAt
            ? `Updated ${formatDistanceToNow(project.lastActivityAt)} ago`
            : "Ready for your first slide"}
        </p>
      </div>
    </article>
  );
};
