import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceSettingsCard } from "./WorkspaceSettingsCard";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  move: vi.fn(),
  openExisting: vi.fn(),
  reveal: vi.fn(),
  rescan: vi.fn(),
}));

vi.mock("../../api", () => ({
  getDesktopWorkspace: mocks.get,
  moveDesktopWorkspace: mocks.move,
  openExistingDesktopWorkspace: mocks.openExisting,
  revealDesktopWorkspace: mocks.reveal,
  rescanDesktopWorkspace: mocks.rescan,
}));

describe("WorkspaceSettingsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue({
      path: "/home/me/Documents/LocalDraw",
      defaultPath: "/home/me/Documents/LocalDraw",
      formatVersion: 2,
      revision: 0,
      state: "ready",
    });
    mocks.openExisting.mockResolvedValue({
      path: "/mnt/drawings",
      defaultPath: "/home/me/Documents/LocalDraw",
      formatVersion: 2,
      revision: 1,
      state: "ready",
      changed: true,
    });
    mocks.reveal.mockResolvedValue({
      path: "/home/me/Documents/LocalDraw",
      defaultPath: "/home/me/Documents/LocalDraw",
      formatVersion: 2,
      revision: 0,
      state: "ready",
      opened: true,
    });
    mocks.move.mockResolvedValue({
      path: "/mnt/moved-drawings",
      defaultPath: "/home/me/Documents/LocalDraw",
      formatVersion: 2,
      revision: 2,
      state: "ready",
      changed: true,
    });
  });

  it("shows the active folder and opens an existing workspace", async () => {
    render(<WorkspaceSettingsCard />);

    expect(await screen.findByText("/home/me/Documents/LocalDraw")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open existing" }));

    await waitFor(() => expect(mocks.openExisting).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("/mnt/drawings")).toBeInTheDocument();
  });

  it("keeps showing the active folder after opening it", async () => {
    render(<WorkspaceSettingsCard />);

    expect(await screen.findByText("/home/me/Documents/LocalDraw")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reveal folder" }));

    await waitFor(() => expect(mocks.reveal).toHaveBeenCalledTimes(1));
    expect(screen.getByText("/home/me/Documents/LocalDraw")).toBeInTheDocument();
  });

  it("moves the workspace only through the explicit move action", async () => {
    render(<WorkspaceSettingsCard />);

    await screen.findByText("/home/me/Documents/LocalDraw");
    fireEvent.click(screen.getByRole("button", { name: "Move workspace" }));

    await waitFor(() => expect(mocks.move).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("/mnt/moved-drawings")).toBeInTheDocument();
  });
});
