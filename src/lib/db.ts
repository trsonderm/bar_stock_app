/**
 * PostgreSQL access layer.
 *
 * All server code goes through the `db` helpers below, which run on a shared
 * connection pool. Always pass values as `$n` parameters — never interpolate
 * user input into SQL text.
 *
 * Multi-statement work that must be atomic has to use `db.transaction()`:
 * issuing BEGIN / COMMIT through `db.execute` does not work, because each pool
 * call may run on a different connection.
 */
import { Pool, PoolClient, QueryResult } from 'pg';

const globalForDb = global as unknown as { pool: Pool };

export const pool = globalForDb.pool || new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/topshelf',
    max: 10,
    idleTimeoutMillis: 30000,
});

// Reuse the pool across hot reloads in development.
if (process.env.NODE_ENV !== 'production') globalForDb.pool = pool;

/** Query helpers bound to a single connection, used inside `db.transaction()`. */
export interface TxClient {
    query: (text: string, params?: any[]) => Promise<any[]>;
    one: (text: string, params?: any[]) => Promise<any | null>;
    execute: (text: string, params?: any[]) => Promise<QueryResult>;
}

async function run(runner: Pool | PoolClient, text: string, params: any[] = []): Promise<QueryResult> {
    try {
        return await runner.query(text, params);
    } catch (error) {
        console.error('Database Error:', error);
        throw error;
    }
}

export const db = {
    /** Execute a query and return all rows. */
    query: async (text: string, params: any[] = []): Promise<any[]> => {
        return (await run(pool, text, params)).rows;
    },

    /** Execute a query and return the first row, or null. */
    one: async (text: string, params: any[] = []): Promise<any | null> => {
        return (await run(pool, text, params)).rows[0] || null;
    },

    /** Execute a query and return the full result (rowCount, rows, ...). */
    execute: async (text: string, params: any[] = []): Promise<QueryResult> => {
        return run(pool, text, params);
    },

    /**
     * Run `work` inside a single BEGIN/COMMIT on one dedicated connection.
     * The transaction is rolled back if `work` throws, and the error re-thrown.
     */
    transaction: async <T>(work: (tx: TxClient) => Promise<T>): Promise<T> => {
        const client = await pool.connect();
        const tx: TxClient = {
            query: async (text, params = []) => (await run(client, text, params)).rows,
            one: async (text, params = []) => (await run(client, text, params)).rows[0] || null,
            execute: (text, params = []) => run(client, text, params),
        };
        try {
            await client.query('BEGIN');
            const result = await work(tx);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK').catch(() => { /* connection may already be broken */ });
            throw error;
        } finally {
            client.release();
        }
    },
};
