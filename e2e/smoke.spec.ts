import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "changeme-admin-123";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin|\/acts/);
}

test("sign in reaches the admin area", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Acts/ })).toBeVisible();
});

test("browse the demo act catalog", async ({ page }) => {
  await login(page);
  await page.goto("/acts/demo-band/songs");
  await expect(page.getByRole("heading", { name: "Songs" })).toBeVisible();
  await expect(page.getByText("Demo Song 1")).toBeVisible();
});

test("open a calendar entry, set attendance, open a setlist item", async ({ page }) => {
  await login(page);
  await page.goto("/acts/demo-band/calendar");
  await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();

  // Open the wedding event with the seeded 2-set setlist.
  await page.getByRole("link", { name: /Anderson Wedding/ }).click();
  await page.waitForURL(/\/calendar\//);

  // Set own attendance.
  await page.getByRole("button", { name: "Attending" }).first().click();

  // Open a setlist item → side sheet with next/prev.
  const firstItem = page.getByRole("button", { name: /Demo Song/ }).first();
  await firstItem.click();
  await expect(page.getByRole("button", { name: "Next" })).toBeVisible();
});
