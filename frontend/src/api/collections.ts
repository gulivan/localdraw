import type { Collection } from "../types";
import { api } from "./client";

const timestamp = (value: unknown) => {
  if (typeof value === "number") return value;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? Date.now() : parsed;
};

const deserializeCollection = (collection: Collection): Collection => ({
  ...collection,
  createdAt: timestamp(collection.createdAt),
  updatedAt: collection.updatedAt ? timestamp(collection.updatedAt) : undefined,
  lastActivityAt: collection.lastActivityAt
    ? timestamp(collection.lastActivityAt)
    : undefined,
  latestDrawing: collection.latestDrawing
    ? {
        ...collection.latestDrawing,
        updatedAt: timestamp(collection.latestDrawing.updatedAt),
      }
    : null,
  initialDrawing: collection.initialDrawing
    ? {
        ...collection.initialDrawing,
        updatedAt: timestamp(collection.initialDrawing.updatedAt),
      }
    : undefined,
});

export const getCollections = async (options?: { includeOverview?: boolean }) => {
  const response = await api.get<Collection[]>("/collections", {
    params: options?.includeOverview ? { includeOverview: "true" } : undefined,
  });
  return response.data.map(deserializeCollection);
};

export const createCollection = async (
  name: string,
  options?: { color?: string; createInitialDrawing?: boolean },
) => {
  const response = await api.post<Collection>("/collections", { name, ...options });
  return deserializeCollection(response.data);
};

export const updateCollection = async (
  id: string,
  changes: string | { name?: string; color?: string },
) => {
  const payload = typeof changes === "string" ? { name: changes } : changes;
  const response = await api.put<Collection>(`/collections/${id}`, payload);
  return deserializeCollection(response.data);
};

export const deleteCollection = async (
  id: string,
  options?: { deleteSlides?: boolean },
) => {
  const response = await api.delete<{ success: true }>(`/collections/${id}`, {
    params: options?.deleteSlides ? { deleteSlides: "true" } : undefined,
  });
  return response.data;
};

type LibraryItem = Record<string, unknown>;

export const getLibrary = async (): Promise<LibraryItem[]> => {
  const response = await api.get<{ items: LibraryItem[] }>("/library");
  return response.data.items;
};

export const updateLibrary = async (items: LibraryItem[]): Promise<LibraryItem[]> => {
  const response = await api.put<{ items: LibraryItem[] }>("/library", { items });
  return response.data.items;
};
