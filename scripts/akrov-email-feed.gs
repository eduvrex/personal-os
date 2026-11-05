/**
 * Akrov email feed → Personal OS
 * -------------------------------
 * Runs inside the AKROV Gmail account (script.google.com, signed in as that
 * account). Every run forwards new inbox mail (id, subject, from, date,
 * snippet — never the full body) to the dashboard's ingest endpoint, which
 * dedupes by Gmail message id, so re-sends are harmless.
 *
 * SETUP (one time, ~5 minutes):
 *  1. In the Akrov Gmail account, open https://script.google.com → New project.
 *  2. Paste this file. Set the two constants below:
 *       DASHBOARD_URL  — your deployed dashboard origin (https://…vercel.app)
 *       INGEST_SECRET  — the AKROV_INGEST_SECRET value from .env.local
 *     (Better: Project Settings → Script properties → add DASHBOARD_URL and
 *      INGEST_SECRET there instead of hardcoding, then leave these "".)
 *  3. Run `forwardNewMail` once from the editor — approve the Gmail permission
 *     prompt, check the dashboard's Akrov tab for the items.
 *  4. Triggers (clock icon) → Add trigger → forwardNewMail → time-driven →
 *     every 10 minutes.
 */

var DASHBOARD_URL = ""; // e.g. "https://personal-os.vercel.app"
var INGEST_SECRET = ""; // AKROV_INGEST_SECRET from .env.local

var LOOKBACK_DAYS = 3;   // safety window; dedupe makes overlap harmless
var BATCH_CAP = 100;     // server rejects bigger batches

function cfg_(key, fallback) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  return v || fallback || "";
}

function forwardNewMail() {
  var url = cfg_("DASHBOARD_URL", DASHBOARD_URL).replace(/\/$/, "");
  var secret = cfg_("INGEST_SECRET", INGEST_SECRET);
  if (!url || !secret) throw new Error("Set DASHBOARD_URL and INGEST_SECRET first.");

  var props = PropertiesService.getScriptProperties();
  var watermark = Number(props.getProperty("LAST_MS") || 0);

  var threads = GmailApp.search("in:inbox newer_than:" + LOOKBACK_DAYS + "d");
  var items = [];
  var maxMs = watermark;

  for (var t = 0; t < threads.length; t++) {
    var msgs = threads[t].getMessages();
    for (var m = 0; m < msgs.length; m++) {
      var msg = msgs[m];
      var ms = msg.getDate().getTime();
      if (ms <= watermark) continue;
      items.push({
        id: msg.getId(),
        subject: (msg.getSubject() || "(no subject)").slice(0, 300),
        from: (msg.getFrom() || "").slice(0, 200),
        date: msg.getDate().toISOString(),
        snippet: (msg.getPlainBody() || "").replace(/\s+/g, " ").trim().slice(0, 400),
      });
      if (ms > maxMs) maxMs = ms;
    }
  }
  if (items.length === 0) return;

  for (var i = 0; i < items.length; i += BATCH_CAP) {
    var res = UrlFetchApp.fetch(url + "/api/akrov/ingest", {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + secret },
      payload: JSON.stringify({ items: items.slice(i, i + BATCH_CAP) }),
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() !== 200) {
      // Don't advance the watermark — next run retries this window.
      throw new Error("Ingest failed: " + res.getResponseCode() + " " + res.getContentText());
    }
  }
  props.setProperty("LAST_MS", String(maxMs));
}
