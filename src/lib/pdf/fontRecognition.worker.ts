// WebWorker for Offline Font Recognition
// Loads the SQLite database and executes the matching pipeline in the background.

import initSqlJs from 'sql.js';
import { matchFontUsingDb } from './fontMatchingEngine';

let db: any = null;
let SQL: any = null;
let initPromise: Promise<void> | null = null;

async function initDb(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      console.log("[Worker] Initializing SQLite Font DB...");
      // Parallel fetch of database and sql.js WASM module
      const [dbRes, sqlJsModule] = await Promise.all([
        fetch('/font-fingerprints.db'),
        initSqlJs({
          locateFile: (file) => `/${file}`
        })
      ]);

      if (!dbRes.ok) {
        throw new Error(`Failed to fetch database: ${dbRes.statusText}`);
      }

      const dbBuffer = await dbRes.arrayBuffer();
      SQL = sqlJsModule;
      db = new SQL.Database(new Uint8Array(dbBuffer));
      console.log("[Worker] SQLite database loaded and indexed successfully.");
    } catch (err: any) {
      console.error("[Worker] Failed to initialize SQLite database:", err.message);
      initPromise = null; // Reset for retry
      throw err;
    }
  })();

  return initPromise;
}

// Start loading the DB immediately when the worker spawns
initDb().catch(() => {});

self.onmessage = async (e: MessageEvent) => {
  const { type, fontName, fontBytes, pdfWidths, requestId } = e.data;

  if (type === 'INIT') {
    try {
      await initDb();
      self.postMessage({ type: 'INIT_SUCCESS', requestId });
    } catch (err: any) {
      self.postMessage({ type: 'INIT_FAILURE', error: err.message, requestId });
    }
    return;
  }

  if (type === 'MATCH') {
    try {
      await initDb();
      if (!db) {
        throw new Error("Database not initialized.");
      }

      console.log(`[Worker] Starting match pipeline for font: ${fontName}`);
      const start = performance.now();
      const result = matchFontUsingDb(db, fontBytes, pdfWidths);
      const duration = performance.now() - start;
      console.log(`[Worker] Match pipeline finished in ${duration.toFixed(1)}ms. Result:`, result);

      self.postMessage({
        type: 'MATCH_RESULT',
        fontName,
        result,
        duration,
        requestId
      });
    } catch (err: any) {
      console.error(`[Worker] Error matching font ${fontName}:`, err.message);
      self.postMessage({
        type: 'MATCH_ERROR',
        fontName,
        error: err.message,
        requestId
      });
    }
  }
};
