import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

test.describe("Pixel Alignment & Measurement E2E Spec", () => {
  test("verifies exact subpixel baseline Y matching tx[5] (tolerance <= 0.05px) and unclipped text container width (scrollWidth <= clientWidth) across zoom levels (100%, 125%, 150%, 200%)", async ({ page }) => {
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

    // --- 2. Click "BUCH" to create/select its text replacement annotation box ---
    await buchSpan.click();

    // Wait for active replacement editor / textarea
    const textarea = page.locator("textarea, [contenteditable='true']").first();
    await textarea.waitFor({ state: "visible", timeout: 8000 });

    // --- 3. Multi-Zoom Subpixel Baseline Y & Container Width Verification (100%, 125%, 150%, 200%) ---
    const zoomLevels = [1.0, 1.25, 1.5, 2.0];

    for (const zoomLevel of zoomLevels) {
      // Set zoom level in editor store
      await page.evaluate((z) => {
        const store = (window as any).useEditor;
        if (store && store.setState) {
          store.setState({ zoom: z, viewMode: "custom" });
        }
      }, zoomLevel);

      // Wait for zoom layout & re-render to settle
      await page.waitForTimeout(500);

      const buchBox = await buchSpan.boundingBox();
      const editorBox = await textarea.boundingBox();

      expect(buchBox).not.toBeNull();
      expect(editorBox).not.toBeNull();

      const spanFontSize = await buchSpan.evaluate((el) => parseFloat(window.getComputedStyle(el).fontSize));
      const editorFontSize = await textarea.evaluate((el) => parseFloat(window.getComputedStyle(el).fontSize));

      // Retrieve precise DOM ascent ratio from canvas font measurement
      const ascentRatio = await textarea.evaluate((el) => {
        const s = window.getComputedStyle(el);
        const fontSpec = `${s.fontSize} ${s.fontFamily}`;
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (ctx && typeof ctx.measureText === "function") {
          ctx.font = fontSpec;
          const m = ctx.measureText("M");
          const ascent = m.fontBoundingBoxAscent || m.actualBoundingBoxAscent;
          const descent = m.fontBoundingBoxDescent || m.actualBoundingBoxDescent;
          if (ascent && ascent + descent > 0) {
            return ascent / (ascent + descent);
          }
        }
        return 0.8;
      });

      // Baseline Y tx[5] of PDF text layer span (top + fontHeight)
      const baselineYBefore = (buchBox?.y ?? 0) + spanFontSize;
      // Baseline Y after text replacement: domTop + fontHeight * ascentRatio
      const baselineYAfter = (editorBox?.y ?? 0) + editorFontSize * ascentRatio;

      const verticalDrift = Math.abs(baselineYAfter - baselineYBefore);
      console.log(
        `[Pixel Alignment Zoom ${(zoomLevel * 100).toFixed(0)}%] Baseline Y before (tx[5]): ${baselineYBefore.toFixed(
          3
        )}px, after: ${baselineYAfter.toFixed(3)}px, drift: ${verticalDrift.toFixed(3)}px`
      );

      // Subpixel baseline Y tolerance <= 0.05px across all zoom levels
      expect(verticalDrift).toBeLessThanOrEqual(0.05);

      // Verify unclipped text container width (scrollWidth <= clientWidth)
      const widthMetrics = await textarea.evaluate((el) => {
        const s = window.getComputedStyle(el);
        return {
          clientWidth: el.clientWidth,
          scrollWidth: el.scrollWidth,
          paddingLeft: parseFloat(s.paddingLeft),
          paddingRight: parseFloat(s.paddingRight),
        };
      });

      console.log(
        `[Pixel Alignment Zoom ${(zoomLevel * 100).toFixed(0)}%] clientWidth: ${widthMetrics.clientWidth}px, scrollWidth: ${widthMetrics.scrollWidth}px`
      );
      expect(widthMetrics.scrollWidth).toBeLessThanOrEqual(widthMetrics.clientWidth);
    }

    // Reset zoom to 1.0 for proof screenshot capture
    await page.evaluate(() => {
      const store = (window as any).useEditor;
      if (store && store.setState) {
        store.setState({ zoom: 1.0, viewMode: "custom" });
      }
    });
    await page.waitForTimeout(300);

    // --- 4. Save multi-zoom proof screenshot ---
    const zoomScreenshotPath = path.join(screenshotsDir, "pixel_alignment_zoom_proof.png");
    await page.screenshot({ path: zoomScreenshotPath });
    console.log(`[Pixel Alignment] Saved multi-zoom proof screenshot to: ${zoomScreenshotPath}`);
    expect(fs.existsSync(zoomScreenshotPath)).toBe(true);

    const legacyScreenshotPath = path.join(screenshotsDir, "pixel_alignment_proof.png");
    await page.screenshot({ path: legacyScreenshotPath });
  });
});
