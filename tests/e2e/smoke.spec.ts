import { expect, test } from "@playwright/test";

import { envLocal } from "./env";

const PASSWORD = envLocal("DASHBOARD_PASSWORD");
const API_SECRET = envLocal("AUTH_SECRET");

test.describe("auth gate", () => {
  test("unauthenticated page visit redirects to /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: /personal os/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("unauthenticated API request gets 401", async ({ request }) => {
    const res = await request.get("/api/tasks");
    expect(res.status()).toBe(401);
  });

  test("wrong password is rejected", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Incorrect password.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("login → dashboard → add a task", () => {
  test("full smoke", async ({ page, request }) => {
    // Login.
    await page.goto("/login");
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

    // Dashboard renders its core cards.
    await expect(page.getByText("Today's Tasks")).toBeVisible();
    await expect(page.getByText("Next steps toward your goals")).toBeVisible();

    // Add a task through the UI.
    const title = `__e2e_smoke_${Date.now()}__`;
    await page.getByPlaceholder("Add a task for today…").fill(title);
    await page.getByPlaceholder("Add a task for today…").press("Enter");
    await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });

    // Cleanup via API (authenticated with the shared secret).
    const list = await request.get("/api/tasks?urgency=today", {
      headers: { "x-api-secret": API_SECRET },
    });
    const tasks = (await list.json()) as { id: string; title: string }[];
    const mine = tasks.find((t) => t.title === title);
    expect(mine).toBeTruthy();
    const del = await request.delete(`/api/tasks/${mine!.id}`, {
      headers: { "x-api-secret": API_SECRET },
    });
    expect(del.status()).toBe(204);
  });
});
