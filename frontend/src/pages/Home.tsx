import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Clock3,
  FolderPlus,
  RefreshCw,
  Search,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";
import * as api from "../api";
import { NewProjectDialog } from "../components/workspace/NewProjectDialog";
import { ProjectCard } from "../components/workspace/ProjectCard";
import { SlideThumbnail } from "../components/workspace/SlideThumbnail";
import { WorkspaceHeader } from "../components/workspace/WorkspaceHeader";
import { UploadStatus } from "../components/UploadStatus";
import { useUpload } from "../context/UploadContext";
import { useDebounce } from "../hooks/useDebounce";
import type { Collection, DrawingSummary } from "../types";

export const Home = () => {
  const navigate = useNavigate();
  const { uploadFiles } = useUpload();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 250);
  const [projects, setProjects] = useState<Collection[]>([]);
  const [recent, setRecent] = useState<DrawingSummary[]>([]);
  const [unfiled, setUnfiled] = useState<{ count: number; slide?: DrawingSummary }>({ count: 0 });
  const [searchResults, setSearchResults] = useState<DrawingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [collectionRows, recentRows, unfiledRows] = await Promise.all([
        api.getCollections({ includeOverview: true }),
        api.getDrawings(undefined, undefined, {
          includePreview: true,
          limit: 8,
          sortField: "updatedAt",
          sortDirection: "desc",
        }),
        api.getDrawings(undefined, null, {
          includePreview: true,
          limit: 1,
          sortField: "updatedAt",
          sortDirection: "desc",
        }),
      ]);
      setProjects(collectionRows.filter((project) => project.id !== "trash"));
      setRecent(recentRows.drawings);
      setUnfiled({ count: unfiledRows.totalCount, slide: unfiledRows.drawings[0] });
    } catch (loadError) {
      console.error(loadError);
      setError("Your workspace could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    api
      .getDrawings(debouncedQuery, undefined, {
        includePreview: true,
        limit: 48,
        sortField: "updatedAt",
        sortDirection: "desc",
      })
      .then((result) => !cancelled && setSearchResults(result.drawings))
      .catch(() => !cancelled && setSearchResults([]));
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const matchingProjects = useMemo(() => {
    const term = debouncedQuery.trim().toLowerCase();
    if (!term) return projects;
    const matchingIds = new Set(searchResults.map((slide) => slide.collectionId));
    return projects.filter(
      (project) =>
        project.name.toLowerCase().includes(term) || matchingIds.has(project.id),
    );
  }, [debouncedQuery, projects, searchResults]);

  const createSlide = async (collectionId: string | null = null) => {
    const drawing = await api.createDrawing("Untitled Slide", collectionId);
    navigate(`/editor/${drawing.id}`);
  };

  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    await uploadFiles(Array.from(files), null);
    await load();
  };

  return (
    <div className="workspace-shell min-h-screen">
      <WorkspaceHeader
        query={query}
        onQueryChange={setQuery}
        onNewProject={() => setNewProjectOpen(true)}
        onNewSlide={() => void createSlide()}
        onImport={(files) => void importFiles(files)}
      />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-white px-6 py-12 text-center dark:border-red-900 dark:bg-zinc-900">
            <p className="font-semibold text-red-800 dark:text-red-300">{error}</p>
            <button type="button" onClick={() => void load()} className="workspace-focus mt-4 inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
              <RefreshCw size={15} /> Retry
            </button>
          </div>
        ) : loading ? (
          <HomeSkeleton />
        ) : debouncedQuery.trim() ? (
          <SearchView query={debouncedQuery} projects={matchingProjects} slides={searchResults} onOpenProject={(id) => navigate(`/projects/${id}`)} onOpenSlide={(id) => navigate(`/editor/${id}`)} />
        ) : (
          <>
            {recent.length > 0 && (
              <section className="mb-10" aria-labelledby="continue-title">
                <div className="mb-3 flex items-center justify-between">
                  <h1 id="continue-title" className="flex items-center gap-2 text-sm font-semibold">
                    <Clock3 size={16} className="text-zinc-500" /> Recent
                  </h1>
                  <button type="button" onClick={() => navigate("/collections")} className="workspace-focus rounded text-xs font-semibold text-violet-700 hover:underline dark:text-violet-300">All slides</button>
                </div>
                <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
                  {recent.map((slide) => {
                    const project = projects.find((item) => item.id === slide.collectionId);
                    return (
                      <button key={slide.id} type="button" onClick={() => navigate(`/editor/${slide.id}`)} className="workspace-focus group w-52 shrink-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white text-left transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-[0_4px_8px_rgba(24,24,27,0.10)] dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-violet-700">
                        <SlideThumbnail drawing={slide} className="h-28 w-full" />
                        <span className="block p-3">
                          <span className="block truncate text-sm font-semibold">{slide.name}</span>
                          <span className="mt-1 flex items-center gap-1 truncate text-[11px] text-zinc-600 dark:text-zinc-400">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: project?.color || "#71717a" }} />
                            {project?.name || "Unfiled"} · {formatDistanceToNow(slide.updatedAt)} ago
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            <section aria-labelledby="projects-title">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h2 id="projects-title" className="text-2xl font-bold tracking-[-0.02em]">Your projects</h2>
                <button
                  type="button"
                  onClick={() => setNewProjectOpen(true)}
                  className="workspace-focus inline-flex h-10 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <FolderPlus size={15} /> New project
                </button>
              </div>
              <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {projects.map((project) => (
                  <ProjectCard key={project.id} project={project} onView={() => navigate(`/projects/${project.id}`)} />
                ))}
                <UnfiledCard count={unfiled.count} slide={unfiled.slide} onView={() => navigate("/collections?id=unorganized")} />
              </div>
            </section>

          </>
        )}
      </main>
      <NewProjectDialog open={newProjectOpen} onClose={() => setNewProjectOpen(false)} onCreate={async (name, color) => {
        const project = await api.createCollection(name, { color, createInitialDrawing: true });
        navigate(`/projects/${project.id}`);
      }} />
      <UploadStatus />
    </div>
  );
};

const UnfiledCard = ({ count, slide, onView }: { count: number; slide?: DrawingSummary; onView: () => void }) => (
  <article className="h-[226px] overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
    <button type="button" onClick={onView} className="workspace-focus relative h-36 w-full"><SlideThumbnail drawing={slide} className="h-full w-full" /><span className="absolute left-3 top-3 inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-zinc-700 px-1.5 text-[10px] font-semibold text-white" aria-label={`${count} ${count === 1 ? "canvas" : "canvases"}`} title={`${count} ${count === 1 ? "canvas" : "canvases"}`}>{count}</span></button>
    <div className="flex h-20 items-center p-4"><h3 className="font-semibold">Other</h3></div>
  </article>
);

const SearchView = ({ query, projects, slides, onOpenProject, onOpenSlide }: { query: string; projects: Collection[]; slides: DrawingSummary[]; onOpenProject: (id: string) => void; onOpenSlide: (id: string) => void }) => (
  <section><h1 className="text-2xl font-bold tracking-[-0.02em]">Results for “{query}”</h1>{projects.length === 0 && slides.length === 0 ? <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 py-16 text-center dark:border-zinc-700"><Search className="mx-auto text-zinc-400" /><p className="mt-3 text-sm font-semibold">No matching projects or slides</p></div> : <><div className="mt-6 flex flex-wrap gap-2">{projects.map((project) => <button key={project.id} type="button" onClick={() => onOpenProject(project.id)} className="workspace-focus rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold dark:border-zinc-700 dark:bg-zinc-900"><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: project.color || "#7c3aed" }} />{project.name}</button>)}</div><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{slides.map((slide) => <button key={slide.id} type="button" onClick={() => onOpenSlide(slide.id)} className="workspace-focus overflow-hidden rounded-2xl border border-zinc-200 bg-white text-left dark:border-zinc-800 dark:bg-zinc-900"><SlideThumbnail drawing={slide} className="h-36" /><span className="block truncate p-4 text-sm font-semibold">{slide.name}</span></button>)}</div></>}</section>
);

const HomeSkeleton = () => <div aria-label="Loading workspace" className="animate-pulse"><div className="h-5 w-28 rounded bg-zinc-200 dark:bg-zinc-800" /><div className="mt-4 flex gap-3 overflow-hidden">{[1, 2, 3, 4].map((item) => <div key={item} className="h-44 w-52 shrink-0 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />)}</div><div className="mt-10 h-8 w-40 rounded bg-zinc-200 dark:bg-zinc-800" /><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-64 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />)}</div></div>;
