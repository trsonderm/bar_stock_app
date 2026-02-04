const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:postgres@localhost:5433/topshelf' });

async function run() {
    try {
        console.log('Creating saved_reports...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS saved_reports (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER REFERENCES organizations(id),
                name VARCHAR(255) NOT NULL,
                description TEXT,
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);

        console.log('Creating report_sections...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS report_sections (
                id SERIAL PRIMARY KEY,
                report_id INTEGER REFERENCES saved_reports(id) ON DELETE CASCADE,
                type VARCHAR(50) NOT NULL,
                title VARCHAR(255),
                data_source VARCHAR(100) NOT NULL,
                config JSONB NOT NULL DEFAULT '{}',
                sort_order INTEGER DEFAULT 0
            );
        `);

        console.log('Creating report_schedules...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS report_schedules (
                id SERIAL PRIMARY KEY,
                report_id INTEGER REFERENCES saved_reports(id) ON DELETE CASCADE,
                organization_id INTEGER REFERENCES organizations(id),
                frequency VARCHAR(50) NOT NULL,
                recipients TEXT[],
                next_run_at TIMESTAMP,
                active BOOLEAN DEFAULT true
            );
        `);

        console.log('Tables created successfully.');
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

run();
