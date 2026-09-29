/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/db', () => ({
    db: { query: jest.fn(), one: jest.fn(), execute: jest.fn() },
}));
jest.mock('@/lib/dba', () => ({ validateStationToken: jest.fn() }));
jest.mock('next/headers', () => ({ cookies: jest.fn() }));
jest.mock('@/lib/auth', () => ({
    ...jest.requireActual('@/lib/auth'),
    createSessionToken: jest.fn().mockResolvedValue('signed.jwt.token'),
}));

import { POST } from '../login/route';
import { db } from '@/lib/db';
import { validateStationToken } from '@/lib/dba';
import { cookies } from 'next/headers';

const mockDb = db as jest.Mocked<typeof db>;

function pinLogin(pin: string) {
    return new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ pin }),
        headers: { 'content-type': 'application/json' },
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockDb.one.mockResolvedValue(null);
    mockDb.execute.mockResolvedValue({ rowCount: 1 } as any);
});

describe('PIN login', () => {
    it('is refused without a registered station token', async () => {
        (cookies as jest.Mock).mockReturnValue({ get: () => undefined });

        const res = await POST(pinLogin('1234'));

        expect(res.status).toBe(401);
        expect(mockDb.query).not.toHaveBeenCalled();
    });

    it('only matches users in the organization the station belongs to', async () => {
        (cookies as jest.Mock).mockReturnValue({ get: () => ({ value: 'station-token' }) });
        (validateStationToken as jest.Mock).mockResolvedValue({ org_id: 42 });
        mockDb.query.mockResolvedValue([
            { id: 5, pin_hash: '1234', role: 'user', permissions: '[]', first_name: 'Sam', last_name: 'B', organization_id: 42 },
        ]);

        const res = await POST(pinLogin('1234'));

        expect(res.status).toBe(200);
        const [sql, params] = mockDb.query.mock.calls[0];
        expect(sql).toContain('WHERE organization_id = $1');
        expect(params).toEqual([42]);
    });

    it('rejects a PIN that no user in the station organization has', async () => {
        (cookies as jest.Mock).mockReturnValue({ get: () => ({ value: 'station-token' }) });
        (validateStationToken as jest.Mock).mockResolvedValue({ org_id: 42 });
        mockDb.query.mockResolvedValue([{ id: 5, pin_hash: '9999', organization_id: 42 }]);

        const res = await POST(pinLogin('1234'));

        expect(res.status).toBe(401);
    });
});
