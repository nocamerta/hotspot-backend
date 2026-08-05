const cron = require('node-cron');
const pool = require('../config/db');

const PENDING_EXPIRY_MINUTES = parseInt(process.env.PENDING_EXPIRY_MINUTES || '15', 10);

async function cleanupExpiredActiveUsers() {
  const conn = await pool.getConnection();
  try {
    const [expired] = await conn.query(
      `SELECT username FROM active_users WHERE status = 'active' AND expired_at <= NOW()`
    );
    for (const row of expired) {
      await conn.query(`DELETE FROM radcheck WHERE username = ?`, [row.username]);
      await conn.query(
        `UPDATE active_users SET status = 'expired' WHERE username = ?`,
        [row.username]
      );
      console.log(`[expiry] user expired & dihapus dari radcheck: ${row.username}`);
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
  // Jalan tiap 5 menit
  cron.schedule('*/5 * * * *', () => {
    cleanupExpiredActiveUsers();
    cleanupStalePendingUsers();
  });
  console.log('[expiry] cron job aktif (tiap 5 menit)');
}

module.exports = { startExpiryJobs };
