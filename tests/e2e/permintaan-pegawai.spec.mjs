// E2E: Alur pegawai — buat permintaan, muncul di list, dan batalkan (confirm dialog).
import { test, expect } from "@playwright/test";
import { loginAs, createRequestAsPegawai } from "./helpers/auth.mjs";

// Buka halaman detail permintaan berdasarkan nomornya lewat list.
async function openDetailByNumber(page, reqNumber) {
  await page.goto("/permintaan");
  const row = page.getByRole("row").filter({ hasText: reqNumber });
  await expect(row).toBeVisible();
  await row.getByRole("link", { name: "Lihat Detail" }).click();
}

test.describe("Pegawai — Permintaan", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "pegawai");
  });

  test("buat permintaan baru menampilkan banner sukses dengan nomor REQ", async ({ page }) => {
    const reqNumber = await createRequestAsPegawai(page);
    expect(reqNumber).toMatch(/^REQ-\d{8}-\d+/);
  });

  test("permintaan baru muncul di daftar dengan status Menunggu", async ({ page }) => {
    const reqNumber = await createRequestAsPegawai(page);

    await page.goto("/permintaan");
    const row = page.getByRole("row").filter({ hasText: reqNumber });
    await expect(row).toBeVisible();
    await expect(row.getByText("Menunggu")).toBeVisible();
  });

  test("membatalkan permintaan lewat confirm dialog mengubah status jadi Dibatalkan", async ({ page }) => {
    const reqNumber = await createRequestAsPegawai(page);
    await openDetailByNumber(page, reqNumber);

    // Klik tombol Batalkan → confirm dialog muncul.
    await page.getByRole("button", { name: "Batalkan" }).click();
    const dialog = page.locator("#confirmDialog");
    await expect(dialog).toBeVisible();
    await expect(page.locator("#confirmDialogTitle")).toHaveText("Batalkan Permintaan?");

    // Konfirmasi → form submit, redirect ke detail dengan flash dibatalkan.
    await page.locator("#confirmDialogConfirm").click();
    await expect(page.getByText("Permintaan telah dibatalkan")).toBeVisible();
    await expect(page.locator(".badge", { hasText: "Dibatalkan" })).toBeVisible();
  });

  test("menutup confirm dialog (Batal) tidak mengubah status permintaan", async ({ page }) => {
    const reqNumber = await createRequestAsPegawai(page);
    await openDetailByNumber(page, reqNumber);

    await page.getByRole("button", { name: "Batalkan" }).click();
    const dialog = page.locator("#confirmDialog");
    await expect(dialog).toBeVisible();

    // Klik "Batal" pada dialog → dialog tertutup, tidak ada submit.
    await page.locator("#confirmDialogCancel").click();
    await expect(dialog).toBeHidden();

    // Status tetap Menunggu (tombol Batalkan masih ada).
    await expect(page.getByRole("button", { name: "Batalkan" })).toBeVisible();
  });
});
