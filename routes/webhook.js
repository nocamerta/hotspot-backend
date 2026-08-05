const express = require('express');
const pool = require('../config/db');
const { sendCredential, sendPlainMessage } = require('../services/telegram');
const { createHotspotUser } = require('../services/radius');
const { generatePassword, sanitizeUsername } = require('../services/credential');

const router = express.Router();
const CREDENTIAL_EXPIRY_HOURS = parseInt(process.env.CREDENTIAL_EXPIRY_HOURS || '24', 10);

// POST /webhook/telegram — dipanggil Telegram tiap ada update (callback_query dari tombol)
router.post('/webhook/telegram', async (req, res) => {
  // Balas 200 secepatnya supaya Telegram tidak retry; proses tetap lanjut di bawah
  res.sendStatus(200);

  const callback = req.body.callback_query;
  if (!callback || !callback.data) return;

  const chatId = callback.message.chat.id;
  const [action, pendingIdStr] = callback.data.split(':');
  const pendingId = parseInt(pendingIdStr, 10);
  if (!pendingId) return;

  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      `SELECT * FROM pending_users WHERE id = ? AND status = 'pending'`,
      [pendingId]
    );
    if (rows.length === 0) {
      await sendPlainMessage(chatId, 'Permintaan ini sudah tidak berlaku atau sudah diproses.');
      return;
    }
    const pending = rows[0];

    if (action === 'reject') {
      await conn.query(`UPDATE pending_users SET status = 'rejected' WHERE id = ?`, [pendingId]);
      await sendPlainMessage(chatId, 'Baik, pendaftaran dibatalkan. Silakan isi ulang data di halaman Wi-Fi jika perlu.');
      return;
    }

    if (action === 'confirm') {
      const baseUsername = sanitizeUsername(pending.nama_lengkap);
      let username = baseUsername;
      let suffix = 1;
      // Pastikan username unik di active_users (kalau bentrok, tambah suffix angka)
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const [existing] = await conn.query(
          `SELECT id FROM active_users WHERE username = ? AND status = 'active'`,
          [username]
        );
        if (existing.length === 0) break;
        suffix += 1;
        username = `${baseUsername}${suffix}`;
      }

      const password = generatePassword(8);

      const expiredAt = await createHotspotUser({
        username,
        password,
        noTelp: pending.no_telp,
        routerAsal: pending.router_asal,
        expiryHours: CREDENTIAL_EXPIRY_HOURS,
      });

      await conn.query(
        `UPDATE pending_users SET status = 'confirmed', confirmed_at = NOW() WHERE id = ?`,
        [pendingId]
      );

      await sendCredential(chatId, username, password, expiredAt);
    }
  } catch (err) {
    console.error('Error /webhook/telegram:', err.message);
    await sendPlainMessage(chatId, 'Terjadi kesalahan, silakan coba lagi atau hubungi admin.');
  } finally {
    conn.release();
  }
});

module.exports = router;
