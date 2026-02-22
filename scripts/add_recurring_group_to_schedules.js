const { Client } = require('pg');

const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgres://postgres@localhost:5432/topshelf'
});

async function run() {
    try {
        await client.connect();

        console.log('Adding recurring_group_id to user_schedules...');
        await client.query(`
            ALTER TABLE user_schedules
            ADD COLUMN IF NOT EXISTS recurring_group_id VARCHAR(255);
        `);

        console.log('Creating index on recurring_group_id...');
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_user_schedules_recurring_group_id 
            ON user_schedules(recurring_group_id);
        `);

        console.log('Migration completed successfully.');
    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        await client.end();
    }
}

run();
