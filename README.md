# FTI Sistem Logistik — B10 Transaksi Checkout

Aplikasi web client-server untuk mengelola transaksi checkout permintaan barang logistik di Fakultas Teknologi Informasi (FTI), Universitas Andalas. Dibangun sebagai Tugas Besar mata kuliah Pemrograman Web semester genap 2025/2026.
Aplikasi ini mensimulasikan alur kerja antara pegawai yang mengajukan permintaan barang dengan Admin Logistik yang meninjau, menyetujui, dan menyerahkan barang. Lingkup yang dikerjakan kelompok ini adalah modul **Transaksi Checkout (B10)** yang merupakan satu bagian dari modul FTI Logistik di sistem yang lebih besar.

## Live Demo

URL: https://b10-transaksi-checkout-production.up.railway.app

Akun untuk uji coba:

| Role           | Email              | Password   |
|----------------|--------------------|------------|
| Admin Logistik | admin@gmail.com    | admin123   |
| Pegawai 1      | pegawai@gmail.com  | pegawai123 |
| Pegawai 2      | pegawai2@gmail.com | pegawai123 |

## Tim Pengembang

Kelompok B10 — Transaksi Checkout (FTI Logistik), terdiri dari tiga anggota:

| NIM        | Nama                      | Tanggung Jawab                                                                                                                                       |
|------------|---------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------|
| 2411523022 | Ihsan Auliya Habiburrohim | Sisi Pegawai — CRUD permintaan, cetak PDF dokumen permintaan, response API JSON                                                                      |
| 2411522020 | Muhammad Racha Ardiwinata | Sisi Admin Logistik (Read) — List, filter status, search keyword, detail permintaan, cetak Surat Keputusan, API JSON dengan filter                   |
| 2411523013 | Taris Rafivdean           | Sisi Admin Logistik (Workflow) — Approval, cancel keputusan, set status selesai, upload tanda terima, cetak Surat Penyerahan Barang, API JSON status |

## Fitur

Total terdapat 18 fitur yang dibagi rata ke tiga anggota.

**Sisi Pegawai (Ihsan):**
1. Mengajukan permintaan barang baru dengan memilih item dan jumlah
2. Melihat daftar/riwayat seluruh permintaan miliknya 
3. Melihat detail satu permintaan beserta timeline approval-nya
4. Mengedit atau membatalkan permintaan yang masih berstatus pending
5. Mencetak dokumen permintaan barang dalam format PDF
6. Response API JSON untuk GET daftar permintaan milik pegawai

**Sisi Admin Logistik — Read & Print (Racha):**
1. Melihat daftar seluruh permintaan barang masuk
2. Memfilter daftar permintaan berdasarkan status
3. Mencari permintaan berdasarkan keyword (nomor permintaan, nama pemohon, atau nama barang)
4. Melihat detail permintaan beserta data pemohon, item, jumlah, status, dan tanggal
5. Mencetak Surat Keputusan persetujuan atau penolakan dalam format PDF
6. Response API JSON untuk GET daftar permintaan masuk dengan filter status

**Sisi Admin Logistik — Workflow (Taris):**
1. Menyetujui atau menolak permintaan barang beserta alasannya
2. Membatalkan keputusan (Approved/Rejected dikembalikan menjadi Pending)
3. Memperbarui status permintaan menjadi selesai (Fulfilled)
4. Mengunggah file tanda terima penyerahan barang (PDF/JPG/PNG, maksimal 5MB)
5. Mencetak dokumen Surat Penyerahan Barang dalam format PDF
6. Response API JSON untuk proses pembaruan status permintaan

## Teknologi yang Digunakan

Backend:
- Node.js dan Express.js
- MySQL dengan driver mysql2 (native, tanpa ORM)
- bcryptjs untuk hashing password
- express-mysql-session untuk session storage di database
- multer untuk upload file
- pdfkit untuk generate dokumen PDF

Frontend:
- EJS sebagai template engine
- Basecoat UI 
- Vanilla JavaScript

