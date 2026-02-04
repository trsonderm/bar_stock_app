const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

async function testQuery() {
    try {
        console.log('Testing Inventory Query...');

        // Mock IDs
        const orgId = 1;
        const locId = 1;

        // The query we patched
        const query = `
          SELECT 
            i.id, i.name, 
            COALESCE(usage_stats.usage_count, 0) as usage_count
          FROM items i
          LEFT JOIN (
            SELECT 
                CAST(json_extract(details, '$.itemId') AS INTEGER) as item_id, 
                COUNT(*) as usage_count 
            FROM activity_logs 
            WHERE action = 'SUBTRACT_STOCK' AND organization_id = ?
            GROUP BY CAST(json_extract(details, '$.itemId') AS INTEGER)
          ) usage_stats ON i.id = usage_stats.item_id
          WHERE i.organization_id = ?
          LIMIT 5
        `;

        const stmt = db.prepare(query);
        const rows = stmt.all(orgId, orgId);

        console.log('Query Success! Rows returned:', rows.length);
        console.log(rows);

    } catch (e) {
        console.error('TEST FAILED:', e);
    }
}

testQuery();
