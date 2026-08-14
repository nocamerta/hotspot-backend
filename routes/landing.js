const express = require('express');
const path = require('path');
const pool = require('../config/db');
const qontak = require('../services/qontak');

const router = express.Router();
const RATE_LIMIT_PER_DAY = parseInt(process.env.RATE_LIMIT_PER_DAY || '3', 10);

// GET /landing?mac=...&router=r1_krs
router.get('/landing', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'views', 'landing.html'));
});

// POST /register  { nama_lengkap, no_telp, router_asal }
router.post('/register', async (req, res) => {
  const { nama_lengkap, no_telp, router_asal } = req.body;

  if (!nama_lengkap || !no_telp) {
    return res.status(400).json({ ok: false, message: 'Data tidak lengkap.' });
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
      [nama_lengkap.trim(), noTelpClean, noTelpClean, router_asal || 'unknown']
    );

    await qontak.sendConfirmation(noTelpClean, nama_lengkap.trim());

    res.json({
      ok: true,
      message: 'Silakan cek WhatsApp untuk konfirmasi.',
      pendingId: result.insertId,
    });
  } catch (err) {
    console.error('Error /register:', err.message);
    res.status(500).json({ ok: false, message: 'Terjadi kesalahan server.' });
  } finally {
    if (conn) conn.release();
  }
});

// GET /status/:id — dipoll landing page tiap beberapa detik untuk tahu
// apakah user sudah tap konfirmasi di Telegram/WA, dan ambil kredensialnya.
router.get('/status/:id', async (req, res) => {
  const pendingId = parseInt(req.params.id, 10);
  if (!pendingId) {
    return res.status(400).json({ ok: false, message: 'ID tidak valid.' });
  }

  let conn;
  try {
    conn = await pool.getConnection();

    const [pendingRows] = await conn.query(
      `SELECT status, no_telp FROM pending_users WHERE id = ?`,
      [pendingId]
    );
    if (pendingRows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Data tidak ditemukan.' });
    }
    const pending = pendingRows[0];

    if (pending.status !== 'confirmed') {
      return res.json({ ok: true, status: pending.status });
    }

    const [activeRows] = await conn.query(
      `SELECT username, password, expired_at FROM active_users
       WHERE no_telp = ? AND status = 'active' ORDER BY id DESC LIMIT 1`,
      [pending.no_telp]
    );
    if (activeRows.length === 0) {
      return res.json({ ok: true, status: 'confirmed_processing' });
    }

    res.json({
      ok: true,
      status: 'confirmed',
      username: activeRows[0].username,
      password: activeRows[0].password,
      expired_at: activeRows[0].expired_at,
    });
  } catch (err) {
    console.error('Error /status:', err.message);
    res.status(500).json({ ok: false, message: 'Terjadi kesalahan server.' });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
