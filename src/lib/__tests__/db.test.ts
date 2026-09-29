/**
 * @jest-environment node
 */
// A single fake pool/client shared by every `new Pool()` (jest.mock is hoisted,
// so the fakes must be created inside the factory).
jest.mock('pg', () => {
    const client = { query: jest.fn(), release: jest.fn() };
    const pool = { query: jest.fn(), connect: jest.fn(async () => client), client };
    return { Pool: jest.fn(() => pool) };
});

import { Pool } from 'pg';
import { db } from '../db';

const pool = new Pool() as any;
const client = pool.client as { query: jest.Mock; release: jest.Mock };

beforeEach(() => {
    jest.clearAllMocks();
    client.query.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 });
    jest.spyOn(console, 'error').mockImplementation(() => { });
});

describe('db.transaction', () => {
    it('runs all statements on one connection between BEGIN and COMMIT', async () => {
        const result = await db.transaction(async (tx) => {
            await tx.execute('INSERT INTO a VALUES ($1)', [1]);
            return tx.one('SELECT id FROM a');
        });

        expect(result).toEqual({ id: 1 });
        expect(client.query.mock.calls.map(c => c[0])).toEqual([
            'BEGIN', 'INSERT INTO a VALUES ($1)', 'SELECT id FROM a', 'COMMIT',
        ]);
        expect(pool.query).not.toHaveBeenCalled();
        expect(client.release).toHaveBeenCalledTimes(1);
    });

    it('rolls back, releases the connection and rethrows on error', async () => {
        const boom = new Error('boom');

        await expect(db.transaction(async () => { throw boom; })).rejects.toBe(boom);

        expect(client.query.mock.calls.map(c => c[0])).toEqual(['BEGIN', 'ROLLBACK']);
        expect(client.release).toHaveBeenCalledTimes(1);
    });
});

describe('db helpers', () => {
    it('one() returns null when there are no rows', async () => {
        pool.query.mockResolvedValue({ rows: [] });
        await expect(db.one('SELECT 1')).resolves.toBeNull();
    });
});
