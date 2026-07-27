export type DesktopWorkspaceStatus = {
  path: string;
  defaultPath: string;
  formatVersion: number;
  revision: number;
  state: "ready" | "missing" | "read-only" | "scanning";
  changed?: boolean;
  opened?: boolean;
  rescanned?: boolean;
};

const requestWorkspace = async (
  action?: "open-existing" | "move" | "reveal" | "rescan",
): Promise<DesktopWorkspaceStatus> => {
  const response = await fetch(
    `/__localdraw/workspace${action ? `/${action}` : ""}`,
    action ? { method: "POST" } : undefined,
  );
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error || "Workspace operation failed");
  }
  return body as DesktopWorkspaceStatus;
};

export const getDesktopWorkspace = (): Promise<DesktopWorkspaceStatus> =>
  requestWorkspace();

export const openExistingDesktopWorkspace = (): Promise<DesktopWorkspaceStatus> =>
  requestWorkspace("open-existing");

export const moveDesktopWorkspace = (): Promise<DesktopWorkspaceStatus> =>
  requestWorkspace("move");

export const revealDesktopWorkspace = (): Promise<DesktopWorkspaceStatus> =>
  requestWorkspace("reveal");

export const rescanDesktopWorkspace = (): Promise<DesktopWorkspaceStatus> =>
  requestWorkspace("rescan");
