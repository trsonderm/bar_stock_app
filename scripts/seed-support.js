const sqlite3 = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Connect to SQLite (since we are in dev and using sqlite locally mainly, or adapted for pg if needed but user context says sqlite often)
// Wait, the user moved to Postgres in Phase 11. I should check if we should use pg or sqlite.
// The user environment is mixed but `scripts/migrate-multitenancy.js` was used recently.
// Let's check `src/lib/db.ts` to see what is active. 
// Ah, previous summary says "Rewrite DB Layer using node-postgres".
// So I should use the `pg` library for seeding.

const { Client } = require('pg');

async function seedSupport() {
    const client = new Client({
        user: 'postgres',
        host: 'localhost',
        database: 'bar_stock',
        password: 'password',
        port: 5432,
    });

    await client.connect();

    try {
        console.log('Cleaning old tickets...');
        await client.query('DELETE FROM support_messages');
        await client.query('DELETE FROM support_tickets');

        console.log('Seeding new tickets...');

        const tickets = [
            { subject: 'Billing Issue', message: 'I was charged twice for this month.', status: 'open', priority: 'high', user_id: 2, org_id: 1 },
            { subject: 'Feature Request: Dark Mode', message: 'Can we get a dark mode for the inventory screen?', status: 'open', priority: 'low', user_id: 2, org_id: 1 },
            { subject: 'Login Problems', message: 'My staff cannot login with their PINs.', status: 'resolved', priority: 'urgent', user_id: 3, org_id: 2 },
            { subject: 'Export not working', message: 'The CSV export gives a 500 error.', status: 'in_progress', priority: 'medium', user_id: 2, org_id: 1 },
            { subject: 'Add new category', message: 'How do I add a new liqueur category?', status: 'open', priority: 'low', user_id: 3, org_id: 2 },
            { subject: 'System slow', message: 'Loading items takes 10 seconds.', status: 'open', priority: 'high', user_id: 2, org_id: 1 },
            { subject: 'Delete user', message: 'Please delete user John Doe.', status: 'resolved', priority: 'medium', user_id: 3, org_id: 2 },
            { subject: 'API Access', message: 'Where is my API key?', status: 'in_progress', priority: 'medium', user_id: 2, org_id: 1 },
            { subject: 'Inventory Sync', message: 'Stock levels are not updating.', status: 'open', priority: 'urgent', user_id: 3, org_id: 2 },
            { subject: 'Refund Request', message: 'We cancelled but were still charged.', status: 'open', priority: 'high', user_id: 2, org_id: 1 }
        ];

        for (const t of tickets) {
            const res = await client.query(
                `INSERT INTO support_tickets (organization_id, user_id, subject, status, priority, created_at)
                 VALUES ($1, $2, $3, $4, $5, NOW() - (random() * interval '7 days'))
                 RETURNING id`,
                [t.org_id, t.user_id, t.subject, t.status, t.priority]
            );
            const ticketId = res.rows[0].id;

            // Initial message
            await client.query(
                `INSERT INTO support_messages (ticket_id, user_id, message, is_staff_reply)
                 VALUES ($1, $2, $3, false)`,
                [ticketId, t.user_id, t.message]
            );

            // Random reply for some
            if (Math.random() > 0.5) {
                await client.query(
                    `INSERT INTO support_messages (ticket_id, user_id, message, is_staff_reply, created_at)
                     VALUES ($1, $2, $3, true, NOW())`,
                    [ticketId, 1, 'We are looking into this.',]
                );
            }
        }

        console.log('Seeding complete.');
    } catch (e) {
        console.error('Error seeding:', e);
    } finally {
        await client.end();
    }
}

seedSupport();
