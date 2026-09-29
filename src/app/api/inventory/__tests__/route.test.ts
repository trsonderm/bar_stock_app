/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/db', () => ({
    db: { query: jest.fn(), one: jest.fn(), execute: jest.fn() },
}));
jest.mock('@/lib/auth', () => ({ getSession: jest.fn() }));
jest.mock('@/lib/logger', () => ({ logActivity: jest.fn() }));
jest.mock('@/lib/smart-order', () => ({ checkAndTriggerSmartOrder: jest.fn() }));

import { GET } from '../route';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

const mockDb = db as jest.Mocked<typeof db>;
const mockGetSession = getSession as jest.Mock;

beforeEach(() => {
    jest.resetAllMocks();
    mockDb.one.mockResolvedValue({ id: 7 });
    mockDb.query.mockResolvedValue([{ id: 1, name: 'Vodka' }]);
});

describe('GET /api/inventory', () => {
    it('requires a session', async () => {
        mockGetSession.mockResolvedValue(null);
        const res = await GET(new NextRequest('http://localhost/api/inventory'));
        expect(res.status).toBe(401);
    });

    it('scopes every query to the caller organization, even if ?orgId is supplied', async () => {
        mockGetSession.mockResolvedValue({ id: 3, organizationId: 1, role: 'user', permissions: [], isSuperAdmin: false });

        const res = await GET(new NextRequest('http://localhost/api/inventory?orgId=2&locationId=7'));

        expect(res.status).toBe(200);
        expect((await res.json()).items).toEqual([{ id: 1, name: 'Vodka' }]);

        const calls = [...mockDb.one.mock.calls, ...mockDb.query.mock.calls];
        const orgScoped = calls.filter(([sql]) => /organization_id|organizations WHERE id/.test(sql));
        expect(orgScoped.length).toBeGreaterThan(0);
        for (const [, params] of orgScoped) {
            expect(params).toContain(1);
            expect(params).not.toContain(2);
        }
    });

    it('lets a super admin read another organization via ?orgId', async () => {
        mockGetSession.mockResolvedValue({ id: 1, organizationId: 1, role: 'admin', permissions: ['super_admin'], isSuperAdmin: true });

        await GET(new NextRequest('http://localhost/api/inventory?orgId=2'));

        const itemsQuery = mockDb.query.mock.calls.find(([sql]) => sql.includes('FROM items'));
        expect(itemsQuery?.[1]?.[0]).toBe(2);
    });
});
