const pool = require('../config/db');

/**
 * Insert/replace ke radcheck + upsert ke active_users. Dipakai bareng oleh
 * user reguler (30 hari) maupun trial (10 menit).
 *
 * sessionTimeoutSeconds (opsional): kalau diisi, sisipkan atribut RADIUS
 * "Session-Timeout" — MikroTik akan OTOMATIS memutus sesi itu sendiri
 * persis di detik itu sejak login, tanpa perlu backend kita ikut campur.
 * Ini beda dari "expired_at" (yang cuma mencegah LOGIN BARU ke depannya,
 * tidak memutus sesi yang sudah terlanjur aktif).
 */
async function upsertHotspotUser({ username, password, noTelp, routerAsal, expiredAtSql, sessionTimeoutSeconds }) {
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

    if (sessionTimeoutSeconds) {
      await conn.query(
        `INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Session-Timeout', ':=', ?)`,
        [username, String(sessionTimeoutSeconds)]
      );
    }

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
             expired_at = ${expiredAtSql}, status = 'active'
         WHERE id = ?`,
        [password, noTelp, routerAsal, activeUserId]
      );
    } else {
      const [result] = await conn.query(
        `INSERT INTO active_users (username, password, no_telp, router_asal, expired_at)
         VALUES (?, ?, ?, ?, ${expiredAtSql})`,
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

/**
 * User reguler: masa berlaku hard cap 30 hari sejak tanggal daftar.
 * Expiry karena tidak dipakai 7 hari dicek terpisah oleh cron (lihat jobs/expiry.js).
 */
async function createHotspotUser({ username, password, noTelp, routerAsal }) {
  return upsertHotspotUser({
    username,
    password,
    noTelp,
    routerAsal,
    expiredAtSql: 'DATE_ADD(NOW(), INTERVAL 30 DAY)',
  });
}

/**
 * User trial: masa berlaku 10 menit sejak login (bukan sejak dibuat!) —
 * pakai RADIUS Session-Timeout supaya MikroTik otomatis putus sendiri
 * tepat waktu, sekalian expired_at di DB (buat jaga-jaga & cleanup cron).
 */
async function createTrialUser({ username, password, mac, routerAsal }) {
  return upsertHotspotUser({
    username,
    password,
    noTelp: mac,
    routerAsal,
    expiredAtSql: 'DATE_ADD(NOW(), INTERVAL 10 MINUTE)',
    sessionTimeoutSeconds: 600,
  });
}

module.exports = { createHotspotUser, createTrialUser };
