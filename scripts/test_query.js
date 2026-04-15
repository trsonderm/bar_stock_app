require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const p = new Pool({ connectionString: process.env.DATABASE_URL.replace('5432', '5433').replace('topshelf', 'bar_stock') });

const fallbackQuery = `
  SELECT
    i.id, i.name, i.type, i.secondary_type, i.unit_cost, i.sale_price, i.supplier,
    i.order_size, i.low_stock_threshold,
    COALESCE(i.barcodes, '[]'::jsonb) as barcodes,
    COALESCE(i.stock_options, '[]') as stock_options,
    COALESCE(i.include_in_audit, true) as include_in_audit,
    true as include_in_low_stock_alerts,
    COALESCE(i.stock_unit_label, 'unit') as stock_unit_label,
    COALESCE(i.stock_unit_size, 1) as stock_unit_size,
    COALESCE(i.order_unit_label, 'case') as order_unit_label,
    COALESCE(i.order_unit_size, 1) as order_unit_size,
    COALESCE(i.use_category_qty_defaults, true) as use_category_qty_defaults,
    MAX(isp.supplier_id) as supplier_id,
    NULL::int as location_supplier_id,
    COALESCE(SUM(inv.quantity), 0) as quantity,
    COALESCE(MAX(usage_stats.usage_count), 0) as usage_count,
    (SELECT json_agg(location_id) FROM inventory WHERE item_id = i.id) as assigned_locations,
    NULL::numeric as location_sale_price
  FROM items i
  LEFT JOIN inventory inv ON i.id = inv.item_id AND inv.location_id = $2
  LEFT JOIN item_suppliers isp ON i.id = isp.item_id AND isp.is_preferred = true
  LEFT JOIN (
    SELECT (details->>'itemId')::int as item_id, COUNT(*) as usage_count
    FROM activity_logs WHERE action = 'SUBTRACT_STOCK' AND organization_id = $1
    GROUP BY (details->>'itemId')::int
  ) usage_stats ON i.id = usage_stats.item_id
  WHERE i.organization_id = $1
  GROUP BY i.id, usage_stats.usage_count
`;

p.query(fallbackQuery, [1, 1])
  .then(() => console.log('SUCCESS'))
  .catch(e => console.error(e.message))
  .finally(() => p.end());
