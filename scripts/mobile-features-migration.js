const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/topshelf'
});

async function run() {
    const client = await pool.connect();
    try {
        console.log('Running mobile features migration...');

        console.log('Creating message_threads...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS message_threads (
                id              SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                type            TEXT NOT NULL DEFAULT 'direct' CHECK(type IN ('direct','group')),
                name            TEXT,
                created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at      TIMESTAMPTZ DEFAULT NOW(),
                updated_at      TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_msg_threads_org ON message_threads(organization_id)`);

        console.log('Creating message_thread_members...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS message_thread_members (
                id           SERIAL PRIMARY KEY,
                thread_id    INTEGER NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
                user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                last_read_at TIMESTAMPTZ DEFAULT NOW(),
                joined_at    TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(thread_id, user_id)
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_msg_members_user   ON message_thread_members(user_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_msg_members_thread ON message_thread_members(thread_id)`);

        console.log('Creating direct_messages...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS direct_messages (
                id         SERIAL PRIMARY KEY,
                thread_id  INTEGER NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
                sender_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                content    TEXT,
                image      TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                CONSTRAINT must_have_content CHECK (content IS NOT NULL OR image IS NOT NULL)
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_direct_msgs_thread ON direct_messages(thread_id, created_at DESC)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_direct_msgs_since  ON direct_messages(created_at)`);

        console.log('Creating mobile_user_settings...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS mobile_user_settings (
                user_id               INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                notifications_enabled BOOLEAN DEFAULT TRUE,
                notify_messages       BOOLEAN DEFAULT TRUE,
                notify_post_likes     BOOLEAN DEFAULT TRUE,
                notify_post_comments  BOOLEAN DEFAULT TRUE,
                notify_schedule       BOOLEAN DEFAULT TRUE,
                notify_swaps          BOOLEAN DEFAULT TRUE,
                notify_time_off       BOOLEAN DEFAULT TRUE,
                address               TEXT,
                city                  TEXT,
                state                 TEXT,
                zip                   TEXT,
                country               TEXT,
                updated_at            TIMESTAMPTZ DEFAULT NOW()
            )
        `);

        console.log('Migration complete.');
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
