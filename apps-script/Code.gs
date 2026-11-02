/**
 * Phi Gamma Delta · Tau Chapter alumni site — Google Apps Script backend.
 *
 * This script is bound to the chapter's Google Sheet, which is the database.
 * Deploy it as a web app (Execute as: Me, Who has access: Anyone). See SETUP.md.
 *
 *   GET          -> public content only: updates, photos, newsletters. Never alumni data.
 *   POST (JSON)  -> {action: "signup", data}
 *                   {action: "admin", key, op, ...}
 *                     op: ping | alumni | content | add | delete | upload | email
 *
 * The site sends POST bodies as Content-Type text/plain so browsers skip the
 * CORS preflight request, which Apps Script cannot answer.
 */

// ---- Settings you may edit --------------------------------------------------

const SETTINGS = {
  // Shown as the sender name on emails to brothers.
  senderName: 'Phi Gamma Delta · Tau Chapter',
  // Optional: the public site address, added to the footer of emails.
  // Example: 'https://your-username.github.io/Phi-Gamma-Delta-Alumni-Dashboard/'
  siteUrl: '',
  // Name of the Drive folder setup() creates for photos and newsletter PDFs.
  uploadFolderName: 'Tau Chapter Alumni Site - Uploads',
};

// ---- Constants --------------------------------------------------------------

// Sheet tabs: [column header, field name used by the website].
const SCHEMA = {
  Alumni: [
    ['ID', 'id'],
    ['Submitted', 'submitted'],
    ['Updated', 'updated'],
    ['Name', 'name'],
    ['Grad Year', 'gradYear'],
    ['Location (City, State)', 'location'],
    ['Employer', 'employer'],
    ['Position', 'position'],
    ['Phone', 'phone'],
    ['Email', 'email'],
    ['Open to Networking', 'networking'],
  ],
  Updates: [
    ['ID', 'id'],
    ['Date', 'date'],
    ['Title', 'title'],
    ['Body', 'body'],
    ['Image URL', 'imageUrl'],
  ],
  Photos: [
    ['ID', 'id'],
    ['Date', 'date'],
    ['Event', 'event'],
    ['Caption', 'caption'],
    ['Image URL', 'imageUrl'],
  ],
  Newsletters: [
    ['ID', 'id'],
    ['Date', 'date'],
    ['Issue', 'issue'],
    ['Summary', 'summary'],
    ['PDF URL', 'pdfUrl'],
    ['Cover Image URL', 'coverUrl'],
  ],
};

const KEY_BY_HEADER = Object.keys(SCHEMA).reduce((acc, tab) => {
  acc[tab] = {};
  SCHEMA[tab].forEach(([header, key]) => { acc[tab][header] = key; });
  return acc;
}, {});

const CONTENT_TABS = { update: 'Updates', photo: 'Photos', newsletter: 'Newsletters' };
const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/;
const EMAIL_BATCH_SIZE = 50;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const UPLOAD_TYPES = {
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png': [0x89, 0x50, 0x4E, 0x47],
  'application/pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
};
const PUBLIC_CACHE_KEY = 'public-content';
const PUBLIC_CACHE_SECONDS = 300;

// ---- Web app entry points ---------------------------------------------------

