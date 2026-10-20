/**
 * Dashboard PIP Puslapdik — Webhook Perubahan Spreadsheet
 * =======================================================
 * Pasang script ini pada SETIAP spreadsheet sumber (Progres Penyaluran SK
 * dan Rencana Kegiatan). Saat spreadsheet berubah, script mengirim
 * pemberitahuan ke aplikasi; aplikasi lalu MEMBACA ULANG data sendiri
 * (payload webhook tidak dipercaya sebagai data).
 *
 * CARA PASANG (lihat juga Docs/SETUP-GOOGLE-SHEETS.md):
 * 1. Buka spreadsheet → Extensions → Apps Script.
 * 2. Tempel seluruh isi file ini ke Code.gs.
 * 3. Isi WEBHOOK_URL dan WEBHOOK_SECRET di bawah.
 *    - WEBHOOK_SECRET harus SAMA dengan env GOOGLE_WEBHOOK_SECRET di Vercel.
 * 4. Simpan, lalu jalankan fungsi `setupTrigger` sekali (menu Run).
 *    Beri izin saat diminta.
 * 5. Uji dengan menjalankan fungsi `testWebhook` — cek log (View → Logs).
 *
 * Jika link spreadsheet BERGANTI (file baru untuk tahun berikutnya):
 * pasang script ini di file baru dan jalankan setupTrigger di sana; trigger
 * pada file lama boleh dihapus lewat menu Triggers (ikon jam).
 */

var WEBHOOK_URL = 'https://GANTI-DOMAIN-ANDA.vercel.app/api/sync/webhook';
var WEBHOOK_SECRET = 'ISI-SAMA-DENGAN-GOOGLE_WEBHOOK_SECRET';

/** Kirim pemberitahuan perubahan (dipanggil trigger onChange/onEdit). */
function notifyChange() {
  var id = SpreadsheetApp.getActiveSpreadsheet().getId();
  var payload = { spreadsheetId: id };
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Webhook-Secret': WEBHOOK_SECRET },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };
  try {
    var res = UrlFetchApp.fetch(WEBHOOK_URL, options);
    Logger.log('Webhook: ' + res.getResponseCode() + ' ' + res.getContentText());
  } catch (err) {
    Logger.log('Webhook gagal: ' + err);
  }
}

/**
 * Debounce sederhana: perubahan beruntun (mengetik banyak sel) hanya
 * mengirim satu webhook per ~30 detik.
 */
function notifyChangeDebounced() {
  var cache = CacheService.getScriptCache();
  if (cache.get('webhook-sent')) return;
  cache.put('webhook-sent', '1', 30);
  notifyChange();
}

/** Jalankan SEKALI untuk memasang installable trigger onChange. */
function setupTrigger() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // Bersihkan trigger lama milik project ini agar tidak dobel.
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'notifyChangeDebounced') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('notifyChangeDebounced').forSpreadsheet(ss).onChange().create();
  Logger.log('Trigger onChange terpasang untuk: ' + ss.getName());
}

/** Uji manual pengiriman webhook (lihat hasil di Logs). */
function testWebhook() {
  notifyChange();
}
