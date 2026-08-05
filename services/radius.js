const pool = require('../config/db');

/**
 * Buat user hotspot baru: insert ke radcheck (dipakai FreeRADIUS) sekaligus
 * active_users (buat tracking & cron expiry kita sendiri), dalam satu transaksi.
 */
async function createHotspotUser({ username, password, noTelp, routerAsal, expiryHours }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Single-session per user (RFC: Simultaneous-Use)
    await conn.query(
      `INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Simultaneous-Use', ':=', '1')`,
      [username]
    );

    await conn.query(
      `INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Cleartext-Password', ':=', ?)`,
      [username, password]
    );

    const [result] = await conn.query(
      `INSERT INTO active_users (username, password, no_telp, router_asal, expired_at)
       VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))`,
      [username, password, noTelp, routerAsal, expiryHours]
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
