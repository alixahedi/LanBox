import os
import json
import uuid
import socket
from flask import Flask, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from zeroconf import Zeroconf, ServiceInfo

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

FILES_DIR = os.path.join(BASE_DIR, "files")
DATA_DIR = os.path.join(BASE_DIR, "data")
NOTES_FILE = os.path.join(DATA_DIR, "notes.json")

os.makedirs(FILES_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

if not os.path.exists(NOTES_FILE):
    with open(NOTES_FILE, "w", encoding="utf8") as f:
        json.dump([], f)

app = Flask(__name__, static_folder="web", static_url_path="")
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024 * 1024  # 5GB


# -------------------------
# Helper: Get Local IP
# -------------------------

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip


# -------------------------
# FRONTEND
# -------------------------

@app.route("/")
def index():
    return send_from_directory("web", "index.html")


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

    safe_name = secure_filename(file.filename)
    if not safe_name:
        return jsonify({"error": "Invalid filename"}), 400

    filepath = os.path.join(FILES_DIR, safe_name)
    file.save(filepath)

    return jsonify({"status": "ok"})


@app.route("/api/files")
def list_files():

    files = []

    for name in os.listdir(FILES_DIR):
        path = os.path.join(FILES_DIR, name)

        if os.path.isfile(path):
            files.append({
                "name": name,
                "size": os.path.getsize(path)
            })

    return jsonify(files)


@app.route("/download/<path:filename>")
def download(filename):
    return send_from_directory(FILES_DIR, filename, as_attachment=True)


@app.route("/api/delete-file", methods=["POST"])
def delete_file():

    data = request.json
    filename = data.get("filename")

    if not filename:
        return jsonify({"error": "filename missing"}), 400

    path = os.path.join(FILES_DIR, filename)

    if os.path.exists(path):
        os.remove(path)

    return jsonify({"status": "deleted"})


# -------------------------
# NOTES API
# -------------------------

def load_notes():
    with open(NOTES_FILE, "r", encoding="utf8") as f:
        return json.load(f)


def save_notes(notes):
    with open(NOTES_FILE, "w", encoding="utf8") as f:
        json.dump(notes, f, indent=2, ensure_ascii=False)


@app.route("/api/notes")
def get_notes():
    return jsonify(load_notes())


@app.route("/api/notes/add", methods=["POST"])
def add_note():

    data = request.json
    text = data.get("text", "").strip()

    if not text:
        return jsonify({"error": "empty"}), 400

    notes = load_notes()

    note = {
        "id": str(uuid.uuid4()),
        "text": text
    }

    notes.append(note)
    save_notes(notes)

    return jsonify({"status": "ok"})


@app.route("/api/notes/delete", methods=["POST"])
def delete_note():

    data = request.json
    note_id = data.get("id")

    notes = load_notes()
    notes = [n for n in notes if n["id"] != note_id]

    save_notes(notes)

    return jsonify({"status": "deleted"})


# -------------------------
# Zeroconf (mDNS)
# -------------------------

def register_mdns():

    ip = get_local_ip()
    hostname = "lanbox.local."

    desc = {
        "path": "/"
    }

    info = ServiceInfo(
        "_http._tcp.local.",
        "LanBox._http._tcp.local.",
        addresses=[socket.inet_aton(ip)],
        port=3000,
        properties=desc,
        server=hostname
    )

    zeroconf = Zeroconf()
    zeroconf.register_service(info)

    print("mDNS registered as: http://lanbox.local:3000")
    return zeroconf


# -------------------------
# START SERVER
# -------------------------

if __name__ == "__main__":

    print("LanBox server starting...")

    zeroconf = register_mdns()

    try:
        app.run(
            host="0.0.0.0",
            port=3000,
            debug=False
        )
    finally:
        zeroconf.close()
