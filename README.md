# Phi Gamma Delta · Tau Chapter Alumni Site

A website for alumni of the Phi Gamma Delta Tau Chapter at Hanover College. It does three things:

1. **Keeps alumni up to date.** The home page shows news from the house and photos from recent events.
2. **Hosts Tau Tales.** Every issue of the bi-monthly newsletter, grouped by year.
3. **Runs the alumni directory.** Alumni sign up on the site. Chapter admins see the list on a private dashboard and use it to email brothers about dinners, events and job opportunities.

Everything runs on free services: **GitHub Pages** hosts the site, a **Google Sheet** holds the data, and a **Google Apps Script** connects the two. The script also stores uploads in **Google Drive** and sends email through **Gmail**. There are no accounts for alumni, no paid services and no build step.

**To set it up, follow [SETUP.md](SETUP.md).**

## What's where

| File | What it is |
|---|---|
| `index.html` | Public site: Home, Tau Tales and Join the Directory |
| `admin.html` | Admin dashboard: directory, email and posting content |
| `styles.css` | Shared styles (purple and white, serif headings) |
| `common.js` | Shared helpers: API calls, Drive link conversion, dates, uploads, preview sample data |
| `config.js` | **Settings:** the script URL, chapter name, school and contact email |
| `apps-script/Code.gs` | Backend. Paste it into the Google Sheet's Apps Script editor |
| `SETUP.md` | Step-by-step setup and handover guide |

All the data is in the chapter's Google Sheet:

| Tab | Holds |
|---|---|
| **Alumni** | Directory sign-ups (private: only returned to someone with the admin key) |
| **Updates** | "From the House" posts |
| **Photos** | Event photos, grouped on the site by the **Event** column |
| **Newsletters** | Tau Tales issues |

Uploaded photos and PDFs go to the **Tau Chapter Alumni Site - Uploads** folder in the chapter's Google Drive.

## Posting content

Open the site, click **Admin** in the footer, and sign in with the admin key. Then open **Post Content**:

- **House update:** a title, date and text, plus an optional photo. It appears at the top of "From the House".
- **Event photos:** an event name and date, an optional caption, and one or more photos. To add more photos to an event later, use exactly the same event name (the field suggests names you've used before).
- **Tau Tales issue:** the issue name (for example "September / October 2026"), date, summary, PDF and an optional cover image. Without a cover, the site draws one.

Photos are resized in your browser to 1,600 pixels before upload, so photos straight from a phone are fine. PDFs can be up to 20 MB.

Each section lists what's already posted, with a **Delete** button. Deleting an item removes it from the site and moves its file to the Drive trash, where it can be recovered for 30 days.

## Using the directory

The **Alumni Directory** tab shows totals, a searchable and sortable list, and filters for graduation year and "open to networking". **Export CSV** and **Copy emails** both use the current filter. On a phone, the list switches to cards with tap-to-call and tap-to-email links.

The **Email Brothers** tab sends a message to all alumni, those open to networking, a class-year range, or whatever the directory is filtered to. Mail goes out from the chapter account in batches of 50, with everyone in BCC, and the chapter account gets a copy. Free Gmail allows about **100 recipients a day**, and the tab shows how many are left. For bigger lists, use **Copy addresses** and send from your own email with the addresses in BCC.

When someone signs up again with the same email address, their existing entry is updated instead of duplicated. That's also how alumni update their own info.

## Preview mode

If `API_URL` in `config.js` is empty, the site runs in **preview mode**. It shows clearly labeled sample content, doesn't save sign-ups, and the dashboard accepts any key and uses sample alumni. This lets you review the site before the backend is set up. To preview locally, open `index.html` in a browser, or run `python3 -m http.server` in this folder and go to <http://localhost:8000>.

## Privacy and security

- The public `GET` endpoint returns only updates, photos and newsletters. Alumni data is returned only with the admin key.
- The admin key is sent in the request body (never in the URL), kept only for the current browser tab, and checked on the server. A wrong key gets a deliberate delay to slow down guessing.
- Sign-ups are checked in the browser and again on the server. A hidden "honeypot" field catches spam bots, and all writes use a lock so simultaneous sign-ups can't overwrite each other.
- Values that start with `=`, `+`, `-` or `@` are stored as plain text, so nothing a visitor types can run as a spreadsheet formula. CSV exports are protected the same way.
- Email only goes to addresses that are already in the Alumni tab.

The site uses a text wordmark (ΦΓΔ), not the fraternity's crest or other trademarked marks.