function doGet() {
  return json_(getPublicContent_());
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'Invalid request.' });
  }
  try {
    if (req.action === 'signup') return json_(signup_(req.data));
    if (req.action === 'admin') return json_(admin_(req));
    return json_({ ok: false, error: 'Unknown action.' });
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return json_({ ok: false, error: 'Server error: ' + (err && err.message ? err.message : err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---- One-time setup (run from the Apps Script editor) -----------------------

/**
 * Creates the tabs and headers, the Drive upload folder and the admin key.
 * Safe to run again: it only adds what is missing and never deletes data.
 */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Open this script from the Google Sheet (Extensions > Apps Script), then run setup().');
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SPREADSHEET_ID', ss.getId());

  Object.keys(SCHEMA).forEach((tab) => {
    const sheet = ss.getSheetByName(tab) || ss.insertSheet(tab);
    const headers = SCHEMA[tab].map((pair) => pair[0]);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    } else {
      const existing = headers_(sheet);
      headers.filter((h) => existing.indexOf(h) < 0).forEach((h) => {
        sheet.getRange(1, sheet.getLastColumn() + 1).setValue(h);
      });
    }
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, sheet.getLastColumn())
      .setFontWeight('bold').setBackground('#4a2788').setFontColor('#ffffff');
  });

  // Remove the empty default tab a new spreadsheet starts with.
  ['Sheet1', 'Sheet 1'].forEach((name) => {
    const blank = ss.getSheetByName(name);
    if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  });

  let folder = null;
  try {
    const folderId = props.getProperty('FOLDER_ID');
    if (folderId) folder = DriveApp.getFolderById(folderId);
  } catch (err) {
    folder = null;
  }
  if (!folder) {
    folder = DriveApp.createFolder(SETTINGS.uploadFolderName);
    props.setProperty('FOLDER_ID', folder.getId());
  }

  let key = props.getProperty('ADMIN_KEY');
  if (!key) {
    key = generateKey_();
    props.setProperty('ADMIN_KEY', key);
  }

  // Touch MailApp so the email permission is requested now, not on first send.
  const quota = MailApp.getRemainingDailyQuota();

  Logger.log('Setup complete.');
  Logger.log('ADMIN KEY: ' + key);
  Logger.log('Upload folder: ' + folder.getUrl());
  Logger.log('Email quota remaining today: ' + quota);
  Logger.log('Next: Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).');
}

/** Replaces the admin key. The old key stops working immediately. */
function rotateAdminKey() {
  const key = generateKey_();
  PropertiesService.getScriptProperties().setProperty('ADMIN_KEY', key);
  Logger.log('NEW ADMIN KEY: ' + key);
}

/** Prints the current admin key to the log. */
function showAdminKey() {
  Logger.log('ADMIN KEY: ' + PropertiesService.getScriptProperties().getProperty('ADMIN_KEY'));
}

function generateKey_() {
  const hex = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  return 'tau-' + [0, 5, 10, 15].map((i) => hex.slice(i, i + 5)).join('-');
}

// ---- Public content ---------------------------------------------------------

function getPublicContent_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(PUBLIC_CACHE_KEY);
  if (hit) return JSON.parse(hit);
  const data = Object.assign({ ok: true }, readContent_());
  try {
    cache.put(PUBLIC_CACHE_KEY, JSON.stringify(data), PUBLIC_CACHE_SECONDS);
  } catch (err) {
    // Too large to cache; serving uncached is fine.
  }
  return data;
}

function clearPublicCache_() {
  CacheService.getScriptCache().remove(PUBLIC_CACHE_KEY);
}

function readContent_() {
  return {
    updates: newestFirst_(readTable_('Updates')),
    photos: newestFirst_(readTable_('Photos')),
    newsletters: newestFirst_(readTable_('Newsletters')),
  };
}

function newestFirst_(rows) {
  return rows
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || b._row - a._row)
    .map(stripRow_);
}

// ---- Alumni sign-up ---------------------------------------------------------

function signup_(data) {
  data = data || {};
  // Honeypot: people never see this field. Report success so bots move on.
  if (clean_(data.website, 200)) return { ok: true, updated: false };

  const rec = {
    name: clean_(data.name, 120).replace(/\s+/g, ' '),
    gradYear: clean_(data.gradYear, 10),
    location: clean_(data.location, 120),
    employer: clean_(data.employer, 120),
    position: clean_(data.position, 120),
    phone: formatPhone_(clean_(data.phone, 40)),
    email: clean_(data.email, 254).toLowerCase(),
    networking: isYes_(data.networking) ? 'Yes' : 'No',
  };
  const errors = validateAlumnus_(rec);
  if (errors.length) return { ok: false, error: errors.join(' ') };
  rec.gradYear = Number(rec.gradYear);

  return withLock_(() => {
    const now = new Date();
    const existing = readTable_('Alumni').find((r) => String(r.email).trim().toLowerCase() === rec.email);
    if (existing) {
      rec.updated = now;
      writeRecord_('Alumni', existing._row, rec);
      return { ok: true, updated: true };
    }
    rec.id = newId_();
    rec.submitted = now;
    rec.updated = now;
    appendRecord_('Alumni', rec);
    return { ok: true, updated: false };
  });
}

function validateAlumnus_(a) {
  const errors = [];
  const maxYear = new Date().getFullYear() + 6;
  const year = Number(a.gradYear);
  const phoneDigits = a.phone.replace(/\D/g, '');
  if (a.name.length < 2) errors.push('Please enter your full name.');
  if (!/^\d{4}$/.test(a.gradYear) || year < 1900 || year > maxYear) errors.push('Graduation year must be a 4-digit year.');
  if (!a.location) errors.push('Please enter where you live (City, State).');
  if (phoneDigits.length < 10 || phoneDigits.length > 15) errors.push('Phone number needs at least 10 digits.');
  if (!EMAIL_RE.test(a.email)) errors.push('Please enter a valid email address.');
  return errors;
}

