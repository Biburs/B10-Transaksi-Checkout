// =====================================================================
// SEEDER: Master Barang (Items + Inventories)
// Jalankan setelah scripts/seed_data.js:
//     node scripts/seed_items.js
//
// Tabel yang di-seed:
//   1. items          - 8 baris barang habis pakai contoh (ATK)
//   2. inventories    - 8 baris stok awal (quantity = 0)
//
// CATATAN PENTING:
//   - Pengelolaan items secara CRUD adalah tanggung jawab kelompok B8
//     (Pengelolaan Data Master Logistik).
//   - File ini hanya menyediakan DATA DUMMY untuk testing fitur B10
//     (Transaksi Checkout / Permintaan Barang).
//   - Stok awal sengaja diisi 0 — pengisian stok adalah tanggung jawab
//     kelompok B9 (Pengadaan) dan B11 (Stok Opname).
//   - Sifat: idempotent - aman dijalankan berkali-kali (cek by code).
// =====================================================================

const db = require("../lib/db");

// ---------- Helper items + inventories ----------
async function ensureItem(name, code, unit, minimalQty, description) {
  const [exist] = await db.query(
    "SELECT id FROM items WHERE code = ? LIMIT 1",
    [code]
  );
  if (exist.length > 0) {
    console.log(`  ↳ ${code} sudah ada, dilewati`);
    return exist[0].id;
  }

  // 1. Insert master item
  const [res] = await db.query(
    `INSERT INTO items (name, code, unit, minimal_quantity, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
    [name, code, unit, minimalQty, description]
  );

  // 2. Buat row inventories dengan stok awal 0
  //    (akan diisi nanti oleh kelompok B9/B11)
  await db.query(
    `INSERT INTO inventories (item_id, quantity, created_at, updated_at)
     VALUES (?, 0, NOW(), NOW())`,
    [res.insertId]
  );

  return res.insertId;
}

// ---------- MAIN SEED ----------
async function seed() {
  try {
    console.log("\n=== SEED MASTER BARANG (ITEMS) ===");
    console.log("Domain: Logistik (data dummy untuk testing B10)\n");

    const sampleItems = [
      { name: "Kertas HVS A4 70gr",            code: "ATK-001", unit: "rim",   min: 5,  desc: "Kertas HVS putih A4 70gr" },
      { name: "Pulpen Standard AE7 Hitam",     code: "ATK-002", unit: "pcs",   min: 20, desc: "Pulpen tinta hitam" },
      { name: "Tinta Printer Epson 003 Hitam", code: "ATK-003", unit: "botol", min: 3,  desc: "Tinta refill printer Epson" },
      { name: "Map Plastik L A4",              code: "ATK-004", unit: "pcs",   min: 10, desc: "Map plastik transparan ukuran A4" },
      { name: "Stapler HD-50R",                code: "ATK-005", unit: "pcs",   min: 5,  desc: "Stapler ukuran sedang" },
      { name: "Isi Stapler No. 10",            code: "ATK-006", unit: "box",   min: 10, desc: "Isi stapler standar" },
      { name: "Spidol Whiteboard Snowman",     code: "ATK-007", unit: "pcs",   min: 12, desc: "Spidol papan tulis" },
      { name: "Penghapus Whiteboard",          code: "ATK-008", unit: "pcs",   min: 5,  desc: "Penghapus papan tulis" },
    ];

    let createdCount = 0;
    for (const item of sampleItems) {
      const id = await ensureItem(item.name, item.code, item.unit, item.min, item.desc);
      console.log(`  ✓ ${item.code} - ${item.name} (id=${id})`);
      createdCount++;
    }

    console.log(`\n=== SELESAI ===`);
    console.log(`Total ${createdCount} item disiapkan dengan stok awal 0.`);
    console.log("Aplikasi siap untuk fitur F1 (Buat Permintaan Barang).\n");

    process.exit(0);
  } catch (err) {
    console.error("\n❌ Error saat seeding items:", err.message);
    console.error(err);
    process.exit(1);
  }
}

seed();
