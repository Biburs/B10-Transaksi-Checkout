const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const adminPermintaanController = require("../controllers/adminPermintaanController");
const { isAuthenticated } = require("../middlewares/auth");
const { requireRole, requireEmployeeProfile } = require("../middlewares/role");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, "../public/uploads/receipts");
    if (!fs.existsSync(dir)){
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const requestId = req.params.id;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `receipt_${requestId}${ext}`);
  }
});
const upload = multer({ storage: storage });

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

// New Routes
router.post("/:id/approve", adminAccess, adminPermintaanController.approvePermintaan);
router.post("/:id/reject", adminAccess, adminPermintaanController.rejectPermintaan);
router.post("/:id/cancel-decision", adminAccess, adminPermintaanController.cancelDecision);
router.post("/:id/complete", adminAccess, adminPermintaanController.completePermintaan);
router.post("/:id/receipt", adminAccess, upload.single("receipt_file"), adminPermintaanController.uploadReceipt);
router.get("/:id/spb", adminAccess, adminPermintaanController.cetakSuratPenyerahanBarang);

module.exports = router;