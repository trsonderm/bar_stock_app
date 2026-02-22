const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres@localhost:5432/topshelf' });

async function run() {
  await client.connect();
  const organizationId = 1;
  const locationId = 5; // Using location 5 as seen in earlier DB check
  try {
    const res = await client.query(`
      SELECT 
        i.id, i.name, i.type, i.secondary_type, i.unit_cost, i.supplier,
        i.order_size, i.low_stock_threshold,
        COALESCE(i.stock_options, '[]') as stock_options,
        COALESCE(i.include_in_audit, true) as include_in_audit,
        MAX(isp.supplier_id) as supplier_id,
        COALESCE(SUM(inv.quantity), 0) as quantity,
        COALESCE(MAX(usage_stats.usage_count), 0) as usage_count
      FROM items i
      LEFT JOIN inventory inv ON i.id = inv.item_id AND inv.location_id = $2
      LEFT JOIN item_suppliers isp ON i.id = isp.item_id AND isp.is_preferred = true
      LEFT JOIN (
        SELECT 
            (details->>'itemId')::int as item_id, 
            COUNT(*) as usage_count 
        FROM activity_logs 
        WHERE action = 'SUBTRACT_STOCK' AND organization_id = $1
        GROUP BY (details->>'itemId')::int
      ) usage_stats ON i.id = usage_stats.item_id
      WHERE i.organization_id = $1
      GROUP BY i.id, usage_stats.usage_count
    `, [organizationId, locationId]);
    console.log(`Returned ${res.rows.length} rows`);
    if(res.rows.length > 0) console.log(res.rows[0]);
  } catch(e) {
    console.error(e);
  } finally {
    client.end();
  }
}
run();
