import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceSettingsCard } from "./WorkspaceSettingsCard";

const mocks = vi.hoisted(() => ({
  choose: vi.fn(),
  get: vi.fn(),
  open: vi.fn(),
  rescan: vi.fn(),
}));

vi.mock("../../api", () => ({
  chooseDesktopWorkspace: mocks.choose,
  getDesktopWorkspace: mocks.get,
  openDesktopWorkspace: mocks.open,
  rescanDesktopWorkspace: mocks.rescan,
}));

describe("WorkspaceSettingsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue({
      path: "/home/me/.localdraw",
      defaultPath: "/home/me/.localdraw",
      formatVersion: 1,
    });
    mocks.choose.mockResolvedValue({
      path: "/mnt/drawings",
      defaultPath: "/home/me/.localdraw",
      formatVersion: 1,
      changed: true,
    });
    mocks.open.mockResolvedValue({
      path: "/home/me/.localdraw",
      defaultPath: "/home/me/.localdraw",
      formatVersion: 1,
      opened: true,
    });
  });

  it("shows the active folder and migrates to a chosen folder", async () => {
    render(<WorkspaceSettingsCard />);

    expect(await screen.findByText("/home/me/.localdraw")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Choose folder" }));

    await waitFor(() => expect(mocks.choose).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("/mnt/drawings")).toBeInTheDocument();
  });

  it("keeps showing the active folder after opening it", async () => {
    render(<WorkspaceSettingsCard />);

    expect(await screen.findByText("/home/me/.localdraw")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => expect(mocks.open).toHaveBeenCalledTimes(1));
    expect(screen.getByText("/home/me/.localdraw")).toBeInTheDocument();
  });
});
