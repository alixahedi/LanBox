try:
    import eventlet
    eventlet.monkey_patch()
    ASYNC_MODE = "eventlet"
except ImportError:
    ASYNC_MODE = "threading"

import os
import json
import uuid
import socket
import ssl
import time
import argparse
import logging
from flask import Flask, request, jsonify, send_from_directory
from flask_socketio import SocketIO, emit, join_room, leave_room
from werkzeug.utils import secure_filename
from zeroconf import Zeroconf, ServiceInfo, NonUniqueNameException

from paths import web_dir, files_dir, data_dir
from ssl_certs import ensure_certificates

DEFAULT_PORT = 3000


class _SuppressWerkzeugSocketNoise(logging.Filter):
    def filter(self, record):
        return "write() before start_response" not in record.getMessage()


logging.getLogger("werkzeug").addFilter(_SuppressWerkzeugSocketNoise())


def build_ssl_context(cert_path, key_path):
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(cert_path, key_path)
    return ctx

FILES_DIR = files_dir()
DATA_DIR = data_dir()
NOTES_FILE = os.path.join(DATA_DIR, "notes.json")
USERS_FILE = os.path.join(DATA_DIR, "users.json")
MESSAGES_FILE = os.path.join(DATA_DIR, "messages.json")
FILE_META_FILE = os.path.join(DATA_DIR, "file_meta.json")
WEB_DIR = web_dir()
BROADCAST_USER = "__broadcast__"
BROADCAST_ROOM = "broadcast"

