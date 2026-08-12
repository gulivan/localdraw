export type ModelCatalogEntry = {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
  releaseDate?: string;
  output: string[];
};

type ModelsDevProvider = {
  id?: string;
  name?: string;
  api?: string;
  models?: Record<string, {
    id?: string;
    name?: string;
    release_date?: string;
    modalities?: { output?: string[] };
  }>;
};

const CACHE_KEY = "localdraw.models-dev.v1";
const CACHE_TTL = 24 * 60 * 60 * 1000;

const parseCatalog = (raw: Record<string, ModelsDevProvider>): ModelCatalogEntry[] =>
  Object.entries(raw).flatMap(([providerKey, provider]) =>
    Object.entries(provider.models || {}).map(([modelKey, model]) => ({
      id: model.id || modelKey,
      name: model.name || model.id || modelKey,
      providerId: provider.id || providerKey,
      providerName: provider.name || provider.id || providerKey,
      releaseDate: model.release_date,
      output: model.modalities?.output || [],
    })),
  ).sort((left, right) => String(right.releaseDate || "").localeCompare(String(left.releaseDate || "")));

export const loadModelCatalog = async (): Promise<ModelCatalogEntry[]> => {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null") as { at?: number; models?: ModelCatalogEntry[] } | null;
    if (cached?.at && Date.now() - cached.at < CACHE_TTL && Array.isArray(cached.models)) return cached.models;
  } catch {
    // Fetch a fresh catalog when cache data is unavailable.
  }
  const response = await fetch("https://models.dev/api.json", { credentials: "omit" });
  if (!response.ok) throw new Error("Could not refresh models.dev catalog");
  const models = parseCatalog(await response.json());
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), models }));
  } catch {
    // A full catalog can exceed constrained browser storage; the live result still works.
  }
  return models;
};
