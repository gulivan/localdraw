import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Plus, TestTube2, Trash2, TriangleAlert } from "lucide-react";
import { AiProfileFields } from "./AiProfileFields";
import { testAiConnection } from "./aiConnectionTest";
import { defaultAiProfile, defaultImageAiProfile, providerFor, readActiveAiProfileId, readAiProfiles, writeActiveAiProfileId, writeAiProfiles, type AiProfile, type AiProfileKind } from "./aiProfiles";

export const AiProfilesSettings = ({ modelKind = "chat" }: { modelKind?: "chat" | "image" }) => {
  const profileKind: AiProfileKind = modelKind === "image" ? "image" : "general";
  const [profiles, setProfiles] = useState(() => readAiProfiles(profileKind));
  const [activeId, setActiveId] = useState(() => readActiveAiProfileId(profileKind) || profiles[0]?.id || "");
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<{ kind: "success" | "warning" | "error"; message: string } | null>(null);
  const active = profiles.find((profile) => profile.id === activeId) || profiles[0];
  useEffect(() => writeAiProfiles(profiles, profileKind), [profileKind, profiles]);
  useEffect(() => { if (active?.id) writeActiveAiProfileId(active.id, profileKind); }, [active?.id, profileKind]);
  const update = (next: AiProfile) => {
    setTestStatus(null);
    setProfiles((current) => current.map((profile) => profile.id === next.id ? next : profile));
  };
  const add = () => {
    const next = { ...(profileKind === "image" ? defaultImageAiProfile() : defaultAiProfile()), name: `Profile ${profiles.length + 1}` };
    setProfiles((current) => [...current, next]);
    setActiveId(next.id);
    setTestStatus(null);
  };
  const remove = () => {
    if (!active || profiles.length === 1) return;
    const next = profiles.filter((profile) => profile.id !== active.id);
    setProfiles(next);
    setActiveId(next[0].id);
    setTestStatus(null);
  };
  const testConnection = async () => {
    if (!active || testing) return;
    setTesting(true);
    setTestStatus(null);
    try {
      const result = await testAiConnection(active, modelKind);
      setTestStatus({ kind: result.modelFound ? "success" : "warning", message: result.message });
    } catch (error) {
      setTestStatus({ kind: "error", message: error instanceof Error ? error.message : "Could not test this connection." });
    } finally {
      setTesting(false);
    }
  };
  if (!active) return null;
  return (
    <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-bold">AI connections</h2><p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">Reusable provider profiles for {modelKind === "image" ? "image generation" : "AI drawing"}. Keys stay in this LocalDraw browser profile, and changes save automatically.</p></div>
        <div className="flex gap-1.5"><button type="button" onClick={add} className="workspace-focus inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-xs font-semibold hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"><Plus size={14} /> New profile</button><button type="button" onClick={remove} disabled={profiles.length === 1} aria-label="Delete profile" className="workspace-focus flex h-9 w-9 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-35 dark:text-red-400 dark:hover:bg-red-950/40"><Trash2 size={14} /></button></div>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <div className="space-y-1" role="tablist" aria-label="AI profiles">
          {profiles.map((profile) => {
            const selected = profile.id === active.id;
            return <button key={profile.id} type="button" role="tab" aria-selected={selected} onClick={() => setActiveId(profile.id)} className={selected
              ? "workspace-focus w-full rounded-lg bg-violet-50 px-3 py-2 text-left text-xs font-semibold text-violet-800 dark:bg-violet-950/40 dark:text-violet-200"
              : "workspace-focus w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"}>
              <span className="block truncate">{profile.name}</span><span className="mt-0.5 block truncate text-[10px] font-normal opacity-75">{providerFor(profile.providerId, profileKind).name}</span>
            </button>;
          })}
        </div>
        <div className="space-y-4">
          <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Profile name<input value={active.name} onChange={(event) => update({ ...active, name: event.target.value })} className="workspace-focus mt-1.5 h-11 w-full rounded-xl border border-zinc-300 bg-zinc-100 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-800" /></label>
          <AiProfileFields profile={active} modelKind={modelKind} onChange={update} />
          <div className="flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <button type="button" onClick={() => void testConnection()} disabled={testing} className="workspace-focus inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:bg-zinc-100 disabled:cursor-wait disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800">
              {testing ? <Loader2 size={15} className="animate-spin" /> : <TestTube2 size={15} />} {testing ? "Testing…" : "Test connection"}
            </button>
            {testStatus && <div role="status" aria-live="polite" className={`flex min-w-0 items-start gap-2 text-sm font-medium ${testStatus.kind === "success" ? "text-emerald-700 dark:text-emerald-300" : testStatus.kind === "warning" ? "text-amber-700 dark:text-amber-300" : "text-red-700 dark:text-red-300"}`}>
              {testStatus.kind === "success" ? <CheckCircle2 size={17} className="mt-0.5 shrink-0" /> : <TriangleAlert size={17} className="mt-0.5 shrink-0" />}
              <span className="break-words">{testStatus.message}</span>
            </div>}
          </div>
        </div>
      </div>
    </section>
  );
};
