const express = require("express");
const router = express.Router();

const permintaanController = require("../controllers/permintaanController");
const { isAuthenticated } = require("../middlewares/auth");
const { requireRole, requireEmployeeProfile } = require("../middlewares/role");

const pegawaiAccess = [
  isAuthenticated,
  requireRole("pegawai"),
  requireEmployeeProfile,
];

// GET /permintaan -> daftar permintaan milik pegawai
router.get("/", pegawaiAccess, permintaanController.listPermintaan);

// GET /permintaan/baru -> tampilkan form
router.get("/baru", pegawaiAccess, permintaanController.formBaru);

// POST /permintaan/baru -> proses simpan
router.post("/baru", pegawaiAccess, permintaanController.createPermintaan);

// GET /permintaan/:id/edit -> tampilkan form edit
router.get("/:id/edit", pegawaiAccess, permintaanController.formEdit);

// POST /permintaan/:id/edit -> proses update
router.post("/:id/edit", pegawaiAccess, permintaanController.updatePermintaan);

// POST /permintaan/:id/batal -> batalkan permintaan
router.post("/:id/batal", pegawaiAccess, permintaanController.cancelPermintaan);

// GET /permintaan/:id/cetak -> generate & download PDF
router.get("/:id/cetak", pegawaiAccess, permintaanController.cetakPDF);

// GET /permintaan/:id -> tampilkan detail (HARUS PALING TERAKHIR)
router.get("/:id", pegawaiAccess, permintaanController.detailPermintaan);

module.exports = router;