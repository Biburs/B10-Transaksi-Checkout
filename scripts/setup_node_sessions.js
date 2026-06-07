// =====================================================================
// SETUP: Tabel node_sessions untuk Express Session
// Jalankan SETELAH import db_tb_pweb_v2.sql, SEBELUM seed lainnya:
//     node scripts/setup_node_sessions.js
//
// KENAPA TABEL INI PERLU?
//   - SQL dosen (db_tb_pweb_v2.sql) berasal dari template Laravel.
//   - Tabel `sessions` di sana punya struktur untuk Laravel session
//     (kolom: id, user_id, ip_address, user_agent, payload, last_activity).
//   - Project kita pakai Node.js + Express + express-mysql-session,
//     yang butuh struktur kolom berbeda: session_id, expires, data.
//   - Karena dua format ini bentrok, kita pakai tabel terpisah: node_sessions.
//   - Struktur kolom HARUS PERSIS seperti di bawah karena sesuai konfigurasi
//     express-mysql-session di file app.js.
//
// Sifat: idempotent — aman dijalankan berkali-kali (cek sebelum buat).
// =====================================================================

const db = require("../lib/db");

async function setupNodeSessions() {
  try {
    console.log("\n=== SETUP TABEL node_sessions ===\n");

    // 1. Cek apakah tabel sudah ada
    const [existing] = await db.query(
      `SELECT TABLE_NAME 
       FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'node_sessions'`
    );

    if (existing.length > 0) {
      console.log("  ↳ Tabel node_sessions sudah ada, dilewati.\n");
      console.log("=== SELESAI (tidak ada perubahan) ===\n");
      process.exit(0);
    }

    // 2. Buat tabel sesuai konfigurasi express-mysql-session di app.js
    console.log("[1/1] Membuat tabel node_sessions...");
    await db.query(`
      CREATE TABLE node_sessions (
        session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
        expires INT(11) UNSIGNED NOT NULL,
        data MEDIUMTEXT COLLATE utf8mb4_bin,
        PRIMARY KEY (session_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
    `);

    console.log("  ✓ Tabel node_sessions berhasil dibuat\n");
    console.log("=== SELESAI ===");
    console.log("Lanjut: jalankan `node scripts/seed_login.js`\n");

    process.exit(0);
  } catch (err) {
    console.error("\n❌ Error saat setup node_sessions:", err.message);
    console.error(err);
    process.exit(1);
  }
}

setupNodeSessions();
