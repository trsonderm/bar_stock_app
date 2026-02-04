import { Pool, QueryResult } from 'pg';

// Global pool to prevent multiple connections in dev
const globalForPg = global as unknown as { pgPool: Pool };

export const pool = globalForPg.pgPool || new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/topshelf',
});

if (process.env.NODE_ENV !== 'production') globalForPg.pgPool = pool;

export const db = {
    /**
     * Execute a query and return all rows
     */
    query: async (text: string, params?: any[]): Promise<any[]> => {
        const start = Date.now();
        try {
            const res = await pool.query(text, params);
            // if (process.env.NODE_ENV !== 'production') {
            //     const duration = Date.now() - start;
            //     console.log('executed query', { text, duration, rows: res.rowCount });
            // }
            return res.rows;
        } catch (error) {
            console.error('Database Error:', error);
            throw error;
        }
    },

    /**
     * Execute a query and return a single row (or null)
     */
    one: async (text: string, params?: any[]): Promise<any | null> => {
        const res = await pool.query(text, params);
        if (res.rows.length > 0) return res.rows[0];
        return null;
    },

    /**
     * Execute a query and return the Result object (for INSERT/UPDATE counts)
     */
    execute: async (text: string, params?: any[]): Promise<QueryResult> => {
        return await pool.query(text, params);
    },

    // Helper to close pool (for scripts)
    end: async () => {
        await pool.end();
    }
};
