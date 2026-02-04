import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, createSessionToken, COOKIE_OPTIONS } from '@/lib/auth';

export async function POST(req: NextRequest) {
    try {
        const { companyName, firstName, lastName, email, password } = await req.json();

        if (!companyName || !firstName || !lastName || !email || !password) {
            return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
        }

        // Check if email already exists globally
        const existingUser = await db.one('SELECT id FROM users WHERE email = $1', [email]);
        if (existingUser) {
            return NextResponse.json({ error: 'Email already registered' }, { status: 400 });
        }

        // Begin Transaction
        await db.execute('BEGIN');

        try {
            // 1. Create Organization
            const orgRes = await db.one(`
                INSERT INTO organizations (name, billing_status, created_at)
                VALUES ($1, 'active', DEFAULT)
                RETURNING id
            `, [companyName]);

            const orgId = orgRes.id;

            // 2. Create Default Location
            await db.execute('INSERT INTO locations (name, address, organization_id) VALUES ($1, $2, $3)', ['Main Bar', 'Main Address', orgId]);

            // 3. Create Admin User
            const dummyPinHash = '$2b$10$dummyhashforpureemailuser';

            const adminRes = await db.one(`
                INSERT INTO users (first_name, last_name, email, password_hash, pin_hash, role, permissions, organization_id)
                VALUES ($1, $2, $3, $4, $5, 'admin', $6, $7)
                RETURNING id
            `, [firstName, lastName, email, hashPassword(password), dummyPinHash, JSON.stringify(["all"]), orgId]);

            const userId = adminRes.id;

            // 4. Seed Categories
            const defaults = {
                'Liquor': JSON.stringify([1]),
                'Beer': JSON.stringify([1, 6, 24]),
                'Seltzer': JSON.stringify([1, 4, 8]),
                'Wine': JSON.stringify([1]),
                'THC': JSON.stringify([1]),
            };

            for (const [name, options] of Object.entries(defaults)) {
                await db.execute('INSERT INTO categories (name, stock_options, organization_id) VALUES ($1, $2, $3)', [name, options, orgId]);
            }

            // 5. Log
            await db.execute('INSERT INTO activity_logs (organization_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
                [orgId, userId, 'REGISTER_ORG', JSON.stringify({ companyName })]);

            // Commit
            await db.execute('COMMIT');

            return NextResponse.json({ success: true, orgId });

        } catch (err) {
            await db.execute('ROLLBACK');
            throw err;
        }

    } catch (error: any) {
        console.error('Registration error', error);
        if (error.message.includes('unique constraint') || error.message.includes('UNIQUE')) {
            return NextResponse.json({ error: 'Registration failed - Organization or Email might exist' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
