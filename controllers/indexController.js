const bcrypt = require("bcryptjs");
const db = require("../lib/db");

// Harus konsisten dengan middlewares/acl.js dan scripts/seed_login.js
const MODEL_TYPE = "App\\Models\\User";

/**
 * GET /
 * Root: arahkan ke /home jika sudah login, ke /login jika belum.
 */
const index = (req, res) => {
  if (req.session.userId) return res.redirect("/home");
  return res.redirect("/login");
};

/**
 * GET /login
 * Tampilkan form login (kalau sudah login, redirect ke /home).
 */
const loginPage = (req, res) => {
  if (req.session.userId) {
    return res.redirect("/home");
  }
  res.render("login", { title: "Login", error: null });
};

/**
 * POST /login
 * Proses login + simpan userId, userName, userEmail, userRole, employeeId ke session.
 *
 * Catatan: kita ambil role saat login (sekali) lalu simpan ke session,
 *          supaya tidak query roles di setiap request.
 */
const login = async (req, res, next) => {
  const { email, password } = req.body;

  // 1. Validasi server-side
  if (!email || !password) {
    return res.render("login", {
      title: "Login",
      error: "Email dan password wajib diisi",
    });
  }

  try {
    // 2. Cari user berdasarkan email (prepared statement -> aman SQL injection)
    const [rows] = await db.query(
      "SELECT id, name, email, password FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    if (rows.length === 0) {
      return res.render("login", {
        title: "Login",
        error: "Email atau password salah",
      });
    }

    const user = rows[0];

    // 3. Bandingkan password dengan hash bcrypt
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.render("login", {
        title: "Login",
        error: "Email atau password salah",
      });
    }

    // 4. Ambil role user (pakai role pertama jika ada banyak)
    //    JOIN: model_has_roles -> roles
    const [roleRows] = await db.query(
      `SELECT r.name AS role_name
       FROM roles r
       JOIN model_has_roles mhr ON r.id = mhr.role_id
       WHERE mhr.model_id = ? AND mhr.model_type = ?
       LIMIT 1`,
      [user.id, MODEL_TYPE]
    );
    const userRole = roleRows.length > 0 ? roleRows[0].role_name : null;

    // 5. Ambil employee_id (employees.id 1:1 dengan users.id)
    //    Jika user belum punya record di employees, employeeId = null
    const [empRows] = await db.query(
      "SELECT id FROM employees WHERE id = ? LIMIT 1",
      [user.id]
    );
    const employeeId = empRows.length > 0 ? empRows[0].id : null;

    // 6. Simpan data ke session
    req.session.userId = user.id;
    req.session.userName = user.name;
    req.session.userEmail = user.email;
    req.session.userRole = userRole;
    req.session.employeeId = employeeId;

    // 7. Pastikan session tersimpan ke DB SEBELUM redirect
    return req.session.save((err) => {
      if (err) return next(err);
      return res.redirect("/home");
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /home
 * Dashboard utama:
 *   - Untuk pegawai: statistik & permintaan terakhir milik dirinya sendiri
 *   - Untuk admin/admin_logistik: statistik & permintaan terakhir SEMUA pegawai
 */
const home = async (req, res, next) => {
  const userRole = req.session.userRole || "pegawai";
  const employeeId = req.session.employeeId;

  try {
    // ===== Query 1: Statistik per status =====
    // Default stats (kalau tidak ada data, semua 0)
    const stats = {
      pending: 0,
      approved: 0,
      rejected: 0,
      fulfilled: 0,
      cancelled: 0,
    };

    let statsQuery;
    let statsParams;

    if (userRole === "pegawai") {
      // Pegawai: cuma lihat permintaan miliknya
      statsQuery = `
        SELECT status, COUNT(*) AS total
        FROM inventory_requests
        WHERE employee_id = ?
        GROUP BY status
      `;
      statsParams = [employeeId];
    } else {
      // Admin: lihat semua permintaan
      statsQuery = `
        SELECT status, COUNT(*) AS total
        FROM inventory_requests
        GROUP BY status
      `;
      statsParams = [];
    }

    // Kalau employeeId null (mis. akun seeder tanpa record employees),
    // skip query stats agar tidak error
    if (userRole === "pegawai" && !employeeId) {
      // biarkan stats default = 0
    } else {
      const [statsRows] = await db.query(statsQuery, statsParams);
      statsRows.forEach((row) => {
        if (stats.hasOwnProperty(row.status)) {
          stats[row.status] = row.total;
        }
      });
    }

    // ===== Query 2: 5 permintaan terakhir =====
    let recentRequests = [];

    let recentQuery;
    let recentParams;

    if (userRole === "pegawai") {
      recentQuery = `
        SELECT 
          ir.id,
          ir.request_number,
          ir.request_date,
          ir.status,
          COUNT(ird.id) AS total_items
        FROM inventory_requests ir
        LEFT JOIN inventory_request_details ird ON ir.id = ird.inventory_request_id
        WHERE ir.employee_id = ?
        GROUP BY ir.id, ir.request_number, ir.request_date, ir.status
        ORDER BY ir.created_at DESC
        LIMIT 5
      `;
      recentParams = [employeeId];
    } else {
      recentQuery = `
        SELECT 
          ir.id,
          ir.request_number,
          ir.request_date,
          ir.status,
          COUNT(ird.id) AS total_items
        FROM inventory_requests ir
        LEFT JOIN inventory_request_details ird ON ir.id = ird.inventory_request_id
        GROUP BY ir.id, ir.request_number, ir.request_date, ir.status
        ORDER BY ir.created_at DESC
        LIMIT 5
      `;
      recentParams = [];
    }

    if (userRole === "pegawai" && !employeeId) {
      // skip - biarkan kosong
    } else {
      const [recentRows] = await db.query(recentQuery, recentParams);
      recentRequests = recentRows;
    }

    // ===== Render =====
    res.render("home", {
      title: "Dashboard",
      user: req.session.userName,
      userRole: userRole,
      stats: stats,
      recentRequests: recentRequests,
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /logout
 * Hapus session + redirect ke /login.
 */
const logout = (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie("session_cookie_name");
    res.redirect("/login");
  });
};

module.exports = {
  index,
  home,
  loginPage,
  login,
  logout,
};
