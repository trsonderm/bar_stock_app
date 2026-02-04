const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/topshelf'
});

async function testQuery() {
  try {
    console.log('Testing Inventory Query with Postgres (Fix Verification)...');

    // Mock IDs
    const orgId = 1;
    const locId = 1;

    // FIXED query: Using $1 for organizationId (reused) and $2 for locationId
    const query = `
      SELECT 
        i.id, i.name, i.type, i.secondary_type, i.unit_cost, i.supplier,
        COALESCE(inv.quantity, 0) as quantity,
        COALESCE(usage_stats.usage_count, 0) as usage_count
      FROM items i
      LEFT JOIN inventory inv ON i.id = inv.item_id AND inv.location_id = $2
      LEFT JOIN (
        SELECT 
            (details->>'itemId')::int as item_id, 
            COUNT(*) as usage_count 
        FROM activity_logs 
        WHERE action = 'SUBTRACT_STOCK' AND organization_id = $1
        GROUP BY (details->>'itemId')::int
      ) usage_stats ON i.id = usage_stats.item_id
      WHERE (i.organization_id = $1 OR i.organization_id IS NULL)
    `;

    // Fixed params array: [orgId, locId]
    const params = [orgId, locId];

    console.log('Running query...');
    const res = await pool.query(query, params);

    console.log('Query Success! Rows returned:', res.rowCount);
    // console.log(res.rows);

  } catch (e) {
    console.error('TEST FAILED:', e);
  } finally {
    pool.end();
  }
}

testQuery();
