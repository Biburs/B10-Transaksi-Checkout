// =====================================================================
// SEEDER: Data Master Kepegawaian (HR Domain)
// Jalankan setelah scripts/seed_login.js:
//     node scripts/seed_data.js
//
// Tabel yang di-seed:
//   1. organization_units    - 3 baris (FTI + 2 jurusan)
//   2. employment_statuses   - 3 baris (PNS, Honorer, Kontrak)
//   3. employees             - 2 baris (profil untuk admin & pegawai)
//
// CATATAN:
//   - Seed `items` dan `inventories` ada di scripts/seed_items.js (terpisah)
//   - Sifat: idempotent - aman dijalankan berkali-kali
// =====================================================================

const db = require("../lib/db");

// ---------- Helper organization_units ----------
// Catatan: kolom organization_unit_id NOT NULL (redundant akibat migrasi Laravel),
// di-handle dengan UPDATE self-reference setelah INSERT.
async function ensureOrgUnit({ name, code, type, parentId = null, description = null }) {
  const [exist] = await db.query(
    "SELECT id FROM organization_units WHERE code = ? LIMIT 1",
    [code]
  );
  if (exist.length > 0) return exist[0].id;

  // Insert dengan placeholder 0 untuk organization_unit_id, lalu update self-reference
  const [res] = await db.query(
    `INSERT INTO organization_units
     (name, code, parent_id, type, description, organization_unit_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, NOW(), NOW())`,
    [name, code, parentId, type, description]
  );

  // Update organization_unit_id ke id sendiri (workaround kolom redundant)
  await db.query(
    "UPDATE organization_units SET organization_unit_id = ? WHERE id = ?",
    [res.insertId, res.insertId]
  );

  return res.insertId;
}

// ---------- Helper employment_statuses ----------
async function ensureEmploymentStatus(name, description) {
  const [exist] = await db.query(
    "SELECT id FROM employment_statuses WHERE name = ? LIMIT 1",
    [name]
  );
  if (exist.length > 0) return exist[0].id;

  const [res] = await db.query(
    `INSERT INTO employment_statuses (name, description, created_at, updated_at)
     VALUES (?, ?, NOW(), NOW())`,
    [name, description]
  );
  return res.insertId;
}

// ---------- Helper employees ----------
// Catatan penting: employees.id punya FK ke users.id, jadi id harus EKSPLISIT
// disamakan dengan users.id (relasi 1:1).
async function ensureEmployee(emp) {
  const [exist] = await db.query(
    "SELECT id FROM employees WHERE id = ? LIMIT 1",
    [emp.userId]
  );
  if (exist.length > 0) {
    console.log(`  ↳ Employee untuk user_id=${emp.userId} sudah ada, dilewati`);
    return exist[0].id;
  }

  await db.query(
    `INSERT INTO employees (
       id, employee_number, national_id_number, name,
       birth_place, birth_date, gender, religion, marital_status,
       address, phone_number, organization_unit_id, hire_date,
       employment_status_id, status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      emp.userId,
      emp.employeeNumber,
      emp.nationalId,
      emp.name,
      emp.birthPlace,
      emp.birthDate,
      emp.gender,
      emp.religion,
      emp.maritalStatus,
      emp.address,
      emp.phoneNumber,
      emp.orgUnitId,
      emp.hireDate,
      emp.employmentStatusId,
      "active",
    ]
  );
  return emp.userId;
}

// ---------- Helper: cek user dari seed_login.js sudah ada ----------
async function getUserIdByEmail(email) {
  const [rows] = await db.query(
    "SELECT id FROM users WHERE email = ? LIMIT 1",
    [email]
  );
  return rows.length > 0 ? rows[0].id : null;
}

// ---------- MAIN SEED ----------
async function seed() {
  try {
    console.log("\n=== SEED DATA MASTER KEPEGAWAIAN ===\n");

 // 1. Cek prerequisite: user dari seed_login.js sudah ada
    console.log("[1/4] Cek prerequisite (user dari seed_login.js)...");
    const adminLogistikUserId = await getUserIdByEmail("admin@gmail.com");
    const pegawaiUserId = await getUserIdByEmail("pegawai@gmail.com");

    if (!adminLogistikUserId || !pegawaiUserId) {
      console.error(
        "\n❌ ERROR: User admin@gmail.com atau pegawai@gmail.com tidak ditemukan."
      );
      console.error("   Jalankan dulu: node scripts/seed_login.js\n");
      process.exit(1);
    }
    console.log(`  ✓ Admin Logistik user_id = ${adminLogistikUserId}, Pegawai user_id = ${pegawaiUserId}\n`);

    // 2. Organization Units
    console.log("[2/4] Seed organization_units...");
    const ftiId = await ensureOrgUnit({
      name: "Fakultas Teknologi Informasi",
      code: "FTI",
      type: "faculty",
      description: "Fakultas Teknologi Informasi - Universitas Andalas",
    });
    const siId = await ensureOrgUnit({
      name: "Jurusan Sistem Informasi",
      code: "SI",
      type: "department",
      parentId: ftiId,
    });
    const ifId = await ensureOrgUnit({
      name: "Jurusan Informatika",
      code: "IF",
      type: "department",
      parentId: ftiId,
    });
    console.log(`  ✓ FTI=${ftiId}, SI=${siId}, IF=${ifId}\n`);

    // 3. Employment Statuses
    console.log("[3/4] Seed employment_statuses...");
    const pnsId = await ensureEmploymentStatus("PNS", "Pegawai Negeri Sipil");
    const honorerId = await ensureEmploymentStatus(
      "Honorer",
      "Tenaga honorer/kontrak"
    );
    const kontrakId = await ensureEmploymentStatus(
      "Kontrak",
      "Pegawai kontrak"
    );
    console.log(`  ✓ PNS=${pnsId}, Honorer=${honorerId}, Kontrak=${kontrakId}\n`);

    // 4. Employees (profil untuk admin & pegawai user yang ada)
    console.log("[4/4] Seed employees...");
   await ensureEmployee({
      userId: adminLogistikUserId,
      employeeNumber: "ADM001",
      nationalId: "1371010101010001",
      name: "Admin Logistik",
      birthPlace: "Padang",
      birthDate: "1985-01-15",
      gender: "male",
      religion: "Islam",
      maritalStatus: "married",
      address: "Jl. Kampus Limau Manis, Padang",
      phoneNumber: "081234567890",
      orgUnitId: ftiId,
      hireDate: "2015-08-01",
      employmentStatusId: pnsId,
    });
    console.log(`  ✓ Employee admin_logistik (id=${adminLogistikUserId}) disiapkan`);

    await ensureEmployee({
      userId: pegawaiUserId,
      employeeNumber: "PEG001",
      nationalId: "1371020202020002",
      name: "Pegawai Satu",
      birthPlace: "Bukittinggi",
      birthDate: "1990-05-20",
      gender: "male",
      religion: "Islam",
      maritalStatus: "single",
      address: "Jl. Pemuda No. 12, Bukittinggi",
      phoneNumber: "082345678901",
      orgUnitId: siId,
      hireDate: "2018-03-01",
      employmentStatusId: honorerId,
    });
    console.log(`  ✓ Employee pegawai (id=${pegawaiUserId}) disiapkan\n`);

    console.log("=== SELESAI ===");
    console.log("Data master kepegawaian sudah siap.");
    console.log("Lanjut: jalankan `node scripts/seed_items.js` untuk data barang.\n");

    process.exit(0);
  } catch (err) {
    console.error("\n❌ Error saat seeding:", err.message);
    console.error(err);
    process.exit(1);
  }
}

seed();
