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

        console.log('Adding is_shared column to signatures table...');
        await client.query(`
            ALTER TABLE signatures 
            ADD COLUMN is_shared BOOLEAN DEFAULT FALSE;
        `);

        console.log('Migration successful.');
    } catch (e) {
        if (e.message && e.message.includes('already exists')) {
            console.log('Column already exists.');
        } else {
            console.error('Migration failed:', e);
        }
    } finally {
        await client.end();
    }
}

migrate();
