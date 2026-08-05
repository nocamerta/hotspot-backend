const axios = require('axios');
const { handleCallbackQuery } = require('../services/confirmationHandler');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;
const POLL_INTERVAL_MS = 20 * 1000; // 20 detik

let lastUpdateId = 0;
let polling = false;

async function pollOnce() {
  if (polling) return; // hindari overlap kalau request sebelumnya belum selesai
  polling = true;
  try {
    const res = await axios.get(`${API_BASE}/getUpdates`, {
      params: { offset: lastUpdateId + 1, timeout: 0 },
    });

    const updates = res.data.result || [];
    for (const update of updates) {
      lastUpdateId = update.update_id;
      if (update.callback_query) {
        await handleCallbackQuery(update.callback_query);
      }
    }
  } catch (err) {
    console.error('[telegram-poll] error:', err.message);
  } finally {
    polling = false;
  }
}

async function startTelegramPolling() {
  if (!BOT_TOKEN) {
    console.warn('[telegram-poll] TELEGRAM_BOT_TOKEN kosong, polling tidak dijalankan');
    return;
  }
  // getUpdates tidak bisa jalan kalau webhook masih aktif — pastikan dihapus dulu
  try {
    await axios.get(`${API_BASE}/deleteWebhook`);
  } catch (err) {
    console.error('[telegram-poll] gagal deleteWebhook:', err.message);
  }
  console.log(`[telegram-poll] aktif, cek update tiap ${POLL_INTERVAL_MS / 1000} detik`);
  setInterval(pollOnce, POLL_INTERVAL_MS);
  pollOnce();
}

module.exports = { startTelegramPolling };
