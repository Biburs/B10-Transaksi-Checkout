const express = require("express");
const router = express.Router();

const adminPermintaanController = require("../controllers/adminPermintaanController");
const { isAuthenticated } = require("../middlewares/auth");
const { requireRole, requireEmployeeProfile } = require("../middlewares/role");

// Middleware chain: hanya admin_logistik yang boleh akses
const adminAccess = [
  isAuthenticated,
  requireRole("admin_logistik"),
  requireEmployeeProfile,
];

// GET /admin/permintaan -> daftar semua permintaan
router.get("/", adminAccess, adminPermintaanController.listSemuaPermintaan);

// GET /admin/permintaan/:id/cetak -> cetak surat keputusan (PDF)
router.get("/:id/cetak", adminAccess, adminPermintaanController.cetakSuratKeputusan);

// GET /admin/permintaan/:id -> detail permintaan (HARUS PALING BAWAH)
router.get("/:id", adminAccess, adminPermintaanController.detailPermintaan);

module.exports = router;