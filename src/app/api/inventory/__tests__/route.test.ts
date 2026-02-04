/**
 * @jest-environment node
 */
import { createMocks } from 'node-mocks-http';
import { GET, POST } from '../route'; // Correct path
import { createTestDb } from '@/lib/__tests__/test-db';

// Mock DB using manual mock in src/lib/__mocks__/db.ts
jest.mock('@/lib/db');
import { db } from '@/lib/db'; // This will be the mock

const testDb = db as any; // Alias for consistency with existing test code

// Mock Auth
jest.mock('@/lib/auth', () => ({
    getSession: jest.fn()
}));

import { getSession } from '@/lib/auth';

describe('/api/inventory Integration', () => {

    beforeAll(() => {
        // Seed DB with some data
        testDb.prepare("INSERT INTO organizations (id, name) VALUES (1, 'Test Org 1')").run();
        testDb.prepare("INSERT INTO organizations (id, name) VALUES (2, 'Test Org 2')").run();

        testDb.prepare("INSERT INTO locations (id, name, organization_id) VALUES (1, 'Bar 1', 1)").run();
        testDb.prepare("INSERT INTO locations (id, name, organization_id) VALUES (2, 'Bar 2', 2)").run();

        testDb.prepare("INSERT INTO categories (id, name, organization_id) VALUES (1, 'Liquor', 1)").run();
        testDb.prepare("INSERT INTO categories (id, name, organization_id) VALUES (2, 'Liquor', 2)").run();

        // Note: Items table uses 'type' column now, ensuring schema match
        testDb.prepare("INSERT INTO items (id, name, type, organization_id) VALUES (1, 'Vodka', 'Liquor', 1)").run();
        testDb.prepare("INSERT INTO items (id, name, type, organization_id) VALUES (2, 'Rum', 'Liquor', 2)").run();

        testDb.prepare("INSERT INTO inventory (item_id, location_id, organization_id, quantity) VALUES (1, 1, 1, 10)").run();
        testDb.prepare("INSERT INTO inventory (item_id, location_id, organization_id, quantity) VALUES (2, 2, 2, 5)").run();
    });

    it('GET should return only items for the user organization', async () => {
        (getSession as jest.Mock).mockResolvedValue({
            organizationId: 1,
            role: 'user',
            permissions: ['view_inventory']
        });

        const { req } = createMocks({
            method: 'GET',
            url: 'http://localhost:3000/api/inventory',
        });

        const res = await GET(req as any);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.items).toHaveLength(1); // API returns { items: [] }, not inventory
        expect(data.items[0].name).toBe('Vodka');
    });

    it('GET should not return items from other organizations', async () => {
        (getSession as jest.Mock).mockResolvedValue({
            organizationId: 2,
            role: 'user',
            permissions: ['view_inventory']
        });

        const { req } = createMocks({
            method: 'GET',
            url: 'http://localhost:3000/api/inventory',
        });

        const res = await GET(req as any);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.items).toHaveLength(1);
        expect(data.items[0].name).toBe('Rum');
    });

    it('POST should create item in user organization', async () => {
        (getSession as jest.Mock).mockResolvedValue({
            organizationId: 1,
            role: 'admin',
            permissions: ['add_item_name'] // assuming check
        });

        const { req } = createMocks({
            method: 'POST',
            body: {
                name: 'Gin',
                type: 'Liquor', // Changed from categoryId to type
                quantity: 5,
                parLevel: 2,
                bottleSize: '750ml'
            }
        });

        req.json = async () => req.body;

        const res = await POST(req as any);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.success).toBe(true);

        // Verify in DB
        const item = testDb.prepare("SELECT * FROM items WHERE name = 'Gin' AND organization_id = 1").get();
        expect(item).toBeDefined();

        const otherOrgItem = testDb.prepare("SELECT * FROM items WHERE name = 'Gin' AND organization_id = 2").get();
        expect(otherOrgItem).toBeUndefined();
    });
});
