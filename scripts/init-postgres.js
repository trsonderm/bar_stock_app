const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/topshelf'
});

async function initDB() {
    try {
        console.log('Connecting to Postgres...');
        const client = await pool.connect();

        console.log('Dropping existing tables...');
        await client.query(`
            DROP SCHEMA public CASCADE;
            CREATE SCHEMA public;
            GRANT ALL ON SCHEMA public TO postgres;
            GRANT ALL ON SCHEMA public TO public;
        `);

        console.log('Running Schema...');
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

        await client.query(schema);
        console.log('Schema initialized successfully.');

        client.release();
        process.exit(0);
    } catch (e) {
        console.error('Init Failed:', e);
        process.exit(1);
    }
}

initDB();
