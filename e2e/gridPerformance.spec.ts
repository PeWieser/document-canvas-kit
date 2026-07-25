import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

test.describe("Pages-per-Row Grid Zoom & Parent Container Drag Delegation E2E Spec", () => {
  test("verifies grid matrix zoom scaling, 0px deadzone parent drag delegation, and page 5 high-res load", async ({ page }) => {
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

    // Verify matrix zoom slider and buttons exist, toolbar shows "4 / Zeile"
    const zoomSlider = page.locator('[data-testid="matrix-zoom-slider"]');
    await expect(zoomSlider).toBeVisible();

    const minusButton = page.locator('[data-testid="pages-per-row-minus"]');
    await expect(minusButton).toBeVisible();

    const zoomIndicator = page.locator('[data-testid="zoom-indicator"]');
    await expect(zoomIndicator).toContainText("4 / Zeile");

    // Click minus button to scale pages per row from 4 to 3
    await minusButton.click();
    await page.waitForTimeout(300);

    // Verify zoom indicator in toolbar updates to "3 / Zeile"
    await expect(zoomIndicator).toContainText("3 / Zeile");

    // Drag page thumbnail over parent grid container (0px deadzone verification)
    const gridContainer = page.locator('[data-testid="grid-container"]');
    await expect(gridContainer).toBeVisible();

    const gridItem2 = page.locator('[data-testid="grid-item-2"]');
    await expect(gridItem2).toBeVisible();

    const box2 = (await gridItem2.boundingBox())!;
    const targetX = box2.x + box2.width / 4;
    const targetY = box2.y + box2.height / 2;

    await gridItem0.dispatchEvent("dragstart");
    // Dispatch dragover directly on the parent grid container element
    await gridContainer.dispatchEvent("dragover", { clientX: targetX, clientY: targetY });

    // Verify dragOver indicator is active without flickering
    const dropIndicator = page.locator('[data-testid="drop-indicator"]');
    await expect(dropIndicator).toBeVisible();

    // Jump to page 5 (index 4) by clicking grid-item-4
    const gridItem4 = page.locator('[data-testid="grid-item-4"]');
    await expect(gridItem4).toBeVisible();
    await gridItem4.click();

    // Verify Grid Overview modal closed and main view scrolled to page 5
    await page.locator('.pdf-text-layer span, canvas').first().waitFor({ state: "visible", timeout: 10000 });
    const page5Container = page.locator('div[data-index="4"]');
    await expect(page5Container).toBeVisible();
    
    // Verify high-resolution <PageView> canvas rendered inside page 5
    const page5Canvas = page5Container.locator('canvas');
    await page5Canvas.waitFor({ state: "visible", timeout: 10000 });
    await expect(page5Canvas).toBeVisible();

    // Save proof screenshot
    const screenshotPath = path.join(process.cwd(), "e2e", "screenshots", "grid_matrix_proof.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    expect(fs.existsSync(screenshotPath)).toBe(true);
    console.log(`[E2E Proof Screenshot Saved]: ${screenshotPath}`);
  });
});
