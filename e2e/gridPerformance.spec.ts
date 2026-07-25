import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

test.describe("Grid Overview Deadzone & Matrix Card Zoom E2E Spec", () => {
  test("verifies grid overview loading, matrix zoom slider scaling, and 0px deadzone drag indicator", async ({ page }) => {
    fs.mkdirSync(path.join(process.cwd(), "e2e", "screenshots"), { recursive: true });

    await page.goto("http://localhost:5173/");

    const fileInput = page.locator('input[type="file"]').first();
    const pdfPath = path.join(
      process.cwd(),
      "test pdfs/Lenovo G70-70 Z70-80 LCFC BALG1_AILG1_AILZ1 NM-A331 Rev 0.4 PDF .pdf"
    );

    expect(fs.existsSync(pdfPath)).toBe(true);
    await fileInput.setInputFiles(pdfPath);

    // Wait for document canvas or text layer to render
    await page.locator(".pdf-text-layer span, canvas").first().waitFor({ state: "visible", timeout: 15000 });

    // Open Grid Overview modal
    const viewModeTrigger = page.locator('[data-testid="view-mode-trigger"]');
    await viewModeTrigger.waitFor({ state: "visible", timeout: 8000 });
    await viewModeTrigger.click();

    const gridOverviewMenuItem = page.locator('[data-testid="grid-overview-item"]');
    await gridOverviewMenuItem.waitFor({ state: "visible", timeout: 5000 });
    await gridOverviewMenuItem.click();

    // Verify Grid Overview items loaded
    const gridItem0 = page.locator('[data-testid="grid-item-0"]');
    await gridItem0.waitFor({ state: "visible", timeout: 10000 });

    // Verify matrix zoom slider exists and scales thumbnail cards without lag
    const zoomSlider = page.locator('[data-testid="matrix-zoom-slider"]');
    await expect(zoomSlider).toBeVisible();

    const initialBox = await gridItem0.boundingBox();
    expect(initialBox).not.toBeNull();

    // Scale matrix zoom slider to 180%
    await zoomSlider.fill("180");
    await zoomSlider.dispatchEvent("input");
    await zoomSlider.dispatchEvent("change");

    // Allow UI to re-layout with new column width
    await page.waitForTimeout(400);

    const scaledBox = await gridItem0.boundingBox();
    expect(scaledBox).not.toBeNull();
    expect(scaledBox!.width).toBeGreaterThan(initialBox!.width);

    // Drag page thumbnail over contiguous card (0px deadzone verification)
    const gridItem2 = page.locator('[data-testid="grid-item-2"]');
    await expect(gridItem2).toBeVisible();

    const box2 = (await gridItem2.boundingBox())!;
    const targetX = box2.x + box2.width / 4;
    const targetY = box2.y + box2.height / 2;

    await gridItem0.dispatchEvent("dragstart");
    await gridItem2.dispatchEvent("dragover", { clientX: targetX, clientY: targetY });

    // Verify dragOver indicator is active without flickering
    const dropIndicator = page.locator('[data-testid="drop-indicator"]');
    await expect(dropIndicator).toBeVisible();

    // Save proof screenshot
    const screenshotPath = path.join(process.cwd(), "e2e/screenshots/grid_matrix_proof.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    expect(fs.existsSync(screenshotPath)).toBe(true);
    console.log(`[E2E Proof Screenshot Saved]: ${screenshotPath}`);
  });
});
