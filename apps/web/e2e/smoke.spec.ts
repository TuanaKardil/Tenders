import { test, expect } from "@playwright/test";

test("landing renders hero and search", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("input").first()).toBeVisible();
});

test("search returns tender results", async ({ page }) => {
  await page.goto("/search?q=road");
  await expect(page.locator("a[href*='/tenders/']").first()).toBeVisible();
});

test("tender detail renders with a source link", async ({ page }) => {
  await page.goto("/search?q=road");
  await page.locator("a[href*='/tenders/']").first().click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("a[href*='/go/']").first()).toBeVisible();
});

test("pricing shows all three plans", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { name: "Free", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Starter", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pro", exact: true })).toBeVisible();
});
