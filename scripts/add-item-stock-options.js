const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/topshelf'
});

async function migrate() {
    console.log('Adding stock_options to items table...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Add column if not exists
        await client.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='items' AND column_name='stock_options') THEN 
                    ALTER TABLE items ADD COLUMN stock_options JSONB DEFAULT NULL; 
                END IF; 
            END $$;
        `);

        console.log('Column added.');
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Migration Failed', e);
    } finally {
        client.release();
        pool.end();
    }
}

migrate();
