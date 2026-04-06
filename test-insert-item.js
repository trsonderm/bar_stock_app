const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/topshelf',
});

async function run() {
  try {
    const payload = [
      "Test Item", // name
      "Liquor",    // type
      null,        // secondary_type
      null,        // supplier
      2,           // organization_id (simulate demo org)
      5,           // low_stock_threshold
      JSON.stringify([{label: 'Unit', amount: 1}]), // order_size
      null,        // stock_options
      true         // include_in_audit
    ];
    
    const res = await pool.query(
      'INSERT INTO items (name, type, secondary_type, supplier, organization_id, low_stock_threshold, order_size, stock_options, include_in_audit) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
      payload
    );
    console.log("Success item id:", res.rows[0].id);
  } catch (e) {
    console.error("Error inserting item:", e);
  } finally {
    pool.end();
  }
}
run();
