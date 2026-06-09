// =====================================================================
// Routes: API JSON endpoints
// Prefix URL: /api
// Convention: semua endpoint di sini return JSON (bukan HTML)
// =====================================================================

const express = require("express");
const router = express.Router();

const apiController = require("../controllers/apiController");
const {
  apiIsAuthenticated,
  apiRequireRole,
  apiRequireEmployeeProfile,
} = require("../middlewares/apiAuth");

// Middleware chain khusus untuk API pegawai
const pegawaiApiAccess = [
  apiIsAuthenticated,
  apiRequireRole("pegawai"),
  apiRequireEmployeeProfile,
];

// Middleware chain untuk API admin logistik
const adminApiAccess = [
  apiIsAuthenticated,
  apiRequireRole("admin_logistik"),
  apiRequireEmployeeProfile,
];

// =====================================================================
// API ENDPOINTS - PERMINTAAN BARANG
// =====================================================================

// GET /api/permintaan -> daftar permintaan milik pegawai (JSON)
router.get("/permintaan", pegawaiApiAccess, apiController.listPermintaan);

// GET /api/admin/permintaan -> daftar SEMUA permintaan (JSON)
router.get("/admin/permintaan", adminApiAccess, apiController.adminListPermintaan);

// GET /api/admin/permintaan/:id/spb -> Generate SPB (JSON metadata + PDF stream)
router.get("/admin/permintaan/:id/spb", adminApiAccess, apiController.adminCetakSPB);

// =====================================================================
// FALLBACK: kalau endpoint tidak ditemukan, return JSON 404
// (bukan render HTML error.ejs)
// =====================================================================
router.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan`,
    },
  });
});

module.exports = router;