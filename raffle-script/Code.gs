/**
 * הגרלה — pashutlitzor.com
 * מדביקים בעורך Apps Script של גיליון Google חדש (Extensions → Apps Script),
 * מפעילים setup() פעם אחת, ופורסים כ-Web app (Execute as: Me, Who has access: Anyone).
 * פירוט מלא ב-README.md, סעיף "הגרלה".
 */

// תאריך הסיום (שעון ישראל, כולל היסט). חייב להתאים ל-endsAt ב-content/raffle.json.
// דוגמה: '2026-11-01T20:00:00+02:00'  (בשעון קיץ: +03:00)
var ENDS_AT = '2026-10-31T20:00:00+02:00';

var SHEET_NAME = 'נרשמות';
var WINNER_SHEET = 'זוכה';
var HEADERS = ['זמן הרשמה', 'שם מלא', 'טלפון', 'טלפון מנורמל', 'הסכמה לדיוור', 'זמן הסכמה לדיוור'];

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  // עמודת טלפון כטקסט כדי ש-0 בתחילת המספר לא יימחק
  sh.getRange('C:D').setNumberFormat('@');
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('הגרלה').addItem('בחר זוכות', 'pickWinner').addToUi();
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// 05XXXXXXXX (נייד ישראלי) או null
function normalizePhone_(raw) {
  var d = String(raw || '').replace(/\D/g, '');
  if (d.indexOf('972') === 0) d = '0' + d.slice(3);
  return /^05\d{8}$/.test(d) ? d : null;
}

// מונע הזרקת נוסחאות בגיליון
function safeCell_(s) {
  s = String(s);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return json_({ ok: false, error: 'busy' });
  }
  try {
    var data = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    if (data.website) return json_({ ok: true }); // honeypot: בוט, מתעלמים בשקט

    if (!ENDS_AT || Date.now() >= new Date(ENDS_AT).getTime()) {
      return json_({ ok: false, error: 'closed' });
    }

    var name = String(data.name || '').replace(/\s+/g, ' ').trim();
    if (name.length < 2 || name.length > 60) return json_({ ok: false, error: 'invalid_name' });
    if (data.terms !== true) return json_({ ok: false, error: 'terms' });

    var phone = normalizePhone_(data.phone);
    if (!phone) return json_({ ok: false, error: 'invalid_phone' });

    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    var last = sh.getLastRow();
    if (last > 1) {
      var existing = sh.getRange(2, 4, last - 1, 1).getValues();
      for (var i = 0; i < existing.length; i++) {
        if (String(existing[i][0]) === phone) return json_({ ok: false, error: 'duplicate' });
      }
    }

    var now = new Date();
    var marketing = data.marketing === true;
    sh.appendRow([now, safeCell_(name), phone, phone, marketing ? 'כן' : 'לא', marketing ? now : '']);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: 'server' });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return json_({ ok: true });
}

// תפריט בגיליון: הגרלה → בחר זוכות. שתי זוכות שונות (מקום ראשון ושני), נשמרות בלשונית "זוכה".
function pickWinner() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  var last = sh.getLastRow();
  if (last < 3) { ui.alert('נדרשות לפחות 2 נרשמות.'); return; }
  var rows = sh.getRange(2, 1, last - 1, 4).getValues();
  var first = Math.floor(Math.random() * rows.length);
  var second;
  do { second = Math.floor(Math.random() * rows.length); } while (second === first);
  var ws = ss.getSheetByName(WINNER_SHEET) || ss.insertSheet(WINNER_SHEET);
  var now = new Date();
  ws.appendRow([now, 'מקום ראשון', rows[first][1], rows[first][2], 'מתוך ' + rows.length + ' נרשמות']);
  ws.appendRow([now, 'מקום שני', rows[second][1], rows[second][2], 'מתוך ' + rows.length + ' נרשמות']);
  ui.alert('מקום ראשון: ' + rows[first][1] + ' — ' + rows[first][2] + '\nמקום שני: ' + rows[second][1] + ' — ' + rows[second][2]);
}
