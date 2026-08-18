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
 * Kalau nama terdiri lebih dari 2 kata, cuma 2 kata PERTAMA yang dipakai.
 * Contoh: "Budi Santoso Wijaya" -> "budi.santoso"
 *         "Budi Santoso" -> "budi.santoso"
 *         "Budi" -> "budi"
 */
function sanitizeUsername(namaLengkap) {
  const firstTwoWords = namaLengkap.trim().split(/\s+/).slice(0, 2).join(' ');

  return firstTwoWords
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '.')
    .slice(0, 40);
}

/**
 * Generate username untuk trial (tidak berbasis nama, karena trial tidak
 * kumpulkan data nama). Contoh: "trial-x7k2m9pq"
 */
function generateTrialUsername() {
  return 'trial-' + generatePassword(8).toLowerCase();
}

/**
 * Normalisasi nomor HP Indonesia ke format internasional (62xxxxxxxxxx),
 * apapun format yang diketik user: 08xxx, +62xxx, 62xxx, atau 8xxx.
 * Wajib format ini karena WhatsApp API (Qontak) cuma terima format internasional
 * tanpa tanda "+" dan tanpa "0" di depan.
 * Return null kalau tidak bisa dikenali sebagai nomor Indonesia yang valid.
 */
function normalizePhoneNumber(input) {
  const digits = (input || '').replace(/[^0-9]/g, '');
  if (!digits) return null;

  let normalized;
  if (digits.startsWith('62')) {
    normalized = digits;
  } else if (digits.startsWith('0')) {
    normalized = '62' + digits.slice(1);
  } else if (digits.startsWith('8')) {
    normalized = '62' + digits;
  } else {
    return null; // pola tidak dikenali sebagai nomor HP Indonesia
  }

  // Nomor HP Indonesia setelah "62": total wajar 10-13 digit (mis. 62812345678)
  if (normalized.length < 10 || normalized.length > 15) return null;

  return normalized;
}

module.exports = { generatePassword, sanitizeUsername, normalizePhoneNumber, generateTrialUsername };
