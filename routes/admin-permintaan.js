const express = require("express");
const router = express.Router();

const adminPermintaanController = require("../controllers/adminPermintaanController");
const { isAuthenticated } = require("../middlewares/auth");
const { requireRole, requireEmployeeProfile } = require("../middlewares/role");

// Admin Logistik (or Admin) can access this
const adminAccess = [
  isAuthenticated,
  (req, res, next) => {
    // Both 'admin' and 'admin_logistik' should be able to manage this
    if (req.session.userRole === "admin_logistik" || req.session.userRole === "admin") {
      return next();
    }
    return res.status(403).render("error", {
      message: "Anda tidak memiliki akses ke halaman ini (Hanya Admin Logistik)",
      error: { status: 403, stack: "" },
    });
  },
  requireEmployeeProfile,
];

// GET /admin/permintaan -> daftar semua permintaan
router.get("/", adminAccess, adminPermintaanController.listSemuaPermintaan);

// GET /admin/permintaan/:id/cetak -> cetak surat keputusan (PDF)
router.get("/:id/cetak", adminAccess, adminPermintaanController.cetakSuratKeputusan);

// GET /admin/permintaan/:id -> detail permintaan (HARUS PALING BAWAH)
router.get("/:id", adminAccess, adminPermintaanController.detailPermintaan);

module.exports = router;
