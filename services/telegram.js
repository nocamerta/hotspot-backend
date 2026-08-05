require('dotenv').config();
const axios = require('axios');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

/**
 * Kirim pesan konfirmasi data ke user, dengan tombol Ya/Tidak (inline keyboard).
 * pendingId dipakai sebagai callback_data supaya webhook tahu baris pending_users mana yang dikonfirmasi.
 */
async function sendConfirmation(chatId, namaLengkap, noTelp, pendingId) {
  const text =
    `Konfirmasi pendaftaran Wi-Fi:\n\n` +
    `Nama: ${namaLengkap}\n` +
    `No. Telp: ${noTelp}\n\n` +
    `Apakah data di atas sudah benar?`;

  const reply_markup = {
    inline_keyboard: [
      [
        { text: '✅ Ya, benar', callback_data: `confirm:${pendingId}` },
        { text: '❌ Bukan saya', callback_data: `reject:${pendingId}` },
      ],
    ],
  };

  await axios.post(`${API_BASE}/sendMessage`, {
    chat_id: chatId,
    text,
    reply_markup,
  });
}

/**
 * Kirim kredensial hotspot setelah dikonfirmasi.
 */
async function sendCredential(chatId, username, password, expiredAt) {
  const text =
    `Pendaftaran berhasil! 🎉\n\n` +
    `Username: ${username}\n` +
    `Password: ${password}\n\n` +
    `Berlaku sampai: ${expiredAt}\n` +
    `Silakan login di halaman Wi-Fi menggunakan data di atas.`;

  await axios.post(`${API_BASE}/sendMessage`, {
    chat_id: chatId,
    text,
  });
}

async function sendPlainMessage(chatId, text) {
  await axios.post(`${API_BASE}/sendMessage`, { chat_id: chatId, text });
}

module.exports = { sendConfirmation, sendCredential, sendPlainMessage };
