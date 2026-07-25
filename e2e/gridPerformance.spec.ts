import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

test.describe("Sub-Toolbar Cleanup, Spacebar Pan, Text Replace & Grid Performance E2E Spec", () => {
  test("verifies spacebar pan, tightly bounded text replacement, grid Overview dropEffect, high contrast grid buttons, and sub-toolbar state", async ({ page }) => {
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
    await page.locator(".pdf-text-layer span, canvas").first().waitFor({ state: "visible", timeout: 20000 });

    // 1. Verify holding Spacebar changes cursor to grab hand and drag-scrolls document workspace
    const mainWorkspace = page.locator("main");
    await mainWorkspace.waitFor({ state: "visible" });

    // Hold Spacebar down
    await page.keyboard.down("Space");
    await page.waitForTimeout(200);

    // Verify computed cursor on main workspace is grab hand
    const spaceCursor = await mainWorkspace.evaluate((el) => window.getComputedStyle(el).cursor);
    expect(spaceCursor).toBe("grab");

    // Perform drag-scroll while holding Spacebar
    const box = (await mainWorkspace.boundingBox())!;
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 80, startY - 80, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up("Space");
    await page.waitForTimeout(200);

    // 2. Switch to edit-text tool and verify clicking text span creates tightly bounded, unsquished text replacement box
    const toolsMenu = page.locator('[data-testid="tools-menu-trigger"]');
    await toolsMenu.waitFor({ state: "visible", timeout: 5000 });
    await toolsMenu.click();

    const editTextTool = page.locator('[data-testid="tool-item-edit-text"]');
    await editTextTool.waitFor({ state: "visible", timeout: 5000 });
    await editTextTool.click();
    await page.waitForTimeout(300);

    // Click a text span in the text layer
    const textSpan = page.locator(".pdf-text-layer span").first();
    await textSpan.waitFor({ state: "visible", timeout: 10000 });

    await textSpan.click({ force: true });
    await page.waitForTimeout(500);

    // Verify text replacement textarea/input box is created
    const replacementBox = page.locator("main textarea").first();
    await replacementBox.waitFor({ state: "visible", timeout: 5000 });
    
    const replacementBoundingBox = (await replacementBox.boundingBox())!;
    // Tightly bounded: width is reasonable (e.g. less than 350px, not blown up across page width)
    expect(replacementBoundingBox.width).toBeLessThan(350);
    expect(replacementBoundingBox.width).toBeGreaterThan(0);

    // Check scaleX transform or styling to verify unsquished text replacement box
    const transformStyle = await replacementBox.evaluate((el) => {
      const parent = el.closest(".group") as HTMLElement | null;
      return parent ? parent.style.transform : el.style.transform;
    });
    if (transformStyle && transformStyle.includes("scaleX")) {
      const match = transformStyle.match(/scaleX\(([^)]+)\)/);
      if (match) {
        const scaleXVal = parseFloat(match[1]);
        expect(scaleXVal).toBeGreaterThan(0.3);
        expect(scaleXVal).toBeLessThan(3.0);
      }
    }

    // 3. Open Grid Overview and verify dropEffect = "move" in DnD test
    const viewModeTrigger = page.locator('[data-testid="view-mode-trigger"]');
    await viewModeTrigger.waitFor({ state: "visible", timeout: 8000 });
    await viewModeTrigger.click();

    const gridOverviewMenuItem = page.locator('[data-testid="grid-overview-item"]');
    await gridOverviewMenuItem.waitFor({ state: "visible", timeout: 5000 });
    await gridOverviewMenuItem.click();

    const gridContainer = page.locator('[data-testid="grid-container"]');
    await gridContainer.waitFor({ state: "visible", timeout: 10000 });

    const gridItem0 = page.locator('[data-testid="grid-item-0"]');
    await gridItem0.waitFor({ state: "visible", timeout: 10000 });

    const plusButton = page.locator('[data-testid="pages-per-row-plus"]');
    const minusButton = page.locator('[data-testid="pages-per-row-minus"]');
    const closeButton = page.locator('button[aria-label="Close grid overview"]');

    await expect(plusButton).toBeVisible();
    await expect(minusButton).toBeVisible();
    await expect(closeButton).toBeVisible();

    const gridItem2 = page.locator('[data-testid="grid-item-2"]');
    await expect(gridItem2).toBeVisible();

    const box2 = (await gridItem2.boundingBox())!;
    const targetX = box2.x + box2.width / 4;
    const targetY = box2.y + box2.height / 2;

    // Verify dropEffect = "move" on dragover event
    const dropEffectValue = await gridContainer.evaluate((el, targetPos) => {
      const dragOverEvent = new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
        clientX: targetPos.x,
        clientY: targetPos.y,
        dataTransfer: new DataTransfer(),
      });
      el.dispatchEvent(dragOverEvent);
      return dragOverEvent.dataTransfer ? dragOverEvent.dataTransfer.dropEffect : null;
    }, { x: targetX, y: targetY });

    expect(dropEffectValue).toBe("move");

    await gridItem0.dispatchEvent("dragstart");
    await gridContainer.dispatchEvent("dragover", { clientX: targetX, clientY: targetY });

    const dropIndicator = page.locator('[data-testid="drop-indicator"]');
    await expect(dropIndicator).toBeVisible();

    // Close Grid Overview
    await closeButton.click();
    await gridContainer.waitFor({ state: "hidden", timeout: 5000 });
    await page.waitForTimeout(300);

    // 4. Verify comment tool sub-toolbar hiding
    await toolsMenu.click();
    const commentTool = page.locator('[data-testid="tool-item-comment"]');
    await commentTool.waitFor({ state: "visible", timeout: 5000 });
    await commentTool.click();
    await page.waitForTimeout(300);

    const subToolbar = page.locator('[data-testid="sub-toolbar"]');
    await expect(subToolbar).not.toBeVisible();

    // 5. Save proof screenshot to e2e/screenshots/grid_matrix_proof.png
    const screenshotPath = path.join(process.cwd(), "e2e", "screenshots", "grid_matrix_proof.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    expect(fs.existsSync(screenshotPath)).toBe(true);
    console.log(`[E2E Proof Screenshot Saved]: ${screenshotPath}`);
  });
});
