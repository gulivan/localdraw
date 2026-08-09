import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bot,
  Check,
  Copy,
  KeyRound,
  PlugZap,
  ShieldAlert,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import * as api from "../../api";

type ClientTab = "codexConfig" | "localdrawCli" | "claude" | "generic";

const deriveMcpUrl = () => {
  const apiUrl = import.meta.env.VITE_API_URL || "/api";
  const resolved = /^https?:\/\//i.test(apiUrl)
    ? apiUrl
    : new URL(apiUrl, window.location.origin).toString();
  return `${resolved.replace(/\/$/, "")}/mcp`;
};

const copyText = async (value: string) => {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
};

const shellQuote = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;

const setupSnippet = (tab: ClientTab, url: string, token: string) => {
  if (tab === "codexConfig") {
    return `# Shell
export LOCALDRAW_MCP_TOKEN=${shellQuote(token)}

# ~/.codex/config.toml
[mcp_servers.localdraw]
url = ${JSON.stringify(url)}
bearer_token_env_var = "LOCALDRAW_MCP_TOKEN"
default_tools_approval_mode = "writes"`;
  }
  if (tab === "localdrawCli") {
    return `LOCALDRAW_MCP_URL=${shellQuote(url)} LOCALDRAW_MCP_TOKEN=${shellQuote(token)} npx localdraw -- list-tools`;
  }
  if (tab === "claude") {
    return `claude mcp add --transport http --scope user --header ${shellQuote(`Authorization: Bearer ${token}`)} localdraw ${shellQuote(url)}`;
  }
  return JSON.stringify({
    mcpServers: {
      localdraw: {
        type: "http",
        url,
        headers: { Authorization: `Bearer ${token}` },
      },
    },
  }, null, 2);
};

const usageInstruction = `Use the LocalDraw MCP tools to inspect and manage my projects and canvases. Read a canvas and keep its version before editing. Use get_canvas_image with a canvas and file ID whenever you need to inspect an embedded image independently of the overall canvas size. Prefer atomic canvas patches and describe the result. Ask before deleting projects, moving canvases to Trash, restoring history, permanently deleting, or cleaning storage.`;
const clientHints: Record<ClientTab, string> = {
  codexConfig: "Export the token in your shell and paste only the TOML block into ~/.codex/config.toml.",
  localdrawCli: "Run the existing LocalDraw CLI to inspect the MCP endpoint directly.",
  claude: "Run this command in your terminal, then start a new Claude Code session.",
  generic: "Paste into your MCP client's configuration and restart that client.",
};
const clientLabels: Record<ClientTab, string> = {
  codexConfig: "Codex config",
  localdrawCli: "LocalDraw CLI",
  claude: "Claude Code",
  generic: "Generic MCP",
};
const clientTabs: ClientTab[] = ["codexConfig", "localdrawCli", "claude", "generic"];

