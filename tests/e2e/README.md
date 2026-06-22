# E2E Testing dengan Playwright

Test end-to-end untuk Facultyware menggunakan [Playwright](https://playwright.dev).

## Prasyarat

Test menjalankan aplikasi nyata terhadap database **`facultyware`**, jadi siapkan dulu:

1. **MySQL berjalan** dan database `facultyware` sudah dibuat.
2. **Data seed dimuat** minimal:
   ```bash
   node scripts/seed_login.js      # akun login (admin & pegawai)
   node scripts/seed_items.js      # daftar barang untuk dropdown permintaan
   node scripts/seed_employees.js  # profil pegawai
   ```
3. **Browser Playwright terpasang** (sekali saja):
   ```bash
   npx playwright install chromium
   ```

> ⚠️ Test ini **menulis data nyata** (membuat, menyetujui, menolak, membatalkan
> permintaan) ke DB `facultyware`. Jalankan terhadap database development/test,
> **bukan produksi**.

## Akun test (dari `scripts/seed_login.js`)

| Role            | Email               | Password     |
| --------------- | ------------------- | ------------ |
| Admin Logistik  | admin@gmail.com     | admin123     |
| Pegawai         | pegawai@gmail.com   | pegawai123   |

## Menjalankan test

Playwright otomatis menjalankan server (`npm start`) sebelum test. Kalau server
sudah jalan (mis. `npm run dev`), Playwright akan memakainya kembali.

```bash
npm test              # jalankan semua test (headless)
npm run test:ui       # mode UI interaktif (inspeksi tiap langkah)
npx playwright test tests/e2e/auth.spec.mjs  # satu file saja
npx playwright show-report                   # lihat laporan HTML terakhir
```

## Struktur

```
tests/e2e/
├── helpers/auth.mjs             # loginAs(), createRequestAsPegawai()
├── auth.spec.mjs                # login sukses/gagal, logout, proteksi route
├── permintaan-pegawai.spec.mjs  # buat permintaan + batalkan (confirm dialog)
└── permintaan-admin.spec.mjs    # list + approve + reject
```

> Catatan: file test memakai ekstensi **`.mjs`** (ESM) untuk menghindari bug
> resolusi modul pada Playwright 1.61 + Node 22 saat memakai `require()` relatif.
