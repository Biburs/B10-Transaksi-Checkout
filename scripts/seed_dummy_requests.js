const db = require("../lib/db");

async function seed() {
  try {
    console.log("=== SEED DUMMY REQUESTS ===");

    // Get pegawai employee id (we know it's id 3 from seed_employees)
    const pegawaiId = 3;
    // Get admin logistik employee id (id 2)
    const adminLogistikId = 2;

    // Insert a Pending Request
    const [req1] = await db.query(
      `INSERT INTO inventory_requests (employee_id, request_number, request_date, status, created_at, updated_at)
       VALUES (?, 'REQ-2026-0001', NOW(), 'pending', NOW(), NOW())`,
      [pegawaiId]
    );
    await db.query(
      `INSERT INTO inventory_request_details (inventory_request_id, item_id, quantity)
       VALUES (?, 1, 5), (?, 2, 10)`,
      [req1.insertId, req1.insertId]
    );

    // Insert an Approved Request
    const [req2] = await db.query(
      `INSERT INTO inventory_requests (employee_id, request_number, request_date, status, approved_by, approved_at, created_at, updated_at)
       VALUES (?, 'REQ-2026-0002', DATE_SUB(NOW(), INTERVAL 1 DAY), 'approved', ?, NOW(), NOW(), NOW())`,
      [pegawaiId, adminLogistikId]
    );
    await db.query(
      `INSERT INTO inventory_request_details (inventory_request_id, item_id, quantity)
       VALUES (?, 4, 20)`,
      [req2.insertId]
    );
    await db.query(
      `INSERT INTO inventory_request_approvals (inventory_request_id, approver_id, status, notes, action_date)
       VALUES (?, ?, 'approved', 'Disetujui sesuai kuota', NOW())`,
      [req2.insertId, adminLogistikId]
    );

    // Insert a Rejected Request
    const [req3] = await db.query(
      `INSERT INTO inventory_requests (employee_id, request_number, request_date, status, approved_by, approved_at, created_at, updated_at)
       VALUES (?, 'REQ-2026-0003', DATE_SUB(NOW(), INTERVAL 2 DAY), 'rejected', ?, NOW(), NOW(), NOW())`,
      [pegawaiId, adminLogistikId]
    );
    await db.query(
      `INSERT INTO inventory_request_details (inventory_request_id, item_id, quantity)
       VALUES (?, 7, 50)`,
      [req3.insertId]
    );
    await db.query(
      `INSERT INTO inventory_request_approvals (inventory_request_id, approver_id, status, notes, action_date)
       VALUES (?, ?, 'rejected', 'Stok sedang kosong', NOW())`,
      [req3.insertId, adminLogistikId]
    );

    console.log("Berhasil menambahkan 3 permintaan (Pending, Approved, Rejected)!");
    process.exit(0);
  } catch (err) {
    console.error("Error seeding dummy requests:", err);
    process.exit(1);
  }
}

seed();
