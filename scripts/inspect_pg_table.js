const { Client } = require('pg');

const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/topshelf',
});

async function inspect(tableName) {
    try {
        await client.connect();
        console.log(`Inspecting ${tableName}...`);
        const res = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = $1
    `, [tableName]);

        console.table(res.rows);
    } catch (e) {
        console.error('Inspection failed', e);
    } finally {
        await client.end();
    }
}

inspect(process.argv[2] || 'signatures');
