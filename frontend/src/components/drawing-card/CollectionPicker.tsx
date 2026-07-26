import React from "react";
import type { Collection, DrawingSummary } from "../../types";
import { CollectionMoveOptions } from "./CollectionMoveOptions";

interface CollectionPickerProps {
  drawing: DrawingSummary;
  collections: Collection[];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onMoveToCollection: (id: string, collectionId: string | null) => void;
}

export const CollectionPicker: React.FC<CollectionPickerProps> = ({
  drawing,
  collections,
  isOpen,
  onToggle,
  onClose,
  onMoveToCollection,
}) => {
  const collectionName = drawing.collectionId
    ? collections.find((collection) => collection.id === drawing.collectionId)
        ?.name || "Collection"
    : "Unorganized";

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1 flex-wrap justify-start xs:justify-end">
        <button
          onClick={onToggle}
          data-testid={`collection-picker-${drawing.id}`}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide max-w-[120px] truncate transition-all border bg-slate-50 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400 cursor-pointer border-neutral-200/60 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-700/50"
        >
          {collectionName}
        </button>

        {drawing.creatorName && (
          <span
            title={drawing.creatorName}
            className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide border bg-indigo-50/50 dark:bg-indigo-900/10 text-indigo-500 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/50 truncate max-w-[120px]"
          >
            {drawing.creatorName}
          </span>
        )}

      </div>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={onClose} />
          <div className="absolute right-0 bottom-full mb-1.5 w-48 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-lg z-20 py-1 max-h-56 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-bottom-2 duration-150">
            <CollectionMoveOptions
              collections={collections}
              currentCollectionId={drawing.collectionId}
              drawingId={drawing.id}
              onMoveToCollection={onMoveToCollection}
              onDone={onClose}
              optionClassName="w-full px-3 py-2 text-xs text-left flex items-center justify-between hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors truncate"
              selectedClassName="text-neutral-900 dark:text-white font-bold bg-neutral-100 dark:bg-neutral-800"
              unselectedClassName="text-slate-600 dark:text-neutral-400"
              checkSize={12}
            />
          </div>
        </>
      )}
    </div>
  );
};
