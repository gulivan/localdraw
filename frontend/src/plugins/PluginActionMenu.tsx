import { useEffect, useMemo, useRef, useState } from "react";
import { Pin, PinOff, Puzzle, Settings } from "lucide-react";
import { usePlugins } from "./PluginProvider";
import { openPluginAction } from "./actionEvents";
import type { PluginEditorContext } from "./types";

type Action = {
  id: string;
  label: string;
  description: string;
  selection?: "optional" | "required";
};

type Props = {
  surface: "home" | "editor";
  editorContext?: PluginEditorContext;
  onManage: () => void;
};

export const PluginActionMenu = ({ surface, editorContext, onManage }: Props) => {
  const { plugins, enabledEmbeddedPlugins, pinnedActionIds, togglePinnedAction } = usePlugins();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [selectedCount, setSelectedCount] = useState(0);
  const actions = useMemo<Action[]>(() => {
    if (surface === "home") {
      return enabledEmbeddedPlugins
        .filter((plugin) => plugin.HomeAction)
        .map((plugin) => ({
          id: `${plugin.manifest.id}:home`,
          label: plugin.manifest.name,
          description: plugin.manifest.description,
        }));
    }
    const embedded = enabledEmbeddedPlugins.flatMap((plugin) =>
      (plugin.manifest.contributes?.editorActions || []).map((action) => ({
        id: `${plugin.manifest.id}:${action.id}`,
        label: action.label,
        description: action.description || plugin.manifest.description,
        selection: action.selection,
      })),
    );
    const external = plugins.flatMap((plugin) => plugin.enabled && !plugin.embedded
      ? (plugin.manifest.contributes?.editorActions || []).map((action) => ({
          id: `${plugin.manifest.id}:${action.id}`,
          label: action.label,
          description: action.description || plugin.manifest.description,
          selection: action.selection,
        }))
      : []);
    return [...embedded, ...external];
  }, [enabledEmbeddedPlugins, plugins, surface]);

  useEffect(() => {
    const api = editorContext?.excalidrawAPI.current;
    if (surface !== "editor" || !api?.onChange) return;
    const update = (_elements?: readonly unknown[], appState?: any) => {
      const selected = appState?.selectedElementIds || api.getAppState?.()?.selectedElementIds || {};
      setSelectedCount(Object.values(selected).filter(Boolean).length);
    };
    update();
    return api.onChange(update);
  }, [editorContext?.excalidrawAPI, surface]);

  const pinned = actions.filter((action) => pinnedActionIds.includes(action.id));
  const run = (action: Action) => {
    if (action.selection === "required" && selectedCount === 0) return;
    detailsRef.current?.removeAttribute("open");
    openPluginAction(action.id);
  };
  if (actions.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5">
      {pinned.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={() => run(action)}
          disabled={action.selection === "required" && selectedCount === 0}
          aria-label={action.label}
          title={action.label}
          className="workspace-focus flex h-9 w-9 items-center justify-center rounded-lg text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-violet-300 dark:hover:bg-violet-950/40"
        >
          <span aria-hidden="true" className="text-[10px] font-bold">{action.label.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase()}</span>
        </button>
      ))}
      <details ref={detailsRef} className="relative">
        <summary className="workspace-focus flex h-9 cursor-pointer list-none items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 [&::-webkit-details-marker]:hidden">
          <Puzzle size={15} /> <span className="hidden sm:inline">Plugins</span>
        </summary>
        <div className="absolute right-0 top-full z-[80] mt-2 w-72 overflow-hidden rounded-xl border border-zinc-200 bg-white p-1.5 shadow-[0_8px_24px_rgba(24,24,27,0.16)] dark:border-zinc-700 dark:bg-zinc-900">
          <div className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Available here</div>
          {actions.map((action) => {
            const isPinned = pinnedActionIds.includes(action.id);
            const disabled = action.selection === "required" && selectedCount === 0;
            return (
              <div key={action.id} className="group flex items-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <button type="button" disabled={disabled} onClick={() => run(action)} className="workspace-focus min-w-0 flex-1 px-2.5 py-2 text-left disabled:cursor-not-allowed disabled:opacity-45">
                  <span className="block truncate text-xs font-semibold">{action.label}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-zinc-500 dark:text-zinc-400">{disabled ? "Select something on the canvas first" : action.description}</span>
                </button>
                <button type="button" onClick={() => togglePinnedAction(action.id)} aria-label={`${isPinned ? "Unpin" : "Pin"} ${action.label}`} className="workspace-focus mr-1.5 rounded-lg p-2 text-zinc-500 hover:bg-white hover:text-violet-700 dark:hover:bg-zinc-700 dark:hover:text-violet-300">
                  {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                </button>
              </div>
            );
          })}
          <button type="button" onClick={() => { detailsRef.current?.removeAttribute("open"); onManage(); }} className="workspace-focus mt-1 flex w-full items-center gap-2 border-t border-zinc-100 px-2.5 py-2.5 text-left text-xs font-semibold text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800">
            <Settings size={14} /> Manage plugins
          </button>
        </div>
      </details>
    </div>
  );
};
