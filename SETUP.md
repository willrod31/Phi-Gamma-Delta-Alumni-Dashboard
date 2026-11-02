# Setup Guide

This guide takes the site from "preview mode" to live. No coding is needed. Plan on about 20 minutes.

You'll need:

- The **chapter Google account**. Use a regular Gmail account the chapter owns (for example `tauchapter.alumni@gmail.com`), **not** a school or Workspace account. School accounts usually block "anyone with the link" sharing, so photos and newsletters wouldn't show on the site.
- Access to this GitHub repository.

---

## 1. Create the Google Sheet

1. Sign in to Google as the **chapter account**.
2. Go to [sheets.new](https://sheets.new) to create a blank spreadsheet.
3. Name it something clear, like **Tau Chapter Alumni Database**.

This Sheet is the database. Every sign-up, update, photo and newsletter is a row in it.

## 2. Add the script and run `setup()`

1. In the Sheet, open **Extensions > Apps Script**. A new tab opens with a file called `Code.gs`.
2. Delete everything in that file.
3. Open [`apps-script/Code.gs`](apps-script/Code.gs) from this repository, copy **all** of it, and paste it into the editor.
4. Optional: near the top, set `siteUrl` to your site's address (you'll get it in step 5). It's added to the footer of emails.
5. Click **Save** (the disk icon).
6. In the function dropdown at the top (next to **Run** and **Debug**), choose **`setup`**, then click **Run**.
7. Google asks for permission:
   - Click **Review permissions** and choose the chapter account.
   - You'll see **"Google hasn't verified this app."** That's normal for your own script. Click **Advanced**, then **Go to (project name) (unsafe)**.
   - Click **Allow**. The script asks for access to the Sheet, Google Drive (to store photos and PDFs) and Gmail sending (to email brothers).
8. When it finishes, open the **Execution log** at the bottom. You'll see:

   ```
   Setup complete.
   ADMIN KEY: tau-xxxxx-xxxxx-xxxxx-xxxxx
   Upload folder: https://drive.google.com/drive/folders/...
   ```

9. **Copy the admin key** and store it somewhere safe, like the officers' password manager. You need it to sign in to the admin dashboard.

`setup()` created four tabs in the Sheet (**Alumni**, **Updates**, **Photos**, **Newsletters**) and a Drive folder called **Tau Chapter Alumni Site - Uploads**. It's safe to run again later: it only adds what's missing and never deletes anything.

## 3. Deploy the web app

1. In the Apps Script editor, click **Deploy > New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Fill in:
   - **Description:** `Alumni site`
   - **Execute as:** **Me** (the chapter account)
   - **Who has access:** **Anyone**
4. Click **Deploy**. Authorize again if asked.
5. Copy the **Web app URL**. It looks like `https://script.google.com/macros/s/AKfy.../exec`.

"Anyone" access is required so the public site can load content and accept sign-ups. Alumni data is still private: the script only returns it when the request includes the correct admin key.

## 4. Connect the site to the script

1. In this GitHub repository, open [`config.js`](config.js) and click the pencil icon to edit it.
2. Paste the web app URL between the quotes on the `API_URL` line:

   ```js
   API_URL: "https://script.google.com/macros/s/AKfy.../exec",
   ```

3. Optional: add a `CONTACT_EMAIL` to show in the site footer.
4. Click **Commit changes**.

## 5. Turn on GitHub Pages

1. In the repository, go to **Settings > Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Choose the **`main`** branch and the **`/ (root)`** folder, then click **Save**.
4. After a minute or two, the page shows your site's address, for example `https://your-username.github.io/Phi-Gamma-Delta-Alumni-Dashboard/`.

Open the site. The yellow "Preview mode" banner should be gone. To test it, sign up with your own info, then open **Admin** in the footer and sign in with the admin key. Your entry should be in the directory.

## 6. Redeploy after changing the script

Edits to `Code.gs` don't go live until you publish a new version. To keep the **same URL** (so `config.js` doesn't change):

1. In the Apps Script editor, paste in the new code and click **Save**.
2. Click **Deploy > Manage deployments**.
3. Select the existing **Web app** deployment and click the **pencil (Edit)** icon.
4. Under **Version**, choose **New version**.
5. Click **Deploy**.

Don't use **Deploy > New deployment** for updates. It creates a new URL, and you'd have to update `config.js` again.

## 7. Change the admin key and pass it on

When officers change over, rotate the key so former officers lose access:

1. Open the Sheet > **Extensions > Apps Script**.
2. In the function dropdown, choose **`rotateAdminKey`** and click **Run**.
3. Copy the new key from the **Execution log**. The old key stops working right away. Anyone signed in with it is signed out on their next action.
4. Share the new key with the incoming officers privately, for example in person, through a password manager, or by text message. Don't post it in a group chat or email list.

Other options:

- **See the current key:** run **`showAdminKey`**.
- **Choose your own key:** in Apps Script, open **Project Settings** (gear icon) > **Script Properties**, and edit the value of `ADMIN_KEY`.

Also hand over the **chapter Google account** password itself, since that account owns the Sheet, the Drive folder and the script.

## 8. Add content by hand in the Sheet (backup)

If the dashboard isn't working, you can edit the Sheet directly. Add one row per item, keep the header row unchanged, and leave **ID** blank (the dashboard fills it in the next time an admin opens it).

| Tab | What to enter |
|---|---|
| **Updates** | **Date** as `2026-10-20`, **Title**, **Body**, and optionally an **Image URL** |
| **Photos** | **Date**, **Event** (use the same name for every photo from one event), optional **Caption**, **Image URL** |
| **Newsletters** | **Date**, **Issue** (for example `September / October 2026`), optional **Summary**, **PDF URL**, optional **Cover Image URL** |

To get a file URL:

1. Upload the image or PDF to Google Drive (the **Uploads** folder is a good place).
2. Right-click the file > **Share** > under **General access**, choose **Anyone with the link** (Viewer).
3. Click **Copy link** and paste it into the Sheet. The site converts Drive links into images automatically.

The public site caches content for up to **5 minutes**, so changes made directly in the Sheet can take that long to appear. Changes made through the dashboard appear right away.

You can also fix an alumni entry (a typo, for example) by editing its row in the **Alumni** tab.

---

## Troubleshooting

**The site still shows the "Preview mode" banner.**
`API_URL` in `config.js` is empty, or GitHub Pages hasn't rebuilt yet. Wait a minute and hard-refresh the page (Ctrl+Shift+R, or Cmd+Shift+R on a Mac).

**"The server sent an unexpected response."**
Check that `API_URL` is the **Web app** URL ending in `/exec`, not the editor URL. Also check that the deployment's access is set to **Anyone**.

**"The 'Alumni' tab is missing."**
A tab was renamed or deleted. Run `setup()` again to recreate it.

**Photos or PDFs don't show for visitors.**
The files need "Anyone with the link" sharing. This fails on school or Workspace accounts. Use a personal Gmail account for the chapter.

**Email says it's over the daily limit.**
Free Gmail accounts can email about 100 recipients a day, and the limit resets about 24 hours after the first send. Send to a smaller group, wait, or use **Copy addresses** and send from your own email with the addresses in BCC.

**I changed `Code.gs` but nothing changed.**
Publish a new version (step 6).