Testing dan Deployment:
- Playwright untuk E2E testing
- Railway sebagai platform deployment

## Prasyarat

Pastikan sudah terpasang di mesin lokal:
- Node.js versi 18 atau lebih baru
- MySQL 8.x atau MariaDB 10.x
- Git

## Instalasi dan Cara Menjalankan

**1. Clone repository**

```bash
git clone https://github.com/Biburs/B10-Transaksi-Checkout.git
```

**2. Install dependencies**

```bash
npm install
```

**3. Buat database dan import schema**

Schema database disediakan oleh dosen pengampu dalam file `db_tb_pweb_v2.sql`.

```bash
mysql -u root -p -e "CREATE DATABASE facultyware CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p facultyware < db_tb_pweb_v2.sql
```

**4. Konfigurasi environment**

Salin `.env.example` menjadi `.env`, kemudian sesuaikan dengan konfigurasi MySQL lokal:

```bash
cp .env.example .env
```

Edit isi `.env`:

```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=facultyware
SESSION_SECRET=ganti-dengan-string-acak-panjang
PORT=3000
```

**5. Jalankan seeder secara berurutan**

```bash
node scripts/setup_node_sessions.js
node scripts/seed_login.js
node scripts/seed_employees.js
node scripts/seed_items.js
node scripts/seed_dummy_requests.js
```

Penjelasan masing-masing:
- `setup_node_sessions.js` membuat tabel `node_sessions` untuk express-mysql-session
- `seed_login.js` mengisi tabel users, roles, permissions, dan role-permission mapping
- `seed_employees.js` mengisi organization_units, employment_statuses, dan employees
- `seed_items.js` mengisi master item barang beserta stok awal
- `seed_dummy_requests.js` opsional, mengisi tiga permintaan dummy untuk demo

**6. Jalankan aplikasi**

Mode development (dengan nodemon, auto-reload saat ada perubahan):

```bash
npm run dev
```

Mode production:

```bash
npm start
```

Aplikasi akan berjalan di `http://localhost:3000`. Login dengan akun seed yang sudah dibuat (lihat tabel di bagian Live Demo).

## Testing

Project ini menyertakan E2E test menggunakan Playwright. Sebelum menjalankan untuk pertama kali, install browser yang diperlukan:

```bash
npx playwright install chromium
```

Menjalankan test:

```bash
# Jalankan semua test
npm test

# Mode UI interaktif (rekomendasi untuk debug)
npm run test:ui

# Lihat laporan HTML setelah test selesai
npx playwright show-report
```

Cakupan test:

| File                        | Jumlah Test | Yang Dicakup                                                     |
|-----------------------------|-------------|------------------------------------------------------------------|
| auth.spec.mjs               | 5           | Login admin, login pegawai, login gagal, logout, proteksi route  |
| permintaan-pegawai.spec.mjs | 4           | Buat permintaan, status di list, cancel via dialog, tutup dialog |
| permintaan-admin.spec.mjs   | 3           | List admin, approve, reject                                      |

Total 12 test case. Testing dijalankan secara berurutan (workers=1) karena menulis data nyata ke database. Jangan jalankan terhadap database produksi.

## Struktur Folder

```
facultyware/
├── app.js                          Entry point Express
├── bin/www                         HTTP server bootstrap
├── package.json
├── playwright.config.js
├── .env.example
│
├── lib/
│   └── db.js                       MySQL2 connection pool
│
├── routes/
│   ├── index.js                    Auth dan halaman utama
│   ├── permintaan.js               Routes untuk Pegawai
│   ├── admin-permintaan.js         Routes untuk Admin Logistik
│   ├── api.js                      Endpoints JSON
│   └── users.js
│
├── controllers/
│   ├── indexController.js
│   ├── permintaanController.js     Logika sisi Pegawai
│   ├── adminPermintaanController.js Logika sisi Admin
│   ├── apiController.js
│   └── usersController.js
│
├── middlewares/
│   ├── auth.js                     Cek session
│   ├── role.js                     Role-based access control
│   ├── apiAuth.js                  Versi JSON-response untuk API
│   ├── acl.js                      Permission-based (Spatie style)
│   └── error.js                    404 dan error handler
│
├── views/
│   ├── home.ejs                    Dashboard
│   ├── login.ejs
│   ├── error.ejs
│   ├── partials/
│   ├── pegawai/permintaan/
│   └── admin/permintaan/
│
├── scripts/                        Seeder dan setup database
├── tests/e2e/                      Playwright test specs
├── uploads/receipts/               File tanda terima upload
└── public/assets/                  CSS, JS, dan assets statis
```

