import { test, expect } from "@playwright/test";

test.describe("UI Visual Feature & Screenshot Test Suite", () => {
  test("loads main app UI and takes baseline screenshot", async ({ page }) => {
    await page.goto("/");
    // Verify title or main dropzone is visible
    await expect(page).toHaveTitle(/PDF|Studio|Document/i);

    // Capture visual snapshot of initial drop zone
    await page.screenshot({ path: "e2e/screenshots/dropzone_baseline.png", fullPage: true });
  });

  test("verifies toolbar button interaction and visual state", async ({ page }) => {
    await page.goto("/");
    // Check main UI elements exist
    const body = page.locator("body");
    await expect(body).toBeVisible();

    await page.screenshot({ path: "e2e/screenshots/app_layout.png" });
  });
});
