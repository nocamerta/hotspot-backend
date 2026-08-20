const cron = require('node-cron');
const pool = require('../config/db');
const { disconnectSession } = require('../services/radiusDisconnect');

const PENDING_EXPIRY_MINUTES = parseInt(process.env.PENDING_EXPIRY_MINUTES || '15', 10);
const INACTIVITY_EXPIRY_DAYS = parseInt(process.env.INACTIVITY_EXPIRY_DAYS || '7', 10);
const MAX_ACCOUNT_AGE_DAYS = parseInt(process.env.MAX_ACCOUNT_AGE_DAYS || '30', 10);

/**
 * Expire akun kalau salah satu dari 3 kondisi terpenuhi:
 *  1. Tidak ada aktivitas login (radacct) selama INACTIVITY_EXPIRY_DAYS hari
 *  2. Sudah lebih dari MAX_ACCOUNT_AGE_DAYS hari sejak tanggal daftar (hard cap)
 *  3. Sudah lewat expired_at custom (dipakai trial 10 menit)
 *
 * Setiap kali expired, SELAIN hapus radcheck (cegah login baru), kita juga
 * kirim RADIUS Disconnect-Request supaya sesi yang KEBETULAN masih aktif
 * saat itu juga langsung diputus paksa — tidak nunggu idle-timeout 8 jam.
 *
 * User TRIAL (username diawali "trial-") dihapus TOTAL dari active_users.
 * User reguler cuma ditandai status='expired' (dipertahankan untuk reuse
 * username kalau daftar ulang).
 */
async function cleanupExpiredActiveUsers() {
  const conn = await pool.getConnection();
  try {
    const [expired] = await conn.query(
      `SELECT au.id, au.username, au.router_asal, au.created_at AS reg_date, au.expired_at AS exp_at,
              COALESCE(MAX(ra.acctstarttime), au.created_at) AS last_used
       FROM active_users au
       LEFT JOIN radacct ra ON ra.username = au.username
       WHERE au.status = 'active'
       GROUP BY au.id
       HAVING last_used <= DATE_SUB(NOW(), INTERVAL ? DAY)
           OR reg_date <= DATE_SUB(NOW(), INTERVAL ? DAY)
           OR exp_at <= NOW()`,
      [INACTIVITY_EXPIRY_DAYS, MAX_ACCOUNT_AGE_DAYS]
    );

    for (const row of expired) {
      await conn.query(`DELETE FROM radcheck WHERE username = ?`, [row.username]);

      // Jaga-jaga: kalau kebetulan masih online SAAT expired terdeteksi,
      // paksa putus sekarang juga (tidak nunggu idle-timeout 8 jam).
      await disconnectSession(row.username, row.router_asal);

      if (row.username.startsWith('trial-')) {
        await conn.query(`DELETE FROM active_users WHERE id = ?`, [row.id]);
        console.log(`[expiry] trial expired & DIHAPUS TOTAL dari active_users: ${row.username}`);
      } else {
        await conn.query(`UPDATE active_users SET status = 'expired' WHERE id = ?`, [row.id]);
        console.log(`[expiry] user expired & dihapus dari radcheck: ${row.username}`);
      }
    }
  } catch (err) {
    console.error('[expiry] error cleanup active_users:', err.message);
  } finally {
    conn.release();
  }
}

async function cleanupStalePendingUsers() {
  const conn = await pool.getConnection();
  try {
    const [result] = await conn.query(
      `UPDATE pending_users
       SET status = 'expired'
       WHERE status = 'pending'
         AND created_at <= DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
      [PENDING_EXPIRY_MINUTES]
    );
    if (result.affectedRows > 0) {
      console.log(`[expiry] ${result.affectedRows} pending_users basi ditandai expired`);
    }
  } catch (err) {
    console.error('[expiry] error cleanup pending_users:', err.message);
  } finally {
    conn.release();
  }
}

function startExpiryJobs() {
  cron.schedule('* * * * *', () => {
    cleanupExpiredActiveUsers();
    cleanupStalePendingUsers();
  });
  console.log(`[expiry] cron job aktif (tiap 1 menit) — inaktif ${INACTIVITY_EXPIRY_DAYS} hari, umur akun ${MAX_ACCOUNT_AGE_DAYS} hari, atau expired_at custom (trial) — plus RADIUS Disconnect paksa putus sesi aktif`);
}

module.exports = { startExpiryJobs };
