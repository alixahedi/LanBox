document.addEventListener("DOMContentLoaded", () => {

    const BROADCAST = "__broadcast__";
    const USERNAME_KEY = "lanbox-username";

    const themeToggle     = document.getElementById("themeToggle");
    const dropZone        = document.getElementById("dropZone");
    const fileInput       = document.getElementById("fileInput");
    const selectBtn       = document.getElementById("selectBtn");
    const uploadStatus    = document.getElementById("uploadStatus");
    const fileList        = document.getElementById("fileList");
    const noteInput       = document.getElementById("noteInput");
    const addNoteBtn      = document.getElementById("addNoteBtn");
    const notesGrid       = document.getElementById("notesGrid");
    const toast           = document.getElementById("toast");
    const userModal       = document.getElementById("userModal");
    const usernameInput   = document.getElementById("usernameInput");
    const usernameSubmit  = document.getElementById("usernameSubmit");
    const usernameCancel  = document.getElementById("usernameCancel");
    const userModalTitle  = document.getElementById("userModalTitle");
    const userModalDesc   = document.getElementById("userModalDesc");
    const userBadge       = document.getElementById("userBadge");
    const currentUsername = document.getElementById("currentUsername");
    const onlineList      = document.getElementById("onlineList");
    const chatTarget      = document.getElementById("chatTarget");
    const chatMessages    = document.getElementById("chatMessages");
    const chatInput       = document.getElementById("chatInput");
    const chatSendBtn     = document.getElementById("chatSendBtn");
    const deleteMyChatsBtn = document.getElementById("deleteMyChatsBtn");
    const encryptUpload   = document.getElementById("encryptUpload");
    const encryptFields   = document.getElementById("encryptFields");
    const uploadPassword  = document.getElementById("uploadPassword");
    const decryptModal    = document.getElementById("decryptModal");
    const decryptFileName = document.getElementById("decryptFileName");
    const decryptPassword = document.getElementById("decryptPassword");
    const decryptCancel   = document.getElementById("decryptCancel");
    const decryptConfirm  = document.getElementById("decryptConfirm");
    const changeUserBtn   = document.getElementById("changeUserBtn");
    const usernameError   = document.getElementById("usernameError");
    const hostBanner      = document.getElementById("hostBanner");
    const hostAddress     = document.getElementById("hostAddress");
    const notifBanner     = document.getElementById("notifBanner");
    const notifBannerText = document.getElementById("notifBannerText");
    const enableNotifBtn  = document.getElementById("enableNotifBtn");

    const NOTIF_ICON = "/icons/icon-192.png";
    let swRegistration = null;

    let filesHash   = "";
    let notesHash   = "";
    let notesCache  = [];
    let currentUser = getStoredUsername();
    let keyPair     = null;
    let socket      = null;
    let onlineUsers = [];
    let userKeys    = {};
    let pendingDecrypt = null;
    let usernameReady = false;
    let chatMode = BROADCAST;
    let knownFileNames = new Set();
    let knownMessageIds = new Set();
    let lastChatPollSince = 0;
    let appInitialized = false;
    let serverInfo = null;
    let isAdmin = false;

    function notifIconUrl() {
        return new URL(NOTIF_ICON, location.origin).href;
    }

    function canUseSystemNotifications() {
        return window.isSecureContext && "Notification" in window;
    }

    function getSecureServerUrl() {
        if (serverInfo && serverInfo.url) {
            return serverInfo.scheme === "https"
                ? serverInfo.url
                : `https://${serverInfo.ip}:${serverInfo.port}`;
        }
        const port = location.port || "3000";
        return `https://${location.hostname}:${port}`;
    }

    function getStoredUsername() {
        return localStorage.getItem(USERNAME_KEY) || "";
    }

    function saveUsername(name) {
        localStorage.setItem(USERNAME_KEY, name);
    }

    function hashData(d) { return JSON.stringify(d); }

    function showToast(message, type = "info") {
        toast.textContent = message;
        toast.className = `toast ${type} show`;
        clearTimeout(window._toast);
        window._toast = setTimeout(() => { toast.className = "toast"; }, 2500);
    }

    async function registerServiceWorker() {
        if (!("serviceWorker" in navigator)) return null;
        try {
            swRegistration = await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
            await navigator.serviceWorker.ready;
            return swRegistration;
        } catch (e) {
            console.warn("Service worker registration failed:", e);
            return null;
        }
    }

    async function requestNotificationPermission() {
        if (!canUseSystemNotifications()) return false;
        if (Notification.permission === "granted") return true;
        if (Notification.permission === "denied") return false;
        const result = await Notification.requestPermission();
        return result === "granted";
    }

    function notificationsReady() {
        return canUseSystemNotifications() && Notification.permission === "granted";
    }

    function updateNotifBanner() {
        if (!notifBanner) return;

        if (!window.isSecureContext) {
            const url = getSecureServerUrl();
            if (notifBannerText) {
                notifBannerText.textContent =
                    "Chrome blocks notifications on HTTP. Open the HTTPS link and accept the certificate warning.";
            }
            if (enableNotifBtn) enableNotifBtn.textContent = "Open HTTPS";
            notifBanner.classList.remove("hidden");
            return;
        }

        if (!("Notification" in window)) {
            if (notifBannerText) {
                notifBannerText.textContent = "This browser does not support system notifications.";
            }
            if (enableNotifBtn) enableNotifBtn.classList.add("hidden");
            notifBanner.classList.remove("hidden");
            return;
        }

        if (Notification.permission === "granted") {
            notifBanner.classList.add("hidden");
            return;
        }

        if (enableNotifBtn) enableNotifBtn.classList.remove("hidden");

        if (Notification.permission === "denied") {
            if (notifBannerText) {
                notifBannerText.textContent =
                    "Notifications are blocked. Click the lock icon in the address bar → Site settings → Notifications → Allow.";
            }
            if (enableNotifBtn) enableNotifBtn.textContent = "Blocked";
            notifBanner.classList.remove("hidden");
            return;
        }

        if (notifBannerText) {
            notifBannerText.textContent =
                "Tap Enable and allow notifications — required for alerts on files and messages.";
        }
        if (enableNotifBtn) enableNotifBtn.textContent = "Enable";
        notifBanner.classList.remove("hidden");
    }

    async function initNotifications() {
        await registerServiceWorker();
        updateNotifBanner();
    }

    async function notifyUser(title, body, tag = "lanbox-alert") {
        const text = String(body || "").slice(0, 240);
        const options = {
            body: text,
            icon: notifIconUrl(),
            badge: notifIconUrl(),
            tag,
            renotify: true,
            vibrate: [200, 100, 200],
            silent: false,
            data: { url: location.href },
        };

        if (!notificationsReady()) {
            showToast(text, "info");
            return false;
        }

        try {
            const reg = swRegistration || (await navigator.serviceWorker.ready);
            if (reg?.showNotification) {
                await reg.showNotification(title, options);
                return true;
            }
        } catch (e) {
            console.warn("Service worker notification failed:", e);
        }

        try {
            new Notification(title, options);
            return true;
        } catch (e) {
            console.warn("Notification failed:", e);
            showToast(text, "info");
            return false;
        }
    }

    async function handleIncomingMessage(msg) {
        if (!msg?.id || knownMessageIds.has(msg.id)) return;
        knownMessageIds.add(msg.id);
        if (msg.from_user === currentUser) return;

        if (msg.to_user === BROADCAST) {
            if (chatTarget.value === BROADCAST) {
                appendBroadcastMessage(msg);
                scrollChat();
            }
            await notifyUser(
                "LanBox broadcast",
                `${msg.from_user}: ${msg.text}`,
                `broadcast-${msg.id}`
            );
            return;
        }

        if (msg.to_user === currentUser) {
            if (chatTarget.value === msg.from_user) {
                await appendChatMessage(msg, false);
                scrollChat();
            }
            let preview = "New private message";
            try {
                const peerKey = await getUserPublicKey(msg.from_user);
                preview = await LanBoxCrypto.decryptMessage(
                    msg.ciphertext, msg.iv, peerKey, keyPair.privateKeyB64, keyPair
                );
            } catch (_) {}
            await notifyUser(`PM from ${msg.from_user}`, preview, `pm-${msg.id}`);
        }
    }

    async function pollChatUpdates() {
        if (!currentUser) return;
        try {
            const res = await fetch(
                `/api/chat/updates?me=${encodeURIComponent(currentUser)}&since=${lastChatPollSince}`
            );
            if (!res.ok) return;
            const messages = await res.json();
            lastChatPollSince = Date.now() / 1000;
            for (const msg of messages) {
                await handleIncomingMessage(msg);
            }
        } catch (e) {
            console.warn("Chat poll failed:", e);
        }
    }

    function escapeHtml(s) {
        return s.replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    // ── Theme ────────────────────────────────────────────────
    function setTheme(theme) {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("lanbox-theme", theme);
        themeToggle.textContent = theme === "dark" ? "🌙" : "☀️";
    }
    function initTheme() {
        setTheme(localStorage.getItem("lanbox-theme") || "dark");
    }
    themeToggle.addEventListener("click", () => {
        setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
    });

    if (enableNotifBtn) {
        enableNotifBtn.addEventListener("click", async () => {
            if (!window.isSecureContext) {
                window.location.href = getSecureServerUrl();
                return;
            }
            if (Notification.permission === "denied") {
                showToast("Allow notifications in browser site settings (lock icon → Site settings)", "error");
                return;
            }
            const ok = await requestNotificationPermission();
            updateNotifBanner();
            if (ok) {
                await notifyUser("LanBox", "Notifications are working!", "lanbox-test");
                showToast("System notifications enabled", "success");
            } else {
                showToast("Notifications blocked — enable in browser settings", "error");
            }
        });
    }

    // ── User onboarding ──────────────────────────────────────
    function showUsernameModal(changingUser = false) {
        userModal.classList.remove("hidden");
        usernameError.classList.add("hidden");
        usernameInput.value = changingUser ? "" : (currentUser || "");

        if (changingUser && currentUser) {
            userModalTitle.textContent = "Change username";
            userModalDesc.textContent = "Enter a new username, or cancel to keep " + currentUser + ".";
            usernameCancel.classList.remove("hidden");
        } else {
            userModalTitle.textContent = "Welcome to LanBox";
            userModalDesc.textContent = "Choose a username once — it will be saved on this device.";
            usernameCancel.classList.add("hidden");
        }

        setTimeout(() => usernameInput.focus(), 100);
    }

    function hideUsernameModal() {
        userModal.classList.add("hidden");
        usernameError.classList.add("hidden");
        usernameCancel.classList.add("hidden");
    }

    function cancelUsernameChange() {
        if (!currentUser) return;
        hideUsernameModal();
        if (!socket) connectSocket();
    }

    function showUsernameError(msg) {
        usernameError.textContent = msg;
        usernameError.classList.remove("hidden");
    }

    async function ensureKeyPair() {
        if (keyPair) return keyPair;
        try {
            keyPair = await LanBoxCrypto.loadOrCreateKeyPair();
        } catch (_) {
            keyPair = LanBoxCrypto.createFallbackKeyPair();
        }
        return keyPair;
    }

    function bindUsernameForm() {
        if (usernameReady) return;
        usernameReady = true;
        usernameSubmit.addEventListener("click", registerUsername);
        usernameCancel.addEventListener("click", cancelUsernameChange);
        usernameInput.addEventListener("keydown", e => {
            if (e.key === "Enter") registerUsername();
            if (e.key === "Escape") cancelUsernameChange();
        });
    }

    async function setupUser() {
        bindUsernameForm();

        if (!currentUser) {
            showUsernameModal();
            return false;
        }

        try {
            await ensureKeyPair();
            await registerOnServer(currentUser);
            saveUsername(currentUser);
            await initNotifications();
            showUserUI();
            return true;
        } catch (e) {
            showUsernameModal();
            showUsernameError(e.message || "Could not sign in. Pick your username again.");
            return false;
        }
    }

    async function registerUsername() {
        const name = usernameInput.value.trim();
        if (name.length < 2) {
            showUsernameError("Username must be at least 2 characters");
            return;
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
            showUsernameError("Use letters, numbers, _ and - only");
            return;
        }

        usernameSubmit.disabled = true;
        usernameSubmit.textContent = "Saving…";

        try {
            await ensureKeyPair();
            await registerOnServer(name);
            currentUser = name;
            saveUsername(name);
            await initNotifications();
            hideUsernameModal();
            showUserUI();
            initApp();
        } catch (e) {
            showUsernameError(e.message || "Registration failed");
        }

        usernameSubmit.disabled = false;
        usernameSubmit.textContent = "Continue";
    }

    changeUserBtn.addEventListener("click", () => {
        if (socket) {
            socket.disconnect();
            socket = null;
        }
        showUsernameModal(true);
    });

    async function registerOnServer(username) {
        const res = await fetch("/api/users/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, publicKey: keyPair.publicKey }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Registration failed");
        currentUser = data.username || username;
        isAdmin = data.isAdmin === true;
    }

    async function loadHostBanner() {
        try {
            const info = await fetch("/api/server/info").then(r => r.json());
            serverInfo = info;
            hostAddress.textContent = info.url || `${info.ip}:${info.port}`;
            hostBanner.classList.remove("hidden");
            updateNotifBanner();
        } catch (_) {}
    }

    function showUserUI() {
        userBadge.classList.remove("hidden");
        changeUserBtn.classList.remove("hidden");
        currentUsername.textContent = currentUser + (isAdmin ? " · admin" : "");
        loadHostBanner();
        updateNotifBanner();
        connectSocket();
    }

    function connectSocket() {
        if (socket) socket.disconnect();
        socket = io({ transports: ["polling", "websocket"], reconnection: true });

        socket.on("connect", () => {
            socket.emit("user_join", {
                username: currentUser,
                publicKey: keyPair.publicKey,
            });
        });

        socket.on("online_users", data => {
            onlineUsers = (data.users || []).filter(u => u !== currentUser);
            renderOnline();
            updateChatTarget();
        });

        socket.on("broadcast_message", msg => handleIncomingMessage(msg));

        socket.on("chat_message", msg => handleIncomingMessage(msg));

        socket.on("file_uploaded", data => {
            if (data.uploaded_by && data.uploaded_by === currentUser) return;
            knownFileNames.add(data.name);
            const name = data.original_name || data.name;
            notifyUser(
                "New file shared",
                `${data.uploaded_by || "Someone"} uploaded ${name}`,
                `file-${data.name}`
            );
            loadFiles();
        });

        socket.on("chats_deleted", data => {
            const who = data?.username;
            if (!who) return;
            if (isBroadcastMode() || chatTarget.value === who || who === currentUser) {
                loadCurrentChat();
            }
            if (who === currentUser) {
                knownMessageIds.clear();
                lastChatPollSince = Date.now() / 1000;
            }
        });
    }

    function renderOnline() {
        onlineList.innerHTML = "";
        if (!onlineUsers.length) {
            onlineList.innerHTML = `<li class="emptyMsg">No other users online</li>`;
            return;
        }
        onlineUsers.forEach(name => {
            const li = document.createElement("li");
            li.className = "online-user";
            li.innerHTML = `<span class="status-dot online"></span> ${escapeHtml(name)}`;
            li.addEventListener("click", () => {
                chatTarget.value = name;
                chatTarget.dispatchEvent(new Event("change"));
            });
            onlineList.appendChild(li);
        });
    }

    function updateChatTarget() {
        const prev = chatTarget.value || BROADCAST;
        chatTarget.innerHTML = `<option value="${BROADCAST}">Everyone (broadcast)</option>`;
        onlineUsers.forEach(u => {
            const opt = document.createElement("option");
            opt.value = u;
            opt.textContent = `${u} (private)`;
            chatTarget.appendChild(opt);
        });
        chatTarget.value = (prev === BROADCAST || onlineUsers.includes(prev)) ? prev : BROADCAST;
    }

    async function getUserPublicKey(username) {
        if (userKeys[username]) return userKeys[username];
        const res = await fetch(`/api/users/${encodeURIComponent(username)}/key`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "User not found");
        userKeys[username] = data.publicKey;
        return data.publicKey;
    }

    function isBroadcastMode() {
        return chatTarget.value === BROADCAST;
    }

    // ── Chat ─────────────────────────────────────────────────
    chatTarget.addEventListener("change", async () => {
        chatMode = chatTarget.value;
        chatInput.placeholder = isBroadcastMode()
            ? "Message everyone on the LAN…"
            : `Private message to ${chatTarget.value}…`;
        await loadCurrentChat();
    });

    async function loadCurrentChat() {
        if (isBroadcastMode()) await loadBroadcastHistory();
        else await loadChatHistory(chatTarget.value);
    }

    async function loadBroadcastHistory() {
        chatMessages.innerHTML = `<div class="emptyMsg">Loading…</div>`;
        const messages = await fetch("/api/chat/broadcast/history").then(r => r.json());
        chatMessages.innerHTML = "";
        if (!messages.length) {
            chatMessages.innerHTML = `<div class="emptyMsg">No messages yet — say hello!</div>`;
            return;
        }
        messages.forEach(msg => appendBroadcastMessage(msg));
        scrollChat();
    }

    function appendBroadcastMessage(msg) {
        const isMine = msg.from_user === currentUser;
        const el = document.createElement("div");
        el.className = `chat-bubble ${isMine ? "mine" : "theirs"}`;
        if (!isMine) {
            const who = document.createElement("span");
            who.className = "chat-sender";
            who.textContent = msg.from_user;
            el.appendChild(who);
        }
        const text = document.createElement("span");
        text.textContent = msg.text;
        el.appendChild(text);
        chatMessages.appendChild(el);
    }

    async function loadChatHistory(withUser) {
        chatMessages.innerHTML = `<div class="emptyMsg">Loading…</div>`;
        const res = await fetch(
            `/api/chat/history?me=${encodeURIComponent(currentUser)}&with=${encodeURIComponent(withUser)}`
        );
        const messages = await res.json();
        chatMessages.innerHTML = "";
        if (!messages.length) {
            chatMessages.innerHTML = `<div class="emptyMsg">No private messages yet</div>`;
            return;
        }
        for (const msg of messages) {
            await appendChatMessage(msg, msg.from_user === currentUser);
        }
        scrollChat();
    }

    async function appendChatMessage(msg, isMine) {
        const peer = isMine ? msg.to_user : msg.from_user;
        let text;
        try {
            const peerKey = await getUserPublicKey(peer);
            text = await LanBoxCrypto.decryptMessage(
                msg.ciphertext, msg.iv, peerKey, keyPair.privateKeyB64, keyPair
            );
        } catch (_) {
            text = "[Unable to decrypt]";
        }
        const el = document.createElement("div");
        el.className = `chat-bubble ${isMine ? "mine" : "theirs"}`;
        el.textContent = text;
        chatMessages.appendChild(el);
    }

    function scrollChat() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    async function sendChat() {
        const to = chatTarget.value;
        const text = chatInput.value.trim();
        if (!to || !text) return;

        try {
            if (isBroadcastMode()) {
                await fetch("/api/chat/broadcast/send", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ from: currentUser, text }),
                });
                appendBroadcastMessage({ from_user: currentUser, text });
            } else {
                const recipientKey = await getUserPublicKey(to);
                const { ciphertext, iv } = await LanBoxCrypto.encryptMessage(
                    text, recipientKey, keyPair.privateKeyB64, keyPair
                );
                await fetch("/api/chat/send", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ from: currentUser, to, ciphertext, iv }),
                });
                await appendChatMessage({
                    from_user: currentUser,
                    to_user: to,
                    ciphertext,
                    iv,
                }, true);
            }
            chatInput.value = "";
            scrollChat();
        } catch (e) {
            showToast(e.message || "Send failed", "error");
        }
    }

    chatSendBtn.addEventListener("click", sendChat);
    chatInput.addEventListener("keydown", e => {
        if (e.key === "Enter") sendChat();
    });

    async function deleteMyChats() {
        if (!currentUser) return;
        const ok = confirm(
            "Delete ALL your chat messages from the server?\n\n" +
            "This removes your broadcasts and private messages (sent and received) for everyone on the LAN. This cannot be undone."
        );
        if (!ok) return;

        try {
            const res = await fetch("/api/chat/delete-mine", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: currentUser }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Delete failed");

            knownMessageIds.clear();
            lastChatPollSince = Date.now() / 1000;
            await loadCurrentChat();
            showToast(`Deleted ${data.deleted} message(s) from server`, "success");
        } catch (e) {
            showToast(e.message || "Could not delete chats", "error");
        }
    }

    if (deleteMyChatsBtn) {
        deleteMyChatsBtn.addEventListener("click", deleteMyChats);
    }

    // ── Encrypted upload toggle ──────────────────────────────
    encryptUpload.addEventListener("change", () => {
        encryptFields.classList.toggle("hidden", !encryptUpload.checked);
        if (encryptUpload.checked) uploadPassword.focus();
    });

    // ── Upload ───────────────────────────────────────────────
    selectBtn.addEventListener("click", e => { e.stopPropagation(); fileInput.click(); });
    fileInput.addEventListener("change", e => {
        const files = e.target.files;
        if (files && files.length) uploadFiles(Array.from(files));
        fileInput.value = "";
    });
    dropZone.addEventListener("dragover", e => { e.preventDefault(); dropZone.classList.add("dragover"); });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
    dropZone.addEventListener("drop", e => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
        const files = e.dataTransfer.files;
        if (files && files.length) uploadFiles(Array.from(files));
    });

    async function uploadFiles(files) {
        if (encryptUpload.checked && !uploadPassword.value.trim()) {
            showToast("Enter a password for encrypted upload", "error");
            encryptFields.classList.remove("hidden");
            uploadPassword.focus();
            return;
        }
        for (let i = 0; i < files.length; i++) {
            uploadStatus.textContent = `Uploading ${i + 1}/${files.length}: ${files[i].name}`;
            try {
                await uploadSingle(files[i]);
            } catch (e) {
                uploadStatus.textContent = e.message || `Failed: ${files[i].name}`;
                showToast(e.message || `Failed: ${files[i].name}`, "error");
            }
        }
        uploadStatus.textContent = "Upload complete";
        loadFiles();
    }

    async function uploadSingle(file) {
        const fd = new FormData();
        if (encryptUpload.checked) {
            const pwd = uploadPassword.value.trim();
            if (!pwd) throw new Error("Enter a password for encrypted upload");
            uploadStatus.textContent = `Encrypting ${file.name}…`;
            const { blob, salt, iv, encMode } = await LanBoxCrypto.encryptFile(file, pwd);
            fd.append("file", blob, `${file.name}.enc`);
            fd.append("encrypted", "true");
            fd.append("originalName", file.name);
            fd.append("salt", salt);
            fd.append("iv", iv);
            fd.append("encMode", encMode || "webcrypto");
            fd.append("uploadedBy", currentUser);
        } else {
            fd.append("file", file);
            fd.append("uploadedBy", currentUser);
        }
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
    }

    // ── Files ────────────────────────────────────────────────
    async function loadFiles() {
        const files = await fetch(
            `/api/files?me=${encodeURIComponent(currentUser)}`
        ).then(r => r.json());
        if (appInitialized) {
            files.forEach(f => {
                const name = f.name;
                if (!knownFileNames.has(name)) {
                    knownFileNames.add(name);
                    const uploader = f.uploaded_by || "";
                    if (uploader && uploader !== currentUser) {
                        const label = f.original_name || f.name;
                        notifyUser(
                            "New file shared",
                            `${uploader} uploaded ${label}`,
                            `file-${name}`
                        );
                    }
                }
            });
        } else {
            files.forEach(f => knownFileNames.add(f.name));
            appInitialized = true;
        }
        filesHash = hashData(files);
        renderFiles(files);
    }

    function renderFiles(files) {
        fileList.innerHTML = "";
        if (!files.length) {
            fileList.innerHTML = `<div class="emptyMsg">No files uploaded yet</div>`;
            return;
        }
        files.forEach(file => {
            const displayName = file.original_name || file.name;
            const isEnc = file.encrypted === true;
            const uploader = file.uploaded_by ? escapeHtml(file.uploaded_by) : "Unknown";
            const canDelete = file.can_delete === true;
            const item = document.createElement("div");
            item.className = "fileItem";
            item.innerHTML = `
              <div class="fileMeta">
                <span class="fileName">${escapeHtml(displayName)}${isEnc ? " 🔒" : ""}</span>
                <span class="fileSize">${formatBytes(file.size || 0)}${isEnc ? " · encrypted" : ""} · ${uploader}</span>
              </div>
              <div class="fileActions">
                <button class="actionBtn dlBtn">Download</button>
                ${canDelete ? '<button class="actionBtn deleteBtn">Delete</button>' : ""}
              </div>`;
            item.querySelector(".dlBtn").addEventListener("click", () => downloadFile(file));
            const delBtn = item.querySelector(".deleteBtn");
            if (delBtn) delBtn.addEventListener("click", () => deleteFile(file.name));
            fileList.appendChild(item);
        });
    }

    function downloadFile(file) {
        if (file.encrypted) {
            pendingDecrypt = file;
            decryptFileName.textContent = file.original_name || file.name;
            decryptPassword.value = "";
            decryptModal.classList.remove("hidden");
            return;
        }
        window.location.href = `/download/${encodeURIComponent(file.name)}`;
    }

    decryptCancel.addEventListener("click", () => {
        decryptModal.classList.add("hidden");
        pendingDecrypt = null;
    });

    decryptConfirm.addEventListener("click", async () => {
        if (!pendingDecrypt) return;
        const pwd = decryptPassword.value;
        if (!pwd) {
            showToast("Enter the file password", "error");
            return;
        }
        try {
            const res = await fetch(`/download/${encodeURIComponent(pendingDecrypt.name)}`);
            const buf = await res.arrayBuffer();
            const plain = await LanBoxCrypto.decryptFile(
                buf, pwd, pendingDecrypt.salt, pendingDecrypt.iv, pendingDecrypt.encMode
            );
            const name = pendingDecrypt.original_name || "decrypted_file";
            const blob = new Blob([plain]);
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = name;
            a.click();
            URL.revokeObjectURL(url);
            decryptModal.classList.add("hidden");
            showToast("File decrypted", "success");
        } catch (_) {
            showToast("Wrong password or corrupted file", "error");
        }
    });

    async function deleteFile(filename) {
        const res = await fetch("/api/delete-file", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename, username: currentUser }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            showToast(data.error || "Could not delete file", "error");
            return;
        }
        showToast("File deleted", "success");
        loadFiles();
    }

    function formatBytes(b) {
        if (!b) return "0 B";
        const s = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(b) / Math.log(1024));
        return `${(b / Math.pow(1024, i)).toFixed(1)} ${s[i]}`;
    }

    // ── Notes ────────────────────────────────────────────────
    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text)
                .then(() => showToast("Copied", "success"))
                .catch(() => legacyCopy(text));
            return;
        }
        legacyCopy(text);
    }

    function legacyCopy(text) {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;";
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try { ok = document.execCommand("copy"); } catch (_) {}
        document.body.removeChild(ta);
        showToast(ok ? "Copied" : "Copy failed", ok ? "success" : "error");
    }

    addNoteBtn.addEventListener("click", addNote);
    noteInput.addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addNote(); }
    });

    async function addNote() {
        const text = noteInput.value.trim();
        if (!text) return;
        await fetch("/api/notes/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
        });
        noteInput.value = "";
        showToast("Note added", "success");
        loadNotes();
    }

    async function loadNotes() {
        const notes = await fetch("/api/notes").then(r => r.json());
        notesHash = hashData(notes);
        notesCache = notes;
        renderNotes(notes);
    }

    function renderNotes(notes) {
        notesGrid.innerHTML = "";
        if (!notes.length) {
            notesGrid.innerHTML = `<div class="emptyMsg">No notes yet</div>`;
            return;
        }
        notes.forEach(note => {
            const item = document.createElement("div");
            item.className = "noteItem";
            item.innerHTML = `
              <p class="noteText">${escapeHtml(note.text)}</p>
              <div class="noteActions">
                <button class="actionBtn copyBtn">Copy</button>
                <button class="actionBtn deleteBtn">Delete</button>
              </div>`;
            item.querySelector(".copyBtn").addEventListener("click", () => copyText(note.text));
            item.querySelector(".deleteBtn").addEventListener("click", () => deleteNote(note.id));
            notesGrid.appendChild(item);
        });
    }

    async function deleteNote(id) {
        await fetch("/api/notes/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
        });
        showToast("Note deleted", "success");
        loadNotes();
    }

    // ── Polling ──────────────────────────────────────────────
    async function pollUpdates() {
        try {
            const files = await fetch(
                `/api/files?me=${encodeURIComponent(currentUser)}`
            ).then(r => r.json());
            const fh = hashData(files);
            if (fh !== filesHash) {
                await loadFiles();
            }

            const notes = await fetch("/api/notes").then(r => r.json());
            const nh = hashData(notes);
            if (nh !== notesHash) { notesHash = nh; notesCache = notes; renderNotes(notes); }

            await pollChatUpdates();
        } catch (e) { console.error("Poll", e); }
    }

    async function seedKnownMessages() {
        if (!currentUser) return;
        try {
            const res = await fetch(
                `/api/chat/updates?me=${encodeURIComponent(currentUser)}&since=0`
            );
            if (res.ok) {
                const messages = await res.json();
                messages.forEach(m => {
                    if (m.id) knownMessageIds.add(m.id);
                });
            }
        } catch (_) {}
        lastChatPollSince = Date.now() / 1000;
    }

    async function initApp() {
        loadFiles();
        loadNotes();
        await loadBroadcastHistory();
        await seedKnownMessages();
        setInterval(pollUpdates, 2000);
    }

    // ── Boot ─────────────────────────────────────────────────
    registerServiceWorker();
    fetch("/api/server/info")
        .then(r => r.json())
        .then(info => {
            serverInfo = info;
            updateNotifBanner();
        })
        .catch(() => {});
    (async () => {
        initTheme();
        try {
            const ready = await setupUser();
            if (ready) initApp();
        } catch (e) {
            console.error("LanBox startup error:", e);
            bindUsernameForm();
            showUsernameModal();
            showUsernameError("Could not start. Please choose a username.");
        }
    })();
});