/** Formats US numbers as (812) 555-1234; leaves international numbers as entered. */
function formatPhone_(s) {
  if (/^\+(?!1)/.test(s)) return s;
  let digits = s.replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '1') digits = digits.slice(1);
  if (digits.length !== 10) return s;
  return '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
}

// ---- Admin API --------------------------------------------------------------

function admin_(req) {
  if (!checkKey_(req.key)) {
    Utilities.sleep(1500); // slows down key guessing
    return { ok: false, auth: false, error: 'Invalid admin key.' };
  }
  switch (req.op) {
    case 'ping':
      return { ok: true, quota: MailApp.getRemainingDailyQuota() };
    case 'alumni':
      withLock_(() => ensureIds_('Alumni'));
      return {
        ok: true,
        alumni: readTable_('Alumni')
          .sort((a, b) => String(b.submitted).localeCompare(String(a.submitted)))
          .map(stripRow_),
      };
    case 'content':
      withLock_(() => Object.keys(CONTENT_TABS).forEach((type) => ensureIds_(CONTENT_TABS[type])));
      return Object.assign({ ok: true }, readContent_());
    case 'add':
      return addContent_(req.type, req.data);
    case 'delete':
      return deleteRecord_(req.type, req.id);
    case 'upload':
      return upload_(req);
    case 'email':
      return sendEmail_(req);
    default:
      return { ok: false, error: 'Unknown admin operation.' };
  }
}

function checkKey_(key) {
  const expected = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!expected || typeof key !== 'string') return false;
  const given = key.trim();
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function addContent_(type, d) {
  const tab = CONTENT_TABS[type];
  if (!tab) return { ok: false, error: 'Unknown content type.' };
  d = d || {};
  let rec;
  let missing;
  if (type === 'update') {
    rec = {
      title: clean_(d.title, 200),
      date: cleanDate_(d.date),
      body: clean_(d.body, 10000, true),
      imageUrl: cleanUrl_(d.imageUrl),
    };
    missing = !rec.title || !rec.date || !rec.body;
  } else if (type === 'photo') {
    rec = {
      event: clean_(d.event, 200),
      date: cleanDate_(d.date),
      caption: clean_(d.caption, 300),
      imageUrl: cleanUrl_(d.imageUrl),
    };
    missing = !rec.event || !rec.date || !rec.imageUrl;
  } else {
    rec = {
      issue: clean_(d.issue, 120),
      date: cleanDate_(d.date),
      summary: clean_(d.summary, 2000, true),
      pdfUrl: cleanUrl_(d.pdfUrl),
      coverUrl: cleanUrl_(d.coverUrl),
    };
    missing = !rec.issue || !rec.date || !rec.pdfUrl;
  }
  if (missing) return { ok: false, error: 'Please fill in all required fields.' };
  rec.id = newId_();
  withLock_(() => appendRecord_(tab, rec));
  clearPublicCache_();
  return { ok: true, item: rec };
}

function deleteRecord_(type, id) {
  const tab = type === 'alumni' ? 'Alumni' : CONTENT_TABS[type];
  if (!tab) return { ok: false, error: 'Unknown item type.' };
  id = clean_(id, 64);
  if (!id) return { ok: false, error: 'Missing item ID.' };
  return withLock_(() => {
    const row = readTable_(tab).find((r) => String(r.id) === id);
    if (!row) return { ok: false, error: 'That item no longer exists. Refresh and try again.' };
    sheet_(tab).deleteRow(row._row);
    if (tab !== 'Alumni') {
      clearPublicCache_();
      trashUploads_([row.imageUrl, row.pdfUrl, row.coverUrl]);
    }
    return { ok: true };
  });
}

