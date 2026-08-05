require('dotenv').config();
const path = require('path');
const express = require('express');
const landingRoutes = require('./routes/landing');
const webhookRoutes = require('./routes/webhook');
const { startExpiryJobs } = require('./jobs/expiry');
const { startTelegramPolling } = require('./jobs/telegramPolling');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Asset statis (css, js, img, font) dari template landing page
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', landingRoutes);
app.use('/', webhookRoutes);

app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server jalan di port ${PORT}`);
  startExpiryJobs();
  startTelegramPolling();
});