os.makedirs(FILES_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

for path, default in [
    (NOTES_FILE, []),
    (USERS_FILE, []),
    (MESSAGES_FILE, []),
    (FILE_META_FILE, {}),
]:
    if not os.path.exists(path):
        with open(path, "w", encoding="utf8") as f:
            json.dump(default, f)

app = Flask(__name__, static_folder=WEB_DIR, static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024 * 1024  # 5GB
app.config["SECRET_KEY"] = os.environ.get("LANBOX_SECRET", "lanbox-local-dev-key")

socketio = SocketIO(app, cors_allowed_origins="*", async_mode=ASYNC_MODE)

# username -> {sid, public_key, last_seen}
online_users = {}

def load_json(path, default):
    try:
        with open(path, "r", encoding="utf8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return default


def save_json(path, data):
    with open(path, "w", encoding="utf8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def load_notes():
    return load_json(NOTES_FILE, [])


def save_notes(notes):
    save_json(NOTES_FILE, notes)


def load_users():
    return load_json(USERS_FILE, [])


def save_users(users):
    save_json(USERS_FILE, users)


def load_messages():
    return load_json(MESSAGES_FILE, [])


def save_messages(messages):
    # Keep last 5000 messages
    if len(messages) > 5000:
        messages = messages[-5000:]
    save_json(MESSAGES_FILE, messages)


def load_file_meta():
    return load_json(FILE_META_FILE, {})


def save_file_meta(meta):
    save_json(FILE_META_FILE, meta)


def get_env_admins():
    raw = os.environ.get("LANBOX_ADMIN", "").strip()
    if not raw:
        return set()
    return {name.strip().lower() for name in raw.split(",") if name.strip()}


def has_any_admin(users):
    if get_env_admins():
        return True
    return any(u.get("is_admin") for u in users)


def is_admin(username):
    if not username:
        return False
    uname = username.strip().lower()
    if uname in get_env_admins():
        return True
    users = load_users()
    user = next((u for u in users if u["username"].lower() == uname), None)
    return bool(user and user.get("is_admin"))


def can_delete_file(username, uploaded_by):
    if not username:
        return False
    if is_admin(username):
        return True
    return bool(uploaded_by and uploaded_by == username)


def ensure_admin_exists():
    users = load_users()
    if has_any_admin(users):
        for user in users:
            if user["username"].lower() in get_env_admins():
                user["is_admin"] = True
        save_users(users)
        return
    if users:
        users[0]["is_admin"] = True
        save_users(users)


def safe_file_path(filename):
    safe = secure_filename(filename)
    if not safe:
        return None
    full = os.path.abspath(os.path.join(FILES_DIR, safe))
    if not full.startswith(os.path.abspath(FILES_DIR)):
        return None
    return safe


def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except OSError:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip


def broadcast_online():
    names = sorted(online_users.keys())
    socketio.emit("online_users", {"users": names})


# -------------------------
# FRONTEND
# -------------------------

@app.route("/")
def index():
    return send_from_directory(WEB_DIR, "index.html")


@app.route("/api/server/info")
def server_info():
    port = int(os.environ.get("LANBOX_PORT", DEFAULT_PORT))
    https_enabled = os.environ.get("LANBOX_HTTPS", "1") == "1"
    scheme = "https" if https_enabled else "http"
    ip = get_local_ip()
    return jsonify({
        "name": "LanBox",
        "version": "2.0",
        "ip": ip,
        "port": port,
        "scheme": scheme,
        "url": f"{scheme}://{ip}:{port}",
        "secureContextRequired": True,
    })


# -------------------------
# USER API
# -------------------------

@app.route("/api/users", methods=["GET"])
def list_users():
    users = load_users()
    return jsonify([{"username": u["username"]} for u in users])


@app.route("/api/users/register", methods=["POST"])
def register_user():
    data = request.json or {}
    username = (data.get("username") or "").strip()
    public_key = (data.get("publicKey") or "").strip()

    if not username or len(username) < 2 or len(username) > 32:
        return jsonify({"error": "Username must be 2-32 characters"}), 400

    if not public_key:
        public_key = f"legacy-{uuid.uuid4()}"

    if not username.replace("_", "").replace("-", "").isalnum():
        return jsonify({"error": "Username: letters, numbers, _ and - only"}), 400

    users = load_users()
    existing = next((u for u in users if u["username"].lower() == username.lower()), None)

    if existing:
        existing["public_key"] = public_key
        if username.lower() in get_env_admins():
            existing["is_admin"] = True
        save_users(users)
        return jsonify({
            "status": "ok",
            "username": existing["username"],
            "isAdmin": is_admin(existing["username"]),
        })

    new_user = {
        "id": str(uuid.uuid4()),
        "username": username,
        "public_key": public_key,
        "created_at": time.time(),
    }
    if not has_any_admin(users):
        new_user["is_admin"] = True
    elif username.lower() in get_env_admins():
        new_user["is_admin"] = True
    users.append(new_user)
    save_users(users)
    return jsonify({
        "status": "ok",
        "username": username,
        "isAdmin": is_admin(username),
    })


@app.route("/api/users/<username>/key", methods=["GET"])
def get_user_key(username):
    users = load_users()
    user = next((u for u in users if u["username"].lower() == username.lower()), None)
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify({"username": user["username"], "publicKey": user["public_key"]})


@app.route("/api/users/online", methods=["GET"])
def get_online():
    return jsonify({"users": sorted(online_users.keys())})


# -------------------------
# CHAT API (encrypted payloads only)
# -------------------------

@app.route("/api/chat/broadcast/history")
def broadcast_history():
    messages = load_messages()
    thread = [m for m in messages if m.get("to_user") == BROADCAST_USER]
    thread.sort(key=lambda m: m.get("timestamp", 0))
    return jsonify(thread[-200:])


@app.route("/api/chat/broadcast/send", methods=["POST"])
def broadcast_send():
    data = request.json or {}
    from_user = (data.get("from") or "").strip()
    text = (data.get("text") or "").strip()

    if not from_user or not text:
        return jsonify({"error": "Missing fields"}), 400

    msg = {
        "id": str(uuid.uuid4()),
        "from_user": from_user,
        "to_user": BROADCAST_USER,
        "text": text,
        "timestamp": time.time(),
    }
    messages = load_messages()
    messages.append(msg)
    save_messages(messages)

    socketio.emit("broadcast_message", msg, room=BROADCAST_ROOM)
    return jsonify({"status": "ok", "id": msg["id"]})


@app.route("/api/chat/updates")
def chat_updates():
    me = (request.args.get("me") or "").strip()
    if not me:
        return jsonify({"error": "me required"}), 400
    try:
        since = float(request.args.get("since", 0))
    except ValueError:
        since = 0

    messages = load_messages()
    updates = []
    for m in messages:
        ts = float(m.get("timestamp", 0))
        if ts <= since:
            continue
        to_user = m.get("to_user")
        if to_user == BROADCAST_USER or to_user == me:
            updates.append(m)
    updates.sort(key=lambda m: m.get("timestamp", 0))
    return jsonify(updates)


@app.route("/api/chat/history", methods=["GET"])
def chat_history():
    with_user = (request.args.get("with") or "").strip()
    me = (request.args.get("me") or "").strip()
    if not with_user or not me:
        return jsonify({"error": "me and with required"}), 400

    messages = load_messages()
    thread = [
        m for m in messages
        if m.get("to_user") != BROADCAST_USER
        and (
            (m["from_user"] == me and m["to_user"] == with_user)
            or (m["from_user"] == with_user and m["to_user"] == me)
        )
    ]
    thread.sort(key=lambda m: m.get("timestamp", 0))
    return jsonify(thread[-200:])


@app.route("/api/chat/send", methods=["POST"])
def chat_send():
    data = request.json or {}
    from_user = (data.get("from") or "").strip()
    to_user = (data.get("to") or "").strip()
    ciphertext = data.get("ciphertext")
    iv = data.get("iv")

    if not from_user or not to_user or not ciphertext or not iv:
        return jsonify({"error": "Missing fields"}), 400

    msg = {
        "id": str(uuid.uuid4()),
        "from_user": from_user,
        "to_user": to_user,
        "ciphertext": ciphertext,
        "iv": iv,
        "timestamp": time.time(),
    }
    messages = load_messages()
    messages.append(msg)
    save_messages(messages)

    socketio.emit("chat_message", msg, room=f"user:{to_user}")
    return jsonify({"status": "ok", "id": msg["id"]})


@app.route("/api/chat/delete-mine", methods=["POST"])
def delete_my_chats():
    data = request.json or {}
    username = (data.get("username") or "").strip()
    if not username:
        return jsonify({"error": "username required"}), 400

    messages = load_messages()
    kept = [
        m for m in messages
        if m.get("from_user") != username and m.get("to_user") != username
    ]
    deleted = len(messages) - len(kept)
    save_messages(kept)

    socketio.emit("chats_deleted", {"username": username})
    return jsonify({"status": "ok", "deleted": deleted})


# -------------------------
# FILE API
# -------------------------

@app.route("/api/upload", methods=["POST"])
def upload_file():
    if "file" not in request.files:
        return jsonify({"error": "No file"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "Empty filename"}), 400

    encrypted = request.form.get("encrypted") == "true"
    original_name = request.form.get("originalName", file.filename)
    salt = request.form.get("salt", "")
    iv = request.form.get("iv", "")
    enc_mode = request.form.get("encMode", "")
    uploaded_by = request.form.get("uploadedBy", "")

    if encrypted:
        safe_name = secure_filename(original_name) or f"encrypted_{uuid.uuid4().hex[:8]}"
        if not safe_name.endswith(".enc"):
            safe_name = f"{safe_name}.enc"
    else:
        safe_name = secure_filename(file.filename)
        if not safe_name:
            return jsonify({"error": "Invalid filename"}), 400

    filepath = os.path.join(FILES_DIR, safe_name)
    file.save(filepath)

    meta = load_file_meta()
    file_entry = {"uploaded_by": uploaded_by, "uploaded_at": time.time()}
    if encrypted:
        file_entry.update({
            "encrypted": True,
            "original_name": original_name,
            "salt": salt,
            "iv": iv,
            "encMode": enc_mode or "webcrypto",
        })
    meta[safe_name] = file_entry
    save_file_meta(meta)

    socketio.emit("file_uploaded", {
        "name": safe_name,
        "original_name": original_name if encrypted else safe_name,
        "size": os.path.getsize(filepath),
        "uploaded_by": uploaded_by,
        "encrypted": encrypted,
    })

    return jsonify({"status": "ok", "name": safe_name})


@app.route("/api/files")
def list_files():
    me = (request.args.get("me") or "").strip()
    meta = load_file_meta()
    files = []
    for name in os.listdir(FILES_DIR):
        path = os.path.join(FILES_DIR, name)
        if os.path.isfile(path):
            entry = {"name": name, "size": os.path.getsize(path)}
            if name in meta:
                entry.update(meta[name])
            entry["can_delete"] = can_delete_file(me, entry.get("uploaded_by", ""))
            files.append(entry)
    return jsonify(files)


@app.route("/download/<path:filename>")
def download(filename):
    safe = safe_file_path(filename)
    if not safe:
        return jsonify({"error": "Invalid filename"}), 400
    return send_from_directory(FILES_DIR, safe, as_attachment=True)


@app.route("/api/delete-file", methods=["POST"])
def delete_file():
    data = request.json or {}
    filename = data.get("filename")
    username = (data.get("username") or "").strip()
    if not filename:
        return jsonify({"error": "filename missing"}), 400
    if not username:
        return jsonify({"error": "username required"}), 400

    safe = safe_file_path(filename)
    if not safe:
        return jsonify({"error": "Invalid filename"}), 400

    meta = load_file_meta()
    uploaded_by = meta.get(safe, {}).get("uploaded_by", "")
    if not can_delete_file(username, uploaded_by):
        return jsonify({"error": "Not allowed to delete this file"}), 403

    path = os.path.join(FILES_DIR, safe)
    if os.path.exists(path):
        os.remove(path)

    if safe in meta:
        del meta[safe]
        save_file_meta(meta)

    return jsonify({"status": "deleted"})


# -------------------------
# NOTES API
# -------------------------

@app.route("/api/notes")
def get_notes():
    return jsonify(load_notes())


@app.route("/api/notes/add", methods=["POST"])
def add_note():
    data = request.json or {}
    text = data.get("text", "").strip()
    if not text:
        return jsonify({"error": "empty"}), 400

    notes = load_notes()
    note = {"id": str(uuid.uuid4()), "text": text}
    notes.append(note)
    save_notes(notes)
    return jsonify({"status": "ok"})


@app.route("/api/notes/delete", methods=["POST"])
def delete_note():
    data = request.json or {}
    note_id = data.get("id")
    notes = load_notes()
    notes = [n for n in notes if n["id"] != note_id]
    save_notes(notes)
    return jsonify({"status": "deleted"})


# -------------------------
# Socket.IO — presence & live chat
# -------------------------

@socketio.on("connect")
def on_connect():
    pass


@socketio.on("disconnect")
def on_disconnect():
    sid = request.sid
    to_remove = [u for u, info in online_users.items() if info.get("sid") == sid]
    for username in to_remove:
        del online_users[username]
        leave_room(f"user:{username}")
    if to_remove:
        broadcast_online()


@socketio.on("user_join")
def on_user_join(data):
    username = (data or {}).get("username", "").strip()
    public_key = (data or {}).get("publicKey", "").strip()
    if not username:
        return

    join_room(f"user:{username}")
    join_room(BROADCAST_ROOM)
    online_users[username] = {
        "sid": request.sid,
        "public_key": public_key,
        "last_seen": time.time(),
    }
    broadcast_online()
    emit("joined", {"username": username, "online": sorted(online_users.keys())})


# -------------------------
# Zeroconf (mDNS)
# -------------------------

def register_mdns(port, scheme="https"):
    ip = get_local_ip()
    machine = socket.gethostname().replace(" ", "-")[:32]
    service_name = f"LanBox-{machine}-{port}._http._tcp.local."

    info = ServiceInfo(
        "_http._tcp.local.",
        service_name,
        addresses=[socket.inet_aton(ip)],
        port=port,
        properties={"path": "/", "app": "LanBox", "scheme": scheme},
        server=f"{machine}.local.",
    )

    try:
        zeroconf = Zeroconf()
        zeroconf.register_service(info, allow_name_change=True)
        print(f"mDNS registered: {info.name} -> {scheme}://{ip}:{port}")
        return zeroconf
    except NonUniqueNameException:
        print(f"mDNS name already in use — another LanBox may be running.")
        print(f"Server will still start at {scheme}://{ip}:{port}")
        return None
    except Exception as exc:
        print(f"mDNS registration skipped ({exc}).")
        print(f"Share this address manually: {scheme}://{ip}:{port}")
        return None


def run_server(host="0.0.0.0", port=DEFAULT_PORT, use_mdns=True, use_https=True):
    ensure_admin_exists()
    os.environ["LANBOX_PORT"] = str(port)
    os.environ["LANBOX_HTTPS"] = "1" if use_https else "0"
    ssl_context = None
    scheme = "http"
    if use_https:
        try:
            cert_path, key_path = ensure_certificates()
            ssl_context = build_ssl_context(cert_path, key_path)
            scheme = "https"
        except Exception as exc:
            print(f"HTTPS setup failed ({exc}). Falling back to HTTP.")
            print("Install cryptography: pip install cryptography")
            use_https = False
            os.environ["LANBOX_HTTPS"] = "0"

    ip = get_local_ip()
    zeroconf = None
    if use_mdns:
        zeroconf = register_mdns(port, scheme)
    try:
        print(f"LanBox server starting on {scheme}://{ip}:{port} ({ASYNC_MODE})")
        if use_https:
            print("First visit: accept the browser security warning (self-signed cert).")
            print("Use HTTPS on all devices so Chrome allows notifications.")
        socketio.run(
            app,
            host=host,
            port=port,
            debug=False,
            allow_unsafe_werkzeug=True,
            ssl_context=ssl_context,
        )
    finally:
        if zeroconf:
            zeroconf.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="LanBox server")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--no-mdns", action="store_true")
    parser.add_argument("--no-https", action="store_true", help="Run HTTP only (notifications blocked in Chrome)")
    args = parser.parse_args()
    run_server(
        host=args.host,
        port=args.port,
        use_mdns=not args.no_mdns,
        use_https=not args.no_https,
    )
