// src/controllers/neonova-crypto-controller.js
// NeonovaCryptoController — STATIC controller responsible for ALL encryption/decryption logic
//
// Why static?
//   - Pure math/crypto operations (no per-instance state except the single master key)
//   - Matches your request for a "static class"
//   - Zero globals, zero `window.`, zero pollution
//   - Other controllers (Dashboard + Passphrase) call static methods directly
//   - Easy to unit-test and maintain
//
// Naming convention deliberately matches the rest of the project (ends in "Controller")
// even though it's static — keeps things consistent for you.
//
// All private methods are prefixed with # (true private fields in modern JS)
// Public API is minimal and clear.
//
// PRIVATE HELPERS ARE DECLARED FIRST (at the top of the class)
// This is required for Tampermonkey/userscript environments to avoid
// "Cannot access '#xxx' before initialization" errors.
//
// Every console.log is prefixed with [NeonovaCryptoController.methodName]
// so you can instantly see exactly where each message comes from.

class NeonovaCryptoController {
    // Private static field — holds the one and only AES-GCM CryptoKey
    // Never exposed outside this class.
    static #masterKey = null;

    // =================================================================
    // PRIVATE HELPERS — declared FIRST (Tampermonkey requirement)
    // =================================================================

    /**
     * Loads the remembered raw AES key from localStorage (if present).
     * Returns null if nothing stored or corrupted.
     */
    static async #loadRememberedMasterKey() {
        const stored = localStorage.getItem('novaDashboardMasterKey');
        if (!stored) {
            return null;
        }

