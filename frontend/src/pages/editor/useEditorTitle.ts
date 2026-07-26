import { useCallback, useState } from "react";

export const useEditorTitle = () => {
  const [title, setTitle] = useState({
    sourceId: null as string | null,
    name: "Drawing Editor",
  });
  const setDrawingName = useCallback((name: string) => {
    setTitle((current) => ({ ...current, name }));
  }, []);
  const setDrawingTitle = useCallback((sourceId: string, name: string) => {
    setTitle({ sourceId, name });
  }, []);

  return {
    drawingName: title.name,
    drawingNameSourceId: title.sourceId,
    setDrawingName,
    setDrawingTitle,
  };
};
