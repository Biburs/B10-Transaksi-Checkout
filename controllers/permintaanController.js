// =====================================================================
// Controller: Permintaan Barang (Pegawai)
// Menangani CRUD permintaan barang oleh role pegawai.
// =====================================================================

const db = require("../lib/db");

const PDFDocument = require("pdfkit");

// ---------------------------------------------------------------------
// HELPER: Generate request number dengan format REQ-YYYYMMDD-NNN
// Counter NNN di-reset setiap hari, di-pad jadi 3 digit (001, 002, ...).
// CATATAN: ada potensi race condition kalau 2 user submit bersamaan.
//          Untuk skala project ini bisa diabaikan.
// ---------------------------------------------------------------------
async function generateRequestNumber(connection) {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const dateStr = `${yyyy}${mm}${dd}`;

  // Hitung berapa permintaan yang sudah dibuat hari ini
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM inventory_requests
     WHERE request_number LIKE ?`,
    [`REQ-${dateStr}-%`]
  );
  const counter = String(rows[0].cnt + 1).padStart(3, "0");
  return `REQ-${dateStr}-${counter}`;
}

// ---------------------------------------------------------------------
// HELPER: Ambil daftar items untuk dropdown form
// ---------------------------------------------------------------------
async function getItemsForDropdown() {
  const [items] = await db.query(
    `SELECT i.id, i.code, i.name, i.unit, COALESCE(inv.quantity, 0) AS stok
     FROM items i
     LEFT JOIN inventories inv ON inv.item_id = i.id
     ORDER BY i.code ASC`
  );
  return items;
}

// ---------------------------------------------------------------------
// GET /permintaan/baru
// Tampilkan form buat permintaan baru.
// Query param ?success=REQ-XXX akan tampilkan banner sukses.
// ---------------------------------------------------------------------
exports.formBaru = async (req, res, next) => {
  try {
    const items = await getItemsForDropdown();
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    res.render("permintaan/baru", {
      title: "Buat Permintaan",
      user: req.session.userName,
      userRole: req.session.userRole,
      items: items,
      today: today,
      successNumber: req.query.success || null,
      error: null,
      formData: null,
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------
// POST /permintaan/baru
// Proses simpan permintaan baru (header + N detail item).
// ---------------------------------------------------------------------
exports.createPermintaan = async (req, res, next) => {
  const employeeId = req.session.employeeId;
  const { request_date } = req.body;

  // ----- Normalisasi input array -----
  // HTML form mengirim multiple field dengan nama sama sebagai array,
  // kecuali kalau cuma 1 baris -> kirim sebagai string. Kita normalisasi.
  let item_id = req.body.item_id;
  let quantity = req.body.quantity;
  let specification = req.body.specification;

  if (!Array.isArray(item_id)) item_id = item_id ? [item_id] : [];
  if (!Array.isArray(quantity)) quantity = quantity ? [quantity] : [];
  if (!Array.isArray(specification))
    specification = specification ? [specification] : [];

  // ----- Validasi server-side -----
  const errors = [];

  if (!request_date) {
    errors.push("Tanggal permintaan wajib diisi");
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(request_date)) {
    errors.push("Format tanggal tidak valid");
  }

  // Validasi & filter items: ambil hanya baris yang terisi
  const validItems = [];
  const seenItems = new Set();

  for (let i = 0; i < item_id.length; i++) {
    if (!item_id[i]) continue; // skip baris kosong

    const itemIdInt = parseInt(item_id[i], 10);
    const qty = parseInt(quantity[i], 10);

    if (isNaN(itemIdInt) || itemIdInt < 1) {
      errors.push(`Baris ${i + 1}: item tidak valid`);
      continue;
    }
    if (isNaN(qty) || qty < 1) {
      errors.push(`Baris ${i + 1}: jumlah harus angka positif`);
      continue;
    }

    const spec = (specification[i] || "").trim() || null;
    if (spec && spec.length > 500) {
      errors.push(`Baris ${i + 1}: spesifikasi maksimal 500 karakter`);
      continue;
    }

    // Deteksi item duplikat (boleh, tapi beri warning)
    const key = `${itemIdInt}-${spec}`;
    if (seenItems.has(key)) {
      errors.push(
        `Baris ${i + 1}: item dengan spesifikasi yang sama sudah ada`
      );
      continue;
    }
    seenItems.add(key);

    validItems.push({ item_id: itemIdInt, quantity: qty, specification: spec });
  }

  if (validItems.length === 0 && errors.length === 0) {
    errors.push("Minimal 1 item harus dipilih dengan jumlah valid");
  }

  // Kalau ada error, render kembali form
  if (errors.length > 0) {
    try {
      const items = await getItemsForDropdown();
      return res.render("permintaan/baru", {
        title: "Buat Permintaan",
        user: req.session.userName,
        userRole: req.session.userRole,
        items: items,
        today: new Date().toISOString().split("T")[0],
        successNumber: null,
        error: errors.join(". "),
        formData: { request_date, items: validItems },
      });
    } catch (err) {
      return next(err);
    }
  }

  // ----- Insert dengan transaction -----
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Generate request_number
    const requestNumber = await generateRequestNumber(connection);

    // Insert header permintaan
    // CATATAN: approved_by_id NOT NULL (bug bawaan SQL dosen, kolom redundant
    //          tanpa FK), kita isi dengan 0 karena belum ada approver.
    const [resHeader] = await connection.query(
      `INSERT INTO inventory_requests
       (request_number, employee_id, request_date, status, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', NOW(), NOW())`,
      [requestNumber, employeeId, request_date]
    );

    const requestId = resHeader.insertId;

    // Insert tiap detail item
    for (const item of validItems) {
      // Ambil nama item untuk denormalization (snapshot saat permintaan dibuat)
      const [nameRows] = await connection.query(
        "SELECT name FROM items WHERE id = ? LIMIT 1",
        [item.item_id]
      );
      if (nameRows.length === 0) {
        throw new Error(`Item dengan id ${item.item_id} tidak ditemukan`);
      }
      const itemName = nameRows[0].name;

      await connection.query(
        `INSERT INTO inventory_request_details
         (inventory_request_id, item_id, item_name, specification, quantity, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
        [requestId, item.item_id, itemName, item.specification, item.quantity]
      );
    }

    await connection.commit();

    // Redirect ke form lagi dengan banner sukses (pattern Post/Redirect/Get)
    return res.redirect(
      "/permintaan/baru?success=" + encodeURIComponent(requestNumber)
    );
  } catch (err) {
    await connection.rollback();
    return next(err);
  } finally {
    connection.release();
  }
};




// ---------------------------------------------------------------------
// GET /permintaan
// Daftar permintaan milik pegawai yang login.
// Mendukung: search, filter by status, pagination.
//
// Query params:
//   ?page=1          (default 1)
//   ?search=         (cari di request_number atau nama item)
//   ?status=         (pending|approved|rejected|fulfilled|cancelled|"")
// ---------------------------------------------------------------------
exports.listPermintaan = async (req, res, next) => {
  const employeeId = req.session.employeeId;

  // ----- Parse & sanitize query params -----
  const PER_PAGE = 10;

  let page = parseInt(req.query.page, 10);
  if (isNaN(page) || page < 1) page = 1;

  const search = (req.query.search || "").trim();
  const status = (req.query.status || "").trim();

  // ----- Validasi status (whitelist agar aman dari injection meskipun pakai prepared) -----
  const VALID_STATUSES = [
    "pending",
    "approved",
    "rejected",
    "fulfilled",
    "cancelled",
  ];
  const statusFilter = VALID_STATUSES.includes(status) ? status : "";

  try {
    // ----- Susun WHERE clause dinamis -----
    const whereClauses = ["ir.employee_id = ?"];
    const params = [employeeId];

    if (statusFilter) {
      whereClauses.push("ir.status = ?");
      params.push(statusFilter);
    }

    if (search) {
      // Cari di request_number ATAU nama item (LIKE join ke details)
      whereClauses.push(`(
        ir.request_number LIKE ? 
        OR EXISTS (
          SELECT 1 FROM inventory_request_details ird2 
          WHERE ird2.inventory_request_id = ir.id 
          AND ird2.item_name LIKE ?
        )
      )`);
      const likePattern = `%${search}%`;
      params.push(likePattern, likePattern);
    }

    const whereSql = whereClauses.join(" AND ");

    // ----- Query 1: hitung total untuk pagination -----
    const [countRows] = await db.query(
      `SELECT COUNT(*) AS total
       FROM inventory_requests ir
       WHERE ${whereSql}`,
      params
    );
    const totalRecords = countRows[0].total;
    const totalPages = Math.max(1, Math.ceil(totalRecords / PER_PAGE));

    // Pastikan page tidak melebihi totalPages
    if (page > totalPages) page = totalPages;
    const offset = (page - 1) * PER_PAGE;

    // ----- Query 2: ambil data per halaman -----
    // LIMIT & OFFSET tidak bisa pakai prepared statement di mysql2 versi tertentu,
    // jadi kita pakai parseInt + interpolasi untuk amankan dari injection
    const [rows] = await db.query(
      `SELECT 
         ir.id,
         ir.request_number,
         ir.request_date,
         ir.status,
         ir.created_at,
         COUNT(ird.id) AS total_items,
         COALESCE(SUM(ird.quantity), 0) AS total_quantity
       FROM inventory_requests ir
       LEFT JOIN inventory_request_details ird 
         ON ird.inventory_request_id = ir.id
       WHERE ${whereSql}
       GROUP BY ir.id, ir.request_number, ir.request_date, ir.status, ir.created_at
       ORDER BY ir.created_at DESC
       LIMIT ${parseInt(PER_PAGE, 10)} OFFSET ${parseInt(offset, 10)}`,
      params
    );

    // ----- Render -----
    res.render("permintaan/list", {
      title: "Permintaan Saya",
      user: req.session.userName,
      userRole: req.session.userRole,
      requests: rows,
      // Pagination info
      currentPage: page,
      totalPages: totalPages,
      totalRecords: totalRecords,
      perPage: PER_PAGE,
      // Filter state (untuk preserve di form)
      search: search,
      status: statusFilter,
    });
  } catch (err) {
    next(err);
  }
};


// ---------------------------------------------------------------------
// GET /permintaan/:id
// Tampilkan detail satu permintaan milik pegawai yang login.
//
// Security:
//   - WHERE id = ? AND employee_id = ? memastikan pegawai hanya bisa
//     melihat permintaan miliknya sendiri.
//   - Kalau tidak ditemukan, tampilkan 404 (bukan 403) supaya tidak bocor
//     informasi "permintaan ini ada tapi bukan milikmu".
// ---------------------------------------------------------------------
exports.detailPermintaan = async (req, res, next) => {
  const employeeId = req.session.employeeId;

  // ----- Validasi & parse ID -----
  const requestId = parseInt(req.params.id, 10);
  if (isNaN(requestId) || requestId < 1) {
    return res.status(404).render("error", {
      message: "Permintaan tidak ditemukan",
      error: { status: 404, stack: "" },
    });
  }

  try {
    // ----- Query 1: Header permintaan + data pemohon -----
    const [headerRows] = await db.query(
      `SELECT 
         ir.id,
         ir.request_number,
         ir.request_date,
         ir.status,
         ir.approved_at,
         ir.created_at,
         ir.updated_at,
         e.name AS pemohon_name,
         e.employee_number AS pemohon_nip,
         ou.name AS pemohon_unit,
         approver.name AS approver_name
       FROM inventory_requests ir
       JOIN employees e ON e.id = ir.employee_id
       LEFT JOIN organization_units ou ON ou.id = e.organization_unit_id
       LEFT JOIN employees approver ON approver.id = ir.approved_by
       WHERE ir.id = ? AND ir.employee_id = ?
       LIMIT 1`,
      [requestId, employeeId]
    );

    // Permintaan tidak ada atau bukan milik user -> 404
    if (headerRows.length === 0) {
      return res.status(404).render("error", {
        message: "Permintaan tidak ditemukan atau bukan milik Anda",
        error: { status: 404, stack: "" },
      });
    }

    const header = headerRows[0];

    // ----- Query 2: Detail item -----
    const [detailRows] = await db.query(
      `SELECT 
         ird.id,
         ird.item_id,
         ird.item_name,
         ird.specification,
         ird.quantity,
         i.code AS item_code,
         i.unit AS item_unit
       FROM inventory_request_details ird
       LEFT JOIN items i ON i.id = ird.item_id
       WHERE ird.inventory_request_id = ?
       ORDER BY ird.id ASC`,
      [requestId]
    );

    // ----- Query 3: Timeline approval (kalau ada) -----
    const [approvalRows] = await db.query(
      `SELECT 
         ira.id,
         ira.status,
         ira.notes,
         ira.action_date,
         e.name AS approver_name,
         e.employee_number AS approver_nip
       FROM inventory_request_approvals ira
       JOIN employees e ON e.id = ira.approver_id
       WHERE ira.inventory_request_id = ?
       ORDER BY ira.action_date ASC, ira.id ASC`,
      [requestId]
    );

    // ----- Hitung total quantity (untuk ringkasan) -----
    const totalQuantity = detailRows.reduce(
      (sum, d) => sum + (d.quantity || 0),
      0
    );

    // ----- Render -----
   res.render("permintaan/detail", {
      title: `Detail ${header.request_number}`,
      user: req.session.userName,
      userRole: req.session.userRole,
      header: header,
      details: detailRows,
      approvals: approvalRows,
      totalItems: detailRows.length,
      totalQuantity: totalQuantity,
      // Banner flags dari query string (untuk redirect setelah edit/batal)
      updated: req.query.updated === "1",
      cancelled: req.query.cancelled === "1",
    });
      } catch (err) {
    next(err);
  }
};




// ---------------------------------------------------------------------
// HELPER: Cek apakah permintaan milik user yang login DAN masih pending
// Dipakai oleh handler edit & batal sebagai pengamanan
// ---------------------------------------------------------------------
async function findEditablePermintaan(requestId, employeeId) {
  const [rows] = await db.query(
    `SELECT id, request_number, request_date, status
     FROM inventory_requests
     WHERE id = ? AND employee_id = ?
     LIMIT 1`,
    [requestId, employeeId]
  );

  if (rows.length === 0) {
    return { found: false, editable: false, request: null };
  }

  const request = rows[0];
  return {
    found: true,
    editable: request.status === "pending",
    request: request,
  };
}

// ---------------------------------------------------------------------
// GET /permintaan/:id/edit
// Tampilkan form edit permintaan (pre-filled dengan data existing)
// ---------------------------------------------------------------------
exports.formEdit = async (req, res, next) => {
  const employeeId = req.session.employeeId;

  // Validasi ID
  const requestId = parseInt(req.params.id, 10);
  if (isNaN(requestId) || requestId < 1) {
    return res.status(404).render("error", {
      message: "Permintaan tidak ditemukan",
      error: { status: 404, stack: "" },
    });
  }

  try {
    // Cek ownership + editable
    const check = await findEditablePermintaan(requestId, employeeId);

    if (!check.found) {
      return res.status(404).render("error", {
        message: "Permintaan tidak ditemukan atau bukan milik Anda",
        error: { status: 404, stack: "" },
      });
    }

    if (!check.editable) {
      return res.status(403).render("error", {
        message: `Permintaan dengan status "${check.request.status}" tidak dapat diedit. Hanya permintaan dengan status "pending" yang dapat diubah.`,
        error: { status: 403, stack: "" },
      });
    }

    // Ambil detail items existing
    const [existingItems] = await db.query(
      `SELECT id, item_id, quantity, specification
       FROM inventory_request_details
       WHERE inventory_request_id = ?
       ORDER BY id ASC`,
      [requestId]
    );

    // Ambil items master untuk dropdown
    const items = await getItemsForDropdown();

    res.render("permintaan/edit", {
      title: `Edit ${check.request.request_number}`,
      user: req.session.userName,
      userRole: req.session.userRole,
      request: check.request,
      existingItems: existingItems,
      items: items,
      error: null,
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------
// POST /permintaan/:id/edit
// Proses update permintaan.
// Strategi: UPDATE header + DELETE all details + INSERT details baru.
// Dilakukan dalam transaction untuk atomicity.
// ---------------------------------------------------------------------
exports.updatePermintaan = async (req, res, next) => {
  const employeeId = req.session.employeeId;

  const requestId = parseInt(req.params.id, 10);
  if (isNaN(requestId) || requestId < 1) {
    return res.status(404).render("error", {
      message: "Permintaan tidak ditemukan",
      error: { status: 404, stack: "" },
    });
  }

  const { request_date } = req.body;

  // Normalisasi array
  let item_id = req.body.item_id;
  let quantity = req.body.quantity;
  let specification = req.body.specification;

  if (!Array.isArray(item_id)) item_id = item_id ? [item_id] : [];
  if (!Array.isArray(quantity)) quantity = quantity ? [quantity] : [];
  if (!Array.isArray(specification))
    specification = specification ? [specification] : [];

  // Validasi server-side (sama persis dengan createPermintaan)
  const errors = [];

  if (!request_date) {
    errors.push("Tanggal permintaan wajib diisi");
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(request_date)) {
    errors.push("Format tanggal tidak valid");
  }

  const validItems = [];
  const seenItems = new Set();

  for (let i = 0; i < item_id.length; i++) {
    if (!item_id[i]) continue;

    const itemIdInt = parseInt(item_id[i], 10);
    const qty = parseInt(quantity[i], 10);

    if (isNaN(itemIdInt) || itemIdInt < 1) {
      errors.push(`Baris ${i + 1}: item tidak valid`);
      continue;
    }
    if (isNaN(qty) || qty < 1) {
      errors.push(`Baris ${i + 1}: jumlah harus angka positif`);
      continue;
    }

    const spec = (specification[i] || "").trim() || null;
    if (spec && spec.length > 500) {
      errors.push(`Baris ${i + 1}: spesifikasi maksimal 500 karakter`);
      continue;
    }

    const key = `${itemIdInt}-${spec}`;
    if (seenItems.has(key)) {
      errors.push(
        `Baris ${i + 1}: item dengan spesifikasi yang sama sudah ada`
      );
      continue;
    }
    seenItems.add(key);

    validItems.push({ item_id: itemIdInt, quantity: qty, specification: spec });
  }

  if (validItems.length === 0 && errors.length === 0) {
    errors.push("Minimal 1 item harus dipilih dengan jumlah valid");
  }

  // Kalau ada error, render form lagi dengan data yang user sudah input
  if (errors.length > 0) {
    try {
      const check = await findEditablePermintaan(requestId, employeeId);
      if (!check.found) {
        return res.status(404).render("error", {
          message: "Permintaan tidak ditemukan",
          error: { status: 404, stack: "" },
        });
      }
      const items = await getItemsForDropdown();

      return res.render("permintaan/edit", {
        title: `Edit ${check.request.request_number}`,
        user: req.session.userName,
        userRole: req.session.userRole,
        request: check.request,
        // Pakai data dari form yang sedang disubmit (bukan dari DB)
        existingItems: validItems.length > 0 ? validItems : [{ item_id: "", quantity: "", specification: "" }],
        items: items,
        error: errors.join(". "),
        formDataDate: request_date,
      });
    } catch (err) {
      return next(err);
    }
  }

  // Mulai transaction
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Re-check ownership + status (defense in depth, in case race condition)
    const [checkRows] = await connection.query(
      `SELECT id, status FROM inventory_requests
       WHERE id = ? AND employee_id = ?
       LIMIT 1`,
      [requestId, employeeId]
    );

    if (checkRows.length === 0) {
      await connection.rollback();
      return res.status(404).render("error", {
        message: "Permintaan tidak ditemukan",
        error: { status: 404, stack: "" },
      });
    }

    if (checkRows[0].status !== "pending") {
      await connection.rollback();
      return res.status(403).render("error", {
        message: `Permintaan dengan status "${checkRows[0].status}" tidak dapat diedit.`,
        error: { status: 403, stack: "" },
      });
    }

    // 1. Update tanggal di header
    await connection.query(
      `UPDATE inventory_requests
       SET request_date = ?, updated_at = NOW()
       WHERE id = ?`,
      [request_date, requestId]
    );

    // 2. Hapus semua detail lama (strategi simple replace)
    await connection.query(
      "DELETE FROM inventory_request_details WHERE inventory_request_id = ?",
      [requestId]
    );

    // 3. Insert detail baru
    for (const item of validItems) {
      const [nameRows] = await connection.query(
        "SELECT name FROM items WHERE id = ? LIMIT 1",
        [item.item_id]
      );
      if (nameRows.length === 0) {
        throw new Error(`Item dengan id ${item.item_id} tidak ditemukan`);
      }
      const itemName = nameRows[0].name;

      await connection.query(
        `INSERT INTO inventory_request_details
         (inventory_request_id, item_id, item_name, specification, quantity, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
        [requestId, item.item_id, itemName, item.specification, item.quantity]
      );
    }

    await connection.commit();

    // Redirect ke detail dengan flag sukses
    return res.redirect(`/permintaan/${requestId}?updated=1`);
  } catch (err) {
    await connection.rollback();
    return next(err);
  } finally {
    connection.release();
  }
};

