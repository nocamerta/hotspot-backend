const { spawn } = require('child_process');

// Mapping router_asal -> IP & secret NAS-nya (buat kirim CoA/Disconnect-Request).
// IP di sini adalah IP yang dipakai router kirim RADIUS request (bukan IP hotspot-nya),
// sama seperti yang didaftarkan di clients.conf FreeRADIUS.
const NAS_MAP = {
  r1_krs: { ip: process.env.RADIUS_NAS_R1_IP || '103.178.13.34', secret: process.env.RADIUS_NAS_R1_SECRET },
  r4_ngl: { ip: process.env.RADIUS_NAS_R4_IP || '103.178.12.233', secret: process.env.RADIUS_NAS_R4_SECRET },
  r6_mjr: { ip: process.env.RADIUS_NAS_R6_IP || '103.178.12.232', secret: process.env.RADIUS_NAS_R6_SECRET },
};

/**
 * Kirim RADIUS Disconnect-Request (RFC 3576/5176) supaya MikroTik PAKSA
 * putus sesi aktif user itu SEKARANG JUGA — beda dari hapus radcheck yang
 * cuma mencegah login BARU ke depannya, tidak menyentuh sesi yang sudah
 * terlanjur berjalan.
 *
 * Pakai `radclient` (bagian dari freeradius-utils, sudah ada di server ini
 * karena satu server dengan FreeRADIUS) lewat child_process — tidak perlu
 * implementasi protokol RADIUS mentah sendiri.
 *
 * Non-blocking terhadap alur utama: kalau gagal (NAS tidak dikenal, secret
 * kosong, router down, dll), cuma di-log sebagai warning, tidak melempar
 * error yang bisa mengganggu proses cleanup lainnya.
 */
function disconnectSession(username, routerAsal) {
  return new Promise((resolve) => {
    const nas = NAS_MAP[routerAsal];
    if (!nas || !nas.secret) {
      console.warn(`[radius-disconnect] NAS "${routerAsal}" tidak dikenal/secret belum diisi di .env, skip disconnect untuk ${username}`);
      return resolve(false);
    }

    const child = spawn('radclient', ['-x', `${nas.ip}:3799`, 'disconnect', nas.secret]);

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });

    const timer = setTimeout(() => {
      child.kill();
      console.warn(`[radius-disconnect] timeout kirim disconnect untuk ${username} @ ${routerAsal}`);
      resolve(false);
    }, 5000);

    child.on('close', (code) => {
      clearTimeout(timer);
      const success = /Received Disconnect-ACK/i.test(stdout);
      if (success) {
        console.log(`[radius-disconnect] ${username} @ ${routerAsal}: sesi berhasil diputus (ACK)`);
      } else {
        // NAK atau tidak ada sesi aktif untuk username itu — ini WAJAR terjadi
        // kalau user memang sedang tidak online, bukan berarti error.
        console.log(`[radius-disconnect] ${username} @ ${routerAsal}: tidak ada ACK (kemungkinan user sedang tidak online)`);
      }
      resolve(success);
    });

    // Attribute yang dikirim ke NAS untuk identifikasi sesi mana yang diputus
    child.stdin.write(`User-Name = "${username}"\n`);
    child.stdin.end();
  });
}

module.exports = { disconnectSession };
