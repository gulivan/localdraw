import { useEffect, useState } from "react";
import { FolderPlus, X } from "lucide-react";
import { PROJECT_COLORS } from "./projectColors";

export const NewProjectDialog = ({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, color: string) => Promise<void>;
}) => {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setColor(PROJECT_COLORS[0]);
    setError(null);
  }, [open]);

  if (!open) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreate(name.trim(), color);
      onClose();
    } catch {
      setError("Could not create the project. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/35 px-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="new-project-title" className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_8px_16px_rgba(24,24,27,0.18)] dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
            <FolderPlus size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="new-project-title" className="text-lg font-bold tracking-tight">New project</h2>
            <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">Start an ordered set of Excalidraw slides.</p>
          </div>
          <button type="button" onClick={onClose} className="workspace-focus rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800" aria-label="Close new project dialog">
            <X size={17} />
          </button>
        </div>
        <label className="mt-5 block text-sm font-semibold" htmlFor="new-project-name">Project name</label>
        <input id="new-project-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Product roadmap" maxLength={100} className="workspace-focus mt-1.5 h-11 w-full rounded-xl border border-zinc-200 bg-zinc-100 px-3 text-sm placeholder:text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:placeholder:text-zinc-400" />
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold">Project color</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {PROJECT_COLORS.map((candidate) => (
              <button key={candidate} type="button" onClick={() => setColor(candidate)} aria-label={`Use project color ${candidate}`} aria-pressed={color === candidate} className={`workspace-focus h-9 w-9 rounded-full border-2 border-white ring-offset-2 dark:border-zinc-900 ${color === candidate ? "ring-2 ring-zinc-900 dark:ring-zinc-100" : "hover:scale-105"}`} style={{ backgroundColor: candidate }} />
            ))}
          </div>
        </fieldset>
        {error && <p role="alert" className="mt-4 text-sm font-medium text-red-700 dark:text-red-400">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="workspace-focus rounded-xl px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800">Cancel</button>
          <button type="submit" disabled={!name.trim() || submitting} className="workspace-focus rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">
            {submitting ? "Creating…" : "Create project"}
          </button>
        </div>
      </form>
    </div>
  );
};
