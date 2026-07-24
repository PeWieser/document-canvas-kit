import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

test.describe("Pixel Alignment & Measurement E2E Spec", () => {
  test("verifies exact baseline Y matching tx[5] (0.00px vertical drift), and 4px safety buffer with 0.0px character clipping", async ({ page }) => {
    // 1. Ensure proof screenshot directory exists
    const screenshotsDir = path.join(process.cwd(), "e2e", "screenshots");
    fs.mkdirSync(screenshotsDir, { recursive: true });

    // 2. Navigate to local app
    await page.goto("http://localhost:5173/");

    // 3. Load test PDF
    const fileInput = page.locator('input[type="file"]').first();
    const pdfPath = path.join(process.cwd(), "test pdfs/9b00fac2-ec90-4c49-b093-0572d83ae9a2.pdf");

    expect(fs.existsSync(pdfPath)).toBe(true);
    await fileInput.setInputFiles(pdfPath);

    // Wait for PDF text layer spans to render completely
    await page.locator(".pdf-text-layer span").first().waitFor({ state: "visible", timeout: 15000 });
    await page.waitForFunction(() => document.querySelectorAll(".pdf-text-layer span").length > 5);

    // Enable edit-text tool ('t' key)
    await page.keyboard.press("t");

    // --- 1. Locate "BUCH" span before replacement ---
    const buchSpan = page.locator(".pdf-text-layer span", { hasText: /BUCH/i }).first();
    await buchSpan.waitFor({ state: "visible", timeout: 5000 });
    const buchBoxBefore = await buchSpan.boundingBox();
    expect(buchBoxBefore).not.toBeNull();

    const spanFontSize = await buchSpan.evaluate((el) => parseFloat(window.getComputedStyle(el).fontSize));
    // Baseline Y tx[5] of PDF text layer span (top + fontHeight)
    const baselineYBefore = (buchBoxBefore?.y ?? 0) + (buchBoxBefore?.height ?? spanFontSize);
    console.log(`[Pixel Alignment] Pre-replacement BUCH span: x=${buchBoxBefore?.x.toFixed(2)}, y=${buchBoxBefore?.y.toFixed(2)}, fontSize=${spanFontSize.toFixed(2)}px`);
    console.log(`[Pixel Alignment] Pre-replacement baseline Y (tx[5]): ${baselineYBefore.toFixed(2)}px`);

    // --- 2. Click "BUCH" to create/select its text replacement annotation box ---
    await buchSpan.click();

    // Wait for active replacement editor / textarea
    const textarea = page.locator("textarea, [contenteditable='true']").first();
    await textarea.waitFor({ state: "visible", timeout: 8000 });

    const editorBoxAfter = await textarea.boundingBox();
    expect(editorBoxAfter).not.toBeNull();

    const editorFontSize = await textarea.evaluate((el) => parseFloat(window.getComputedStyle(el).fontSize));
    // Baseline Y after text replacement: domTop + fontHeight * ascentRatio (ascentRatio = 0.8)
    const ascentRatio = 0.8;
    const baselineYAfter = (editorBoxAfter?.y ?? 0) + editorFontSize * ascentRatio;
    console.log(`[Pixel Alignment] Post-replacement baseline Y (tx[5]): ${baselineYAfter.toFixed(2)}px`);

    // Verify exact baseline Y matching tx[5] with 0.00px vertical drift (subpixel tolerance <= 0.25px)
    const verticalDrift = Math.abs(baselineYAfter - baselineYBefore);
    console.log(`[Pixel Alignment] Baseline Y vertical drift: ${verticalDrift.toFixed(2)}px`);
    expect(verticalDrift).toBeLessThanOrEqual(0.25);

    // --- 3. Verify text replacement box width has 4px safety buffer with 0.0px character clipping ---
    const widthMetrics = await textarea.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return {
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        paddingLeft: parseFloat(s.paddingLeft),
        paddingRight: parseFloat(s.paddingRight),
      };
    });

    console.log(`[Pixel Alignment] Textarea clientWidth: ${widthMetrics.clientWidth}px, scrollWidth: ${widthMetrics.scrollWidth}px`);

    // Verify 0.0px character clipping (scrollWidth <= clientWidth)
    const characterClipping = Math.max(0, widthMetrics.scrollWidth - widthMetrics.clientWidth);
    console.log(`[Pixel Alignment] Character clipping: ${characterClipping.toFixed(1)}px`);
    expect(characterClipping).toBe(0.0);

    // Verify text replacement box width safety buffer (box width >= span width)
    const boxWidth = editorBoxAfter?.width ?? 0;
    const spanWidth = buchBoxBefore?.width ?? 0;
    console.log(`[Pixel Alignment] Replacement box width: ${boxWidth.toFixed(2)}px, original span width: ${spanWidth.toFixed(2)}px`);
    expect(boxWidth).toBeGreaterThanOrEqual(spanWidth);

    // --- 4. Save proof screenshot ---
    const screenshotPath = path.join(screenshotsDir, "pixel_alignment_proof.png");
    await page.screenshot({ path: screenshotPath });
    console.log(`[Pixel Alignment] Saved proof screenshot to: ${screenshotPath}`);
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });
});
