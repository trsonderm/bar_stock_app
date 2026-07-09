/**
 * @jest-environment node
 */
import { GET, POST } from '../route';

jest.mock('@/lib/db');
import { db } from '@/lib/db';

jest.mock('@/lib/auth', () => ({
    getSession: jest.fn(),
    hashPassword: jest.fn(p => Promise.resolve('hashed_' + p)),
    hashPin: jest.fn(p => Promise.resolve('hashed_' + p)),
}));

import { getSession } from '@/lib/auth';

const mockDb = db as jest.Mocked<typeof db>;

function makeReq(method: string, body?: any): Request {
    const url = 'http://localhost/api/admin/users';
    const opts: RequestInit = { method };
    const req = new Request(url, opts) as any;
    if (body) req.json = async () => body;
    return req;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockDb.execute.mockResolvedValue({ rowCount: 0, rows: [] });
});

describe('/api/admin/users', () => {
    it('GET returns only users for the admin organization', async () => {
        (getSession as jest.Mock).mockResolvedValue({ organizationId: 1, role: 'admin' });

        const users = [
            { id: 1, first_name: 'Admin', last_name: 'One', role: 'admin', organization_id: 1 },
            { id: 2, first_name: 'User', last_name: 'One', role: 'user', organization_id: 1 },
        ];
        mockDb.query.mockResolvedValueOnce(users);

        const res = await GET(makeReq('GET') as any);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.users).toHaveLength(2);
        const ids = data.users.map((u: any) => u.id).sort();
        expect(ids).toEqual([1, 2]);
    });

    it('GET does not leak users from another organization', async () => {
        (getSession as jest.Mock).mockResolvedValue({ organizationId: 2, role: 'admin' });

        const users = [
            { id: 3, first_name: 'Admin', last_name: 'Two', role: 'admin', organization_id: 2 },
        ];
        mockDb.query.mockResolvedValueOnce(users);

        const res = await GET(makeReq('GET') as any);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.users).toHaveLength(1);
        expect(data.users[0].id).toBe(3);
    });

    it('POST creates a new user scoped to the admin organization', async () => {
        (getSession as jest.Mock).mockResolvedValue({ organizationId: 1, role: 'admin', userId: 1 });

        mockDb.one.mockResolvedValueOnce({ id: 10 });

        const res = await POST(makeReq('POST', {
            firstName: 'New', lastName: 'Staff', pin: '1234', role: 'user', permissions: ['add_stock'],
        }) as any);

        expect(res.status).toBe(200);

        // db.one is used for INSERT … RETURNING id
        const insertCall = mockDb.one.mock.calls.find(([sql]) =>
            typeof sql === 'string' && sql.toLowerCase().includes('insert into users')
        );
        expect(insertCall).toBeDefined();
        expect(insertCall![1]).toContain(1); // organizationId in params
    });
});
