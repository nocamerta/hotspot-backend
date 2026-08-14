const pool = require('../config/db');
const qontak = require('./qontak');
const { createHotspotUser } = require('./radius');
const { generatePassword, sanitizeUsername } = require('./credential');

/**
 * Diproses saat ada balasan (button reply) masuk dari pelanggan via WA.
 * Karena WhatsApp tidak punya "callback data" custom kayak Telegram,
 * pending registration dicocokkan lewat NOMOR PENGIRIM (harus masih 'pending').
 */
async function handleQontakReply(fromNumber, buttonText) {
  const decision = normalizeDecision(buttonText);
  if (!decision) return; // bukan balasan Ya/Tidak yang relevan, abaikan

  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      `SELECT * FROM pending_users WHERE no_telp = ? AND status = 'pending' ORDER BY id DESC LIMIT 1`,
      [fromNumber]
    );
    if (rows.length === 0) return; // tidak ada pendaftaran pending untuk nomor ini
    const pending = rows[0];

    if (decision === 'reject') {
      await conn.query(`UPDATE pending_users SET status = 'rejected' WHERE id = ?`, [pending.id]);
      await qontak.sendCancelled(pending.no_telp, pending.nama_lengkap);
      return;
    }

    // decision === 'confirm'
    const [prevRows] = await conn.query(
      `SELECT username FROM active_users WHERE no_telp = ? ORDER BY id DESC LIMIT 1`,
      [pending.no_telp]
    );

    let username;
    if (prevRows.length > 0) {
      username = prevRows[0].username;
    } else {
      const baseUsername = sanitizeUsername(pending.nama_lengkap);
      username = baseUsername;
      let suffix = 1;
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
    }

    const password = generatePassword(8);

    await createHotspotUser({
      username,
      password,
      noTelp: pending.no_telp,
      routerAsal: pending.router_asal,
    });

    await conn.query(
      `UPDATE pending_users SET status = 'confirmed', confirmed_at = NOW() WHERE id = ?`,
      [pending.id]
    );

    await qontak.sendCredential(pending.no_telp, pending.nama_lengkap, username, password);
  } catch (err) {
    console.error('Error handleQontakReply:', err.message);
  } finally {
    conn.release();
  }
}

function normalizeDecision(buttonText) {
  const t = (buttonText || '').trim().toLowerCase();
  if (t === 'ya') return 'confirm';
  if (t === 'tidak') return 'reject';
  return null;
}

module.exports = { handleQontakReply };
