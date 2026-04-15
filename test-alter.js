const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:postgres@localhost:5432/topshelf' });
async function run() {
  try {
    await pool.query("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT true, ADD COLUMN is_archived BOOLEAN DEFAULT false;");
    console.log("Success");
  } catch (e) {
    console.log("Error:", e.message);
  }
  pool.end();
}
run();
