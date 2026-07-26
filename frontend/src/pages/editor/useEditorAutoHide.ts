import { useCallback, useState } from "react";

const STORAGE_KEY = "localdraw:editor:autoHideEnabled";

export const useEditorAutoHide = () => {
  const getStoredAutoHideEnabled = useCallback((): boolean => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === null) return true;
      return raw === "1" || raw === "true";
    } catch {
      return true;
    }
  }, []);

  const [autoHideEnabled, setAutoHideEnabled] = useState(
    getStoredAutoHideEnabled,
  );

  const setAndStoreAutoHideEnabled = useCallback(
    (next: boolean) => {
      setAutoHideEnabled(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Ignore storage errors in restricted browser contexts.
      }
    },
    [],
  );

  return {
    autoHideEnabled,
    setAutoHideEnabled: setAndStoreAutoHideEnabled,
  };
};
