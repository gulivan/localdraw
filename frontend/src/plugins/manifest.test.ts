import { describe, expect, it } from "vitest";
import { resolvePluginManifestUrl, validatePluginManifest } from "./manifest";

describe("plugin manifests", () => {
  it("resolves repository and tree GitHub links", () => {
    expect(resolvePluginManifestUrl("https://github.com/acme/drawing-tools").href)
      .toBe("https://raw.githubusercontent.com/acme/drawing-tools/HEAD/localdraw.plugin.json");
    expect(resolvePluginManifestUrl("https://github.com/acme/drawing-tools/tree/v2/packages/labels").href)
      .toBe("https://raw.githubusercontent.com/acme/drawing-tools/v2/packages/labels/localdraw.plugin.json");
  });

  it("normalizes relative entries and validates permissions", () => {
    const manifest = validatePluginManifest({
      manifestVersion: 1,
      id: "acme.labels",
      name: "Labels",
      version: "1.0.0",
      description: "Adds labeled shapes",
      entry: "./plugin.js",
      permissions: ["canvas:read", "canvas:write"],
      contributes: { editorActions: [{ id: "label", label: "Add label", selection: "required" }] },
    }, new URL("https://example.com/plugins/localdraw.plugin.json"));
    expect(manifest.entry).toBe("https://example.com/plugins/plugin.js");
    expect(manifest.contributes?.editorActions?.[0].selection).toBe("required");
  });

  it("rejects unknown permissions", () => {
    expect(() => validatePluginManifest({
      manifestVersion: 1,
      id: "acme.unsafe",
      name: "Unsafe",
      version: "1",
      description: "Unsafe plugin",
      permissions: ["filesystem:write"],
    }, new URL("https://example.com/localdraw.plugin.json"))).toThrow("Unsupported plugin permission");
  });
});
