# 📦 LanBox - Fast LAN File Sharing

![Python](https://img.shields.io/badge/Python-3.8%2B-blue)
![Framework](https://img.shields.io/badge/Framework-Flask-black)
![Platform](https://img.shields.io/badge/Platform-Web%20%2B%20LAN-lightgrey)
![Dependency](https://img.shields.io/badge/Dependency-zeroconf-orange)
![License](https://img.shields.io/badge/License-MIT-green)

LanBox is a lightweight local network tool for sharing files and notes between devices on the same LAN.

It provides a clean web interface, drag-and-drop uploads, and mDNS discovery support (`lanbox.local`) for easier access on your network.

---

## 🎯 Purpose of This Project

This project is designed for:

- Fast file sharing on local networks
- Sharing quick notes between devices
- Running a zero-cloud, local-first transfer tool
- Simple self-hosted setup with Python + Flask

If you need a quick local sharing box without third-party services, LanBox keeps everything on your own network.

---

## ✨ Features

- Responsive web UI (desktop + mobile)
- Drag-and-drop file upload
- Direct file download and delete
- Shared notes wall (add, copy, delete)
- Light/Dark theme toggle
- Auto-refresh for files and notes
- mDNS announcement with Zeroconf
- Supports large uploads (up to 5GB)

---

## 📁 Project Structure

- `server.py` - Flask backend and API routes
- `web/index.html` - main UI page
- `web/style.css` - app styling and responsive layout
- `web/app.js` - frontend logic for uploads, notes, and polling
- `web/manifest.json` - PWA metadata
- `web/service-worker.js` - service worker
- `lanbox.bat` - Windows auto-setup and run script
- `lanbox-background.bat` - background runner loop (no console)
- `lanbox-startup.vbs` - hidden launcher for startup
- `install-startup.bat` - install Windows Startup shortcut
- `remove-startup.bat` - remove Windows Startup shortcut
- `requirements.txt` - Python dependencies
- `data/notes.json` - persisted notes
- `files/` - uploaded files storage directory

---

## 🧰 Requirements

- Python 3.8+
- pip

Install dependencies:

```bash
pip install -r requirements.txt
```

---

## 🚀 Installation & Run

From project root:

```bash
python server.py
```

Or on Windows (auto install + auto restart):

```bash
lanbox.bat
```

Then open:

- `http://localhost:3000`
- `http://lanbox.local:3000` (when mDNS is available on your network)

---

## 🪟 Run on Windows Startup (Background)

LanBox includes scripts to auto-start in the background when you log in to Windows.

### One-time setup

From project root, run:

```bat
install-startup.bat
```

This creates a Startup shortcut that launches LanBox hidden on each login.

### How it works

- `lanbox-background.bat` runs `pythonw server.py` in a restart loop
- `lanbox-startup.vbs` starts it with no visible console window
- `install-startup.bat` adds a Startup shortcut automatically

### Remove auto-start

If you want to disable startup:

```bat
remove-startup.bat
```

### Important

- Keep this project folder in a fixed path after installing startup.
- If you move the folder, run `remove-startup.bat` then `install-startup.bat` again.

---

## 🔌 API Overview

- `POST /api/upload` - upload a file
- `GET /api/files` - list uploaded files
- `POST /api/delete-file` - delete file by filename
- `GET /download/<filename>` - download a file
- `GET /api/notes` - list notes
- `POST /api/notes/add` - add note
- `POST /api/notes/delete` - delete note by id

---

## 🛡️ Notes

- LanBox is intended for trusted local networks.
- Uploaded files are saved directly in `files/`.
- Notes are persisted in `data/notes.json`.
- Filenames are sanitized on upload for safer file handling.

---

## 🤝 Contributing

Contributions are welcome. Suggested workflow:

1. Fork the repository
2. Create a feature branch
3. Open a pull request

Read contribution details in `CONTRIBUTING.md`.

---

## 📄 License

This project is licensed under the MIT License.
See `LICENSE` for full text.

