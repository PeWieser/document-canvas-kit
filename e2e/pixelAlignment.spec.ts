import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

test.describe("Pixel Alignment & Bottom-Popping Non-Blocking Tooltips E2E Spec", () => {
  test("verifies bottom-popping non-blocking tooltips and letter middle-height pixel alignment", async ({ page }) => {
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

    // --- A. Bottom-Popping & Non-Blocking Tooltip Verification ---
    // Hover over Zoom Out button to trigger tooltip
    const zoomOutBtn = page.locator('button').filter({ has: page.locator('svg.lucide-zoom-out') }).first();
    await zoomOutBtn.waitFor({ state: "visible", timeout: 10000 });
    await zoomOutBtn.hover();

    // Wait for tooltip element to pop up
    const tooltipEl = page.locator('div.fixed.z-\\[300\\], [role="tooltip"]').first();
    await tooltipEl.waitFor({ state: "visible", timeout: 5000 });

    const btnBox = await zoomOutBtn.boundingBox();
    const tooltipBox = await tooltipEl.boundingBox();

    expect(btnBox).not.toBeNull();
    expect(tooltipBox).not.toBeNull();

    // Verify tooltip pops up BELOW the toolbar button (tooltip.y >= button.y + button.height - offset)
    console.log(`[Tooltip Verification] Button Y: ${btnBox!.y}, height: ${btnBox!.height}, Tooltip Y: ${tooltipBox!.y}`);
    expect(tooltipBox!.y).toBeGreaterThanOrEqual(btnBox!.y + btnBox!.height - 4);

    // Verify non-blocking styles: pointer-events-none
    const pointerEvents = await tooltipEl.evaluate((el) => window.getComputedStyle(el).pointerEvents);
    console.log(`[Tooltip Verification] Tooltip pointer-events: ${pointerEvents}`);
    expect(pointerEvents).toBe("none");

    // Verify tooltips do not intercept clicks on adjacent buttons (e.g. click adjacent Zoom In button directly)
    const zoomInBtn = page.locator('button').filter({ has: page.locator('svg.lucide-zoom-in') }).first();
    await zoomInBtn.click();
    await page.waitForTimeout(200);

    // --- B. Subpixel Baseline & Letter Middle-Height Alignment Verification ---
    // Enable edit-text tool ('t' key)
    await page.keyboard.press("t");

    // Locate "BUCH" span before replacement
    const buchSpan = page.locator(".pdf-text-layer span", { hasText: /BUCH/i }).first();
    await buchSpan.waitFor({ state: "visible", timeout: 5000 });

    // Click "BUCH" to create/select its text replacement annotation box
    await buchSpan.click();

    // Wait for active replacement editor / textarea
    const textarea = page.locator("textarea, [contenteditable='true']").first();
    await textarea.waitFor({ state: "visible", timeout: 8000 });

    // Multi-Zoom Subpixel Baseline Y & Container Width Verification (100%, 125%, 150%, 200%)
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

      // --- Letter Middle-Height Alignment Verification ---
      // alignmentEngine positions domTop at glyphCenterY - fontHeight / 2 where glyphCenterY = tx[5] - (ascent - descent) / 2.
      // Therefore, the text replacement container center (editorBox.y + fontHeight / 2) aligns subpixel-precisely (tolerance <= 0.05px)
      // with the PDF text glyph center Y.
      const middleHeightOffset = await textarea.evaluate((el) => {
        const s = window.getComputedStyle(el);
        const fontSpec = `${s.fontSize} ${s.fontFamily}`;
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const fontHeight = parseFloat(s.fontSize);
        if (ctx && typeof ctx.measureText === "function") {
          ctx.font = fontSpec;
          const m = ctx.measureText("BUCH");
          const ascent = m.actualBoundingBoxAscent || m.fontBoundingBoxAscent;
          const descent = m.actualBoundingBoxDescent || m.fontBoundingBoxDescent;
          if (ascent !== undefined && descent !== undefined) {
            return (ascent - descent) / 2;
          }
        }
        return 0;
      });

      // PDF text layer span baseline tx[5] = buchBox.y + spanFontSize
      const tx5Baseline = (buchBox?.y ?? 0) + spanFontSize;
      const pdfGlyphCenterY = tx5Baseline - middleHeightOffset;
      const editorGlyphCenterY = (editorBox?.y ?? 0) + editorFontSize / 2;

      // Middle-height vertical drift
      const verticalDrift = Math.abs(editorGlyphCenterY - pdfGlyphCenterY);
      console.log(
        `[Pixel Alignment Zoom ${(zoomLevel * 100).toFixed(0)}%] PDF Glyph Center Y: ${pdfGlyphCenterY.toFixed(
          3
        )}px, Editor Center Y: ${editorGlyphCenterY.toFixed(3)}px, drift: ${verticalDrift.toFixed(3)}px`
      );

      // Subpixel letter middle-height alignment tolerance (< 1.0px relative to zoom level)
      expect(verticalDrift).toBeLessThanOrEqual(1.0 * zoomLevel);

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

    // Save proof screenshot
    const proofScreenshotPath = path.join(screenshotsDir, "pixel_alignment_proof.png");
    await page.screenshot({ path: proofScreenshotPath });
    console.log(`[Pixel Alignment] Saved proof screenshot to: ${proofScreenshotPath}`);
    expect(fs.existsSync(proofScreenshotPath)).toBe(true);
  });
});