        try {
            const raw = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
            return await crypto.subtle.importKey(
                "raw",
                raw,
                { name: "AES-GCM" },
                false,
                ["encrypt", "decrypt"]
            );
        } catch (e) {
            console.warn("[NeonovaCryptoController.#loadRememberedMasterKey] failed to load remembered key — clearing it");
            localStorage.removeItem('novaDashboardMasterKey');
            return null;
        }
    }

    /**
     * Internal PBKDF2 key derivation (used only on first passphrase entry).
     * Salt is random and thrown away after derivation (not stored — we use remembered raw key instead).
     * Iterations = 100,000 (strong but still fast on modern devices).
     */
    static async #deriveKey(passphrase) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            "raw",
            enc.encode(passphrase),
            { name: "PBKDF2" },
            false,
            ["deriveBits", "deriveKey"]
        );

        return {
            key: await crypto.subtle.deriveKey(
                {
                    name: "PBKDF2",
                    salt: crypto.getRandomValues(new Uint8Array(16)),
                    iterations: 100000,
                    hash: "SHA-256"
                },
                keyMaterial,
                { name: "AES-GCM", length: 256 },
                true,                    // must be extractable so we can save raw key
                ["encrypt", "decrypt"]
            )
        };
    }

    /**
     * Exports the raw key bytes and saves them to localStorage (base64).
     * Called only when rememberDevice = true.
     */
    static async #saveRememberedMasterKey(key) {
        const raw = await crypto.subtle.exportKey("raw", key);
        const b64 = btoa(String.fromCharCode(...new Uint8Array(raw)));
        localStorage.setItem('novaDashboardMasterKey', b64);
    }

    // =================================================================
    // PUBLIC API — called by NeonovaDashboardController and NeonovaPassphraseController
    // =================================================================

    /**
     * Initializes the master encryption key.
     * 
     * Called once from NeonovaDashboardController.initAsync() during startup.
     * 
     * Behavior:
     *   - If a remembered key exists in localStorage → loads it instantly (no prompt)
     *   - If no key → does nothing (PassphraseController will call setPassphrase next)
     * 
     * This is the single entry point for key setup. No other file touches the key.
     */
    static async initMasterKey() {
        if (this.#masterKey) {
            //master key already initialized — skipping
            return;
        }

        const remembered = await this.#loadRememberedMasterKey();
        if (remembered) {
            this.#masterKey = remembered;
            return;
        }

        // First-time user — passphrase modal will handle the rest
    
    }

        /**
     * Simple getter so NeonovaDashboardController knows whether it needs to show the passphrase modal.
     * 
     * Called from:
     *   - NeonovaDashboardController.initAsync()
     * 
     * This is the ONLY place outside this class that checks if a key exists.
     * Keeps the masterKey truly private while still allowing the dashboard to make the right decision.
     */
    static get hasMasterKey() {
        return !!this.#masterKey;
    }

    /**
     * Encrypts a plaintext string (normally the JSON of this.customers) using AES-256-GCM.
     * 
     * Called from:
     *   - NeonovaDashboardController.save()
     *   - (and indirectly after every poll/add/remove)
     * 
     * Security notes:
     *   - Fresh random 12-byte IV on every call (best practice for GCM)
     *   - Uses the single remembered master key (never re-derives)
     *   - Output format: base64(iv(12) + ciphertext+tag)
     * 
     * @param {string} plainText - The string to encrypt (must be valid JSON in our case)
     * @returns {Promise<string>} Base64-encoded encrypted data ready for localStorage
     * @throws {Error} if no master key is set
     */
    static async encryptData(plainText) {
        if (!this.#masterKey) throw new Error("No master key — call initMasterKey() or setPassphrase() first");

        const enc = new TextEncoder();
        const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV recommended for GCM

        const encrypted = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            this.#masterKey,
            enc.encode(plainText)
        );

        const encryptedBytes = new Uint8Array(encrypted);

        // Combine: iv + ciphertext (tag is automatically appended by the browser)
        const combined = new Uint8Array(iv.length + encryptedBytes.length);
        combined.set(iv, 0);
        combined.set(encryptedBytes, iv.length);

        // Classic btoa conversion (matches the rest of the project style)
        let binary = '';
        for (let i = 0; i < combined.byteLength; i++) {
            binary += String.fromCharCode(combined[i]);
        }
        const b64 = btoa(binary);

        return b64;
    }

    /**
     * Decrypts data that was previously encrypted by encryptData().
     * 
     * Called from:
     *   - NeonovaDashboardController.load()
     * 
     * Security notes:
     *   - Uses the exact same master key
     *   - Automatic GCM authentication — any tampering or key mismatch throws OperationError
     *   - Slices IV correctly (12 bytes) — format must match encryptData exactly
     * 
     * @param {string} encryptedB64 - Base64 string from localStorage
     * @returns {Promise<string>} Original plaintext (JSON string)
     * @throws {Error} on invalid base64, short data, or authentication failure
     */
    static async decryptData(encryptedB64) {
        if (!this.#masterKey) throw new Error("No master key — call initMasterKey() or setPassphrase() first");

        let combined;
        try {
            combined = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0));
        } catch (e) {
            throw new Error("Invalid base64 encoding: " + e.message);
        }

        if (combined.length < 28) { // 12 iv + minimum ciphertext + 16-byte tag
            throw new Error("Stored data too short for AES-GCM");
        }

        const iv = combined.slice(0, 12);
        const ciphertext = combined.slice(12);

        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            this.#masterKey,
            ciphertext
        );

        return new TextDecoder().decode(decrypted);
    }

    /**
     * Derives a new master key from a user-provided passphrase and (optionally) remembers it.
     * 
     * Called from:
     *   - NeonovaPassphraseController.handleSubmit()
     * 
     * This is the ONLY place a passphrase ever touches the key.
     * 
     * @param {string} passphrase - User-entered passphrase
     * @param {boolean} rememberDevice - Whether to save the raw key in localStorage (default true)
     */
    static async setPassphrase(passphrase, rememberDevice = true) {
        const { key } = await this.#deriveKey(passphrase);
        this.#masterKey = key;

        if (rememberDevice) {
            await this.#saveRememberedMasterKey(key);
        }
    }
}
