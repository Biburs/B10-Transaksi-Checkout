// =====================================================================
// Controller: API JSON endpoints
// Berisi handler untuk endpoint API yang return JSON
//
// Konvensi response sukses:
//   {
//     "success": true,
//     "data": [...],
//     "pagination": {...},  (kalau pagination)
//     "filters": {...}      (kalau ada filter aktif)
//   }
//
// Konvensi response error:
//   {
//     "success": false,
//     "error": { "code": "XXX", "message": "..." }
//   }
// =====================================================================

const db = require("../lib/db");

// ---------------------------------------------------------------------
// GET /api/permintaan
// Daftar permintaan milik pegawai yang login (dalam format JSON).
// Mendukung pagination, search, dan filter status.
//
// Query params:
//   ?page=1          (default 1)
//   ?perPage=10      (default 10, max 100)
//   ?search=         (cari di request_number atau nama item)
//   ?status=         (pending|approved|rejected|fulfilled|cancelled|"")
// ---------------------------------------------------------------------
exports.listPermintaan = async (req, res) => {
  const employeeId = req.session.employeeId;

  // ----- Parse & sanitize query params -----
  let page = parseInt(req.query.page, 10);
  if (isNaN(page) || page < 1) page = 1;

  let perPage = parseInt(req.query.perPage, 10);
  if (isNaN(perPage) || perPage < 1) perPage = 10;
  if (perPage > 100) perPage = 100; // hard cap untuk cegah abuse

  const search = (req.query.search || "").trim();
  const status = (req.query.status || "").trim();

  // Validasi status (whitelist)
  const VALID_STATUSES = [
    "pending",
    "approved",
    "rejected",
    "fulfilled",
    "cancelled",
  ];
  const statusFilter = VALID_STATUSES.includes(status) ? status : "";

  try {
    // ----- Susun WHERE clause -----
    const whereClauses = ["ir.employee_id = ?"];
    const params = [employeeId];

    if (statusFilter) {
      whereClauses.push("ir.status = ?");
      params.push(statusFilter);
    }

    if (search) {
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

    // ----- Hitung total -----
    const [countRows] = await db.query(
      `SELECT COUNT(*) AS total
       FROM inventory_requests ir
       WHERE ${whereSql}`,
      params
    );
    const totalRecords = countRows[0].total;
    const totalPages = Math.max(1, Math.ceil(totalRecords / perPage));

    if (page > totalPages) page = totalPages;
    const offset = (page - 1) * perPage;

    // ----- Ambil data -----
    const [rows] = await db.query(
      `SELECT 
         ir.id,
         ir.request_number,
         ir.request_date,
         ir.status,
         ir.created_at,
         ir.updated_at,
         COUNT(ird.id) AS total_items,
         COALESCE(SUM(ird.quantity), 0) AS total_quantity
       FROM inventory_requests ir
       LEFT JOIN inventory_request_details ird 
         ON ird.inventory_request_id = ir.id
       WHERE ${whereSql}
       GROUP BY ir.id, ir.request_number, ir.request_date, ir.status, ir.created_at, ir.updated_at
       ORDER BY ir.created_at DESC
       LIMIT ${parseInt(perPage, 10)} OFFSET ${parseInt(offset, 10)}`,
      params
    );

    // ----- Format data untuk response (konsisten + bersih) -----
    const data = rows.map((r) => ({
      id: r.id,
      request_number: r.request_number,
      request_date: r.request_date, // YYYY-MM-DD
      status: r.status,
      total_items: r.total_items,
      total_quantity: r.total_quantity,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    // ----- Response JSON -----
    return res.json({
      success: true,
      data: data,
      pagination: {
        page: page,
        perPage: perPage,
        total: totalRecords,
        totalPages: totalPages,
      },
      filters: {
        search: search || null,
        status: statusFilter || null,
      },
    });
  } catch (err) {
    console.error("API Error - listPermintaan:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Terjadi kesalahan internal pada server",
      },
    });
  }
};