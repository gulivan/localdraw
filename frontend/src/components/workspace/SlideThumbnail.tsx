import { FileText } from "lucide-react";
import {
  useDrawingPreview,
  type DrawingPreviewSource,
} from "../drawing-card/useDrawingPreview";
import { SafeSvgPreview } from "../SafeSvgPreview";

export const SlideThumbnail = ({
  drawing,
  preview,
  className = "",
}: {
  drawing?: DrawingPreviewSource | null;
  preview?: string | null;
  className?: string;
}) =>
  drawing ? (
    <GeneratedThumbnail drawing={drawing} className={className} />
  ) : (
    <ThumbnailFrame preview={preview} className={className} />
  );

const GeneratedThumbnail = ({
  drawing,
  className,
}: {
  drawing: DrawingPreviewSource;
  className: string;
}) => {
  const { previewSvg } = useDrawingPreview(drawing);
  return <ThumbnailFrame preview={previewSvg} className={className} />;
};

const ThumbnailFrame = ({
  preview,
  className,
}: {
  preview?: string | null;
  className: string;
}) => (
  <div
    className={`relative flex items-center justify-center overflow-hidden bg-zinc-100 dark:bg-zinc-800 ${className}`}
  >
    {preview ? (
      <SafeSvgPreview
        svg={preview}
        className="h-full w-full object-contain p-3 dark:brightness-90"
      />
    ) : (
      <FileText size={28} className="text-zinc-400 dark:text-zinc-500" />
    )}
  </div>
);
