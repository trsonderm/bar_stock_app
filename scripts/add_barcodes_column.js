require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function main() {
    console.log('Adding barcodes JSONB column to items table...');
    try {
        // Add column
        await pool.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS barcodes JSONB DEFAULT '[]'::jsonb;`);
        console.log('Column added or already exists.');

        
    } catch(e) {
        console.error('Error during migration:', e);
    } finally {
        await pool.end();
    }
}

main();
