const cron = require('node-cron');
const pool = require('../config/db');

const PENDING_EXPIRY_MINUTES = parseInt(process.env.PENDING_EXPIRY_MINUTES || '15', 10);
const INACTIVITY_EXPIRY_DAYS = parseInt(process.env.INACTIVITY_EXPIRY_DAYS || '7', 10);
const MAX_ACCOUNT_AGE_DAYS = parseInt(process.env.MAX_ACCOUNT_AGE_DAYS || '30', 10);

/**
 * Expire akun kalau salah satu dari 3 kondisi terpenuhi:
 *  1. Tidak ada aktivitas login (radacct) selama INACTIVITY_EXPIRY_DAYS hari
 *     (dihitung dari created_at kalau belum pernah login sama sekali)
 *  2. Sudah lebih dari MAX_ACCOUNT_AGE_DAYS hari sejak tanggal daftar,
 *     berapapun aktifnya user itu (hard cap)
 *  3. Sudah lewat expired_at yang di-set khusus saat dibuat (dipakai untuk
 *     trial 10 menit — masa berlakunya jauh lebih pendek dari 2 aturan di atas)
 *
 * User TRIAL (username diawali "trial-") begitu expired langsung DIHAPUS
 * TOTAL dari active_users (bukan cuma ditandai expired) — karena tidak ada
 * gunanya disimpan (tidak dipakai buat histori/reuse username seperti user
 * reguler). User reguler tetap ditandai status='expired' saja (dipertahankan
 * untuk fitur reuse username kalau daftar ulang).
 */
async function cleanupExpiredActiveUsers() {
  const conn = await pool.getConnection();
  try {
    const [expired] = await conn.query(
      `SELECT au.id, au.username, au.created_at AS reg_date, au.expired_at AS exp_at,
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
  // Jalan tiap 1 menit — supaya trial 10 menit ditegakkan presisi
  cron.schedule('* * * * *', () => {
    cleanupExpiredActiveUsers();
    cleanupStalePendingUsers();
  });
  console.log(`[expiry] cron job aktif (tiap 1 menit) — inaktif ${INACTIVITY_EXPIRY_DAYS} hari, umur akun ${MAX_ACCOUNT_AGE_DAYS} hari, atau expired_at custom (trial, langsung dihapus total)`);
}

module.exports = { startExpiryJobs };
