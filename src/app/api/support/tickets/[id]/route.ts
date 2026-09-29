/**
 * /api/support/tickets/:id — a single support ticket thread.
 *
 *  GET  ticket + messages (own organization, or any ticket for super admins)
 *  POST reply and/or change status (multipart: message, status, optional file)
 */
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
        // Validate access first
        const ticket = await db.one('SELECT organization_id FROM support_tickets WHERE id = $1', [ticketId]);
        if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        if (!isSuperAdmin && ticket.organization_id !== session.organizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const formData = await req.formData();
        const message = formData.get('message') as string;
        const status = formData.get('status') as string;
        const file = formData.get('file') as File | null;

        if (!message && !status) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

        let attachmentPath = null;
        if (file && file.size > 0) {
            try {
                attachmentPath = await saveFile(file);
            } catch (err) {
                // The reply is still saved without the attachment.
                console.error('File upload failed', err);
            }
        }

        const attachments = attachmentPath ? JSON.stringify([attachmentPath]) : '[]';

        await db.transaction(async (tx) => {
            if (message) {
                await tx.execute(`
                    INSERT INTO support_messages (ticket_id, user_id, message, attachments)
                    VALUES ($1, $2, $3, $4)
                `, [ticketId, session.id, message, attachments]);
            }

            if (status) {
                await tx.execute('UPDATE support_tickets SET status = $1 WHERE id = $2', [status, ticketId]);
            }
        });

        return NextResponse.json({ success: true });

    } catch (e) {
        console.error('Reply Error Main Catch', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
