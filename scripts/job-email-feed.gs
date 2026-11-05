/**
 * Job-search email feed → Personal OS
 * -----------------------------------
 * Runs inside the job-search Gmail account at
 * script.google.com, signed in as that account. Every run forwards new inbox
 * mail (id, subject, from, date, snippet — never the full body) to the
 * dashboard's ingest endpoint, which dedupes by Gmail message id, so re-sends
 * are harmless.
 *
 * On the server side each item is matched against the applications table by
 * sender domain and organisation name, so a reply from a company you applied
 * to attaches itself to that application and pings Telegram.
 *
 * SETUP (one time, ~5 minutes):
 *  1. Sign in to Gmail as the job-search account. Open https://script.google.com
 *     → New project. Confirm the account shown top-right is the job-search one,
 *     not your personal address — the script reads whichever inbox it runs in.
 *  2. Paste this file. Project Settings → Script properties → add:
 *       DASHBOARD_URL   your deployed dashboard origin (https://….vercel.app)
 *       INGEST_SECRET   the JOBS_INGEST_SECRET value from .env.local / Vercel
 *     (Script properties are safer than editing the constants below.)
 *  3. Run `forwardNewMail` once from the editor — approve the Gmail permission
 *     prompt, then check the dashboard's /apply tab for the items.
 *  4. Triggers (clock icon) → Add trigger → forwardNewMail → time-driven →
 *     every 10 minutes.
 *
 * To verify the wiring without waiting for real mail, run `selfTest` — it
 * posts one synthetic item and reports what the server did with it.
 */

var DASHBOARD_URL = ""; // e.g. "https://personal-os.vercel.app"
var INGEST_SECRET = ""; // JOBS_INGEST_SECRET

var LOOKBACK_DAYS = 3;   // safety window; dedupe makes overlap harmless
var BATCH_CAP = 100;     // server rejects bigger batches

function cfg_(key, fallback) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  return v || fallback || "";
}

function endpoint_() {
  var url = cfg_("DASHBOARD_URL", DASHBOARD_URL).replace(/\/$/, "");
  var secret = cfg_("INGEST_SECRET", INGEST_SECRET);
  if (!url || !secret) throw new Error("Set DASHBOARD_URL and INGEST_SECRET first.");
  return { url: url + "/api/jobs/ingest", secret: secret };
}

function post_(items) {
  var e = endpoint_();
  var res = UrlFetchApp.fetch(e.url, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + e.secret },
    payload: JSON.stringify({ items: items }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    throw new Error("Ingest failed: " + res.getResponseCode() + " " + res.getContentText());
  }
  return res.getContentText();
}

function forwardNewMail() {
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

  // Don't advance the watermark if a batch throws — the next run retries it.
  for (var i = 0; i < items.length; i += BATCH_CAP) {
    post_(items.slice(i, i + BATCH_CAP));
  }
  props.setProperty("LAST_MS", String(maxMs));
}

/** One synthetic item, to prove URL + secret + matching work end to end. */
function selfTest() {
  var out = post_([{
    id: "selftest-" + Date.now(),
    subject: "Self test — ignore",
    from: "Personal OS <selftest@example.com>",
    date: new Date().toISOString(),
    snippet: "Forwarder wiring check.",
  }]);
  Logger.log(out);
  return out;
}

/** Clears the watermark so the next run re-sends the lookback window. */
function resetWatermark() {
  PropertiesService.getScriptProperties().deleteProperty("LAST_MS");
}
