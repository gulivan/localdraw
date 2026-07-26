export const isDesktopApp =
  import.meta.env.VITE_DESKTOP_MINIMAL === "true";

export const productName = isDesktopApp ? "LocalDraw" : "ExcaliDash";

export const savedLocationLabel = isDesktopApp
  ? "Saved on this device"
  : "Saved to ExcaliDash";
