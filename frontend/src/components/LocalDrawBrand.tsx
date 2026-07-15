import React, { useEffect, useId, useRef, useState } from "react";
import { CircleHelp } from "lucide-react";
import { Logo } from "./Logo";
import { displayFontFamily } from "../utils/displayFont";

interface LocalDrawBrandProps {
  compact?: boolean;
}

export const LocalDrawBrand: React.FC<LocalDrawBrandProps> = ({
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div
      ref={containerRef}
      className="relative flex items-center"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => {
        if (!containerRef.current?.contains(document.activeElement)) {
          setIsOpen(false);
        }
      }}
      onFocusCapture={() => setIsOpen(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsOpen(false);
        }
      }}
    >
      <Logo className={compact ? "h-8 w-8" : "h-10 w-10"} />
      <span
        className={
          compact
            ? "ml-2 mt-1 text-xl text-slate-900 dark:text-white"
            : "ml-3 mt-1 text-2xl tracking-tight text-slate-900 dark:text-white"
        }
        style={{ fontFamily: displayFontFamily }}
      >
        LocalDraw
      </span>
      <button
        type="button"
        aria-label="About LocalDraw"
        aria-controls={popoverId}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="ml-1.5 mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200 dark:focus-visible:ring-offset-neutral-900"
      >
        <CircleHelp size={15} strokeWidth={2.25} aria-hidden="true" />
      </button>

      <div
        id={popoverId}
        role="dialog"
        aria-label="About LocalDraw"
        className={[
          "absolute top-full z-50 mt-2 rounded-lg border border-slate-200 bg-white p-3 text-left font-sans text-xs leading-5 text-slate-600 shadow-lg transition duration-150 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
          compact ? "right-0 w-56" : "left-0 w-full",
          isOpen
            ? "pointer-events-auto visible translate-y-0 opacity-100"
            : "pointer-events-none invisible -translate-y-1 opacity-0",
        ].join(" ")}
      >
        forked from{" "}
        <a
          href="https://github.com/ZimengXiong/ExcaliDash"
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-indigo-700 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-indigo-300 dark:decoration-indigo-600 dark:hover:text-indigo-100"
        >
          ExcaliDash
        </a>
        ; powered by{" "}
        <a
          href="https://github.com/excalidraw/excalidraw"
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-indigo-700 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-indigo-300 dark:decoration-indigo-600 dark:hover:text-indigo-100"
        >
          Excalidraw
        </a>
      </div>
    </div>
  );
};
