export type DesktopWorkspaceStatus = {
  path: string;
  defaultPath: string;
  formatVersion: number;
  changed?: boolean;
  opened?: boolean;
  rescanned?: boolean;
};

const requestWorkspace = async (
  action?: "choose" | "open" | "rescan",
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

export const chooseDesktopWorkspace = (): Promise<DesktopWorkspaceStatus> =>
  requestWorkspace("choose");

export const openDesktopWorkspace = (): Promise<DesktopWorkspaceStatus> =>
  requestWorkspace("open");

export const rescanDesktopWorkspace = (): Promise<DesktopWorkspaceStatus> =>
  requestWorkspace("rescan");
