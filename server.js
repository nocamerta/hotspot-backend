require('dotenv').config();
const path = require('path');
const express = require('express');
const landingRoutes = require('./routes/landing');
const webhookQontakRoutes = require('./routes/webhookQontak');
const { startExpiryJobs } = require('./jobs/expiry');

const app = express();

// Jaring pengaman: error async yang lolos dari try/catch tidak mematikan seluruh server
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Asset statis (css, js, img, font) dari template landing page
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', landingRoutes);
app.use('/', webhookQontakRoutes);

app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server jalan di port ${PORT}`);
  startExpiryJobs();
  // Catatan: webhook Qontak (/webhook/qontak) baru bisa didaftarkan & dites
  // setelah HTTPS siap. Sebelum itu, balasan "Ya"/"Tidak" pelanggan belum
  // akan diproses otomatis meski pesan konfirmasi sudah bisa terkirim.
});