// ---------------------------------------------------------------------
// POST /permintaan/:id/batal
// Batalkan permintaan: ubah status jadi 'cancelled'
// Tidak menghapus data — audit trail tetap ada.
// ---------------------------------------------------------------------
exports.cancelPermintaan = async (req, res, next) => {
  const employeeId = req.session.employeeId;

  const requestId = parseInt(req.params.id, 10);
  if (isNaN(requestId) || requestId < 1) {
    return res.status(404).render("error", {
      message: "Permintaan tidak ditemukan",
      error: { status: 404, stack: "" },
    });
  }

  try {
    // Cek ownership + status pending dalam 1 query (atomic check)
    const [updateResult] = await db.query(
      `UPDATE inventory_requests
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = ? AND employee_id = ? AND status = 'pending'`,
      [requestId, employeeId]
    );

    if (updateResult.affectedRows === 0) {
      // Tidak ada row ter-update -> permintaan tidak ada, bukan milik user,
      // atau statusnya bukan pending
      return res.status(403).render("error", {
        message:
          "Permintaan tidak dapat dibatalkan. Pastikan permintaan masih berstatus 'Menunggu' dan milik Anda.",
        error: { status: 403, stack: "" },
      });
    }

    // Sukses -> redirect ke detail dengan flag
    return res.redirect(`/permintaan/${requestId}?cancelled=1`);
  } catch (err) {
    return next(err);
  }
};


