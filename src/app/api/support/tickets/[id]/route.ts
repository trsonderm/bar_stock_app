import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { saveFile } from '@/lib/upload';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const ticketId = params.id;
    const isSuperAdmin = session.isSuperAdmin || (session.permissions as any)?.includes('super_admin');

    // Fetch Ticket
    const ticket = await db.one(`
        SELECT t.*, o.name as org_name 
        FROM support_tickets t 
        JOIN organizations o ON t.organization_id = o.id
        WHERE t.id = $1
    `, [ticketId]);

    if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Authorization Check
    if (!isSuperAdmin && ticket.organization_id !== session.organizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Fetch Messages
    const messages = await db.query(`
        SELECT m.*, u.first_name, u.last_name, u.role 
        FROM support_messages m
        JOIN users u ON m.user_id = u.id
        WHERE m.ticket_id = $1
        ORDER BY m.created_at ASC
    `, [ticketId]);

    return NextResponse.json({ ticket, messages });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const ticketId = params.id;
    const isSuperAdmin = session.isSuperAdmin || (session.permissions as any)?.includes('super_admin');

    try {
        console.log(`[Support Reply] Processing for ticket ${ticketId}`);
        // Validate Access first
        const ticket = await db.one('SELECT organization_id FROM support_tickets WHERE id = $1', [ticketId]);
        if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        // Fix: Ensure super admin check is robust
        if (!isSuperAdmin && ticket.organization_id !== session.organizationId) {
            console.log('[Support Reply] Unauthorized');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const formData = await req.formData();
        const message = formData.get('message') as string;
        const status = formData.get('status') as string;
        const file = formData.get('file') as File | null;

        console.log(`[Support Reply] Message: ${message ? 'Yes' : 'No'}, Status: ${status}, File: ${file ? file.size : 'None'}`);

        if (!message && !status) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

        let attachmentPath = null;
        if (file && file.size > 0) {
            try {
                attachmentPath = await saveFile(file);
            } catch (err) {
                console.error('File upload failed', err);
                // Continue without file? Or fail?
            }
        }

        const attachments = attachmentPath ? JSON.stringify([attachmentPath]) : '[]';

        // Transaction
        await db.execute('BEGIN');

        try {
            if (message) {
                await db.execute(`
                    INSERT INTO support_messages (ticket_id, user_id, message, attachments)
                    VALUES ($1, $2, $3, $4)
                `, [ticketId, session.id, message, attachments]);
            }

            if (status) {
                await db.execute('UPDATE support_tickets SET status = $1 WHERE id = $2', [status, ticketId]);
            }

            await db.execute('COMMIT');
            return NextResponse.json({ success: true });
        } catch (err) {
            await db.execute('ROLLBACK');
            throw err;
        }

    } catch (e) {
        console.error('Reply Error Main Catch', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
