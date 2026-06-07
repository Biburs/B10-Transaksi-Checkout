// =====================================================================
// Middleware: Role-based Access Control
// Helper untuk membatasi akses route berdasarkan role user.
// Dipakai bersama dengan isAuthenticated dari middlewares/auth.js
// =====================================================================

/**
 * Batasi akses route ke role tertentu.
 * Contoh pemakaian:
 *   router.get('/baru', isAuthenticated, requireRole('pegawai'), handler);
 *   router.get('/admin', isAuthenticated, requireRole('admin', 'admin_logistik'), handler);
 */
function requireRole(...roles) {
  return (req, res, next) => {
    // Belum login -> redirect (defense-in-depth, idealnya isAuthenticated jalan duluan)
    if (!req.session.userId) {
      return res.redirect("/login");
    }

    // Role tidak cocok -> 403 Forbidden
    if (!roles.includes(req.session.userRole)) {
      return res.status(403).render("error", {
        message: "Anda tidak memiliki akses ke halaman ini",
        error: { status: 403, stack: "" },
      });
    }

    next();
  };
}

/**
 * Pastikan user punya record di tabel `employees`.
 * Tanpa ini, INSERT ke inventory_requests akan gagal (FK constraint).
 * Dipakai khusus untuk fitur yang butuh employeeId.
 */
function requireEmployeeProfile(req, res, next) {
  if (!req.session.employeeId) {
    return res.status(403).render("error", {
      message:
        "Akun Anda belum terhubung ke profil pegawai. Silakan hubungi administrator.",
      error: { status: 403, stack: "" },
    });
  }
  next();
}

module.exports = {
  requireRole,
  requireEmployeeProfile,
};