// ---------------------------------------------------------------------
// GET /permintaan/:id/cetak
// Generate PDF permintaan dan kirim sebagai download.
//
// Aturan:
//   - Hanya pemilik permintaan yang boleh cetak.
//   - Hanya permintaan dengan status 'approved' atau 'fulfilled' yang
//     boleh dicetak (dokumen resmi).
// ---------------------------------------------------------------------
exports.cetakPDF = async (req, res, next) => {
  const employeeId = req.session.employeeId;

  // Validasi ID
  const requestId = parseInt(req.params.id, 10);
  if (isNaN(requestId) || requestId < 1) {
    return res.status(404).render("error", {
      message: "Permintaan tidak ditemukan",
      error: { status: 404, stack: "" },
    });
  }

  try {
    // ===== Query 1: Header + data pemohon + approver =====
    const [headerRows] = await db.query(
      `SELECT 
         ir.id,
         ir.request_number,
         ir.request_date,
         ir.status,
         ir.approved_at,
         ir.created_at,
         e.name AS pemohon_name,
         e.employee_number AS pemohon_nip,
         ou.name AS pemohon_unit,
         approver.name AS approver_name,
         approver.employee_number AS approver_nip
       FROM inventory_requests ir
       JOIN employees e ON e.id = ir.employee_id
       LEFT JOIN organization_units ou ON ou.id = e.organization_unit_id
       LEFT JOIN employees approver ON approver.id = ir.approved_by
       WHERE ir.id = ? AND ir.employee_id = ?
       LIMIT 1`,
      [requestId, employeeId]
    );

    if (headerRows.length === 0) {
      return res.status(404).render("error", {
        message: "Permintaan tidak ditemukan atau bukan milik Anda",
        error: { status: 404, stack: "" },
      });
    }

    const header = headerRows[0];

    // ===== Validasi status =====
    const CETAK_ALLOWED_STATUSES = ["approved", "fulfilled"];
    if (!CETAK_ALLOWED_STATUSES.includes(header.status)) {
      return res.status(403).render("error", {
        message: `Permintaan dengan status "${header.status}" belum dapat dicetak. Hanya permintaan yang sudah disetujui atau selesai yang dapat dicetak sebagai dokumen resmi.`,
        error: { status: 403, stack: "" },
      });
    }

    // ===== Query 2: Detail item =====
    const [details] = await db.query(
      `SELECT 
         ird.id,
         ird.item_name,
         ird.specification,
         ird.quantity,
         i.code AS item_code,
         i.unit AS item_unit
       FROM inventory_request_details ird
       LEFT JOIN items i ON i.id = ird.item_id
       WHERE ird.inventory_request_id = ?
       ORDER BY ird.id ASC`,
      [requestId]
    );

    // ===== Generate PDF =====
    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      info: {
        Title: `Permintaan Barang ${header.request_number}`,
        Author: "FTI Sistem Logistik",
        Subject: "Dokumen Permintaan Barang",
      },
    });

    // Set headers untuk download
    const filename = `${header.request_number}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );

    // Pipe PDF langsung ke response
    doc.pipe(res);

    // ----------------------------------------
    // HALAMAN PDF
    // ----------------------------------------
    renderPdfPermintaan(doc, header, details);

    doc.end();
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------
// HELPER: Render isi PDF
// Dipisah jadi fungsi sendiri agar mudah di-maintain & dibaca.
// ---------------------------------------------------------------------
function renderPdfPermintaan(doc, header, details) {
  const leftX = 50;
  const rightX = 360; // kolom kanan digeser ke kanan, rata ujung garis (545)
  const pageRight = 545;
  const contentW = pageRight - leftX;

  // Helper: format tanggal Indonesia
  const fmtTgl = (d) =>
    new Date(d).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

  // Helper: baris info "Label : Nilai" dengan titik dua di posisi tetap (sejajar)
  const drawInfoRows = (x, y0, lh, labelW, rightEdge, rows) => {
    doc.font("Helvetica").fontSize(10).fillColor("#000000");
    rows.forEach((r, i) => {
      const y = y0 + i * lh;
      doc.text(r[0], x, y, { width: labelW, lineBreak: false });
      doc.text(":", x + labelW, y, { lineBreak: false });
      doc.text(String(r[1]), x + labelW + 8, y, {
        width: rightEdge - (x + labelW + 8),
        lineBreak: false,
      });
    });
  };

  // Helper: gambar garis sel (kotak per kolom) untuk satu baris tabel
  const drawCells = (edges, y, h) => {
    doc.lineWidth(0.6).strokeColor("#9ca3af");
    for (let i = 0; i < edges.length - 1; i++) {
      doc.rect(edges[i], y, edges[i + 1] - edges[i], h).stroke();
    }
  };

  // ===== KOP SURAT =====
  doc
    .fillColor("#000000")
    .fontSize(11)
    .font("Helvetica-Bold")
    .text("UNIVERSITAS ANDALAS", leftX, 50, { align: "center", width: contentW });
  doc
    .fontSize(10)
    .font("Helvetica")
    .text("FAKULTAS TEKNOLOGI INFORMASI", leftX, doc.y, { align: "center", width: contentW })
    .fontSize(9)
    .text("Kampus Unand Limau Manis, Padang", leftX, doc.y, { align: "center", width: contentW });
  doc.moveDown(0.4);

  // Garis pemisah (tebal + tipis)
  const sepY = doc.y;
  doc.lineWidth(2).strokeColor("#000000").moveTo(leftX, sepY).lineTo(pageRight, sepY).stroke();
  doc.lineWidth(0.5).moveTo(leftX, sepY + 3).lineTo(pageRight, sepY + 3).stroke();
  doc.y = sepY + 3;
  doc.moveDown(1);

  // ===== JUDUL DOKUMEN =====
  doc
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("DOKUMEN PERMINTAAN BARANG", leftX, doc.y, { align: "center", width: contentW });
  doc
    .fontSize(11)
    .font("Helvetica")
    .text(`Nomor: ${header.request_number}`, leftX, doc.y, { align: "center", width: contentW });
  doc.moveDown(1.4);

  // ===== INFORMASI HEADER (2 kolom, titik dua presisi) =====
  const tglPermintaan = fmtTgl(header.request_date);
  const tglDibuat = fmtTgl(header.created_at);
  const statusLabel = header.status === "approved" ? "Disetujui" : "Selesai";

  const infoTop = doc.y;
  const lh = 16;

  doc.font("Helvetica-Bold").fontSize(10).fillColor("#000000");
  doc.text("Pemohon", leftX, infoTop, { lineBreak: false });
  doc.text("Informasi Permintaan", rightX, infoTop, { lineBreak: false });

  drawInfoRows(leftX, infoTop + lh, lh, 62, rightX - 15, [
    ["Nama", header.pemohon_name],
    ["NIP", header.pemohon_nip || "-"],
    ["Unit Kerja", header.pemohon_unit || "-"],
  ]);
  drawInfoRows(rightX, infoTop + lh, lh, 112, pageRight + 1, [
    ["Tanggal Permintaan", tglPermintaan],
    ["Tanggal Dibuat", tglDibuat],
    ["Status", statusLabel],
  ]);

  doc.y = infoTop + lh * 4 + 14;

  // ===== TABEL DAFTAR BARANG =====
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("#000000")
    .text("Daftar Barang yang Diminta", leftX, doc.y, { lineBreak: false });
  doc.moveDown(1); // jarak heading -> tabel diperlebar

  // Tepi kolom (7 nilai = 6 kolom): No, Kode, Nama, Spesifikasi, Jumlah, Satuan
  const edges = [50, 85, 150, 320, 435, 485, 545];
  const headerCols = [
    { t: "No", a: "center" },
    { t: "Kode", a: "left" },
    { t: "Nama Barang", a: "left" },
    { t: "Spesifikasi", a: "left" },
    { t: "Jumlah", a: "center" },
    { t: "Satuan", a: "center" },
  ];
  const headerH = 24;
  const rowH = 20;
  let y = doc.y;

  // Header tabel
  doc.rect(leftX, y, contentW, headerH).fill("#e5e7eb");
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(9);
  headerCols.forEach((c, i) => {
    doc.text(c.t, edges[i] + 6, y + 8, {
      width: edges[i + 1] - edges[i] - 12,
      align: c.a,
      lineBreak: false,
    });
  });
  drawCells(edges, y, headerH);
  y += headerH;

  // Body tabel
  doc.font("Helvetica").fontSize(9);
  details.forEach((item, idx) => {
    if (y + rowH > 740) {
      doc.addPage();
      y = 50;
    }

    if (idx % 2 === 1) {
      doc.rect(leftX, y, contentW, rowH).fill("#f9fafb");
    }
    doc.fillColor("#111827");

    const cells = [
      { t: String(idx + 1), a: "center" },
      { t: item.item_code || "-", a: "left" },
      { t: item.item_name || "-", a: "left" },
      { t: item.specification || "-", a: "left" },
      { t: String(item.quantity), a: "center" },
      { t: item.item_unit || "-", a: "center" },
    ];
    cells.forEach((c, i) => {
      doc.text(c.t, edges[i] + 6, y + 6, {
        width: edges[i + 1] - edges[i] - 12,
        align: c.a,
        lineBreak: false,
      });
    });
    drawCells(edges, y, rowH);
    y += rowH;
  });

  // Baris TOTAL (sel No–Spesifikasi di-merge agar garis tak memotong tulisan)
  const totalQty = details.reduce((sum, d) => sum + (d.quantity || 0), 0);
  doc.rect(leftX, y, contentW, rowH).fill("#f3f4f6");
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(9);
  doc.text("TOTAL", edges[0] + 6, y + 6, { width: edges[4] - edges[0] - 12, align: "right" });
  doc.text(String(totalQty), edges[4] + 6, y + 6, {
    width: edges[5] - edges[4] - 12,
    align: "center",
  });
  doc.lineWidth(0.6).strokeColor("#9ca3af");
  doc.rect(edges[0], y, edges[4] - edges[0], rowH).stroke();
  doc.rect(edges[4], y, edges[5] - edges[4], rowH).stroke();
  doc.rect(edges[5], y, edges[6] - edges[5], rowH).stroke();
  y += rowH;

  // ===== TANDA TANGAN =====
  doc.fillColor("#000000").font("Helvetica").fontSize(10);
  const tglApproval = header.approved_at ? fmtTgl(header.approved_at) : tglDibuat;

  let ttdY = y + 35;
  if (ttdY + 130 > 770) {
    doc.addPage();
    ttdY = 60;
  }

  const ttdW = pageRight - rightX; // 185, agar garis bawah nama tak lewat margin
  // Kolom kiri: pemohon
  doc.text("Pemohon,", leftX, ttdY, { width: 230, lineBreak: false });
  // Kolom kanan: approver (rata kanan, ujung teks sejajar garis tabel/545)
  doc.text(`Padang, ${tglApproval}`, rightX, ttdY, { width: ttdW, align: "right", lineBreak: false });
  doc.text("Disetujui oleh,", rightX, ttdY + lh, { width: ttdW, align: "right", lineBreak: false });

  const nameY = ttdY + 85;
  doc.font("Helvetica-Bold").text(header.pemohon_name, leftX, nameY, {
    width: 230,
    underline: true,
    lineBreak: false,
  });
  doc.font("Helvetica").text(`NIP. ${header.pemohon_nip || "-"}`, leftX, nameY + 15, {
    width: 230,
    lineBreak: false,
  });

  const approverName = header.approver_name || "Admin Logistik";
  doc.font("Helvetica-Bold").text(approverName, rightX, nameY, {
    width: ttdW,
    align: "right",
    underline: true,
    lineBreak: false,
  });
  if (header.approver_name) {
    doc.font("Helvetica").text(`NIP. ${header.approver_nip || "-"}`, rightX, nameY + 15, {
      width: ttdW,
      align: "right",
      lineBreak: false,
    });
  }

  // ===== FOOTER (di dalam margin agar tetap 1 halaman) =====
  doc
    .font("Helvetica-Oblique")
    .fontSize(8)
    .fillColor("#6b7280")
    .text(
      `Dokumen ini dicetak pada ${new Date().toLocaleString("id-ID")} dari FTI Sistem Logistik`,
      leftX,
      775,
      { align: "center", width: contentW }
    );
}