import { Pool } from 'pg';

const globalForDb = global as unknown as { pool: Pool };

export const pool = globalForDb.pool || new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/topshelf',
    max: 10,
    idleTimeoutMillis: 30000,
});

if (process.env.NODE_ENV !== 'production') globalForDb.pool = pool;

export const db = {
    /**
     * Execute a query and return all rows
     */
    query: async (text: string, params: any[] = []): Promise<any[]> => {
        try {
            const res = await pool.query(text, params);
            return res.rows;
        } catch (error) {
            console.error('Database Error:', error);
            throw error;
        }
    },

    /**
     * Execute a query and return a single row (or null)
     */
    one: async (text: string, params: any[] = []): Promise<any | null> => {
        try {
            const res = await pool.query(text, params);
            return res.rows[0] || null;
        } catch (error) {
            console.error('Database Error:', error);
            throw error;
        }
    },

    /**
     * Execute a query and return the Result object (for INSERT/UPDATE counts)
     */
    execute: async (text: string, params: any[] = []): Promise<any> => {
        try {
            const res = await pool.query(text, params);
            return res; // Returns { rowCount, rows, ... }
        } catch (error) {
            console.error('Database Error:', error);
            throw error;
        }
    }
};
