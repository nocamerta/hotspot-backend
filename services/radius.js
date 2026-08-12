const pool = require('../config/db');

/**
 * Buat/perbarui user hotspot: insert ke radcheck (dipakai FreeRADIUS) sekaligus
 * active_users (buat tracking & cron expiry kita sendiri), dalam satu transaksi.
 *
 * Aturan expiry (dicek oleh cron jobs/expiry.js, bukan di sini):
 *  - Tidak login/dipakai selama 7 hari berturut-turut -> expired
 *  - ATAU sudah 30 hari sejak tanggal daftar (created_at) -> expired
 *  Mana yang lebih dulu tercapai.
 *
 * Kalau nomor telp yang sama sudah pernah daftar (username lama masih ada),
 * username DIPERTAHANKAN sama, hanya password yang baru — radcheck lama untuk
 * username itu dihapus dulu supaya tidak ada Cleartext-Password dobel/usang.
 */
async function createHotspotUser({ username, password, noTelp, routerAsal, expiryHours }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Bersihkan radcheck lama untuk username ini (kalau ada, dari registrasi sebelumnya)
    await conn.query(`DELETE FROM radcheck WHERE username = ?`, [username]);

    // Single-session per user (RFC: Simultaneous-Use)
    await conn.query(
      `INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Simultaneous-Use', ':=', '1')`,
      [username]
    );

    await conn.query(
      `INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Cleartext-Password', ':=', ?)`,
      [username, password]
    );

    // Tandai record aktif lama (kalau ada) untuk nomor ini sebagai expired,
    // supaya cuma ada 1 baris 'active' per nomor telp.
    await conn.query(
      `UPDATE active_users SET status = 'expired' WHERE no_telp = ? AND status = 'active'`,
      [noTelp]
    );

    // expired_at di sini adalah HARD CAP 30 hari dari tanggal daftar.
    // Expiry karena tidak dipakai 7 hari dicek terpisah oleh cron (lihat jobs/expiry.js),
    // karena butuh data radacct yang baru ada setelah user benar-benar login.
    const [result] = await conn.query(
      `INSERT INTO active_users (username, password, no_telp, router_asal, expired_at)
       VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))`,
      [username, password, noTelp, routerAsal]
    );

    await conn.commit();

    const [rows] = await conn.query(
      `SELECT expired_at FROM active_users WHERE id = ?`,
      [result.insertId]
    );

    return rows[0].expired_at;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { createHotspotUser };
