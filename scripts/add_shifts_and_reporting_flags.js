const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/topshelf'
});

async function migrate() {
    console.log('Starting migration details...');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Create Shifts Table
        console.log('Creating shifts table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS shifts (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL,
                label TEXT NOT NULL,
                start_time TEXT NOT NULL, -- Format "HH:mm"
                end_time TEXT NOT NULL,   -- Format "HH:mm"
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Shifts table created.');

        // 2. Add enable_low_stock_reporting to categories
        console.log('Checking categories table for enable_low_stock_reporting...');
        await client.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='categories' AND column_name='enable_low_stock_reporting') THEN 
                    ALTER TABLE categories ADD COLUMN enable_low_stock_reporting BOOLEAN DEFAULT TRUE; 
                END IF; 
            END $$;
        `);
        console.log('Added enable_low_stock_reporting column to categories.');

        await client.query('COMMIT');
        console.log('Migration completed successfully.');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', e);
        process.exit(1);
    } finally {
        client.release();
        pool.end();
    }
}

migrate();
