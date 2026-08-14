const express = require('express');
const { handleQontakReply } = require('../services/qontakConfirmationHandler');

const router = express.Router();

// POST /webhook/qontak — didaftarkan di Qontak setelah HTTPS siap
router.post('/webhook/qontak', async (req, res) => {
  res.sendStatus(200); // balas cepat, proses lanjut di background

  // Struktur payload asli belum pernah kita lihat langsung — log dulu supaya
  // begitu ada request masuk beneran, kita bisa cocokkan path yang benar.
  console.log('[qontak-webhook] payload masuk:', JSON.stringify(req.body));

  try {
    const body = req.body || {};
    const message = body.last_message || body.message || body;

    // Coba beberapa kemungkinan lokasi nomor HP pengirim
    const fromNumber =
      message?.raw_message?.contacts?.[0]?.wa_id ||
      body?.room?.account_uniq_id ||
      body?.account_uniq_id ||
      message?.from;

    // Coba beberapa kemungkinan lokasi teks tombol yang ditekan
    const buttonText =
      message?.text ||
      message?.button?.text ||
      message?.interactive?.button_reply?.title;

    if (fromNumber && buttonText) {
      await handleQontakReply(fromNumber, buttonText);
    } else {
      console.warn('[qontak-webhook] tidak bisa ekstrak fromNumber/buttonText dari payload ini');
    }
  } catch (err) {
    console.error('[qontak-webhook] error:', err.message);
  }
});

module.exports = router;
