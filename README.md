# Central Browser

A multifunctional web browser, built with Electron.

## Features

- Multiple tabs with automatic shrinking (never scroll)
- Custom title bar (minimize/maximize/close integrated to the right of the tabs)
- Previous/Next/Refresh/Stop/Home navigation + smart address bar
- Favorites (quick star + full panel with search)
- History grouped by time period (Today/Yesterday/This week/Oldest) + search
- Downloads with live progress
- New window and Private browsing (non-persistent session, separate theme)
- Search within page, zoom, print
- Local password manager (detection, encrypted saving, autofill)

- Google account (true persistent session → "Sign in with Google" SSO works)
- **Integrated page translator** (Free MyMemory or Google Cloud Translate)
- **Cookie management**: cookie browser per domain + blocking of third-party cookies
- **Premium PDF viewer**: embedded Mozilla pdf.js engine (Firefox's) —

Continuous scrolling, search, zoom, print, rotate, page thumbnails
- **Video Player** (VLC style): playlist with thumbnails, playback history, automatic resume from the last position, Previous/Next, automatic playback of the next video, MKV/AVI/FLV/WMV support via FFmpeg
- **Audio Player** with playlist and history (same logic as the video player)
- **PDF Manager**: organize, merge, compress, split, edit (watermark/text, blank pages) and convert PDFs (Word/Excel/HTML ↔ PDF)
- **File Transfer** (Xender style): detection of devices on the same Wi-Fi network, pairing with a confirmation code, ultra-fast file/folder transfer via direct HTTP (no data passes through the internet), history and progress tracking

## Details on the video and audio players

Both players (menu ⋮ → Applications → "Video Player" / "Audio Player") open
to a "Playlist / History" area in a sidebar, with the player on the left:

- **Playlist**: "➕ Add" button (multiple selection) or drag and drop directly
into the window. Reorderable by dragging and dropping within the list. Each video item
displays an automatically generated **thumbnail** (via FFmpeg).

- **Previous / Next** + **autoplay** of the next item at the end of
playback (🔗 button to disable). The 🔁 button only loops the current item.

- **History**: each played file appears with the date and progress;

click to replay, ✕ to exit, "Clear History" to clear everything.

- **Auto Resume**: playback position is saved regularly (and upon
closing); When reopening a file that has already started, playback resumes from where it left off (unless you are at the very beginning or almost at the end).

- **Extended formats (MKV, AVI, FLV, WMV)**: These containers are not natively supported by Chromium. The video player uses **FFmpeg** (binary embedded via the `ffmpeg-static` package, no separate installation required): fast remuxing without re-encoding when possible, otherwise full re-encoding as a fallback (slower on large files — a "Converting…" screen is displayed). The result is cached in the application's data folder to avoid re-conversion with each playback.

## Details on the 3 previous features

### 1. Page translator
Button 🌐 in the toolbar. Choose a target language: the visible text of the page

is extracted, sent to the chosen translation service, and then reinserted into the page.

- **Default: MyMemory**, free, no key required, but limited to approximately **5,000 characters/day**
per IP address (large pages may not be fully translated — a message will inform you). You can add your email address in Settings → Translation to multiply this quota by 10.

- **Alternative: Google Cloud Translate**, unlimited but paid and requires an API key

which you create yourself at https://console.cloud.google.com (API "Cloud Translation").

- "View original page" button to cancel the translation on the current tab.

### 2. Cookie Management
Menu ⋮ → "Cookie Management" (or Settings → Cookies → "Manage Cookies"):

- Lists all cookies for the current session, grouped by domain
- Delete by domain or global deletion
- "Block third-party cookies" checkbox: actually blocks the sending/receiving of cookies
for requests whose domain differs from the one displayed in the tab (same principle
as Chrome/Firefox's third-party blocking)

### 3. Premium PDF Viewer
Any link or address ending in `.pdf` is automatically opened in Mozilla's
real **pdf.js** engine (the one used by Firefox), embedded locally in
the app — not just a basic preview. Features included: continuous scrolling,
