-- Jalankan sekali di database hotspot_db sebelum menjalankan backend
-- channel_id: generik, diisi no. WA saat produksi, atau chat_id Telegram saat testing
-- confirm_token: dipakai untuk mencocokkan callback dari Telegram/webhook WA ke baris pending_users yang benar

ALTER TABLE pending_users
  ADD COLUMN channel_id VARCHAR(50) NULL AFTER no_telp;
