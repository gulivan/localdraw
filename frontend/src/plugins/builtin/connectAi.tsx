/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from "react";
import { PlugZap } from "lucide-react";
import { ConnectAiModal } from "../../components/workspace/ConnectAiModal";
import type { EmbeddedPlugin } from "../types";
import { listenForPluginAction } from "../actionEvents";

const ACTION_ID = "localdraw.connect-ai:home";

const ConnectAiHomeAction = ({ hideTrigger = false }: { hideTrigger?: boolean }) => {
  const [open, setOpen] = useState(false);
  useEffect(() => listenForPluginAction(ACTION_ID, () => setOpen(true)), []);
  return (
    <>
      {!hideTrigger && <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Connect AI"
        className="workspace-focus inline-flex h-10 items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 text-xs font-semibold text-violet-700 hover:bg-violet-100 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-950/70"
      >
        <PlugZap size={15} /> <span className="hidden md:inline">Connect AI</span>
      </button>}
      <ConnectAiModal open={open} onClose={() => setOpen(false)} />
    </>
  );
};

export const connectAiPlugin: EmbeddedPlugin = {
  manifest: {
    manifestVersion: 1,
    id: "localdraw.connect-ai",
    name: "Connect AI",
    version: "1.0.0",
    description: "Expose projects and canvases to Codex, Claude Code, and other MCP clients through a revocable workspace key.",
    author: "LocalDraw",
    permissions: ["canvas:read", "canvas:write", "network"],
  },
  defaultEnabled: true,
  HomeAction: ConnectAiHomeAction,
};
