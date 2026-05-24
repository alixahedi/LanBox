/**
 * Client-side cryptography for LanBox.
 * Uses Web Crypto when available (localhost / HTTPS).
 * Falls back on plain HTTP LAN so usernames and basic chat still work on phones.
 */

const LanBoxCrypto = (() => {
    const KEY_PAIR_STORAGE = "lanbox-keypair";
    const PBKDF2_ITERATIONS = 120000;

    function hasSubtle() {
        return !!(window.crypto && window.crypto.subtle);
    }

    function randomId() {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
        return Date.now().toString(36) + Math.random().toString(36).slice(2);
    }

    function bufToB64(buf) {
        const bytes = new Uint8Array(buf);
        let s = "";
        for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
        return btoa(s);
    }

    function b64ToBuf(b64) {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes.buffer;
    }

    function utf8ToB64(text) {
        return btoa(unescape(encodeURIComponent(text)));
    }

    function b64ToUtf8(b64) {
        return decodeURIComponent(escape(atob(b64)));
    }

    function createFallbackKeyPair() {
        const stored = localStorage.getItem(KEY_PAIR_STORAGE);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (parsed.fallback) return parsed;
            } catch (_) {
                localStorage.removeItem(KEY_PAIR_STORAGE);
            }
        }
        const id = randomId();
        const pair = {
            publicKey: `fb-${id}`,
            privateKeyB64: `fb-${id}`,
            fallback: true,
        };
        localStorage.setItem(KEY_PAIR_STORAGE, JSON.stringify(pair));
        return pair;
    }

    async function exportPublicKey(key) {
        const raw = await crypto.subtle.exportKey("raw", key);
        return bufToB64(raw);
    }

    async function importPublicKey(b64) {
        return crypto.subtle.importKey(
            "raw",
            b64ToBuf(b64),
            { name: "ECDH", namedCurve: "P-256" },
            true,
            []
        );
    }

    async function generateKeyPair() {
        const pair = await crypto.subtle.generateKey(
            { name: "ECDH", namedCurve: "P-256" },
            true,
            ["deriveKey"]
        );
        const publicKey = await exportPublicKey(pair.publicKey);
        const privateKey = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
        return {
            publicKey,
            privateKeyB64: bufToB64(privateKey),
            fallback: false,
        };
    }

    async function loadOrCreateKeyPair() {
        const stored = localStorage.getItem(KEY_PAIR_STORAGE);
        if (stored) {
            try {
                return JSON.parse(stored);
            } catch (_) {
                localStorage.removeItem(KEY_PAIR_STORAGE);
            }
        }
        if (!hasSubtle()) {
            return createFallbackKeyPair();
        }
        const pair = await generateKeyPair();
        localStorage.setItem(KEY_PAIR_STORAGE, JSON.stringify(pair));
        return pair;
    }

    async function importPrivateKey(b64) {
        return crypto.subtle.importKey(
            "pkcs8",
            b64ToBuf(b64),
            { name: "ECDH", namedCurve: "P-256" },
            true,
            ["deriveKey"]
        );
    }

    async function deriveSharedKey(privateKey, otherPublicKeyB64) {
        const otherPub = await importPublicKey(otherPublicKeyB64);
        return crypto.subtle.deriveKey(
            { name: "ECDH", public: otherPub },
            privateKey,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"]
        );
    }

    function isFallbackKey(keyPair) {
        return keyPair && (keyPair.fallback || (keyPair.publicKey || "").startsWith("fb-"));
    }

    function isFallbackPayload(ciphertext, iv) {
        return ciphertext.startsWith("plain:") || iv === "plain";
    }

    async function encryptMessage(plaintext, recipientPublicKeyB64, privateKeyB64, keyPair) {
        if (isFallbackKey(keyPair) || (recipientPublicKeyB64 || "").startsWith("fb-")) {
            return { ciphertext: `plain:${utf8ToB64(plaintext)}`, iv: "plain" };
        }
        const priv = await importPrivateKey(privateKeyB64);
        const aesKey = await deriveSharedKey(priv, recipientPublicKeyB64);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(plaintext);
        const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            aesKey,
            encoded
        );
        return { ciphertext: bufToB64(ciphertext), iv: bufToB64(iv) };
    }

    async function decryptMessage(ciphertextB64, ivB64, senderPublicKeyB64, privateKeyB64, keyPair) {
        if (isFallbackPayload(ciphertextB64, ivB64)) {
            return b64ToUtf8(ciphertextB64.slice(6));
        }
        if (isFallbackKey(keyPair) || (senderPublicKeyB64 || "").startsWith("fb-")) {
            return "[Encrypted — open via HTTPS or localhost for full E2E chat]";
        }
        const priv = await importPrivateKey(privateKeyB64);
        const aesKey = await deriveSharedKey(priv, senderPublicKeyB64);
        const plain = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: new Uint8Array(b64ToBuf(ivB64)) },
            aesKey,
            b64ToBuf(ciphertextB64)
        );
        return new TextDecoder().decode(plain);
    }

    async function deriveFileKey(password, saltB64) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            "raw",
            enc.encode(password),
            "PBKDF2",
            false,
            ["deriveKey"]
        );
        return crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: new Uint8Array(b64ToBuf(saltB64)),
                iterations: PBKDF2_ITERATIONS,
                hash: "SHA-256",
            },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"]
        );
    }

    async function encryptFile(file, password) {
        const data = await file.arrayBuffer();
        if (hasSubtle()) {
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const saltB64 = bufToB64(salt);
            const aesKey = await deriveFileKey(password, saltB64);
            const ciphertext = await crypto.subtle.encrypt(
                { name: "AES-GCM", iv },
                aesKey,
                data
            );
            return {
                blob: new Blob([ciphertext], { type: "application/octet-stream" }),
                salt: saltB64,
                iv: bufToB64(iv),
                encMode: "webcrypto",
            };
        }
        return encryptFileFallback(data, password);
    }

    async function decryptFile(arrayBuffer, password, saltB64, ivB64, encMode) {
        if (encMode === "lanbox-v1" || ivB64 === "lanbox-v1") {
            return decryptFileFallback(arrayBuffer, password, saltB64);
        }
        if (!hasSubtle()) {
            throw new Error("This file needs Web Crypto to decrypt. Open on localhost or use HTTPS.");
        }
        const aesKey = await deriveFileKey(password, saltB64);
        const plain = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: new Uint8Array(b64ToBuf(ivB64)) },
            aesKey,
            arrayBuffer
        );
        return plain;
    }

    function hashBlock(pwdBytes, saltBytes, counter) {
        const input = new Uint8Array(pwdBytes.length + saltBytes.length + 4);
        input.set(pwdBytes, 0);
        input.set(saltBytes, pwdBytes.length);
        input[pwdBytes.length + saltBytes.length] = counter & 0xff;
        input[pwdBytes.length + saltBytes.length + 1] = (counter >> 8) & 0xff;
        input[pwdBytes.length + saltBytes.length + 2] = (counter >> 16) & 0xff;
        input[pwdBytes.length + saltBytes.length + 3] = (counter >> 24) & 0xff;

        let state = new Uint8Array(32);
        for (let round = 0; round < 8000; round++) {
            for (let i = 0; i < input.length; i++) {
                const j = i % 32;
                state[j] ^= input[i];
                state[(j + 7) % 32] = (state[(j + 7) % 32] + input[i] * 131 + round) & 0xff;
                state[(j + 13) % 32] ^= (state[j] + i) & 0xff;
            }
            for (let i = 0; i < 32; i++) {
                input[i % input.length] ^= state[i];
            }
        }
        return state;
    }

    function stretchKey(password, saltB64, length) {
        const enc = new TextEncoder();
        const pwdBytes = enc.encode(password);
        const saltBytes = new Uint8Array(b64ToBuf(saltB64));
        const out = new Uint8Array(length);
        let pos = 0;
        let counter = 0;
        while (pos < length) {
            const block = hashBlock(pwdBytes, saltBytes, counter++);
            const take = Math.min(block.length, length - pos);
            out.set(block.subarray(0, take), pos);
            pos += take;
        }
        return out;
    }

    function xorCrypt(bytes, keyStream) {
        const out = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) {
            out[i] = bytes[i] ^ keyStream[i % keyStream.length];
        }
        return out;
    }

    function randomBytes(n) {
        const buf = new Uint8Array(n);
        if (window.crypto && crypto.getRandomValues) {
            crypto.getRandomValues(buf);
        } else {
            for (let i = 0; i < n; i++) buf[i] = Math.floor(Math.random() * 256);
        }
        return buf;
    }

    function encryptFileFallback(data, password) {
        const salt = randomBytes(16);
        const saltB64 = bufToB64(salt);
        const keyStream = stretchKey(password, saltB64, data.byteLength + 32);
        const encrypted = xorCrypt(new Uint8Array(data), keyStream);
        return {
            blob: new Blob([encrypted], { type: "application/octet-stream" }),
            salt: saltB64,
            iv: "lanbox-v1",
            encMode: "lanbox-v1",
        };
    }

    function decryptFileFallback(arrayBuffer, password, saltB64) {
        const keyStream = stretchKey(password, saltB64, arrayBuffer.byteLength + 32);
        const decrypted = xorCrypt(new Uint8Array(arrayBuffer), keyStream);
        return decrypted.buffer;
    }

    return {
        hasSubtle,
        loadOrCreateKeyPair,
        createFallbackKeyPair,
        encryptMessage,
        decryptMessage,
        encryptFile,
        decryptFile,
        isFallbackKey,
    };
})();
