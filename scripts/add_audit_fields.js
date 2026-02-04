
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:postgres@localhost:5433/topshelf' });

async function run() {
    try {
        console.log('--- Migrating Database for Audit System ---');

        // 1. Add type column to activity_logs
        // Check if exists first
        const res = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='activity_logs' AND column_name='type'
        `);

        if (res.rows.length === 0) {
            console.log("Adding 'type' column to activity_logs...");
            await pool.query(`ALTER TABLE activity_logs ADD COLUMN "type" TEXT DEFAULT 'normal'`);
            await pool.query(`UPDATE activity_logs SET type = 'normal' WHERE type IS NULL`);
            console.log("Column added.");
        } else {
            console.log("'type' column already exists.");
        }

        // 2. Ensure users have permissions array (It acts as JSON or text[]?)
        // The schema uses text[] usually. 
        // We don't need to change schema for permissions if it's already an array, just logically support 'audit' string.

        console.log('Migration Complete.');
    } catch (e) {
        console.error('Migration Failed:', e);
    } finally {
        pool.end();
    }
}

run();
