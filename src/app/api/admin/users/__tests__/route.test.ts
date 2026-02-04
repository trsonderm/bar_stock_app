/**
 * @jest-environment node
 */
import { createMocks } from 'node-mocks-http';
import { GET, POST } from '../route';
import { createTestDb } from '@/lib/__tests__/test-db';

// Mock DB using manual mock
jest.mock('@/lib/db');
import { db } from '@/lib/db';

const testDb = db as any;

// Mock Auth
jest.mock('@/lib/auth', () => ({
    getSession: jest.fn(),
    hashPassword: jest.fn(p => 'hashed_' + p),
    hashPin: jest.fn(p => 'hashed_' + p)
}));

import { getSession } from '@/lib/auth';

describe('/api/admin/users Integration', () => {

    beforeAll(() => {
        // Reset DB tables
        testDb.prepare('DELETE FROM users').run();
        testDb.prepare('DELETE FROM organizations').run();

        // Seed
        testDb.prepare("INSERT INTO organizations (id, name) VALUES (1, 'Org 1')").run();
        testDb.prepare("INSERT INTO organizations (id, name) VALUES (2, 'Org 2')").run();

        // Admin for Org 1
        testDb.prepare("INSERT INTO users (id, first_name, last_name, role, organization_id) VALUES (1, 'Admin', 'One', 'admin', 1)").run();
        // User for Org 1
        testDb.prepare("INSERT INTO users (id, first_name, last_name, role, organization_id) VALUES (2, 'User', 'One', 'user', 1)").run();

        // Admin for Org 2
        testDb.prepare("INSERT INTO users (id, first_name, last_name, role, organization_id) VALUES (3, 'Admin', 'Two', 'admin', 2)").run();
    });

    it('GET should return only users for the admin organization', async () => {
        (getSession as jest.Mock).mockResolvedValue({
            organizationId: 1,
            role: 'admin'
        });

        const { req } = createMocks({
            method: 'GET',
            url: 'http://localhost:3000/api/admin/users'
        });

        const res = await GET(req as any);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.users).toHaveLength(2); // ID 1 and 2
        const ids = data.users.map((u: any) => u.id).sort();
        expect(ids).toEqual([1, 2]);
    });

    it('POST should create a new user in the admin organization', async () => {
        (getSession as jest.Mock).mockResolvedValue({
            organizationId: 1,
            role: 'admin'
        });

        const { req } = createMocks({
            method: 'POST',
            body: {
                firstName: 'New',
                lastName: 'Staff',
                pin: '1234',
                role: 'user',
                permissions: ['add_stock']
            }
        });
        req.json = async () => req.body;

        const res = await POST(req as any);
        const data = await res.json();

        expect(res.status).toBe(200);

        // Check DB
        const user = testDb.prepare("SELECT * FROM users WHERE first_name = 'New' AND organization_id = 1").get();
        expect(user).toBeDefined();
        expect(user.role).toBe('user');

        // Verify not in Org 2
        const leak = testDb.prepare("SELECT * FROM users WHERE first_name = 'New' AND organization_id = 2").get();
        expect(leak).toBeUndefined();
    });
});
