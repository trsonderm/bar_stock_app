const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/topshelf'
});

async function run() {
    try {
        const client = await pool.connect();

        console.log('Creating signatures table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS signatures (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER REFERENCES organizations(id),
                user_id INTEGER REFERENCES users(id),
                label TEXT,
                data TEXT,
                is_active BOOLEAN DEFAULT FALSE,
                is_shared BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('Creating report_schedules table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS report_schedules (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER REFERENCES organizations(id),
                report_id TEXT,
                frequency TEXT,
                recipients TEXT,
                active BOOLEAN DEFAULT TRUE,
                next_run_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('Tables created successfully.');

        client.release();
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await pool.end();
    }
}

run();
