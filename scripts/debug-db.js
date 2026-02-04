const { Client } = require('pg');

const client = new Client({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:5432/postgres'
});

async function run() {
    try {
        await client.connect();
        console.log('✅ Connected to Postgres (127.0.0.1:5432)');

        const res = await client.query('SELECT datname FROM pg_database');
        console.log('📂 Databases found:');
        res.rows.forEach(r => console.log(' - ' + r.datname));

        await client.end();
    } catch (e) {
        console.error('❌ Connection Failed:', e);
    }
}

run();
