/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/db', () => ({
    db: { query: jest.fn(), one: jest.fn(), execute: jest.fn() },
}));
jest.mock('@/lib/auth', () => ({
    getSession: jest.fn(),
    hashPassword: jest.fn((p: string) => 'hashed_' + p),
    hashPin: jest.fn((p: string) => p),
}));

import { GET, POST, PUT, DELETE } from '../route';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

const mockDb = db as jest.Mocked<typeof db>;
const mockGetSession = getSession as jest.Mock;

const tenantAdmin = { id: 10, organizationId: 1, role: 'admin', permissions: ['all'], isSuperAdmin: false };
const superAdmin = { ...tenantAdmin, isSuperAdmin: true, permissions: ['all', 'super_admin'] };

function request(method: string, body?: unknown, url = 'http://localhost/api/admin/users') {
    return new NextRequest(url, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
    });
}

/** Returns the JSON-encoded permissions passed to the INSERT/UPDATE on users. */
function writtenPermissions(): string[] {
    const call = [...mockDb.one.mock.calls, ...mockDb.execute.mock.calls]
        .find(([sql]) => /INSERT INTO users|UPDATE users SET/.test(sql));
    const json = (call?.[1] as any[]).find(p => typeof p === 'string' && p.startsWith('['));
    return JSON.parse(json);
}

beforeEach(() => {
    jest.resetAllMocks();
    mockDb.query.mockResolvedValue([]);
    mockDb.one.mockResolvedValue(null);
    mockDb.execute.mockResolvedValue({ rowCount: 1 } as any);
});

describe('/api/admin/users', () => {
    it('rejects non-admins', async () => {
        mockGetSession.mockResolvedValue({ ...tenantAdmin, role: 'user' });
        const res = await GET(request('GET'));
        expect(res.status).toBe(401);
    });

    it('GET only queries the caller organization, ignoring ?orgId for tenant admins', async () => {
        mockGetSession.mockResolvedValue(tenantAdmin);
        mockDb.query.mockResolvedValue([{ id: 1, first_name: 'A', assigned_locations: [null] }]);

        const res = await GET(request('GET', undefined, 'http://localhost/api/admin/users?orgId=2'));

        expect(res.status).toBe(200);
        expect(mockDb.query.mock.calls[0][1]).toEqual([1]);
        const data = await res.json();
        expect(data.users[0].assigned_locations).toEqual([]);
    });

    it('POST strips the super_admin permission when a tenant admin creates a user', async () => {
        mockGetSession.mockResolvedValue(tenantAdmin);
        mockDb.one.mockResolvedValue({ id: 99 });

        const res = await POST(request('POST', {
            firstName: 'New', lastName: 'Staff', pin: '1234', permissions: ['add_stock', 'super_admin'],
        }));

        expect(res.status).toBe(200);
        expect(writtenPermissions()).toEqual(['add_stock']);
    });

    it('POST lets a super admin grant super_admin', async () => {
        mockGetSession.mockResolvedValue(superAdmin);
        mockDb.one.mockResolvedValue({ id: 99 });

        await POST(request('POST', {
            firstName: 'New', lastName: 'Admin', pin: '1234', permissions: ['super_admin'],
        }));

        expect(writtenPermissions()).toEqual(['super_admin']);
    });

    it('POST only assigns locations that belong to the organization', async () => {
        mockGetSession.mockResolvedValue(tenantAdmin);
        mockDb.one.mockResolvedValue({ id: 99 });
        mockDb.query.mockImplementation(async (sql: string) =>
            sql.includes('FROM locations') ? [{ id: 5 }] : []);

        await POST(request('POST', {
            firstName: 'New', lastName: 'Staff', pin: '1234', assignedLocations: [5, 777],
        }));

        const inserts = mockDb.execute.mock.calls.filter(([sql]) => sql.includes('INSERT INTO user_locations'));
        expect(inserts.map(([, params]) => (params as any[])[1])).toEqual([5]);
    });

    it('PUT refuses to let a tenant admin modify a super admin account', async () => {
        mockGetSession.mockResolvedValue(tenantAdmin);
        mockDb.one.mockResolvedValue({ id: 1, permissions: '["all","super_admin"]' });

        const res = await PUT(request('PUT', { id: 1, firstName: 'X', lastName: 'Y', password: 'takeover' }));

        expect(res.status).toBe(403);
        expect(mockDb.execute).not.toHaveBeenCalled();
    });

    it('DELETE refuses to let a tenant admin delete a super admin account', async () => {
        mockGetSession.mockResolvedValue(tenantAdmin);
        mockDb.one.mockResolvedValue({ id: 1, permissions: ['super_admin'] });

        const res = await DELETE(request('DELETE', { id: 1 }));

        expect(res.status).toBe(403);
        expect(mockDb.execute).not.toHaveBeenCalled();
    });
});
