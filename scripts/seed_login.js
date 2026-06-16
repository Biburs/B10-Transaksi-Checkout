// Jalankan sekali dengan: node scripts/seed_login.js
const db = require("../lib/db");
const bcrypt = require("bcryptjs");

const MODEL_TYPE = "App\\Models\\User";

// Helper: cari id kalau sudah ada, kalau belum insert (anti-duplikat)
async function ensureRole(name) {
  const [exist] = await db.query(
    "SELECT id FROM roles WHERE name = ? AND guard_name = ? LIMIT 1",
    [name, "web"]
  );
  if (exist.length > 0) return exist[0].id;

  const [res] = await db.query(
    `INSERT INTO roles (name, guard_name, created_at, updated_at)
     VALUES (?, 'web', NOW(), NOW())`,
    [name]
  );
  return res.insertId;
}

async function ensurePermission(name) {
  const [exist] = await db.query(
    "SELECT id FROM permissions WHERE name = ? AND guard_name = ? LIMIT 1",
    [name, "web"]
  );
  if (exist.length > 0) return exist[0].id;

  const [res] = await db.query(
    `INSERT INTO permissions (name, guard_name, created_at, updated_at)
     VALUES (?, 'web', NOW(), NOW())`,
    [name]
  );
  return res.insertId;
}

async function ensureUser(name, email, plainPassword) {
  const [exist] = await db.query(
    "SELECT id FROM users WHERE email = ? LIMIT 1",
    [email]
  );
  if (exist.length > 0) return exist[0].id;

  // Password di-hash dengan bcrypt sebelum disimpan
  const hashed = await bcrypt.hash(plainPassword, 10);
  const [res] = await db.query(
    `INSERT INTO users (name, email, password, created_at, updated_at)
     VALUES (?, ?, ?, NOW(), NOW())`,
    [name, email, hashed]
  );
  return res.insertId;
}

async function assignRole(userId, roleId) {
  // INSERT IGNORE supaya aman kalau seeder dijalankan ulang
  await db.query(
    `INSERT IGNORE INTO model_has_roles (role_id, model_type, model_id)
     VALUES (?, ?, ?)`,
    [roleId, MODEL_TYPE, userId]
  );
}

async function givePermissionToRole(roleId, permissionId) {
  await db.query(
    `INSERT IGNORE INTO role_has_permissions (permission_id, role_id)
     VALUES (?, ?)`,
    [permissionId, roleId]
  );
}

async function seed() {
  try {
    console.log("\n=== SEED LOGIN (ROLES, USERS, PERMISSIONS) ===\n");

    // 1. Buat 2 role
    const adminLogistikRoleId = await ensureRole("admin_logistik");
    const pegawaiRoleId = await ensureRole("pegawai");
    console.log(
      "✓ Role: admin_logistik =", adminLogistikRoleId,
      ", pegawai =", pegawaiRoleId
    );

    // 2. Siapkan permission yang dipakai
    const manageUsersId = await ensurePermission("manage_users");
    const viewDashboardId = await ensurePermission("view_dashboard");
    console.log("✓ Permission disiapkan");

   // 3. Buat 3 user (email & password sesuai kebutuhan project)
    const adminLogistikUserId = await ensureUser(
      "Admin Logistik",
      "admin@gmail.com",
      "admin123"
    );
    const pegawaiUserId = await ensureUser(
      "Pegawai Satu",
      "pegawai@gmail.com",
      "pegawai123"
    );
    const pegawai2UserId = await ensureUser(
      "Pegawai Dua",
      "pegawai2@gmail.com",
      "pegawai123"
    );
    console.log(
      "✓ User: admin_logistik =", adminLogistikUserId,
      ", pegawai =", pegawaiUserId,
      ", pegawai2 =", pegawai2UserId
    );

    // 4. Hubungkan user -> role
    await assignRole(adminLogistikUserId, adminLogistikRoleId);
    await assignRole(pegawaiUserId, pegawaiRoleId);
    await assignRole(pegawai2UserId, pegawaiRoleId);
    console.log("✓ User dihubungkan ke role masing-masing");

    // 5. Atur permission per role
    //    admin_logistik: kelola user + lihat dashboard
    await givePermissionToRole(adminLogistikRoleId, manageUsersId);
    await givePermissionToRole(adminLogistikRoleId, viewDashboardId);
    //    pegawai: hanya lihat dashboard
    await givePermissionToRole(pegawaiRoleId, viewDashboardId);
    console.log("✓ Permission tiap role diatur");

    console.log("\n=== SELESAI ===");
    console.log("Akun admin logistik -> admin@gmail.com    / admin123");
    console.log("Akun pegawai 1      -> pegawai@gmail.com  / pegawai123");
    console.log("Akun pegawai 2      -> pegawai2@gmail.com / pegawai123");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Error seeding login:", err);
    process.exit(1);
  }
}

seed();
