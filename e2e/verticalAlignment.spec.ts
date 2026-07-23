import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

test.describe("Vertical Text Alignment E2E Spec", () => {
  test("verifies that replacement textarea vertical position aligns with PDF text layer span (delta Y <= 1.0px)", async ({ page }) => {
    fs.mkdirSync(path.join(process.cwd(), "e2e", "screenshots"), { recursive: true });

    await page.goto("http://localhost:5173/");

    const fileInput = page.locator('input[type="file"]').first();
    const pdfPath = path.join(process.cwd(), "test pdfs/9b00fac2-ec90-4c49-b093-0572d83ae9a2.pdf");

    expect(fs.existsSync(pdfPath)).toBe(true);
    await fileInput.setInputFiles(pdfPath);

    // Wait for text layer spans to render
    const textSpan = page.locator(".pdf-text-layer span").first();
    await textSpan.waitFor({ state: "visible", timeout: 15000 });

    // Enable edit-text tool
    await page.keyboard.press("t");

    // Click the text span to trigger textReplace annotation
    await textSpan.click();

    // Wait for replacement textarea to appear
    const textarea = page.locator("textarea, [contenteditable='true']").first();
    await textarea.waitFor({ state: "visible", timeout: 8000 });

    // Measure bounding boxes after scroll/click has settled
    const spanBox = await textSpan.boundingBox();
    const textareaBox = await textarea.boundingBox();

    expect(spanBox).not.toBeNull();
    expect(textareaBox).not.toBeNull();

    if (spanBox && textareaBox) {
      const deltaTop = Math.abs(spanBox.y - textareaBox.y);
      const deltaLeft = Math.abs(spanBox.x - textareaBox.x);

      console.log(`[E2E Alignment Measurement] Span Y=${spanBox.y.toFixed(2)}px, Textarea Y=${textareaBox.y.toFixed(2)}px, ΔY=${deltaTop.toFixed(2)}px`);
      console.log(`[E2E Alignment Measurement] Span X=${spanBox.x.toFixed(2)}px, Textarea X=${textareaBox.x.toFixed(2)}px, ΔX=${deltaLeft.toFixed(2)}px`);

      // Capture screenshot artifact for visual proof
      await page.screenshot({ path: "e2e/screenshots/vertical_alignment_proof.png" });

      // Assert vertical top offset aligns within 1.0px tolerance
      expect(deltaTop).toBeLessThanOrEqual(1.0);
    }
  });
});
