const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:postgres@localhost:5432/topshelf' });
async function check() {
  const c = await pool.query("SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'items' AND column_name = 'type'");
  console.log(c.rows);
  pool.end();
}
check();
