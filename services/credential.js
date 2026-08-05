/**
 * Generate password random 8 karakter (huruf besar/kecil + angka).
 */
function generatePassword(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; // tanpa karakter ambigu (0/O, 1/l/I)
  let pass = '';
  for (let i = 0; i < length; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

/**
 * Bersihkan nama lengkap jadi username yang aman untuk RADIUS/MikroTik.
 * Contoh: "Budi Santoso" -> "budi.santoso"
 * Kalau username sudah dipakai (masih aktif), tambahkan suffix angka.
 */
function sanitizeUsername(namaLengkap) {
  return namaLengkap
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '.')
    .slice(0, 40);
}

module.exports = { generatePassword, sanitizeUsername };
