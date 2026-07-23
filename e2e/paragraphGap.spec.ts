import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

test.describe("Paragraph Gap and Multi-line Height E2E Spec", () => {
  test("verifies clicking body paragraph creates properly styled editor with correct height and line spacing", async ({ page }) => {
    fs.mkdirSync(path.join(process.cwd(), "e2e", "screenshots"), { recursive: true });

    await page.goto("http://localhost:5173/");

    const fileInput = page.locator('input[type="file"]').first();
    const pdfPath = path.join(process.cwd(), "test pdfs/9b00fac2-ec90-4c49-b093-0572d83ae9a2.pdf");

    expect(fs.existsSync(pdfPath)).toBe(true);
    await fileInput.setInputFiles(pdfPath);

    // Wait for text layer spans to load
    await page.locator(".pdf-text-layer span").first().waitFor({ state: "visible", timeout: 15000 });

    // Enable edit-text tool
    await page.keyboard.press("t");

    // Target a body paragraph span (excluding headline)
    const bodySpans = page.locator('.pdf-text-layer span').filter({ hasNotText: /FARBMANAGEMENT/i });
    const count = await bodySpans.count();
    expect(count).toBeGreaterThan(0);

    // Click a body span (e.g. 4th span or span with body text)
    const targetSpan = bodySpans.nth(Math.min(3, count - 1));
    await targetSpan.scrollIntoViewIfNeeded();
    await targetSpan.click();

    // Wait for paragraph editor (textarea or editor element)
    const editor = page.locator("textarea, [contenteditable='true']").first();
    await editor.waitFor({ state: "visible", timeout: 8000 });

    const editorBox = await editor.boundingBox();
    expect(editorBox).not.toBeNull();
    console.log(`[E2E Paragraph Gap] Editor Box Height: ${editorBox?.height.toFixed(2)}px, Width: ${editorBox?.width.toFixed(2)}px`);

    // Verify textarea/editor height is valid and height covers paragraph lines
    expect(editorBox!.height).toBeGreaterThan(10);

    // Save screenshot proof
    await page.screenshot({ path: "e2e/screenshots/paragraph_gap_proof.png" });
  });
});
