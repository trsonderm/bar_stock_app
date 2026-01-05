import Database from 'better-sqlite3';
import path from 'path';

// Prevent multiple instances in dev mode (Next.js hot reload)
const globalForDb = global as unknown as { db: Database.Database };

const dbPath = path.join(process.cwd(), 'inventory.db');

export const db = globalForDb.db || new Database(dbPath, { verbose: console.log });

if (process.env.NODE_ENV !== 'production') globalForDb.db = db;
