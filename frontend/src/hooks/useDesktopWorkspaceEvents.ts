import { useEffect, useRef } from "react";
import { isDesktopApp } from "../utils/productBrand";

const EVENT_NAME = "localdraw:workspace-changed";

export const useDesktopWorkspaceEventSource = () => {
  useEffect(() => {
    if (!isDesktopApp) return;
    let lastRevision: number | undefined;
    const source = new EventSource("/__localdraw/events");
    const notify = (event: MessageEvent) => {
      let revision: number | undefined;
      try {
        revision = Number(JSON.parse(event.data)?.revision);
      } catch {
        revision = undefined;
      }
      if (Number.isFinite(revision)) lastRevision = revision;
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { revision } }));
    };
    source.addEventListener("workspace-changed", notify as EventListener);
    const poll = async () => {
      try {
        const response = await fetch("/__localdraw/workspace", { cache: "no-store" });
        if (!response.ok) return;
        const revision = Number((await response.json())?.revision);
        if (!Number.isFinite(revision)) return;
        if (lastRevision === undefined) {
          lastRevision = revision;
          return;
        }
        if (revision === lastRevision) return;
        lastRevision = revision;
        window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { revision } }));
      } catch {
        // The SSE connection remains the primary path; retry polling later.
      }
    };
    const timer = window.setInterval(() => void poll(), 2_500);
    const onFocus = () => void poll();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    void poll();
    return () => {
      source.close();
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
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

export const useDesktopDrawingChange = (
  drawingId: string | undefined,
  callback: (revision?: number) => void,
) => {
  const callbackRef = useRef(callback);
  useEffect(() => { callbackRef.current = callback; }, [callback]);
  useEffect(() => {
    if (!isDesktopApp || !drawingId) return;
    const listener = (event: Event) => callbackRef.current((event as CustomEvent<{ revision?: number }>).detail?.revision);
    window.addEventListener(EVENT_NAME, listener);
    return () => window.removeEventListener(EVENT_NAME, listener);
  }, [drawingId]);
};
