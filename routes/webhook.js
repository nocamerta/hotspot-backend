const express = require('express');
const { handleCallbackQuery } = require('../services/confirmationHandler');

const router = express.Router();

// POST /webhook/telegram — dipakai kalau nanti sudah setWebhook (butuh HTTPS)
router.post('/webhook/telegram', async (req, res) => {
  res.sendStatus(200); // balas cepat, proses lanjut di background
  await handleCallbackQuery(req.body.callback_query);
});

module.exports = router;
