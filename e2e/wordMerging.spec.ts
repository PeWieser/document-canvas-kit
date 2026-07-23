import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

test.describe("Word Merging E2E Spec", () => {
  test("verifies clicking headline span merges word fragments into full FARBMANAGEMENT text", async ({ page }) => {
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

    // Target FARBMANAGEMENT span or fragment specifically (matching MANAGEMENT or ARBMANAGEMEN)
    const farbSpan = page.locator('.pdf-text-layer span', { hasText: /MANAGEMENT|ARBMANAGEMEN/i }).first();
    await farbSpan.waitFor({ state: "visible", timeout: 5000 });
    await farbSpan.click();

    // Wait for replacement textarea / editor
    const textarea = page.locator("textarea, [contenteditable='true']").first();
    await textarea.waitFor({ state: "visible", timeout: 8000 });

    const content = (await textarea.inputValue().catch(() => "")) || (await textarea.innerText().catch(() => ""));
    console.log(`[E2E Word Merging] Extracted text content: "${content}"`);

    expect(content.toUpperCase()).toContain("FARBMANAGEMENT");

    // Save screenshot proof
    await page.screenshot({ path: "e2e/screenshots/word_merging_proof.png" });
  });
});
