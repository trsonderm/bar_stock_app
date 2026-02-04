const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/topshelf'
});

async function listLogins() {
    try {
        const client = await pool.connect();

        console.log('\n--- ALL USERS (LOGINS) ---');
        const users = await client.query(`
            SELECT u.id, u.email, u.first_name, u.last_name, u.role, o.name as org_name 
            FROM users u
            LEFT JOIN organizations o ON u.organization_id = o.id
            ORDER BY o.name, u.email
        `);
        console.table(users.rows.map(u => ({
            ID: u.id,
            Email: u.email,
            Name: `${u.first_name} ${u.last_name}`,
            Role: u.role,
            Org: u.org_name
        })));

        console.log('\n--- RECENT LOGIN ACTIVITY (Last 10) ---');
        const logins = await client.query(`
            SELECT u.email, l.timestamp, l.details 
            FROM activity_logs l
            JOIN users u ON l.user_id = u.id
            WHERE l.action = 'USER_LOGIN'
            ORDER BY l.timestamp DESC
            LIMIT 10
        `);
        if (logins.rows.length === 0) {
            console.log('No recent login activity found in logs.');
        } else {
            console.table(logins.rows.map(l => ({
                User: l.email,
                Time: l.timestamp,
                Details: JSON.stringify(l.details)
            })));
        }

        pool.end();
    } catch (e) {
        console.error(e);
        pool.end();
    }
}
listLogins();
