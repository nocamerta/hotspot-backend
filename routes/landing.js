const express = require('express');
const path = require('path');
const pool = require('../config/db');
const { sendConfirmation } = require('../services/telegram');

const router = express.Router();
const RATE_LIMIT_PER_DAY = parseInt(process.env.RATE_LIMIT_PER_DAY || '3', 10);

// GET /landing?mac=...&router=r1_krs
router.get('/landing', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'views', 'landing.html'));
});

// POST /register  { nama_lengkap, no_telp, router_asal }
// Catatan: channel_id TIDAK diminta dari form. Untuk testing (Telegram) dipakai
// TELEGRAM_TEST_CHAT_ID dari .env. Nanti saat pindah ke WA, channel_id = no_telp
// itu sendiri (nomor tujuan kirim pesan), jadi baris ini tinggal diganti sekali saja.
router.post('/register', async (req, res) => {
  const { nama_lengkap, no_telp, router_asal } = req.body;
  const channel_id = process.env.TELEGRAM_TEST_CHAT_ID;

  if (!nama_lengkap || !no_telp) {
    return res.status(400).json({ ok: false, message: 'Data tidak lengkap.' });
  }
  if (!channel_id) {
    console.error('TELEGRAM_TEST_CHAT_ID belum diisi di .env');
    return res.status(500).json({ ok: false, message: 'Konfigurasi server belum lengkap.' });
  }

  const noTelpClean = no_telp.replace(/[^0-9]/g, '');
  if (noTelpClean.length < 9 || noTelpClean.length > 15) {
    return res.status(400).json({ ok: false, message: 'Nomor telepon tidak valid.' });
  }

  let conn;
  try {
    conn = await pool.getConnection();

    // Rate limit: max N request per hari per nomor
    const [rows] = await conn.query(
      `SELECT COUNT(*) AS total FROM pending_users
       WHERE no_telp = ? AND created_at >= CURDATE()`,
      [noTelpClean]
    );
    if (rows[0].total >= RATE_LIMIT_PER_DAY) {
      return res.status(429).json({
        ok: false,
        message: `Batas percobaan harian tercapai (maks ${RATE_LIMIT_PER_DAY}x/hari). Coba lagi besok.`,
      });
    }

    const [result] = await conn.query(
      `INSERT INTO pending_users (nama_lengkap, no_telp, channel_id, router_asal, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [nama_lengkap.trim(), noTelpClean, channel_id, router_asal || 'unknown']
    );

    await sendConfirmation(channel_id, nama_lengkap.trim(), noTelpClean, result.insertId);

    res.json({ ok: true, message: 'Silakan cek Telegram/WhatsApp untuk konfirmasi.' });
  } catch (err) {
    console.error('Error /register:', err.message);
    res.status(500).json({ ok: false, message: 'Terjadi kesalahan server.' });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