function upload_(req) {
  const mime = String(req.mimeType || '');
  const signature = UPLOAD_TYPES[mime];
  if (!signature) return { ok: false, error: 'Only JPEG/PNG images and PDF files can be uploaded.' };
  if (typeof req.data !== 'string' || !req.data) return { ok: false, error: 'The file was empty.' };
  if (req.data.length > Math.ceil(MAX_UPLOAD_BYTES / 3) * 4) return { ok: false, error: 'Files must be under 20 MB.' };

  const bytes = Utilities.base64Decode(req.data);
  const matches = signature.every((b, i) => (bytes[i] & 0xFF) === b);
  if (!matches) return { ok: false, error: 'That file does not look like a valid ' + (mime === 'application/pdf' ? 'PDF.' : 'image.') };

  const name = clean_(req.name, 120).replace(/[\\/:*?"<>|]+/g, '-') || 'upload';
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const file = folder_().createFile(Utilities.newBlob(bytes, mime, stamp + ' ' + name));
  let warning = '';
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {
    warning = 'Uploaded, but Drive would not allow "anyone with the link" sharing, so visitors may not see it. ' +
      'Use a personal Google account for the chapter (see SETUP.md).';
  }
  return { ok: true, id: file.getId(), url: 'https://drive.google.com/file/d/' + file.getId() + '/view', warning: warning };
}

function sendEmail_(req) {
  const subject = clean_(req.subject, 200);
  const body = clean_(req.body, 20000, true);
  const replyTo = clean_(req.replyTo, 254);
  if (!subject || !body) return { ok: false, error: 'Add a subject and a message.' };
  if (replyTo && !EMAIL_RE.test(replyTo)) return { ok: false, error: 'The reply-to address is not valid.' };

  // Only send to addresses that are actually in the directory.
  const known = {};
  readTable_('Alumni').forEach((a) => {
    const email = String(a.email || '').trim();
    if (EMAIL_RE.test(email)) known[email.toLowerCase()] = email;
  });
  const seen = {};
  const list = [];
  (Array.isArray(req.recipients) ? req.recipients : []).forEach((e) => {
    const k = String(e || '').trim().toLowerCase();
    if (known[k] && !seen[k]) {
      seen[k] = true;
      list.push(known[k]);
    }
  });
  if (!list.length) return { ok: false, error: 'None of the selected recipients are in the alumni directory.' };

  const batches = [];
  for (let i = 0; i < list.length; i += EMAIL_BATCH_SIZE) batches.push(list.slice(i, i + EMAIL_BATCH_SIZE));
  // Each batch is also addressed To: the chapter account, which counts toward the quota.
  const needed = list.length + batches.length;
  const quota = MailApp.getRemainingDailyQuota();
  if (needed > quota) {
    return {
      ok: false,
      code: 'quota',
      quota: quota,
      needed: needed,
      error: 'This send needs ' + needed + ' of today\'s email quota, but only ' + quota + ' remain. ' +
        'Send to a smaller group, wait until tomorrow, or copy the addresses and send from your own email.',
    };
  }

  const self = Session.getEffectiveUser().getEmail();
  const footer = 'You are receiving this because you joined the ' + SETTINGS.senderName + ' alumni directory. ' +
    'To be removed, reply to this email.' + (SETTINGS.siteUrl ? '\n' + SETTINGS.siteUrl : '');
  let sent = 0;
  try {
    batches.forEach((batch) => {
      const message = {
        to: self,
        bcc: batch.join(','),
        subject: subject,
        body: body + '\n\n--\n' + footer,
        htmlBody: emailHtml_(body, footer),
        name: SETTINGS.senderName,
      };
      if (replyTo) message.replyTo = replyTo;
      MailApp.sendEmail(message);
      sent += batch.length;
    });
  } catch (err) {
    return {
      ok: false,
      sent: sent,
      quota: MailApp.getRemainingDailyQuota(),
      error: 'Sent to ' + sent + ' of ' + list.length + ' before an error: ' + err.message,
    };
  }
  return { ok: true, sent: sent, batches: batches.length, quota: MailApp.getRemainingDailyQuota() };
}

function emailHtml_(text, footer) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const linkify = (s) => s.replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g, (url) => '<a href="' + url + '">' + url + '</a>');
  return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f1a29;max-width:640px">' +
    linkify(esc(text)).replace(/\n/g, '<br>') +
    '<hr style="border:0;border-top:1px solid #e4deec;margin:28px 0 12px">' +
    '<p style="font-size:12px;color:#6b6478;margin:0">' + linkify(esc(footer)).replace(/\n/g, '<br>') + '</p></div>';
}

// ---- Sheet helpers ----------------------------------------------------------

let ss_ = null;

function spreadsheet_() {
  if (!ss_) {
    const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    ss_ = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  }
  return ss_;
}

function sheet_(tab) {
  const sheet = spreadsheet_().getSheetByName(tab);
  if (!sheet) throw new Error('The "' + tab + '" tab is missing. Run setup() in the Apps Script editor.');
  return sheet;
}

function headers_(sheet) {
  const cols = Math.max(1, sheet.getLastColumn());
  return sheet.getRange(1, 1, 1, cols).getValues()[0].map((h) => String(h).trim());
}

