import { expect, test } from "@playwright/test";
import {
  createCollection,
  createDrawing,
  deleteCollection,
  deleteDrawing,
} from "./helpers/api";

test.describe("Local-first workspace", () => {
  const drawingIds: string[] = [];
  const collectionIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of drawingIds.splice(0)) {
      try {
        await deleteDrawing(request, id);
      } catch {
      }
    }
    for (const id of collectionIds.splice(0)) {
      try {
        await deleteCollection(request, id);
      } catch {
      }
    }
  });

  test("resumes recent slides and exposes their project from Home", async ({
    page,
    request,
  }) => {
    const project = await createCollection(request, `Workspace ${Date.now()}`);
    collectionIds.push(project.id);
    const slide = await createDrawing(request, {
      name: `Resume ${Date.now()}`,
      collectionId: project.id,
    });
    drawingIds.push(slide.id);

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Recent" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your projects" })).toBeVisible();
    await expect(page.getByText(project.name, { exact: true })).toBeVisible();
    await expect(page.getByText(slide.name, { exact: true }).first()).toBeVisible();
    await expect(page.getByPlaceholder("Search projects & slides…")).toBeVisible();
  });

  test("reorders project slides with the accessible action menu", async ({
    page,
    request,
  }) => {
    const project = await createCollection(request, `Ordered ${Date.now()}`);
    collectionIds.push(project.id);
    const first = await createDrawing(request, {
      name: "First slide",
      collectionId: project.id,
    });
    const second = await createDrawing(request, {
      name: "Second slide",
      collectionId: project.id,
    });
    drawingIds.push(first.id, second.id);

    await page.goto(`/projects/${project.id}`);
    await expect(page.locator(`#slide-card-${first.id}`)).toBeVisible();
    const secondCard = page.locator(`#slide-card-${second.id}`);
    await secondCard.locator("summary").click();
    await secondCard.getByRole("button", { name: "Move earlier" }).click();

    await expect
      .poll(() =>
        page.locator("[id^='slide-card-']").evaluateAll((cards) =>
          cards.map((card) => card.id),
        ),
      )
      .toEqual([`slide-card-${second.id}`, `slide-card-${first.id}`]);
  });

  test("keeps Home usable without horizontal overflow on a phone", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Your projects" })).toBeVisible();
    await expect(page.getByPlaceholder("Search projects & slides…")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
});
