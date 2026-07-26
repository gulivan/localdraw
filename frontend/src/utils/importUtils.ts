import { api } from "../api";
import { type UploadStatus } from "../context/UploadContext";
import { extractDrawingData, makeSvgPreview } from "./importHelpers";

export const importDrawings = async (
  files: File[],
  targetCollectionId: string | null,
  onSuccess?: () => void | Promise<void>,
  onProgress?: (
    fileIndex: number,
    status: UploadStatus,
    progress: number,
    error?: string
  ) => void
) => {
  const drawingFiles = files.filter(
    (f) => f.name.endsWith(".json") || f.name.endsWith(".excalidraw")
  );

  if (drawingFiles.length === 0) {
    return { success: 0, failed: 0, errors: ["No supported files found."] };
  }

  let successCount = 0;
  let failCount = 0;
  const errors: string[] = [];

  const originalIndexMap = new Map<number, number>();
  drawingFiles.forEach((df, i) => {
    const originalIndex = files.indexOf(df);
    originalIndexMap.set(i, originalIndex);
  });

  await Promise.all(
    drawingFiles.map(async (file, drawingIndex) => {
      const fileIndex = originalIndexMap.get(drawingIndex) ?? drawingIndex;
      try {
        if (onProgress) onProgress(fileIndex, 'processing', 0);

        const text = await file.text();
        const parsed = JSON.parse(text) as unknown;
        const extracted = extractDrawingData(parsed);
        if (!extracted) throw new Error(`Invalid file structure: ${file.name}`);

        const svg = await makeSvgPreview(extracted.elements, extracted.appState, extracted.files);

        const payload = {
          name: file.name.replace(/\.(json|excalidraw)$/, ""),
          elements: extracted.elements,
          appState: extracted.appState,
          files: extracted.files || null,
          collectionId: targetCollectionId,
          createdAt: (parsed as any)?.createdAt || Date.now(),
          updatedAt: (parsed as any)?.updatedAt || Date.now(),
          preview: svg.outerHTML,
        };

        if (onProgress) onProgress(fileIndex, 'uploading', 0);

        await api.post("/drawings", payload, {
          headers: {
            "X-Imported-File": "true",
          },
          onUploadProgress: (progressEvent) => {
            if (onProgress && progressEvent.total) {
              const percentCompleted = Math.round(
                (progressEvent.loaded * 100) / progressEvent.total
              );
              onProgress(fileIndex, 'uploading', percentCompleted);
            }
          },
        });

        if (onProgress) onProgress(fileIndex, 'success', 100);
        successCount++;

      } catch (err: any) {
        console.error(`Failed to import ${file.name}:`, err);
        failCount++;
        const errorMessage =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          "Upload failed";
        errors.push(`${file.name}: ${errorMessage}`);
        if (onProgress) onProgress(fileIndex, 'error', 0, errorMessage);
      }
    })
  );

  if (successCount > 0 && onSuccess) {
    await onSuccess();
  }

  return { success: successCount, failed: failCount, errors };
};
