// =====================================================================
// Middleware: Auth & ACL untuk API endpoints
//
// Perbedaan dengan middlewares/auth.js dan middlewares/role.js:
//   - Versi HTML: kalau gagal -> redirect ke /login atau render error.ejs
//   - Versi API : kalau gagal -> return JSON {success:false, error:{...}}
//
// Konvensi response error:
//   401 = Unauthorized   (belum login)
//   403 = Forbidden      (login OK tapi tidak punya hak akses)
// =====================================================================

/*
 Cek user sudah login.
 Kalau belum, return JSON 401.
 */
function apiIsAuthenticated(req, res, next) {
  if (req.session.userId) {
    return next();
  }
  return res.status(401).json({
    success: false,
    error: {
      code: "UNAUTHORIZED",
      message: "Anda harus login terlebih dahulu",
    },
  });
}

/**
 Cek user punya salah satu role yang dibolehkan.
 Pakai setelah apiIsAuthenticated.
 Contoh: apiRequireRole('pegawai')
 apiRequireRole('admin', 'admin_logistik')
 */
function apiRequireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Anda harus login terlebih dahulu",
        },
      });
    }

    if (!roles.includes(req.session.userRole)) {
      return res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Anda tidak memiliki akses ke endpoint ini",
          required_roles: roles,
        },
      });
    }

    next();
  };
}

/*
 Pastikan user punya record di tabel employees.
 Tanpa ini, query yang butuh employee_id akan gagal.
 */
function apiRequireEmployeeProfile(req, res, next) {
  if (!req.session.employeeId) {
    return res.status(403).json({
      success: false,
      error: {
        code: "NO_EMPLOYEE_PROFILE",
        message: "Akun Anda belum terhubung ke profil pegawai",
      },
    });
  }
  next();
}

module.exports = {
  apiIsAuthenticated,
  apiRequireRole,
  apiRequireEmployeeProfile,
};