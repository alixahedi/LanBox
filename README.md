# LanBox

![Python](https://img.shields.io/badge/Python-3.8%2B-blue)
![Framework](https://img.shields.io/badge/Framework-Flask-black)
![Platform](https://img.shields.io/badge/Platform-Web%20%2B%20LAN-lightgrey)
![License](https://img.shields.io/badge/License-MIT-green)

LanBox is a lightweight LAN app for sharing files, notes, and chat between devices on the same local network. Run the server on one machine, then connect from any phone, tablet, or PC in the browser.

No cloud account required. Data stays on your network.

---

## Features

- **Web UI** — works on desktop, phone, and tablet
- **File sharing** — drag-and-drop upload, download, delete
- **Password-protected files** — encrypted in the browser before upload
- **Broadcast chat** — message everyone on the LAN
- **Private messages** — end-to-end encrypted (Web Crypto on HTTPS/localhost)
- **Shared notes wall** — quick sticky notes for the LAN
- **Online users** — live presence via WebSocket
- **System notifications** — alerts for new files and messages (HTTPS)
- **Themes** — light and dark mode
- **PWA-friendly** — installable from the browser with a service worker
- **mDNS discovery** — optional local discovery when supported

---

## Quick start

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

On Windows, you can double-click `lanbox.bat` to install dependencies and start the server.

### 2. Start the server (host device)

```bash
python server.py
```

The server starts with **HTTPS by default**, for example:

```
https://192.168.1.10:3000
```

Share that address with other devices on the same Wi‑Fi or LAN.

### 3. Connect from other devices

1. Open the **HTTPS** URL in Chrome, Edge, or Safari.
2. Accept the self-signed certificate warning (one time per device).
3. Choose a username — it is saved on that device.
4. Click **Enable** on the notification banner if you want system alerts.

---

## HTTPS and notifications

Chrome blocks system notifications on plain `http://192.168.x.x` addresses. LanBox generates a self-signed certificate automatically (stored in `certs/` on first run) so notifications can work on your LAN IP.

| URL | Notifications |
|-----|----------------|
| `https://192.168.x.x:3000` | Supported (accept cert warning first) |
| `http://localhost:3000` | Supported |
| `http://192.168.x.x:3000` | Blocked by Chrome |

To run HTTP only (not recommended):

```bash
python server.py --no-https
```

---

## Server options

```bash
python server.py                  # HTTPS on port 3000 (default)
python server.py --port 8080      # Custom port
python server.py --no-mdns        # Disable mDNS registration
python server.py --no-https       # HTTP only
python server.py --host 0.0.0.0   # Listen on all interfaces (default)
```

Environment variables:

- `LANBOX_PORT` — port number
- `LANBOX_HTTPS` — `1` or `0`
- `LANBOX_SECRET` — Flask session secret (optional)

---

## Windows helpers

| Script | Purpose |
|--------|---------|
| `lanbox.bat` | Install deps and run the server (auto-restart on crash) |
| `install-startup.bat` | Add LanBox to Windows startup |
| `remove-startup.bat` | Remove from Windows startup |
| `lanbox-background.bat` | Run server in the background |

---

## Project structure

```
LanBox/
├── server.py           # Flask + Socket.IO backend
├── ssl_certs.py        # Self-signed HTTPS certificate generation
├── paths.py            # Runtime directory paths
├── requirements.txt    # Python dependencies
├── lanbox.bat          # Windows launcher
├── web/                # Frontend (HTML, CSS, JS)
│   ├── app.js          # Main UI logic
│   ├── crypto.js       # E2E chat & file encryption
│   └── service-worker.js
├── files/              # Uploaded files (created at runtime)
├── data/               # Users, notes, messages (created at runtime)
└── certs/              # Auto-generated TLS cert (created at runtime)
```

---

## API overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/server/info` | Server IP, port, and URL |
| `POST` | `/api/users/register` | Register username and public key |
| `GET` | `/api/users/online` | List online users |
| `GET` | `/api/chat/broadcast/history` | Broadcast message history |
| `POST` | `/api/chat/broadcast/send` | Send a broadcast message |
| `GET` | `/api/chat/history` | Private message history |
| `POST` | `/api/chat/send` | Send an encrypted private message |
| `POST` | `/api/chat/delete-mine` | Delete all messages for a user |
| `POST` | `/api/upload` | Upload a file |
| `GET` | `/api/files` | List uploaded files |
| `GET` | `/api/notes` | List shared notes |

Live updates also use Socket.IO events: `broadcast_message`, `chat_message`, `file_uploaded`, `online_users`.

---

## Security notes

LanBox is designed for **trusted local networks** (home Wi-Fi, lab, office). It does not provide user authentication beyond choosing a username.

- Usernames are stored per device in browser `localStorage`.
- Full E2E chat encryption works on HTTPS or localhost.
- On plain HTTP LAN, chat and file encryption use a compatible fallback so phones can still connect.
- Anyone on the network who knows the server address can join.

Do not expose LanBox directly to the public internet without additional hardening.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and pull request guidelines.

---

## License

MIT License — see [LICENSE](LICENSE).
