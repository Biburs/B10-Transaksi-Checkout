// Helper bersama untuk E2E test.
import { expect } from "@playwright/test";

// Kredensial dari scripts/seed_login.js
export const USERS = {
  admin: { email: "admin@gmail.com", password: "admin123" },
  pegawai: { email: "pegawai@gmail.com", password: "pegawai123" },
};

/**
 * Login lewat form di /login lalu tunggu redirect ke /home.
 * @param {import('@playwright/test').Page} page
 * @param {string} email
 * @param {string} password
 */
export async function login(page, email, password) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/home");
}

/**
 * Login dengan akun seed berdasarkan role ('admin' | 'pegawai').
 * @param {import('@playwright/test').Page} page
 * @param {'admin'|'pegawai'} role
 */
export async function loginAs(page, role) {
  const creds = USERS[role];
  if (!creds) throw new Error(`Role tidak dikenal: ${role}`);
  await login(page, creds.email, creds.password);
}

/**
 * Buat 1 permintaan barang baru sebagai pegawai (memilih item pertama yang valid).
 * Mengembalikan nomor permintaan (REQ-...) untuk dipakai test berikutnya.
 * Asumsi: page sudah login sebagai pegawai.
 * @param {import('@playwright/test').Page} page
 * @param {number} [quantity]
 * @returns {Promise<string>} request number
 */
export async function createRequestAsPegawai(page, quantity = 2) {
  await page.goto("/permintaan/baru");

  // Pilih opsi barang pertama yang punya value (index 0 = placeholder kosong).
  const select = page.locator('select[name="item_id"]').first();
  const optionValue = await select.locator("option").nth(1).getAttribute("value");
  expect(optionValue, "Tidak ada item di dropdown — jalankan seed_items.js").toBeTruthy();
  await select.selectOption(optionValue);

  await page.fill('input[name="quantity"]', String(quantity));
  await page.click('#formPermintaan button[type="submit"]');

  // Banner sukses + nomor permintaan muncul.
  await expect(page.getByText("Permintaan berhasil dibuat!")).toBeVisible();
  const reqNumber = await page.locator("span.font-mono").first().innerText();
  expect(reqNumber).toMatch(/^REQ-/);
  return reqNumber.trim();
}
