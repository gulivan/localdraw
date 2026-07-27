import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import {
  MAX_RECENT_CANVASES_LIMIT,
  MIN_RECENT_CANVASES_LIMIT,
  normalizeRecentCanvasesLimit,
} from "../../utils/recentCanvases";

type RecentCanvasesSettingsCardProps = {
  value: number;
  onChange: (value: number) => void;
};

export const RecentCanvasesSettingsCard = ({
  value,
  onChange,
}: RecentCanvasesSettingsCardProps) => {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    if (!draft.trim()) {
      setDraft(String(value));
      return;
    }
    const next = normalizeRecentCanvasesLimit(draft);
    setDraft(String(next));
    onChange(next);
  };

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:gap-4 sm:p-6 lg:p-8 dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)]">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-sky-100 bg-sky-50 sm:h-16 sm:w-16 dark:border-neutral-700 dark:bg-neutral-800">
        <Clock3 className="text-sky-600 dark:text-sky-400" size={28} />
      </div>
      <div className="text-center">
        <h3 className="mb-1 text-lg font-bold text-slate-900 dark:text-white">
          Recent canvases
        </h3>
        <p
          id="recent-canvases-description"
          className="mx-auto max-w-[220px] text-xs font-medium text-slate-600 dark:text-neutral-300"
        >
          Maximum shown on Home (1–20)
        </p>
      </div>
      <input
        type="number"
        min={MIN_RECENT_CANVASES_LIMIT}
        max={MAX_RECENT_CANVASES_LIMIT}
        inputMode="numeric"
        aria-label="Maximum recent canvases"
        aria-describedby="recent-canvases-description"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-center text-sm font-bold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:focus-visible:ring-offset-neutral-900"
      />
    </div>
  );
};
