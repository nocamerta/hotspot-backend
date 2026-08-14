const { QontakClient } = require('qontak-client');

const api = new QontakClient({
  clientId: process.env.QONTAK_CLIENT_ID,
  clientSecret: process.env.QONTAK_CLIENT_SECRET,
});

const CHANNEL_INTEGRATION_ID = process.env.QONTAK_CHANNEL_INTEGRATION_ID;

// Cache id template supaya tidak query list template tiap kali kirim pesan
const templateIdCache = {};

async function getTemplateId(templateName) {
  if (templateIdCache[templateName]) return templateIdCache[templateName];

  const response = await api.template.getListWhatsappTemplate();
  const found = (response.data || []).find((t) => t.name === templateName);

  if (!found) {
    throw new Error(`Template Qontak "${templateName}" tidak ditemukan. Pastikan nama persis sama dan sudah dibuat.`);
  }
  if (found.status !== 'APPROVED') {
    throw new Error(`Template Qontak "${templateName}" statusnya masih "${found.status}", belum APPROVED.`);
  }

  templateIdCache[templateName] = found.id;
  return found.id;
}

/**
 * Kirim pesan konfirmasi pendaftaran (template dengan Quick Reply "Ya"/"Tidak").
 */
async function sendConfirmation(noTelp, namaLengkap) {
  const templateId = await getTemplateId(process.env.QONTAK_TEMPLATE_REG);

  await api.broadcast.createBroadcastDirect({
    to_name: namaLengkap,
    to_number: noTelp,
    message_template_id: templateId,
    channel_integration_id: CHANNEL_INTEGRATION_ID,
    language: { code: 'id' },
    parameters: {
      buttons: [],
      body: [
        { key: '1', value_text: namaLengkap, value: 'nama' },
        { key: '2', value_text: noTelp, value: 'no_telp' },
      ],
    },
  });
}

/**
 * Kirim username & password setelah dikonfirmasi "Ya".
 */
async function sendCredential(noTelp, namaLengkap, username, password) {
  const templateId = await getTemplateId(process.env.QONTAK_TEMPLATE_SUCCESS);

  await api.broadcast.createBroadcastDirect({
    to_name: namaLengkap,
    to_number: noTelp,
    message_template_id: templateId,
    channel_integration_id: CHANNEL_INTEGRATION_ID,
    language: { code: 'id' },
    parameters: {
      buttons: [],
      body: [
        { key: '1', value_text: username, value: 'username' },
        { key: '2', value_text: password, value: 'password' },
      ],
    },
  });
}

/**
 * Kirim pesan pembatalan setelah dikonfirmasi "Tidak".
 */
async function sendCancelled(noTelp, namaLengkap) {
  const templateId = await getTemplateId(process.env.QONTAK_TEMPLATE_CANCEL);

  await api.broadcast.createBroadcastDirect({
    to_name: namaLengkap,
    to_number: noTelp,
    message_template_id: templateId,
    channel_integration_id: CHANNEL_INTEGRATION_ID,
    language: { code: 'id' },
    parameters: { buttons: [], body: [] },
  });
}

module.exports = { sendConfirmation, sendCredential, sendCancelled };
