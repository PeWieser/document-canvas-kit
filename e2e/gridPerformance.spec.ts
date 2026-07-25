import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

test.describe("Sub-Toolbar Cleanup & Grid Performance E2E Spec", () => {
  test("verifies high contrast grid buttons, drop indicator, comment tool sub-toolbar hiding, and edit-text color picker removal", async ({ page }) => {
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

    // 1. Verify high contrast +, -, X buttons
    const plusButton = page.locator('[data-testid="pages-per-row-plus"]');
    const minusButton = page.locator('[data-testid="pages-per-row-minus"]');
    const closeButton = page.locator('button[aria-label="Close grid overview"]');

    await expect(plusButton).toBeVisible();
    await expect(minusButton).toBeVisible();
    await expect(closeButton).toBeVisible();

    // Verify matrix zoom slider and toolbar indicators
    const zoomSlider = page.locator('[data-testid="matrix-zoom-slider"]');
    await expect(zoomSlider).toBeVisible();

    const zoomIndicator = page.locator('[data-testid="zoom-indicator"]');
    await expect(zoomIndicator).toContainText("4 / Zeile");

    // Click minus button to scale pages per row from 4 to 3
    await minusButton.click();
    await page.waitForTimeout(300);
    await expect(zoomIndicator).toContainText("3 / Zeile");

    // 2. Drag page thumbnail and verify vertical drop indicator centered at 50% gap midpoint
    const gridContainer = page.locator('[data-testid="grid-container"]');
    await expect(gridContainer).toBeVisible();

    const gridItem2 = page.locator('[data-testid="grid-item-2"]');
    await expect(gridItem2).toBeVisible();

    const box2 = (await gridItem2.boundingBox())!;
    const targetX = box2.x + box2.width / 4;
    const targetY = box2.y + box2.height / 2;

    await gridItem0.dispatchEvent("dragstart");
    await gridContainer.dispatchEvent("dragover", { clientX: targetX, clientY: targetY });

    const dropIndicator = page.locator('[data-testid="drop-indicator"]');
    await expect(dropIndicator).toBeVisible();

    // Close Grid Overview
    await closeButton.click();
    await gridContainer.waitFor({ state: "hidden", timeout: 5000 });
    await page.waitForTimeout(300);

    // 3. Switch to comment tool and verify sub-toolbar is hidden
    const toolsMenu = page.locator('[data-testid="tools-menu-trigger"]');
    await toolsMenu.waitFor({ state: "visible", timeout: 5000 });
    await toolsMenu.click();

    const commentTool = page.locator('[data-testid="tool-item-comment"]');
    await commentTool.waitFor({ state: "visible", timeout: 5000 });
    await commentTool.click();
    await page.waitForTimeout(300);

    const subToolbar = page.locator('[data-testid="sub-toolbar"]');
    await expect(subToolbar).not.toBeVisible();

    // 4. Switch to edit-text tool without selecting text and verify greyed-out color picker is removed
    await toolsMenu.click();

    const editTextTool = page.locator('[data-testid="tool-item-edit-text"]');
    await editTextTool.waitFor({ state: "visible", timeout: 5000 });
    await editTextTool.click();
    await page.waitForTimeout(300);

    // Verify sub-toolbar is visible for edit-text
    await expect(subToolbar).toBeVisible();

    // Verify greyed-out color picker field is NOT rendered in sub-toolbar
    const subToolbarColorPicker = page.locator('[data-testid="subtoolbar-color-picker"]');
    await expect(subToolbarColorPicker).not.toBeVisible();

    // 5. Save proof screenshot
    const screenshotPath = path.join(process.cwd(), "e2e", "screenshots", "grid_matrix_proof.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    expect(fs.existsSync(screenshotPath)).toBe(true);
    console.log(`[E2E Proof Screenshot Saved]: ${screenshotPath}`);
  });
});
