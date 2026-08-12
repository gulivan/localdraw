import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { AiProfileFields } from "./AiProfileFields";
import { defaultAiProfile, providerFor, readActiveAiProfileId, readAiProfiles, writeActiveAiProfileId, writeAiProfiles, type AiProfile } from "./aiProfiles";

export const AiProfilesSettings = () => {
  const [profiles, setProfiles] = useState(readAiProfiles);
  const [activeId, setActiveId] = useState(() => readActiveAiProfileId() || profiles[0]?.id || "");
  const active = profiles.find((profile) => profile.id === activeId) || profiles[0];
  useEffect(() => writeAiProfiles(profiles), [profiles]);
  useEffect(() => { if (active?.id) writeActiveAiProfileId(active.id); }, [active?.id]);
  const update = (next: AiProfile) => setProfiles((current) => current.map((profile) => profile.id === next.id ? next : profile));
  const add = () => {
    const next = { ...defaultAiProfile(), name: `Profile ${profiles.length + 1}` };
    setProfiles((current) => [...current, next]);
    setActiveId(next.id);
  };
  const remove = () => {
    if (!active || profiles.length === 1) return;
    const next = profiles.filter((profile) => profile.id !== active.id);
    setProfiles(next);
    setActiveId(next[0].id);
  };
  if (!active) return null;
  return (
    <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-bold">AI connections</h2><p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">Reusable provider profiles for AI drawing and image generation. Keys stay in this LocalDraw browser profile.</p></div>
        <div className="flex gap-1.5"><button type="button" onClick={add} className="workspace-focus inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-xs font-semibold hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"><Plus size={14} /> New profile</button><button type="button" onClick={remove} disabled={profiles.length === 1} aria-label="Delete profile" className="workspace-focus flex h-9 w-9 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-35 dark:text-red-400 dark:hover:bg-red-950/40"><Trash2 size={14} /></button></div>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <div className="space-y-1" role="tablist" aria-label="AI profiles">
          {profiles.map((profile) => {
            const selected = profile.id === active.id;
            return <button key={profile.id} type="button" role="tab" aria-selected={selected} onClick={() => setActiveId(profile.id)} className={selected
              ? "workspace-focus w-full rounded-lg bg-violet-50 px-3 py-2 text-left text-xs font-semibold text-violet-800 dark:bg-violet-950/40 dark:text-violet-200"
              : "workspace-focus w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"}>
              <span className="block truncate">{profile.name}</span><span className="mt-0.5 block truncate text-[10px] font-normal opacity-75">{providerFor(profile.providerId).name}</span>
            </button>;
          })}
        </div>
        <div className="space-y-4">
          <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Profile name<input value={active.name} onChange={(event) => update({ ...active, name: event.target.value })} className="workspace-focus mt-1.5 h-11 w-full rounded-xl border border-zinc-300 bg-zinc-100 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-800" /></label>
          <AiProfileFields profile={active} modelKind="chat" onChange={update} />
          <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Image model<input list="models-image-profile" value={active.imageModel} onChange={(event) => update({ ...active, imageModel: event.target.value })} placeholder="gpt-image-2" className="workspace-focus mt-1.5 h-11 w-full rounded-xl border border-zinc-300 bg-zinc-100 px-3 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-800" /></label>
        </div>
      </div>
    </section>
  );
};
