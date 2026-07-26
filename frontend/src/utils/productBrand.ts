export const isDesktopApp =
  import.meta.env.VITE_DESKTOP_MINIMAL === "true";

export const productName = "LocalDraw";

export const savedLocationLabel = isDesktopApp
  ? "Saved on this device"
  : "Saved to LocalDraw";
