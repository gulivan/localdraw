type SafeSvgPreviewProps = {
  svg: string;
  className?: string;
  alt?: string;
};

/** Render stored SVG as an inert image document instead of injecting DOM. */
export const SafeSvgPreview = ({
  svg,
  className = "",
  alt = "",
}: SafeSvgPreviewProps) => (
  <img
    src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
    alt={alt}
    className={className}
    draggable={false}
  />
);