export const ConnectAiModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const [connectionName, setConnectionName] = useState("AI connection");
  const [serverUrl, setServerUrl] = useState(deriveMcpUrl);
  const [tab, setTab] = useState<ClientTab>("codexConfig");
  const [keys, setKeys] = useState<api.ApiKeyMetadata[]>([]);
  const [generatedToken, setGeneratedToken] = useState("");
  const [generatedKeyId, setGeneratedKeyId] = useState("");
  const [loading, setLoading] = useState(false);
  const [keysLoading, setKeysLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"setup" | "instruction" | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const loadKeys = async () => {
    setKeysLoading(true);
    try {
      setKeys(await api.listApiKeys());
    } catch (caught) {
      setError(api.isAxiosError(caught) && caught.response?.data?.message
        ? caught.response.data.message
        : "Could not load API keys");
    } finally {
      setKeysLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setServerUrl(deriveMcpUrl());
    setGeneratedToken("");
    setGeneratedKeyId("");
    setCopied(null);
    setError("");
    void loadKeys();
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const snippet = useMemo(
    () => generatedToken ? setupSnippet(tab, serverUrl.trim(), generatedToken) : "",
    [generatedToken, serverUrl, tab],
  );

  if (!open) return null;

  const generate = async () => {
    const name = connectionName.trim();
    if (!name) return setError("Connection name is required");
    try {
      const url = new URL(serverUrl);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Unsupported protocol");
    } catch {
      return setError("Enter a valid MCP server URL");
    }
    setLoading(true);
    setError("");
    try {
      const response = await api.createApiKey(name, [...api.API_KEY_SCOPES]);
      setGeneratedToken(response.token);
      setGeneratedKeyId(response.apiKey.id);
      setKeys((current) => [response.apiKey, ...current]);
    } catch (caught) {
      setError(api.isAxiosError(caught) && caught.response?.data?.message
        ? caught.response.data.message
        : "Could not generate the AI connection key");
    } finally {
      setLoading(false);
    }
  };

  const revoke = async (key: api.ApiKeyMetadata) => {
    setError("");
    try {
      await api.revokeApiKey(key.id);
      setKeys((current) => current.map((item) => item.id === key.id
        ? { ...item, revokedAt: new Date().toISOString() }
        : item));
      if (key.id === generatedKeyId) {
        setGeneratedToken("");
        setGeneratedKeyId("");
      }
    } catch (caught) {
      setError(api.isAxiosError(caught) && caught.response?.data?.message
        ? caught.response.data.message
        : "Could not revoke the API key");
    }
  };

  const handleCopy = async (kind: "setup" | "instruction", value: string) => {
    try {
      await copyText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied((current) => current === kind ? null : current), 1600);
    } catch {
      setError("Copy failed. Select the text and copy it manually.");
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-zinc-950/40 px-4 py-6"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-ai-title"
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_12px_32px_rgba(24,24,27,0.22)] dark:border-zinc-700 dark:bg-zinc-900"
      >
        <header className="flex items-start gap-3 border-b border-zinc-200 p-5 dark:border-zinc-800">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
            <PlugZap size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="connect-ai-title" className="text-lg font-bold tracking-tight">Connect an AI agent</h2>
            <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">Give Codex, Claude Code, LocalDraw CLI, or another MCP client access to this workspace.</p>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} className="workspace-focus rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800" aria-label="Close Connect AI dialog">
            <X size={18} />
          </button>
        </header>

        <div className="overflow-y-auto p-5">
          {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</p>}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold">
              Connection name
              <input value={connectionName} onChange={(event) => setConnectionName(event.target.value)} maxLength={100} className="workspace-focus mt-1.5 h-11 w-full rounded-xl border border-zinc-200 bg-zinc-100 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-800" />
            </label>
            <label className="block text-sm font-semibold">
              MCP server URL
              <input value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} className="workspace-focus mt-1.5 h-11 w-full rounded-xl border border-zinc-200 bg-zinc-100 px-3 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-800" />
            </label>
          </div>

          {!generatedToken ? (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/25">
              <div className="flex gap-3">
                <ShieldAlert className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" size={18} />
                <div>
                  <p className="text-sm font-bold text-amber-900 dark:text-amber-200">This grants full workspace access</p>
                  <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-300">The agent can read and change projects, canvases, Trash, history, and canvas storage. Its key is shown once and embedded in the copied setup.</p>
                </div>
              </div>
              <button type="button" disabled={loading || !connectionName.trim()} onClick={() => void generate()} className="workspace-focus mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">
                <KeyRound size={16} /> {loading ? "Generating…" : "Generate connection key"}
              </button>
            </div>
          ) : (
            <div className="mt-5">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/25 dark:text-amber-300">
                Copy the setup now. Closing this dialog permanently hides the key.
              </div>
              <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1 sm:grid-cols-4 dark:bg-zinc-800" role="tablist" aria-label="MCP client">
                {clientTabs.map((candidate) => (
                  <button key={candidate} type="button" role="tab" aria-selected={tab === candidate} onClick={() => setTab(candidate)} className={`workspace-focus rounded-lg px-2 py-2 text-xs font-semibold ${tab === candidate ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-700 dark:text-white" : "text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"}`}>
                    {clientLabels[candidate]}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{clientHints[tab]}</p>
              <div className="relative mt-3">
                <pre className="max-h-52 overflow-auto rounded-xl bg-zinc-950 p-4 pr-12 text-xs leading-relaxed text-zinc-100"><code>{snippet}</code></pre>
                <button type="button" onClick={() => void handleCopy("setup", snippet)} className="workspace-focus absolute right-2 top-2 rounded-lg bg-zinc-800 p-2 text-zinc-200 hover:bg-zinc-700" aria-label="Copy MCP setup">
                  {copied === "setup" ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
              <div className="mt-4 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
                <div className="flex items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-xs font-bold"><Bot size={15} /> Optional instruction for the agent</p>
                  <button type="button" onClick={() => void handleCopy("instruction", usageInstruction)} className="workspace-focus inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950/40">
                    {copied === "instruction" ? <Check size={14} /> : <Copy size={14} />} {copied === "instruction" ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{usageInstruction}</p>
              </div>
            </div>
          )}

          <section className="mt-6 border-t border-zinc-200 pt-5 dark:border-zinc-800" aria-labelledby="active-api-keys">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 id="active-api-keys" className="text-sm font-bold">API keys</h3>
                <p className="mt-0.5 text-xs text-zinc-500">AI connections and other integration keys share this list.</p>
              </div>
              <Terminal size={17} className="text-zinc-400" />
            </div>
            {keysLoading ? <p className="mt-3 text-xs text-zinc-500">Loading keys…</p> : (
              <div className="mt-3 space-y-2">
                {keys.length === 0 && <p className="rounded-xl border border-dashed border-zinc-300 py-5 text-center text-xs text-zinc-500 dark:border-zinc-700">No API keys yet.</p>}
                {keys.map((key) => {
                  const revoked = Boolean(key.revokedAt);
                  return <div key={key.id} className="flex items-center gap-3 rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-700">
                    <span className={`h-2 w-2 rounded-full ${revoked ? "bg-zinc-400" : "bg-emerald-500"}`} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{key.name}</p>
                      <p className="truncate font-mono text-[10px] text-zinc-500">{key.prefix} · {revoked ? "revoked" : key.lastUsedAt ? `used ${new Date(key.lastUsedAt).toLocaleString()}` : "never used"}</p>
                    </div>
                    {!revoked && <button type="button" onClick={() => void revoke(key)} className="workspace-focus rounded-lg p-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30" aria-label={`Revoke API key ${key.name}`}><Trash2 size={15} /></button>}
                  </div>;
                })}
              </div>
            )}
          </section>
        </div>
      </section>
    </div>,
    document.body,
  );
};
