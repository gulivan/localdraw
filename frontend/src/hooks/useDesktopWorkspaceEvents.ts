import { useEffect, useRef } from "react";
import { isDesktopApp } from "../utils/productBrand";

const EVENT_NAME = "localdraw:workspace-changed";

export const useDesktopWorkspaceEventSource = () => {
  useEffect(() => {
    if (!isDesktopApp) return;
    const source = new EventSource("/__localdraw/events");
    const notify = (event: MessageEvent) => {
      let revision: number | undefined;
      try {
        revision = Number(JSON.parse(event.data)?.revision);
      } catch {
        revision = undefined;
      }
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { revision } }));
    };
    source.addEventListener("workspace-changed", notify as EventListener);
    return () => source.close();
  }, []);
};

export const useDesktopWorkspaceChange = (callback: () => void) => {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  useEffect(() => {
    if (!isDesktopApp) return;
    const listener = () => callbackRef.current();
    window.addEventListener(EVENT_NAME, listener);
    return () => window.removeEventListener(EVENT_NAME, listener);
  }, []);
};
