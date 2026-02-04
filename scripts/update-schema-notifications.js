const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/topshelf'
});

async function updateSchema() {
    try {
        console.log('Updating Schema for Notifications...');
        const client = await pool.connect();

        await client.query('BEGIN');

        // 1. Create Notifications Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER REFERENCES organizations(id),
                user_id INTEGER REFERENCES users(id), 
                type TEXT NOT NULL, 
                title TEXT,
                message TEXT NOT NULL,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                data JSONB 
            )
        `);
        console.log('Created notifications table.');

        // 2. Add Preferences to Users
        // Check if column exists first to avoid error? Or simple ALTER IF NOT EXISTS (pg 9.6+ doesn't have IF NOT EXISTS for column easily, catch error)
        try {
            await client.query(`
                ALTER TABLE users 
                ADD COLUMN notification_preferences JSONB DEFAULT '{"price_changes": true, "stock_changes": true, "system": true}'
            `);
            console.log('Added notification_preferences to users.');
        } catch (e) {
            console.log('Column notification_preferences likely exists or error:', e.message);
        }

        await client.query('COMMIT');
        console.log('Schema Update Complete.');
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

updateSchema();
