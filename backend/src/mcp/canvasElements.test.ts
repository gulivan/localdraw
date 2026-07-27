import { describe, expect, it } from "vitest";
import {
  createSceneElements,
  deleteSceneElement,
  updateSceneElement,
} from "./canvasElements";
import { arrangeScene, describeScene, queryScene } from "./canvasScene";

describe("MCP canvas elements", () => {
  it("creates labeled shapes and bound arrows in an agent-friendly format", () => {
    const scene: any[] = [];
    const source = createSceneElements({
      id: "source",
      type: "rectangle",
      x: 100,
      y: 100,
      width: 180,
      height: 80,
      text: "API",
    }, scene);
    scene.push(...source.elements);
    const target = createSceneElements({
      id: "target",
      type: "diamond",
      x: 420,
      y: 100,
      width: 160,
      height: 100,
      text: "Database",
    }, scene);
    scene.push(...target.elements);
    const arrow = createSceneElements({
      id: "connection",
      type: "arrow",
      x: 0,
      y: 0,
      startElementId: "source",
      endElementId: "target",
    }, scene);
    scene.push(...arrow.elements);

    expect(scene.find((element) => element.id === "source")?.boundElements)
      .toEqual(expect.arrayContaining([{ id: "connection", type: "arrow" }]));
    expect(scene.find((element) => element.containerId === "source")?.text).toBe("API");
    expect(scene.find((element) => element.id === "connection")).toMatchObject({
      startBinding: { elementId: "source" },
      endBinding: { elementId: "target" },
      endArrowhead: "arrow",
    });
    expect(describeScene(scene)).toContain("source -> target");
    expect(queryScene(scene, { text: "database" }).map((element) => element.id)).toContain("target");
  });

  it("updates bound labels and soft-deletes containers with their labels", () => {
    const scene: any[] = [];
    const created = createSceneElements({
      id: "box",
      type: "rectangle",
      x: 0,
      y: 0,
      text: "Before",
    }, scene);
    scene.push(...created.elements);
    const changed = updateSceneElement({ id: "box", text: "After", x: 40 }, scene);
    expect(changed).toHaveLength(2);
    expect(scene.find((element) => element.containerId === "box")).toMatchObject({ text: "After", x: 101 });

    deleteSceneElement("box", scene);
    expect(scene.find((element) => element.id === "box")?.isDeleted).toBe(true);
    expect(scene.find((element) => element.containerId === "box")?.isDeleted).toBe(true);
  });

  it("refuses ordinary updates to locked elements", () => {
    const scene: any[] = [];
    scene.push(...createSceneElements({ id: "locked", type: "rectangle", x: 0, y: 0, locked: true }, scene).elements);
    expect(() => updateSceneElement({ id: "locked", x: 20 }, scene)).toThrow("locked");
  });

  it("returns the new element IDs when duplicating", () => {
    const scene: any[] = [];
    scene.push(...createSceneElements({ id: "source", type: "rectangle", x: 10, y: 20 }, scene).elements);

    const changedIds = arrangeScene(scene, { action: "duplicate", elementIds: ["source"] });

    expect(changedIds).toHaveLength(1);
    expect(changedIds[0]).not.toBe("source");
    expect(scene.find((element) => element.id === changedIds[0])).toMatchObject({ x: 30, y: 40 });
  });

  it("keeps bound labels attached while arranging and duplicating shapes", () => {
    const scene: any[] = [];
    scene.push(...createSceneElements({ id: "labeled", type: "rectangle", x: 10, y: 20, text: "Label" }, scene).elements);
    scene.push(...createSceneElements({ id: "anchor", type: "rectangle", x: 100, y: 80 }, scene).elements);

    arrangeScene(scene, { action: "align", alignment: "right", elementIds: ["labeled", "anchor"] });
    const movedLabel = scene.find((element) => element.containerId === "labeled");
    expect(movedLabel.x).toBeGreaterThan(100);

    const createdIds = arrangeScene(scene, { action: "duplicate", elementIds: ["labeled"] });
    const duplicate = scene.find((element) => element.id === createdIds[0]);
    const duplicateLabel = scene.find((element) => element.containerId === duplicate.id);
    expect(duplicate.boundElements).toContainEqual({ id: duplicateLabel.id, type: "text" });
    expect(duplicateLabel.text).toBe("Label");
  });
});
