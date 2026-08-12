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

    // Kalau username ini sudah pernah ada di active_users (aktif maupun expired),
    // UPDATE baris itu (reset masa berlaku + password baru) alih-alih insert baris
    // baru — supaya aman meski kolom username punya UNIQUE constraint.
    const [existingRows] = await conn.query(
      `SELECT id FROM active_users WHERE username = ? ORDER BY id DESC LIMIT 1`,
      [username]
    );

    let activeUserId;
    if (existingRows.length > 0) {
      activeUserId = existingRows[0].id;
      await conn.query(
        `UPDATE active_users
         SET password = ?, no_telp = ?, router_asal = ?, created_at = NOW(),
             expired_at = DATE_ADD(NOW(), INTERVAL 30 DAY), status = 'active'
         WHERE id = ?`,
        [password, noTelp, routerAsal, activeUserId]
      );
    } else {
      const [result] = await conn.query(
        `INSERT INTO active_users (username, password, no_telp, router_asal, expired_at)
         VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))`,
        [username, password, noTelp, routerAsal]
      );
      activeUserId = result.insertId;
    }

    await conn.commit();

    const [rows] = await conn.query(
      `SELECT expired_at FROM active_users WHERE id = ?`,
      [activeUserId]
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
