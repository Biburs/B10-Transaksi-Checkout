// E2E: Autentikasi (login sukses/gagal, logout, proteksi route).
import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth.mjs";

test.describe("Autentikasi", () => {
  test("login gagal dengan kredensial salah menampilkan pesan error", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', "salah@gmail.com");
    await page.fill('input[name="password"]', "passwordsalah");
    await page.click('button[type="submit"]');

    // Tetap di halaman login dan banner error muncul.
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator(".text-destructive")).toBeVisible();
  });

  test("pegawai bisa login dan diarahkan ke dashboard", async ({ page }) => {
    await loginAs(page, "pegawai");
    await expect(page).toHaveURL(/\/home/);
  });

  test("admin bisa login dan diarahkan ke dashboard", async ({ page }) => {
    await loginAs(page, "admin");
    await expect(page).toHaveURL(/\/home/);
  });

  test("logout mengembalikan ke login dan memblokir akses /home", async ({ page }) => {
    await loginAs(page, "pegawai");

    await page.goto("/logout");
    await expect(page).toHaveURL(/\/login/);

    // Akses route terproteksi setelah logout harus dialihkan ke login.
    await page.goto("/home");
    await expect(page).toHaveURL(/\/login/);
  });

  test("akses /home tanpa login dialihkan ke login", async ({ page }) => {
    await page.goto("/home");
    await expect(page).toHaveURL(/\/login/);
  });
});
