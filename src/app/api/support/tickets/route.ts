import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { saveFile } from '@/lib/upload';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const isSuperAdmin = session.isSuperAdmin || (session.permissions as any)?.includes('super_admin');

    let tickets;
    if (isSuperAdmin) {
        // Super Admin sees all
        tickets = await db.query(`
            SELECT t.*, o.name as org_name, u.first_name, u.last_name 
            FROM support_tickets t
            JOIN organizations o ON t.organization_id = o.id
            JOIN users u ON t.user_id = u.id
            ORDER BY t.created_at DESC
        `);
    } else {
        // Org Admin sees their org's tickets
        tickets = await db.query(`
            SELECT t.*, u.first_name, u.last_name 
            FROM support_tickets t
            JOIN users u ON t.user_id = u.id
            WHERE t.organization_id = $1
            ORDER BY t.created_at DESC
        `, [session.organizationId]);
    }

    return NextResponse.json({ tickets });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const formData = await req.formData();
        const subject = formData.get('subject') as string;
        const description = formData.get('description') as string;
        const file = formData.get('file') as File | null;

        if (!subject || !description) {
            return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
        }

        let attachmentPath = null;
        if (file && file.size > 0) {
            attachmentPath = await saveFile(file);
        }

        // Begin Transaction
        await db.execute('BEGIN');

        try {
            // 1. Create Ticket
            const ticketRes = await db.one(`
                INSERT INTO support_tickets (organization_id, user_id, subject, description, status)
                VALUES ($1, $2, $3, $4, 'open')
                RETURNING id
            `, [session.organizationId, session.id, subject, description]);

            const ticketId = ticketRes.id;

            // 2. Create Initial Message
            const attachments = attachmentPath ? JSON.stringify([attachmentPath]) : '[]';

            await db.execute(`
                INSERT INTO support_messages (ticket_id, user_id, message, attachments)
                VALUES ($1, $2, $3, $4)
            `, [ticketId, session.id, description, attachments]);

            // Log
            await db.execute('INSERT INTO activity_logs (organization_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
                [session.organizationId, session.id, 'CREATE_TICKET', JSON.stringify({ ticketId, subject })]);

            await db.execute('COMMIT');
            return NextResponse.json({ success: true, ticketId });

        } catch (err) {
            await db.execute('ROLLBACK');
            throw err;
        }

    } catch (e) {
        console.error('Create Ticket Error', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
