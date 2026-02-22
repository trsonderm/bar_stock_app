const http = require('http');

// I need the session cookie to pass middleware.
// Since I can't easily get it, I will try to hit the URL.
// IF the server is running on localhost:3000 (npm run dev), I can try to fetch it.
// BUT, I need authentication.

// Plan B:
// I will Modify `src/app/api/admin/reporting/daily/route.ts` to wrap everything in a Try/Catch that LOGS to console.
// Oh wait, it DOES have a try/catch block at the end:
// } catch (e) {
//    console.error('Daily Report Error', e);
//    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
// }

// So the error IS being logged to the server console.
// I need to see the server logs.
// The user provided snippets: `[Error] Failed to load resource: ... 500`. This is Browser Console.
// I need Server Console output.

// Since I cannot see the real-time server console of the user (I only see "npm run dev" is running),
// I have to infer or reproduce it.

// Reproduction:
// I can try to run the code of the route in a standalone script, mocking `req`, `db` and `getSession`.
// But `getSession` depends on cookies.

// Let's look at `src/lib/db.ts` again.
// Maybe there's a connection pool issue?
// "Connection refused" was seen earlier.

// Let's create `scripts/test_db_reporting.js` which simply runs the QUERIES that the route runs.
// This isolates DB issues from Next.js issues.

const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/topshelf',
});

async function testReportingQuery() {
    try {
        console.log('Testing DB Query for Reports...');
        const client = await pool.connect();
        console.log('DB Connected.');

        const organizationId = 3; // using org 3 from previous debug

        // 1. Shifts
        console.log('Fetching Shifts...');
        const shifts = await client.query('SELECT end_time FROM shifts WHERE organization_id = $1', [organizationId]);
        console.log(`Shifts found: ${shifts.rows.length}`);

        // 2. Activity Logs
        console.log('Fetching Activity Logs...');
        // Mock window
        const windowStart = new Date();
        windowStart.setHours(6, 0, 0, 0);
        const windowEnd = new Date();
        windowEnd.setHours(30, 0, 0, 0); // Next day 6am

        const logs = await client.query(`
            SELECT 
                al.user_id,
                u.name as user_name,
                (al.details->>'itemId')::int as item_id,
                al.details->>'itemName' as item_name,
                (al.details->>'quantity')::numeric as quantity,
                al.action,
                al.timestamp
            FROM activity_logs al
            LEFT JOIN users u ON al.user_id = u.id
            WHERE al.organization_id = $1
              AND (al.action = 'SUBTRACT_STOCK' OR al.action = 'ADD_STOCK')
        `, [organizationId]);
        console.log(`Logs found: ${logs.rows.length}`);

        client.release();
        console.log('Queries Successful.');

    } catch (e) {
        console.error('DB Test Failed:', e);
    } finally {
        await pool.end();
    }
}

testReportingQuery();
