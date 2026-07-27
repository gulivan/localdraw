import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UpdateSettingsCard } from "./UpdateSettingsCard";

const baseProps = {
  updateChannel: "stable" as const,
  updateLoading: false,
  updateError: null,
  onChannelChange: vi.fn(),
  onCheckForUpdates: vi.fn(),
};

describe("UpdateSettingsCard", () => {
  it("shows desktop update availability and links to the matching LocalDraw release", () => {
    render(
      <UpdateSettingsCard
        {...baseProps}
        updateInfo={{
          currentVersion: "0.5.11",
          channel: "stable",
          outboundEnabled: true,
          latestVersion: "0.6.0",
          latestUrl: "https://github.com/gulivan/localdraw/releases/tag/v0.6.0-desktop",
          publishedAt: "2026-07-27T23:39:42Z",
          isUpdateAvailable: true,
        }}
      />,
    );

    expect(screen.getByText("v0.6.0 available")).toBeVisible();
    expect(screen.getByRole("link", { name: "Releases" })).toHaveAttribute(
      "href",
      "https://github.com/gulivan/localdraw/releases/tag/v0.6.0-desktop",
    );
  });

  it("falls back to the current LocalDraw release index", () => {
    render(<UpdateSettingsCard {...baseProps} updateInfo={null} />);
    expect(screen.getByRole("link", { name: "Releases" })).toHaveAttribute(
      "href",
      "https://github.com/gulivan/localdraw/releases",
    );
  });
});
