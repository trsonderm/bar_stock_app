/**
 * @jest-environment node
 */
import { GET, POST } from '../route';

jest.mock('@/lib/db');
import { db } from '@/lib/db';

jest.mock('@/lib/auth', () => ({
    getSession: jest.fn(),
}));

import { getSession } from '@/lib/auth';

const mockDb = db as jest.Mocked<typeof db>;

function makeReq(method: string, body?: any): Request {
    const url = 'http://localhost/api/inventory';
    const opts: RequestInit = { method };
    if (body) opts.body = JSON.stringify(body);
    const req = new Request(url, opts) as any;
    req.cookies = { get: jest.fn().mockReturnValue(null) };
    if (body) req.json = async () => body;
    return req;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockDb.execute.mockResolvedValue({ rowCount: 0, rows: [] });
});

describe('/api/inventory', () => {
    it('GET returns only items for the user organization', async () => {
        (getSession as jest.Mock).mockResolvedValue({
            organizationId: 1,
            role: 'user',
            permissions: ['view_inventory'],
        });

        const items = [
            { id: 1, name: 'Vodka', type: 'Liquor', quantity: 10, organization_id: 1 },
        ];
        mockDb.query.mockResolvedValueOnce(items);

        const res = await GET(makeReq('GET') as any);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.items).toHaveLength(1);
        expect(data.items[0].name).toBe('Vodka');
    });

    it('GET does not return items from other organizations', async () => {
        (getSession as jest.Mock).mockResolvedValue({
            organizationId: 2,
            role: 'user',
            permissions: ['view_inventory'],
        });

        const items = [
            { id: 2, name: 'Rum', type: 'Liquor', quantity: 5, organization_id: 2 },
        ];
        mockDb.query.mockResolvedValueOnce(items);

        const res = await GET(makeReq('GET') as any);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.items).toHaveLength(1);
        expect(data.items[0].name).toBe('Rum');
    });

    it('POST creates item scoped to the user organization', async () => {
        (getSession as jest.Mock).mockResolvedValue({
            organizationId: 1,
            role: 'admin',
            permissions: ['add_item_name'],
        });

        mockDb.execute.mockResolvedValue({ rowCount: 1, rows: [{ id: 5 }] });
        mockDb.one.mockResolvedValue({ id: 5 });

        const res = await POST(makeReq('POST', { name: 'Gin', type: 'Liquor', quantity: 5 }) as any);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.success).toBe(true);

        // db.one is used for INSERT … RETURNING id
        const insertCall = mockDb.one.mock.calls.find(([sql]) =>
            typeof sql === 'string' && sql.toLowerCase().includes('insert into items')
        );
        expect(insertCall).toBeDefined();
        expect(insertCall![1]).toContain(1); // organizationId in params
    });
});
