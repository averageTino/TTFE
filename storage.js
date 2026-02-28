(function () {
    const DB_NAME = "tech-tree-db";
    const DB_VERSION = 1;
    const STORE_NAME = "app";
    const MIGRATION_FLAG = "__tt_migrated_idb_v1";

    const hasLocalStorage = (() => {
        try {
            const key = "__tt_test__";
            localStorage.setItem(key, "1");
            localStorage.removeItem(key);
            return true;
        } catch {
            return false;
        }
    })();

    const api = {
        db: null,
        useIndexedDB: typeof indexedDB !== "undefined",
        ready: false,

        async init() {
            if (this.ready) return;
            if (!this.useIndexedDB) {
                this.ready = true;
                return;
            }
            try {
                this.db = await this.openDb();
                await this.migrateFromLocalStorageIfNeeded();
            } catch (err) {
                console.warn("IndexedDB unavailable, falling back to localStorage:", err);
                this.db = null;
                this.useIndexedDB = false;
            } finally {
                this.ready = true;
            }
        },

        openDb() {
            return new Promise((resolve, reject) => {
                const req = indexedDB.open(DB_NAME, DB_VERSION);
                req.onupgradeneeded = () => {
                    const db = req.result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        db.createObjectStore(STORE_NAME, { keyPath: "key" });
                    }
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error || new Error("Failed to open IndexedDB"));
            });
        },

        async migrateFromLocalStorageIfNeeded() {
            if (!hasLocalStorage) return;
            const migrated = localStorage.getItem(MIGRATION_FLAG) === "1";
            if (migrated) return;

            const existingFactions = await this.idbGet("factions");
            const existingCurrent = await this.idbGet("currentFaction");

            if ((existingFactions === undefined || existingFactions === null) && localStorage.getItem("factions")) {
                try {
                    await this.idbSet("factions", JSON.parse(localStorage.getItem("factions") || "[]"));
                } catch {
                    await this.idbSet("factions", []);
                }
            }

            if ((existingCurrent === undefined || existingCurrent === null) && localStorage.getItem("currentFaction")) {
                await this.idbSet("currentFaction", localStorage.getItem("currentFaction"));
            }

            localStorage.setItem(MIGRATION_FLAG, "1");
        },

        transaction(mode) {
            const tx = this.db.transaction(STORE_NAME, mode);
            return tx.objectStore(STORE_NAME);
        },

        idbGet(key) {
            return new Promise((resolve, reject) => {
                const req = this.transaction("readonly").get(key);
                req.onsuccess = () => resolve(req.result ? req.result.value : undefined);
                req.onerror = () => reject(req.error || new Error("IndexedDB read failed"));
            });
        },

        idbSet(key, value) {
            return new Promise((resolve, reject) => {
                const req = this.transaction("readwrite").put({ key, value });
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error || new Error("IndexedDB write failed"));
            });
        },

        async getFactions() {
            await this.init();
            if (this.useIndexedDB && this.db) {
                const factions = await this.idbGet("factions");
                return Array.isArray(factions) ? factions : [];
            }
            if (!hasLocalStorage) return [];
            try {
                return JSON.parse(localStorage.getItem("factions") || "[]");
            } catch {
                return [];
            }
        },

        async setFactions(factions) {
            await this.init();
            if (this.useIndexedDB && this.db) {
                await this.idbSet("factions", Array.isArray(factions) ? factions : []);
                return;
            }
            if (!hasLocalStorage) return;
            localStorage.setItem("factions", JSON.stringify(Array.isArray(factions) ? factions : []));
        },

        async getCurrentFaction() {
            await this.init();
            if (this.useIndexedDB && this.db) {
                const value = await this.idbGet("currentFaction");
                return value || null;
            }
            if (!hasLocalStorage) return null;
            return localStorage.getItem("currentFaction");
        },

        async setCurrentFaction(id) {
            await this.init();
            if (this.useIndexedDB && this.db) {
                await this.idbSet("currentFaction", id || null);
                return;
            }
            if (!hasLocalStorage) return;
            if (id === null || id === undefined || id === "") {
                localStorage.removeItem("currentFaction");
            } else {
                localStorage.setItem("currentFaction", id);
            }
        },

        async getUsageInfo() {
            if (navigator.storage && typeof navigator.storage.estimate === "function") {
                try {
                    const estimate = await navigator.storage.estimate();
                    return {
                        usedBytes: estimate.usage || 0,
                        quotaBytes: estimate.quota || 0,
                        source: "estimate"
                    };
                } catch {
                }
            }

            let total = 0;
            if (hasLocalStorage) {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i) || "";
                    const value = localStorage.getItem(key) || "";
                    total += (key.length + value.length) * 2;
                }
            }

            return {
                usedBytes: total,
                quotaBytes: 5 * 1024 * 1024,
                source: "localStorage-estimate"
            };
        }
    };

    window.TechTreeStorage = api;
})();
