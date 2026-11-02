/* Shared helpers for the public site (index.html) and admin dashboard (admin.html).
   Everything is exposed on window.FG. */
(function () {
  "use strict";

  const CONFIG = window.SITE_CONFIG || {};
  const API_URL = String(CONFIG.API_URL || "").trim();
  const PREVIEW = !API_URL;
  const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/;

  /* ---------- API ---------- */

  async function request(url, options) {
    let res;
    try {
      res = await fetch(url, options);
    } catch (err) {
      throw new Error("Couldn't reach the server. Check your connection and try again.");
    }
    let data;
    try {
      data = await res.json();
    } catch (err) {
      throw new Error("The server sent an unexpected response. Check that API_URL in config.js is the web app URL ending in /exec.");
    }
    if (!data || data.ok !== true) {
      const error = new Error((data && data.error) || "Something went wrong. Please try again.");
      error.data = data || {};
      throw error;
    }
    return data;
  }

  /** Public content: updates, photos, newsletters. */
  function getPublicContent() {
    if (PREVIEW) return Promise.resolve(clone(PREVIEW_CONTENT));
    return request(API_URL, { method: "GET" });
  }

  /** POST a JSON payload to the Apps Script backend. */
  function post(payload) {
    if (PREVIEW) return Promise.reject(new Error("Preview mode: no backend is configured."));
    return request(API_URL, {
      method: "POST",
      // text/plain keeps this a "simple" request, so the browser skips the
      // CORS preflight that Apps Script cannot answer.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
  }

  /* ---------- URLs ---------- */

  function driveFileId(url) {
    const s = String(url || "");
    if (!/(drive|docs)\.google\.com|googleusercontent\.com/.test(s)) return "";
    const m = s.match(/\/(?:file\/)?d\/([\w-]{20,})/) || s.match(/[?&]id=([\w-]{20,})/);
    return m ? m[1] : "";
  }

  /** Converts Drive share links to an embeddable thumbnail URL; passes other http(s) and data: image URLs through. */
  function imageUrl(url, width) {
    const id = driveFileId(url);
    if (id) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${width || 1200}`;
    const s = String(url || "").trim();
    return /^(https?:|data:image\/)/i.test(s) ? s : "";
  }

  /** Link that opens a document (PDF) for reading. */
  function documentUrl(url) {
    const id = driveFileId(url);
    if (id) return `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
    const s = String(url || "").trim();
    return /^https?:/i.test(s) ? s : "";
  }

  /* ---------- Dates ---------- */

  function parseDate(value) {
    if (!value) return null;
    const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    // Parse plain dates as local dates so they don't shift a day in US time zones.
    const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(value);
    return isNaN(d) ? null : d;
  }

  function formatDate(value, style) {
    const d = parseDate(value);
    if (!d) return "";
    const opts = style === "short"
      ? { month: "short", day: "numeric", year: "numeric" }
      : { month: "long", day: "numeric", year: "numeric" };
    return d.toLocaleDateString("en-US", opts);
  }

  function todayISO() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /** Newest first by date; keeps the existing order for ties. */
  function sortNewest(list) {
    return (list || []).slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }

  /* ---------- Text & DOM ---------- */

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  /** Fills elements marked data-config="KEY" from config.js, and the footer contact line. */
  function applyConfig() {
    document.querySelectorAll("[data-config]").forEach((el) => {
      const value = CONFIG[el.dataset.config];
      if (value) el.textContent = value;
    });
    const contact = document.getElementById("footer-contact");
    if (contact && CONFIG.CONTACT_EMAIL) {
      const link = contact.querySelector("a");
      link.href = "mailto:" + CONFIG.CONTACT_EMAIL;
      link.textContent = CONFIG.CONTACT_EMAIL;
      contact.hidden = false;
    }
    if (PREVIEW) {
      const banner = document.getElementById("preview-banner");
      if (banner) banner.hidden = false;
    }
  }

  /** Shows a message in a role="status" element. kind: info | success | error | warn */
  function setStatus(el, message, kind) {
    if (!el) return;
    el.textContent = message || "";
    el.dataset.kind = kind || "info";
  }

  /** Accessible confirm dialog. Resolves true if confirmed. */
  function confirmDialog({ title, message, confirmLabel = "Confirm", danger = false }) {
    return new Promise((resolve) => {
      const dlg = document.createElement("dialog");
      dlg.className = "confirm-dialog";
      dlg.setAttribute("aria-labelledby", "confirm-title");
      dlg.innerHTML = `<form method="dialog">
          <h2 class="confirm-title" id="confirm-title"></h2>
          <div class="confirm-message"></div>
          <div class="confirm-actions">
            <button value="cancel" class="btn btn-ghost">Cancel</button>
            <button value="ok" class="btn ${danger ? "btn-danger" : "btn-primary"}"></button>
          </div>
        </form>`;
      dlg.querySelector(".confirm-title").textContent = title;
      const msg = dlg.querySelector(".confirm-message");
      if (message instanceof Node) msg.append(message);
      else msg.textContent = message;
      dlg.querySelector('[value="ok"]').textContent = confirmLabel;
      dlg.addEventListener("close", () => {
        resolve(dlg.returnValue === "ok");
        dlg.remove();
      });
      document.body.append(dlg);
      dlg.showModal();
      dlg.querySelector('[value="cancel"]').focus();
    });
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.append(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  function downloadText(filename, text, mimeType) {
    const blob = new Blob([text], { type: mimeType || "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------- Files ---------- */

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Couldn't read "${file.name}" as an image. Try a JPEG or PNG.`)); };
      img.src = url;
    });
  }

  /** Resizes an image to fit within maxSize px and re-encodes it as JPEG. Returns base64 data without the prefix. */
  async function resizeImage(file, maxSize = 1600, quality = 0.85) {
    const img = await loadImage(file);
    const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; // JPEG has no transparency
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    return {
      name: file.name.replace(/\.[^.]+$/, "") + ".jpg",
      mimeType: "image/jpeg",
      data: dataUrl.split(",")[1],
    };
  }

  function readFileBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = () => reject(new Error(`Couldn't read "${file.name}".`));
      reader.readAsDataURL(file);
    });
  }

  /* ---------- Preview data (used when API_URL is empty) ---------- */

  function placeholderImage(label, hue) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="hsl(${hue},42%,40%)"/><stop offset="1" stop-color="hsl(${hue + 25},45%,20%)"/>
      </linearGradient></defs>
      <rect width="1200" height="800" fill="url(#g)"/>
      <circle cx="980" cy="160" r="260" fill="rgba(255,255,255,.06)"/>
      <text x="600" y="390" font-family="Georgia,serif" font-size="66" fill="rgba(255,255,255,.92)" text-anchor="middle">${escapeHtml(label)}</text>
      <text x="600" y="460" font-family="Arial,sans-serif" font-size="28" letter-spacing="8" fill="rgba(255,255,255,.6)" text-anchor="middle">SAMPLE PHOTO</text>
    </svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  const PREVIEW_CONTENT = {
    ok: true,
    updates: [
      {
        id: "u1", date: "2026-10-20", title: "The kitchen renovation is finished",
        body: "After a summer of work, the house kitchen has new counters, a commercial range and much better ventilation. Thank you to every alumnus who gave to the house fund. Stop by at Homecoming and see it for yourself.",
        imageUrl: placeholderImage("New house kitchen", 268),
      },
      {
        id: "u2", date: "2026-10-06", title: "Homecoming weekend recap",
        body: "More than 60 alumni came back for Homecoming. Brothers from the class of 1971 through 2026 filled the front lawn for the cookout before the game.\n\nPhotos from the weekend are below.",
        imageUrl: "",
      },
      {
        id: "u3", date: "2026-09-02", title: "Welcome back: fall semester at the house",
        body: "The chapter starts the year with 48 brothers, 21 of them living in the house. New officers were installed in August, and the recruitment committee is planning events for the first six weeks of the semester.",
        imageUrl: "",
      },
      {
        id: "u4", date: "2026-07-15", title: "Summer roof repair update",
        body: "The roof repair on the north wing is complete, and the work came in under budget. The house corporation will share a full report in the next issue of Tau Tales.",
        imageUrl: placeholderImage("Roof repair", 205),
      },
    ],
    photos: [
      { id: "p1", date: "2026-10-04", event: "Homecoming 2026", caption: "Alumni cookout on the front lawn", imageUrl: placeholderImage("Homecoming cookout", 268) },
      { id: "p2", date: "2026-10-04", event: "Homecoming 2026", caption: "Class of 1996 reunion photo", imageUrl: placeholderImage("Class of 1996", 252) },
      { id: "p3", date: "2026-10-04", event: "Homecoming 2026", caption: "Brothers at the game", imageUrl: placeholderImage("At the game", 280) },
      { id: "p4", date: "2026-10-04", event: "Homecoming 2026", caption: "", imageUrl: placeholderImage("House tour", 240) },
      { id: "p5", date: "2026-08-22", event: "Alumni Golf Outing", caption: "Foursome from the class of 1988", imageUrl: placeholderImage("Golf outing", 150) },
      { id: "p6", date: "2026-08-22", event: "Alumni Golf Outing", caption: "Closest to the pin winner", imageUrl: placeholderImage("On the green", 135) },
      { id: "p7", date: "2026-08-22", event: "Alumni Golf Outing", caption: "Dinner after the round", imageUrl: placeholderImage("Dinner", 30) },
      { id: "p8", date: "2026-04-11", event: "Spring Formal", caption: "", imageUrl: placeholderImage("Spring Formal", 290) },
      { id: "p9", date: "2026-04-11", event: "Spring Formal", caption: "Chapter photo", imageUrl: placeholderImage("Chapter photo", 262) },
    ],
    newsletters: [
      { id: "n1", date: "2026-10-01", issue: "September / October 2026", summary: "Homecoming preview, the finished kitchen, fall recruitment numbers and a profile of the new chapter president.", pdfUrl: "", coverUrl: "" },
      { id: "n2", date: "2026-08-01", issue: "July / August 2026", summary: "Summer house projects, the golf outing and graduating seniors' first jobs.", pdfUrl: "", coverUrl: placeholderImage("Tau Tales", 268) },
      { id: "n3", date: "2026-06-01", issue: "May / June 2026", summary: "Commencement, the spring awards banquet and the new house corporation board.", pdfUrl: "", coverUrl: "" },
      { id: "n4", date: "2026-04-01", issue: "March / April 2026", summary: "Spring Formal, philanthropy week results and alumni notes.", pdfUrl: "", coverUrl: "" },
      { id: "n5", date: "2026-02-01", issue: "January / February 2026", summary: "Winter term recap and the plan for the kitchen renovation.", pdfUrl: "", coverUrl: "" },
      { id: "n6", date: "2025-12-01", issue: "November / December 2025", summary: "Thanksgiving dinner at the house and year-end giving.", pdfUrl: "", coverUrl: "" },
      { id: "n7", date: "2025-10-01", issue: "September / October 2025", summary: "Homecoming 2025 and a welcome to the new pledge class.", pdfUrl: "", coverUrl: "" },
    ],
  };

  const PREVIEW_ALUMNI = [
    ["a01", "2026-10-28T15:02:00Z", "Daniel Whitaker", 2019, "Indianapolis, IN", "Crossroads Health Partners", "Financial Analyst", "(317) 555-0142", "dan.whitaker@example.com", "Yes"],
    ["a02", "2026-10-25T21:40:00Z", "Marcus Bell", 2008, "Chicago, IL", "Lakefront Capital", "Managing Director", "(312) 555-0187", "marcus.bell@example.com", "Yes"],
    ["a03", "2026-10-21T13:15:00Z", "Thomas Grady", 1985, "Louisville, KY", "", "Retired", "(502) 555-0110", "tgrady@example.com", "No"],
    ["a04", "2026-10-19T02:05:00Z", "Ryan Okafor", 2022, "Columbus, OH", "Buckeye Engineering", "Civil Engineer", "(614) 555-0129", "ryan.okafor@example.com", "Yes"],
    ["a05", "2026-10-12T18:30:00Z", "Christopher Hale", 1996, "Nashville, TN", "Hale & Moreno LLP", "Partner", "(615) 555-0173", "chale@example.com", "Yes"],
    ["a06", "2026-10-09T16:45:00Z", "Andrew Kim", 2014, "Denver, CO", "Summit Software", "Product Manager", "(720) 555-0156", "andrew.kim@example.com", "Yes"],
    ["a07", "2026-10-05T11:20:00Z", "Joseph Reyes", 2001, "Hanover, IN", "Madison Consolidated Schools", "Principal", "(812) 555-0134", "jreyes@example.com", "No"],
    ["a08", "2026-09-30T23:10:00Z", "William Foster", 1978, "Cincinnati, OH", "", "", "(513) 555-0168", "bill.foster@example.com", "No"],
    ["a09", "2026-09-27T14:00:00Z", "Ethan Brooks", 2025, "Bloomington, IN", "Indiana University", "Law Student", "(812) 555-0191", "ethan.brooks@example.com", "Yes"],
    ["a10", "2026-09-22T17:35:00Z", "Samuel Ortiz", 2011, "Atlanta, GA", "Peachtree Logistics", "Operations Director", "(404) 555-0117", "sam.ortiz@example.com", "Yes"],
    ["a11", "2026-09-18T12:50:00Z", "Patrick Nolan", 1991, "Evansville, IN", "Nolan Family Dental", "Dentist", "(812) 555-0105", "pnolan@example.com", "No"],
    ["a12", "2026-09-15T19:25:00Z", "Benjamin Carter", 2017, "Washington, DC", "U.S. Department of Commerce", "Policy Advisor", "(202) 555-0148", "ben.carter@example.com", "Yes"],
  ].map(([id, submitted, name, gradYear, location, employer, position, phone, email, networking]) => ({
    id, submitted, updated: submitted, name, gradYear, location, employer, position, phone, email, networking,
  }));

  window.FG = {
    CONFIG, API_URL, PREVIEW, EMAIL_RE,
    getPublicContent, post,
    driveFileId, imageUrl, documentUrl,
    parseDate, formatDate, todayISO, sortNewest,
    escapeHtml, clone, applyConfig, setStatus, confirmDialog, copyText, downloadText,
    resizeImage, readFileBase64,
    PREVIEW_CONTENT, PREVIEW_ALUMNI,
  };
})();
