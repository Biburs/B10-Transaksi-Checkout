// =====================================================================
// Seeder Dummy Requests
//
// Mengisi 3 permintaan barang contoh dengan status berbeda (pending,
// approved, rejected) untuk keperluan testing & demo halaman admin.
//
// Idempotent: aman dijalankan berkali-kali (cek dulu sebelum insert).
//
// Prerequisite (harus dijalankan dulu):
//   1. node scripts/seed_login.js
//   2. node scripts/seed_employees.js
//   3. node scripts/seed_items.js
// =====================================================================

const db = require("../lib/db");

// ----- Helper: ambil employee_id dari email user -----
async function getEmployeeIdByEmail(email) {
  const [rows] = await db.query(
    `SELECT e.id
     FROM employees e
     JOIN users u ON u.id = e.id
     WHERE u.email = ?
     LIMIT 1`,
    [email]
  );
  return rows.length > 0 ? rows[0].id : null;
}

// ----- Helper: ambil item dari master berdasarkan id -----
async function getItemById(itemId) {
  const [rows] = await db.query(
    `SELECT id, name FROM items WHERE id = ? LIMIT 1`,
    [itemId]
  );
  return rows.length > 0 ? rows[0] : null;
}

// ----- Helper: cek apakah request_number sudah ada -----
async function requestNumberExists(requestNumber) {
  const [rows] = await db.query(
    `SELECT id FROM inventory_requests WHERE request_number = ? LIMIT 1`,
    [requestNumber]
  );
  return rows.length > 0;
}

// ----- Helper: insert 1 permintaan lengkap (header + details + approval opsional) -----
async function ensureDummyRequest({
  requestNumber,
  pegawaiId,
  adminLogistikId,
  daysAgo,
  status,
  items, // [{ item_id, quantity }, ...]
  approvalNotes, // string atau null (null = belum ada approval)
}) {
  // Cek duplikat
  if (await requestNumberExists(requestNumber)) {
    console.log(`  - ${requestNumber} sudah ada, skip`);
    return;
  }

  // Validasi semua item_id ada di master + ambil nama untuk snapshot
  const itemSnapshots = [];
  for (const it of items) {
    const itemRow = await getItemById(it.item_id);
    if (!itemRow) {
      console.error(
        `  ❌ Item id=${it.item_id} tidak ada di master. Skip ${requestNumber}.`
      );
      return;
    }
    itemSnapshots.push({
      item_id: itemRow.id,
      item_name: itemRow.name,
      quantity: it.quantity,
    });
  }

  // Tentukan kolom approved_by & approved_at sesuai status
  const isDecided = status === "approved" || status === "rejected";

  // Insert header
  const [resHeader] = await db.query(
    `INSERT INTO inventory_requests
     (request_number, employee_id, request_date, status,
      approved_by, approved_at, created_at, updated_at)
     VALUES (?, ?, DATE_SUB(CURDATE(), INTERVAL ? DAY), ?,
             ?, ?, NOW(), NOW())`,
    [
      requestNumber,
      pegawaiId,
      daysAgo,
      status,
      isDecided ? adminLogistikId : null,
      isDecided ? new Date() : null,
    ]
  );
  const requestId = resHeader.insertId;

  // Insert detail items (dengan item_name snapshot)
  for (const snap of itemSnapshots) {
    await db.query(
      `INSERT INTO inventory_request_details
       (inventory_request_id, item_id, item_name, quantity, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())`,
      [requestId, snap.item_id, snap.item_name, snap.quantity]
    );
  }

  // Insert approval log (kalau status sudah decided)
  if (isDecided && approvalNotes) {
    await db.query(
      `INSERT INTO inventory_request_approvals
       (inventory_request_id, approver_id, status, notes, action_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW(), NOW())`,
      [requestId, adminLogistikId, status, approvalNotes]
    );
  }

  console.log(`  ✓ ${requestNumber} (${status}) berhasil dibuat`);
}

// ----- Main seed function -----
async function seed() {
  try {
    console.log("\n=== SEED DUMMY REQUESTS ===\n");

    // 1. Cek prerequisite
   console.log("[1/2] Cek prerequisite (user & employee)...");
    const pegawaiId = await getEmployeeIdByEmail("pegawai@gmail.com");
    const adminLogistikId = await getEmployeeIdByEmail("admin@gmail.com");
    

    if (!pegawaiId || !adminLogistikId) {
      console.error(
        "\n❌ ERROR: Employee untuk pegawai@gmail.com atau admin@gmail.com tidak ditemukan."
      );
      console.error("   Jalankan dulu:");
      console.error("     node scripts/seed_login.js");
      console.error("     node scripts/seed_employees.js\n");
      process.exit(1);
    }
    console.log(
      `  ✓ pegawai_employee_id=${pegawaiId}, admin_logistik_employee_id=${adminLogistikId}\n`
    );

    // 2. Insert 3 permintaan
    console.log("[2/2] Insert permintaan dummy...");

    await ensureDummyRequest({
      requestNumber: "REQ-2026-0001",
      pegawaiId,
      adminLogistikId,
      daysAgo: 0,
      status: "pending",
      items: [
        { item_id: 1, quantity: 5 },
        { item_id: 2, quantity: 10 },
      ],
      approvalNotes: null,
    });

    await ensureDummyRequest({
      requestNumber: "REQ-2026-0002",
      pegawaiId,
      adminLogistikId,
      daysAgo: 1,
      status: "approved",
      items: [{ item_id: 4, quantity: 20 }],
      approvalNotes: "Disetujui sesuai kuota",
    });

    await ensureDummyRequest({
      requestNumber: "REQ-2026-0003",
      pegawaiId,
      adminLogistikId,
      daysAgo: 2,
      status: "rejected",
      items: [{ item_id: 7, quantity: 50 }],
      approvalNotes: "Stok sedang kosong",
    });

    console.log("\n=== SELESAI ===");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Error seeding dummy requests:", err);
    process.exit(1);
  }
}

seed();