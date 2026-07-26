import { formatDistanceToNow } from "date-fns";
import { Layers2 } from "lucide-react";
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
  const countLabel = `${count} ${count === 1 ? "canvas" : "canvases"}`;
  const activityLabel = project.lastActivityAt
    ? `Updated ${formatDistanceToNow(project.lastActivityAt)} ago`
    : count === 0
      ? "Ready for your first canvas"
      : "No recent activity";
  return (
    <article className="group h-[226px] overflow-hidden rounded-2xl border border-zinc-200 bg-white transition duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_4px_8px_rgba(24,24,27,0.10)] dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700">
      <button
        type="button"
        onClick={onView}
        aria-label={`Open ${project.name} project`}
        className="workspace-focus flex h-full w-full flex-col rounded-2xl text-left"
      >
        <div className="h-36 w-full shrink-0 overflow-hidden">
          <SlideThumbnail
            drawing={project.latestDrawing}
            className="h-full w-full transition-transform duration-200 group-hover:scale-[1.015] motion-reduce:transition-none"
          />
        </div>
        <div className="flex min-h-0 flex-1 flex-col justify-center px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: project.color || "#7c3aed" }}
              aria-hidden="true"
            />
            <span className="truncate text-base font-semibold text-zinc-950 dark:text-zinc-50">
              {project.name}
            </span>
          </div>
          <div className="mt-1.5 flex min-w-0 items-center justify-between gap-3 text-xs text-zinc-600 dark:text-zinc-400">
            <span className="inline-flex shrink-0 items-center gap-1.5 font-medium">
              <Layers2 size={14} aria-hidden="true" />
              {countLabel}
            </span>
            <span className="truncate text-right">{activityLabel}</span>
          </div>
        </div>
      </button>
    </article>
  );
};
