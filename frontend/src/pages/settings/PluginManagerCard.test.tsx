import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PluginProvider } from "../../plugins/PluginProvider";
import { PluginManagerCard } from "./PluginManagerCard";

describe("PluginManagerCard", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: () => values.clear(),
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, String(value)),
      },
    });
  });

  it("shows and toggles bundled plugins", () => {
    render(<PluginProvider><PluginManagerCard /></PluginProvider>);
    expect(screen.getByText("Connect AI")).toBeInTheDocument();
    expect(screen.getByText("Image generation")).toBeInTheDocument();
    expect(screen.getByText("2 active")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Disable Connect AI" }));
    expect(screen.getByText("1 active")).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("localdraw.plugin-enabled.v1") || "{}")).toMatchObject({
      "localdraw.connect-ai": false,
    });
  });

  it("installs a direct manifest disabled for permission review", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      manifestVersion: 1,
      id: "acme.labels",
      name: "Acme labels",
      version: "1.0.0",
      description: "Add labels to selected elements",
      entry: "./plugin.js",
      permissions: ["canvas:read", "canvas:write"],
      contributes: { editorActions: [{ id: "label", label: "Add label" }] },
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    render(<PluginProvider><PluginManagerCard /></PluginProvider>);
    fireEvent.change(screen.getByLabelText("Install from link"), { target: { value: "https://plugins.example/acme/localdraw.plugin.json" } });
    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    expect(await screen.findByText("Acme labels")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Enable Acme labels" })).toHaveAttribute("aria-checked", "false");
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem("localdraw.plugins.v1") || "[]")).toHaveLength(1));
  });
});