## API Endpoints

Seluruh endpoint API mengembalikan response JSON dengan struktur konsisten yang mencakup field `success`, `data`, `pagination`, `filters`, dan `error` (jika ada).

**Untuk Pegawai:**

| Method | URL             | Deskripsi                                                                                            |
|--------|-----------------|------------------------------------------------------------------------------------------------------|
| GET    | /api/permintaan | Daftar permintaan milik pegawai yang login. Mendukung query parameter: page, perPage, search, status |

**Untuk Admin Logistik:**

| Method | URL                                       | Deskripsi                                                   |
|--------|-------------------------------------------|-------------------------------------------------------------|
| GET    | /api/admin/permintaan                     | Daftar semua permintaan, mendukung filter status dan search |
| GET    | /api/admin/permintaan/:id/spb             | Stream PDF Surat Penyerahan Barang                          |
| POST   | /api/admin/permintaan/:id/approve         | Setujui permintaan dengan body `{ notes }`                  |
| POST   | /api/admin/permintaan/:id/reject          | Tolak permintaan dengan body `{ notes }`                    |
| POST   | /api/admin/permintaan/:id/cancel-decision | Batalkan keputusan, kembalikan ke Pending                   |
| POST   | /api/admin/permintaan/:id/complete        | Set Approved menjadi Fulfilled                              |

## Skema Database

Aplikasi menggunakan schema `facultyware` yang disediakan dosen. Tabel utama yang digunakan modul ini:

- `users` — akun login
- `employees` — profil pegawai, relasi 1:1 ke users via shared primary key
- `organization_units` — hierarki organisasi
- `employment_statuses` — status kepegawaian
- `roles`, `permissions`, `model_has_roles`, `role_has_permissions` — RBAC bergaya Spatie
- `node_sessions` — session storage untuk Express
- `items` — master barang
- `inventories` — stok per item
- `inventory_requests` — header permintaan
- `inventory_request_details` — detail item per permintaan
- `inventory_request_approvals` — riwayat keputusan approve/reject

Status enum pada `inventory_requests`: `pending` → `approved`/`rejected` → `fulfilled`, atau `cancelled` dari `pending`.

## Role dan Akses

Terdapat dua role yang dipakai:
- `pegawai` dapat mengakses route `/permintaan/*` dan API `/api/permintaan`
- `admin_logistik` dapat mengakses route `/admin/permintaan/*` dan API `/api/admin/permintaan/*`

Aturan otorisasi yang dijaga di backend:
- Pegawai hanya bisa melihat dan memodifikasi permintaan miliknya sendiri
- Pegawai hanya bisa edit atau cancel permintaan yang masih berstatus `pending`
- Admin hanya bisa approve/reject permintaan yang berstatus `pending`
- Admin hanya bisa cancel decision untuk status `approved` atau `rejected`
- Admin hanya bisa complete permintaan yang berstatus `approved`
- Admin hanya bisa upload receipt untuk status `approved` atau `fulfilled`


Proyek ini dibuat untuk keperluan akademik sebagai Tugas Besar mata kuliah Pemrograman Web, Program Studi Sistem Informasi, Fakultas Teknologi Informasi, Universitas Andalas, semester genap tahun ajaran 2025/2026.

Referensi:
- Repository acuan dosen: https://github.com/husnilk/facultyware
- ERD database, SQL schema, dan dokumen proyek disediakan oleh dosen pengampu
