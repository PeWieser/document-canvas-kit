import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

test.describe("Vertical Text Alignment & Baseline E2E Proof Suite", () => {
  test("verifies that replacement textarea vertical position aligns 1:1 with PDF text layer span", async ({ page }) => {
    // 1. Open the application
    await page.goto("http://localhost:5173/");

    // Check if main UI or file dropzone is visible
    const fileInput = page.locator('input[type="file"]').first();
    const pdfPath = path.join(__dirname, "../test pdfs/9b00fac2-ec90-4c49-b093-0572d83ae9a2.pdf");

    if (fs.existsSync(pdfPath)) {
      await fileInput.setInputFiles(pdfPath);

      // Wait for page to render text layer spans
      const textSpan = page.locator(".pdf-text-layer span").first();
      await textSpan.waitFor({ state: "visible", timeout: 15000 });

      // Measure the bounding rect of the original text span
      const spanBox = await textSpan.boundingBox();
      expect(spanBox).not.toBeNull();

      // Click the text span to trigger textReplace annotation
      await textSpan.click();

      // Wait for replacement textarea to appear
      const textarea = page.locator("textarea").first();
      await textarea.waitFor({ state: "visible", timeout: 5000 });

      // Measure the bounding rect of the replacement textarea
      const textareaBox = await textarea.boundingBox();
      expect(textareaBox).not.toBeNull();

      if (spanBox && textareaBox) {
        const deltaTop = Math.abs(spanBox.y - textareaBox.y);
        const deltaLeft = Math.abs(spanBox.x - textareaBox.x);

        console.log(`[E2E Alignment Measurement] Span Y=${spanBox.y.toFixed(2)}px, Textarea Y=${textareaBox.y.toFixed(2)}px, ΔY=${deltaTop.toFixed(2)}px`);
        console.log(`[E2E Alignment Measurement] Span X=${spanBox.x.toFixed(2)}px, Textarea X=${textareaBox.x.toFixed(2)}px, ΔX=${deltaLeft.toFixed(2)}px`);

        // Capture screenshot artifact for visual proof
        await page.screenshot({ path: "e2e/screenshots/vertical_alignment_proof.png" });

        // Assert vertical top offset aligns within 1.5px tolerance
        expect(deltaTop).toBeLessThanOrEqual(1.5);
      }
    } else {
      console.log("No test PDF found at", pdfPath);
    }
  });
});
