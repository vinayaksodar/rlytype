import { PatternStat, UserConfig } from "@rlytype/types";

const DB_NAME = "rlytype_db";
const DB_VERSION = 2;
const STORE_PATTERNS = "patterns";
const STORE_CONFIG = "config";
const STORE_LANGUAGES = "languages";

export class StorageEngine {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (typeof indexedDB === "undefined") {
      console.warn("IndexedDB not available (SSR or non-browser env)");
      return;
    }
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_PATTERNS)) {
          db.createObjectStore(STORE_PATTERNS, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORE_CONFIG)) {
          db.createObjectStore(STORE_CONFIG); // Key-Value store
        }
        if (!db.objectStoreNames.contains(STORE_LANGUAGES)) {
          db.createObjectStore(STORE_LANGUAGES); // Key-Value store (filename -> words[])
        }
      };
    });
  }

  async savePatternStats(stats: PatternStat[]): Promise<void> {
    if (!this.db) return; // Fail silently if no DB (e.g. SSR)
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_PATTERNS, "readwrite");
      const store = tx.objectStore(STORE_PATTERNS);

      stats.forEach((stat) => store.put(stat));

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async loadAllPatternStats(): Promise<PatternStat[]> {
    if (!this.db) return [];
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_PATTERNS, "readonly");
      const store = tx.objectStore(STORE_PATTERNS);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async saveConfig(config: UserConfig): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_CONFIG, "readwrite");
      const store = tx.objectStore(STORE_CONFIG);
      store.put(config, "user_config");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async loadConfig(): Promise<UserConfig | null> {
    if (!this.db) return null;
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_CONFIG, "readonly");
      const store = tx.objectStore(STORE_CONFIG);
      const request = store.get("user_config");
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async saveLanguage(filename: string, words: string[]): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_LANGUAGES, "readwrite");
      const store = tx.objectStore(STORE_LANGUAGES);
      store.put(words, filename);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getLanguage(filename: string): Promise<string[] | null> {
    if (!this.db) return null;
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_LANGUAGES, "readonly");
      const store = tx.objectStore(STORE_LANGUAGES);
      const request = store.get(filename);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }
}

export const storage = new StorageEngine();
