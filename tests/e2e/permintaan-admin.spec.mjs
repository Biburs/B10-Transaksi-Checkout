// E2E: Alur admin logistik — list, approve, dan reject permintaan.
// Setiap test membuat permintaannya sendiri sebagai pegawai dulu agar mandiri
// (tidak bergantung urutan eksekusi / data dari spec lain).
import { test, expect } from "@playwright/test";
import { loginAs, createRequestAsPegawai } from "./helpers/auth.mjs";

// Buat 1 permintaan sebagai pegawai, lalu pindah login ke admin.
// Mengembalikan nomor permintaan yang baru dibuat.
async function seedRequestThenLoginAdmin(page) {
  await loginAs(page, "pegawai");
  const reqNumber = await createRequestAsPegawai(page);
  await page.goto("/logout");
  await loginAs(page, "admin");
  return reqNumber;
}

// Cari permintaan via search box admin lalu buka detailnya.
async function openAdminDetail(page, reqNumber) {
  await page.goto("/admin/permintaan");
  await page.fill('input[name="search"]', reqNumber);
  await page.getByRole("button", { name: "Cari" }).click();

  const row = page.getByRole("row").filter({ hasText: reqNumber });
  await expect(row).toBeVisible();
  await row.getByRole("link", { name: "Lihat Detail" }).click();
  await expect(page.getByText(reqNumber).first()).toBeVisible();
}

test.describe("Admin — Permintaan", () => {
  test("daftar permintaan admin dapat dibuka", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/permintaan");
    await expect(page.getByRole("heading", { name: "Semua Permintaan Masuk" })).toBeVisible();
  });

  test("admin menyetujui permintaan pending", async ({ page }) => {
    const reqNumber = await seedRequestThenLoginAdmin(page);
    await openAdminDetail(page, reqNumber);

    // Form approve submit langsung (tanpa confirm dialog). Catatan opsional.
    await page.fill('input[placeholder*="Catatan persetujuan"]', "Disetujui oleh test E2E");
    await page.getByRole("button", { name: "Setujui" }).click();

    await expect(page.getByText("Permintaan disetujui!")).toBeVisible();
    await expect(page.locator(".badge", { hasText: "Disetujui" })).toBeVisible();
  });

  test("admin menolak permintaan pending dengan alasan", async ({ page }) => {
    const reqNumber = await seedRequestThenLoginAdmin(page);
    await openAdminDetail(page, reqNumber);

    // Form reject butuh alasan (notes wajib) dan submit langsung.
    await page.fill('input[placeholder*="Alasan penolakan"]', "Stok tidak tersedia (test E2E)");
    await page.getByRole("button", { name: "Tolak" }).click();

    await expect(page.getByText("Permintaan ditolak.")).toBeVisible();
    await expect(page.locator(".badge", { hasText: "Ditolak" })).toBeVisible();
  });
});