/** Reads a tab into objects keyed by field name. Each object has _row (sheet row number). */
function readTable_(tab) {
  const values = sheet_(tab).getDataRange().getValues();
  if (values.length < 2) return [];
  const tz = spreadsheet_().getSpreadsheetTimeZone();
  const headers = values[0].map((h) => String(h).trim());
  const cols = SCHEMA[tab].map(([header, key]) => ({ key: key, idx: headers.indexOf(header) }));
  const rows = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (row.every((v) => v === '' || v === null)) continue;
    const obj = { _row: r + 1 };
    cols.forEach((c) => { obj[c.key] = c.idx < 0 ? '' : cellOut_(row[c.idx], c.key, tz); });
    rows.push(obj);
  }
  return rows;
}

function writeRecord_(tab, rowNum, rec) {
  const sheet = sheet_(tab);
  const headers = headers_(sheet);
  const range = sheet.getRange(rowNum, 1, 1, headers.length);
  // Re-guard existing values too: getValues() drops the protective apostrophe.
  const row = range.getValues()[0].map(cellIn_);
  headers.forEach((h, i) => {
    const key = KEY_BY_HEADER[tab][h];
    if (key && Object.prototype.hasOwnProperty.call(rec, key)) row[i] = cellIn_(rec[key]);
  });
  range.setValues([row]);
}

function appendRecord_(tab, rec) {
  const sheet = sheet_(tab);
  sheet.appendRow(headers_(sheet).map((h) => {
    const key = KEY_BY_HEADER[tab][h];
    return key && rec[key] != null ? cellIn_(rec[key]) : '';
  }));
}

/** Gives an ID to any rows added by hand in the Sheet so they can be deleted from the dashboard. */
function ensureIds_(tab) {
  const sheet = sheet_(tab);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;
  const idCol = values[0].map((h) => String(h).trim()).indexOf('ID');
  if (idCol < 0) return;
  let changed = false;
  const ids = values.slice(1).map((row) => {
    const blankRow = row.every((v) => v === '' || v === null);
    if (!blankRow && !String(row[idCol]).trim()) {
      changed = true;
      return [newId_()];
    }
    return [row[idCol]];
  });
  if (changed) sheet.getRange(2, idCol + 1, ids.length, 1).setValues(ids);
}

function cellOut_(v, key, tz) {
  if (v instanceof Date) {
    if (key === 'submitted' || key === 'updated') return v.toISOString();
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return key === 'gradYear' ? v : String(v);
  return String(v == null ? '' : v).replace(/^'(?=[=+\-@])/, '');
}

/** Blocks spreadsheet formula injection: a leading apostrophe makes Sheets store text. */
function cellIn_(v) {
  if (typeof v !== 'string') return v;
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

function stripRow_(r) {
  const out = Object.assign({}, r);
  delete out._row;
  return out;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ---- Value helpers ----------------------------------------------------------

function clean_(v, max, multiline) {
  let s = v == null ? '' : String(v);
  s = s.replace(/\r\n?/g, '\n');
  s = multiline
    ? s.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
    : s.replace(/[\u0000-\u001F\u007F]+/g, ' ');
  return s.trim().slice(0, max);
}

function cleanDate_(v) {
  const s = clean_(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function cleanUrl_(v) {
  const s = clean_(v, 500);
  return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : '';
}

function isYes_(v) {
  return v === true || /^(yes|true|on|y|1)$/i.test(String(v == null ? '' : v).trim());
}

function newId_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

function driveId_(url) {
  const s = String(url || '');
  if (!/(drive|docs)\.google\.com|googleusercontent\.com/.test(s)) return '';
  const m = s.match(/\/(?:file\/)?d\/([\w-]{20,})/) || s.match(/[?&]id=([\w-]{20,})/);
  return m ? m[1] : '';
}

// ---- Drive helpers ----------------------------------------------------------

function folder_() {
  const id = PropertiesService.getScriptProperties().getProperty('FOLDER_ID');
  if (!id) throw new Error('Upload folder not set up. Run setup() in the Apps Script editor.');
  return DriveApp.getFolderById(id);
}

/** Moves files this site uploaded to the Drive trash (recoverable for 30 days). */
function trashUploads_(urls) {
  const folderId = PropertiesService.getScriptProperties().getProperty('FOLDER_ID');
  urls.forEach((url) => {
    const id = driveId_(url);
    if (!id || !folderId) return;
    try {
      const file = DriveApp.getFileById(id);
      const parents = file.getParents();
      while (parents.hasNext()) {
        if (parents.next().getId() === folderId) {
          file.setTrashed(true);
          return;
        }
      }
    } catch (err) {
      // Already gone, or not a file this site manages.
    }
  });
}
