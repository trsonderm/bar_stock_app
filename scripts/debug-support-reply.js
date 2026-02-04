const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/topshelf'
});

async function debug() {
    try {
        const client = await pool.connect();

        // 1. Create a ticket if one doesn't exist
        console.log('Creating ticket...');
        const user = await client.query('SELECT id, organization_id FROM users LIMIT 1');
        if (user.rows.length === 0) throw new Error('No users found');
        const userId = user.rows[0].id;
        const orgId = user.rows[0].organization_id;

        const ticketRes = await client.query(`
            INSERT INTO support_tickets (organization_id, user_id, subject, description)
            VALUES ($1, $2, 'Test Issue', 'Debug description')
            RETURNING id
        `, [orgId, userId]);
        const ticketId = ticketRes.rows[0].id;
        console.log('Ticket ID:', ticketId);

        // 2. Try to insert a message (Simulating Route Logic)
        console.log('Inserting reply...');
        const message = 'Test Reply from Script';
        const attachments = '[]';

        await client.query(`
            INSERT INTO support_messages (ticket_id, user_id, message, attachments)
            VALUES ($1, $2, $3, $4)
        `, [ticketId, userId, message, attachments]);

        console.log('Reply inserted successfully via DB.');

        pool.end();
    } catch (e) {
        console.error('Reply Failed:', e);
        pool.end();
    }
}
debug();
