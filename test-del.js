const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:postgres@localhost:5432/topshelf' });
async function check() {
  try {
    const res = await pool.query("DELETE FROM items WHERE id = (SELECT id FROM items LIMIT 1)");
    console.log("Deleted", res.rowCount);
  } catch (e) {
    console.log("ERROR:", e.message);
  }
  pool.end();
}
check();
