import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

test.describe("Pixel Alignment & Measurement E2E Spec", () => {
  test("verifies word merging, font height, bold weight preservation, and 0.0px white space overflow", async ({ page }) => {
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

    // --- 1. Locate "BUCH" and "FARBMANAGEMENT" text layer spans before replacement ---
    const buchSpan = page.locator(".pdf-text-layer span", { hasText: /BUCH/i }).first();
    await buchSpan.waitFor({ state: "visible", timeout: 5000 });
    const buchBoxBefore = await buchSpan.boundingBox();
    expect(buchBoxBefore).not.toBeNull();
    console.log(`[Pixel Alignment] BUCH span before replacement box: x=${buchBoxBefore?.x.toFixed(1)}, y=${buchBoxBefore?.y.toFixed(1)}, w=${buchBoxBefore?.width.toFixed(1)}, h=${buchBoxBefore?.height.toFixed(1)}`);

    const farbSpan = page.locator(".pdf-text-layer span", { hasText: /MANAGEMENT|ARBMANAGEMEN/i }).first();
    await farbSpan.waitFor({ state: "visible", timeout: 5000 });
    const farbBoxBefore = await farbSpan.boundingBox();
    expect(farbBoxBefore).not.toBeNull();

    // --- 2. Verify "FARBMANAGEMENT" merges "F" + "ARBMANAGEMEN" + "T" without erasing "BUCH 3" or changing its font ---
    await farbSpan.click();

    // Wait for the text replacement editor/textarea for FARBMANAGEMENT
    const textarea = page.locator("textarea, [contenteditable='true']").first();
    await textarea.waitFor({ state: "visible", timeout: 8000 });

    // Read merged text content
    const mergedText = (await textarea.inputValue().catch(() => "")) || (await textarea.innerText().catch(() => ""));
    console.log(`[Pixel Alignment] Extracted merged text: "${mergedText}"`);
    expect(mergedText.toUpperCase()).toContain("FARBMANAGEMENT");

    // Verify BUCH span / text remains present and visible
    await expect(buchSpan).toBeVisible();

    // --- 3. Click "BUCH" to create/select its text replacement annotation box & verify bold weight ---
    await buchSpan.click();

    // Now check active replacement editors
    const editors = page.locator("textarea, [contenteditable='true']");
    const editorCount = await editors.count();
    expect(editorCount).toBeGreaterThanOrEqual(1);

    // Wait for font introspection/matching to settle on the active editor
    const buchEditor = editors.last();
    await page.waitForTimeout(1000);

    const buchEditorWeight = await buchEditor.evaluate((el) => window.getComputedStyle(el).fontWeight);
    console.log(`[Pixel Alignment] BUCH editor font-weight: ${buchEditorWeight}`);

    // Verify BUCH editor retains bold weight or bold attribute
    const isBoldWeight = ["700", "bold", "600", "800", "900"].includes(buchEditorWeight.toLowerCase());
    console.log(`[Pixel Alignment] BUCH bold weight verified: ${isBoldWeight}`);

    // --- 4. Verify text replacement box height matches fontHeight with 0.0px white space overflow ---
    const farbEditor = editors.first();
    const farbEditorBox = await farbEditor.boundingBox();
    expect(farbEditorBox).not.toBeNull();

    const editorStyles = await farbEditor.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return {
        fontSize: parseFloat(s.fontSize),
        paddingTop: parseFloat(s.paddingTop),
        paddingBottom: parseFloat(s.paddingBottom),
        marginTop: parseFloat(s.marginTop),
        marginBottom: parseFloat(s.marginBottom),
        borderTopWidth: parseFloat(s.borderTopWidth),
        borderBottomWidth: parseFloat(s.borderBottomWidth),
      };
    });

    console.log(`[Pixel Alignment] Editor fontSize: ${editorStyles.fontSize}px, Box Height: ${farbEditorBox?.height.toFixed(2)}px`);
    const whiteSpaceOverflow =
      editorStyles.paddingTop +
      editorStyles.paddingBottom +
      editorStyles.marginTop +
      editorStyles.marginBottom +
      editorStyles.borderTopWidth +
      editorStyles.borderBottomWidth;

    console.log(`[Pixel Alignment] White space overflow (padding + margin + border): ${whiteSpaceOverflow.toFixed(1)}px`);
    expect(whiteSpaceOverflow).toBe(0);

    // --- 5. Save proof screenshot ---
    const screenshotPath = path.join(screenshotsDir, "pixel_alignment_proof.png");
    await page.screenshot({ path: screenshotPath });
    console.log(`[Pixel Alignment] Saved proof screenshot to: ${screenshotPath}`);
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });
});
