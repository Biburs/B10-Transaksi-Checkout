const db = require("../lib/db");
const PDFDocument = require("pdfkit");

// ---------------------------------------------------------------------
// GET /admin/permintaan
// ---------------------------------------------------------------------
exports.listSemuaPermintaan = async (req, res, next) => {
  const PER_PAGE = 10;
  let page = parseInt(req.query.page, 10);
  if (isNaN(page) || page < 1) page = 1;

  const search = (req.query.search || "").trim();
  const status = (req.query.status || "").trim();

  const VALID_STATUSES = ["pending", "approved", "rejected", "fulfilled", "cancelled"];
  const statusFilter = VALID_STATUSES.includes(status) ? status : "";

  try {
    const whereClauses = ["1=1"]; // Admin sees all
    const params = [];

    if (statusFilter) {
      whereClauses.push("ir.status = ?");
      params.push(statusFilter);
    }

    if (search) {
      whereClauses.push(`(
        ir.request_number LIKE ? 
        OR e.name LIKE ?
        OR EXISTS (
          SELECT 1 FROM inventory_request_details ird2 
          WHERE ird2.inventory_request_id = ir.id 
          AND ird2.item_name LIKE ?
        )
      )`);
      const likePattern = `%${search}%`;
      params.push(likePattern, likePattern, likePattern);
    }

    const whereSql = whereClauses.join(" AND ");

    const [countRows] = await db.query(
      `SELECT COUNT(*) AS total
       FROM inventory_requests ir
       JOIN employees e ON e.id = ir.employee_id
       WHERE ${whereSql}`,
      params
    );
    const totalRecords = countRows[0].total;
    const totalPages = Math.max(1, Math.ceil(totalRecords / PER_PAGE));

    if (page > totalPages) page = totalPages;
    const offset = (page - 1) * PER_PAGE;

    const [rows] = await db.query(
      `SELECT 
         ir.id,
         ir.request_number,
         ir.request_date,
         ir.status,
         ir.created_at,
         e.name AS pemohon_name,
         ou.name AS pemohon_unit,
         COUNT(ird.id) AS total_items,
         COALESCE(SUM(ird.quantity), 0) AS total_quantity
       FROM inventory_requests ir
       JOIN employees e ON e.id = ir.employee_id
       LEFT JOIN organization_units ou ON ou.id = e.organization_unit_id
       LEFT JOIN inventory_request_details ird ON ird.inventory_request_id = ir.id
       WHERE ${whereSql}
       GROUP BY ir.id, ir.request_number, ir.request_date, ir.status, ir.created_at, e.name, ou.name
       ORDER BY ir.created_at DESC
       LIMIT ${parseInt(PER_PAGE, 10)} OFFSET ${parseInt(offset, 10)}`,
      params
    );

    res.render("admin/permintaan/list", {
      title: "Semua Permintaan Masuk",
      user: req.session.userName,
      userRole: req.session.userRole,
      requests: rows,
      currentPage: page,
      totalPages: totalPages,
      totalRecords: totalRecords,
      perPage: PER_PAGE,
      search: search,
      status: statusFilter,
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------
// GET /admin/permintaan/:id
// ---------------------------------------------------------------------
exports.detailPermintaan = async (req, res, next) => {
  const requestId = parseInt(req.params.id, 10);
  if (isNaN(requestId) || requestId < 1) {
    return res.status(404).render("error", {
      message: "Permintaan tidak ditemukan",
      error: { status: 404, stack: "" },
    });
  }

  try {
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
       WHERE ir.id = ?
       LIMIT 1`,
      [requestId]
    );

    if (headerRows.length === 0) {
      return res.status(404).render("error", {
        message: "Permintaan tidak ditemukan",
        error: { status: 404, stack: "" },
      });
    }

    const header = headerRows[0];

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

    const totalQuantity = detailRows.reduce((sum, d) => sum + (d.quantity || 0), 0);

    res.render("admin/permintaan/detail", {
      title: `Detail ${header.request_number}`,
      user: req.session.userName,
      userRole: req.session.userRole,
      header: header,
      details: detailRows,
      approvals: approvalRows,
      totalItems: detailRows.length,
      totalQuantity: totalQuantity,
      approved: req.query.approved === "1",
      rejected: req.query.rejected === "1",
    });
  } catch (err) {
    next(err);
  }
};



// ---------------------------------------------------------------------
// GET /admin/permintaan/:id/cetak
// ---------------------------------------------------------------------
exports.cetakSuratKeputusan = async (req, res, next) => {
  const requestId = parseInt(req.params.id, 10);
  if (isNaN(requestId) || requestId < 1) {
    return res.status(404).render("error", {
      message: "Permintaan tidak ditemukan",
      error: { status: 404, stack: "" },
    });
  }

  try {
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
       WHERE ir.id = ?
       LIMIT 1`,
      [requestId]
    );

    if (headerRows.length === 0) {
      return res.status(404).render("error", {
        message: "Permintaan tidak ditemukan",
        error: { status: 404, stack: "" },
      });
    }

    const header = headerRows[0];

    const CETAK_ALLOWED_STATUSES = ["approved", "rejected", "fulfilled"];
    if (!CETAK_ALLOWED_STATUSES.includes(header.status)) {
      return res.status(403).render("error", {
        message: `Permintaan dengan status "${header.status}" belum dapat dicetak.`,
        error: { status: 403, stack: "" },
      });
    }

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

    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      info: {
        Title: `Surat Keputusan Permintaan Barang ${header.request_number}`,
        Author: "FTI Sistem Logistik",
        Subject: "Surat Keputusan Permintaan Barang",
      },
    });

    const statusTitle = header.status === "rejected" ? "PENOLAKAN" : "PERSETUJUAN";
    const filename = `SK_${statusTitle}_${header.request_number}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    doc.pipe(res);

    renderPdfSuratKeputusan(doc, header, details, statusTitle);

    doc.end();
  } catch (err) {
    next(err);
  }
};

function renderPdfSuratKeputusan(doc, header, details, statusTitle) {
  const leftX = 50;
  const rightX = 360;
  const pageRight = 545;
  const contentW = pageRight - leftX;

  const fmtTgl = (d) =>
    new Date(d).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

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

  const drawCells = (edges, y, h) => {
    doc.lineWidth(0.6).strokeColor("#9ca3af");
    for (let i = 0; i < edges.length - 1; i++) {
      doc.rect(edges[i], y, edges[i + 1] - edges[i], h).stroke();
    }
  };

  doc.fillColor("#000000").fontSize(11).font("Helvetica-Bold")
     .text("UNIVERSITAS ANDALAS", leftX, 50, { align: "center", width: contentW });
  doc.fontSize(10).font("Helvetica")
     .text("FAKULTAS TEKNOLOGI INFORMASI", leftX, doc.y, { align: "center", width: contentW })
     .fontSize(9).text("Kampus Unand Limau Manis, Padang", leftX, doc.y, { align: "center", width: contentW });
  doc.moveDown(0.4);

  const sepY = doc.y;
  doc.lineWidth(2).strokeColor("#000000").moveTo(leftX, sepY).lineTo(pageRight, sepY).stroke();
  doc.lineWidth(0.5).moveTo(leftX, sepY + 3).lineTo(pageRight, sepY + 3).stroke();
  doc.y = sepY + 3;
  doc.moveDown(1);

  doc.fontSize(14).font("Helvetica-Bold")
     .text(`SURAT KEPUTUSAN ${statusTitle}`, leftX, doc.y, { align: "center", width: contentW });
  doc.fontSize(11).font("Helvetica")
     .text(`Nomor Permintaan: ${header.request_number}`, leftX, doc.y, { align: "center", width: contentW });
  doc.moveDown(1.4);

  const tglPermintaan = fmtTgl(header.request_date);
  const infoTop = doc.y;
  const lh = 16;

  doc.font("Helvetica-Bold").fontSize(10).fillColor("#000000");
  doc.text("Data Pemohon:", leftX, infoTop, { lineBreak: false });

  drawInfoRows(leftX, infoTop + lh, lh, 62, rightX - 15, [
    ["Nama", header.pemohon_name],
    ["NIP", header.pemohon_nip || "-"],
    ["Unit Kerja", header.pemohon_unit || "-"],
    ["Tanggal", tglPermintaan],
  ]);

  doc.y = infoTop + lh * 5 + 14;

  let textDecision = statusTitle === "PENOLAKAN" 
    ? "Berdasarkan evaluasi, permintaan barang tersebut dinyatakan DITOLAK."
    : "Berdasarkan evaluasi, permintaan barang tersebut dinyatakan DISETUJUI.";

  doc.font("Helvetica").fontSize(10).text(textDecision, leftX, doc.y, { align: "left" });
  doc.moveDown(1);

  doc.font("Helvetica-Bold").fontSize(11).fillColor("#000000")
     .text("Daftar Barang:", leftX, doc.y, { lineBreak: false });
  doc.moveDown(1);

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

  doc.rect(leftX, y, contentW, headerH).fill("#e5e7eb");
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(9);
  headerCols.forEach((c, i) => {
    doc.text(c.t, edges[i] + 6, y + 8, { width: edges[i + 1] - edges[i] - 12, align: c.a, lineBreak: false });
  });
  drawCells(edges, y, headerH);
  y += headerH;

  doc.font("Helvetica").fontSize(9);
  details.forEach((item, idx) => {
    if (y + rowH > 740) { doc.addPage(); y = 50; }
    if (idx % 2 === 1) doc.rect(leftX, y, contentW, rowH).fill("#f9fafb");
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
      doc.text(c.t, edges[i] + 6, y + 6, { width: edges[i + 1] - edges[i] - 12, align: c.a, lineBreak: false });
    });
    drawCells(edges, y, rowH);
    y += rowH;
  });

  const totalQty = details.reduce((sum, d) => sum + (d.quantity || 0), 0);
  doc.rect(leftX, y, contentW, rowH).fill("#f3f4f6");
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(9);
  doc.text("TOTAL", edges[0] + 6, y + 6, { width: edges[4] - edges[0] - 12, align: "right" });
  doc.text(String(totalQty), edges[4] + 6, y + 6, { width: edges[5] - edges[4] - 12, align: "center" });
  doc.lineWidth(0.6).strokeColor("#9ca3af");
  doc.rect(edges[0], y, edges[4] - edges[0], rowH).stroke();
  doc.rect(edges[4], y, edges[5] - edges[4], rowH).stroke();
  doc.rect(edges[5], y, edges[6] - edges[5], rowH).stroke();
  y += rowH;

  doc.fillColor("#000000").font("Helvetica").fontSize(10);
  const tglApproval = header.approved_at ? fmtTgl(header.approved_at) : fmtTgl(new Date());

  let ttdY = y + 35;
  if (ttdY + 130 > 770) { doc.addPage(); ttdY = 60; }

  const ttdW = pageRight - rightX;
  doc.text(`Padang, ${tglApproval}`, rightX, ttdY, { width: ttdW, align: "right", lineBreak: false });
  doc.text("Admin Logistik,", rightX, ttdY + lh, { width: ttdW, align: "right", lineBreak: false });

  const nameY = ttdY + 85;
  const approverName = header.approver_name || "Admin Logistik";
  doc.font("Helvetica-Bold").text(approverName, rightX, nameY, { width: ttdW, align: "right", underline: true, lineBreak: false });
  if (header.approver_name) {
    doc.font("Helvetica").text(`NIP. ${header.approver_nip || "-"}`, rightX, nameY + 15, { width: ttdW, align: "right", lineBreak: false });
  }

  doc.font("Helvetica-Oblique").fontSize(8).fillColor("#6b7280")
     .text(`Dokumen ini dicetak pada ${new Date().toLocaleString("id-ID")} dari FTI Sistem Logistik`, leftX, 775, { align: "center", width: contentW });
}
