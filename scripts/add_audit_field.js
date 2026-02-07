const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local manually
const envPath = path.resolve(__dirname, '../.env.local');
let dbUrl = process.env.DATABASE_URL;

if (!dbUrl && fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/DATABASE_URL=(.*)/);
    if (match && match[1]) {
        dbUrl = match[1].trim().replace(/['"]/g, '');
    }
}

if (!dbUrl) {
    console.error('DATABASE_URL not found');
    process.exit(1);
}

const client = new Client({
    connectionString: dbUrl
});

async function migrate() {
    try {
        await client.connect();
        console.log('Connected to database.');

        console.log('Adding include_in_audit column to items table...');

        // Add column if not exists
        await client.query(`
            ALTER TABLE items 
            ADD COLUMN IF NOT EXISTS include_in_audit BOOLEAN DEFAULT TRUE;
        `);

        console.log('Migration successful.');
    } catch (e) {
        console.error('Migration failed:', e);
        process.exit(1);
    } finally {
        await client.end();
    }
}

migrate();
