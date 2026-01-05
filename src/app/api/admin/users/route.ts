import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hashPin } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const users = db.prepare('SELECT id, first_name, last_name, role, permissions, created_at FROM users ORDER BY first_name ASC').all();
    return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { firstName, lastName, pin, permissions = [], role = 'user' } = await req.json();

    if (!firstName || !lastName || !pin) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (pin.length !== 4 || isNaN(Number(pin))) {
        return NextResponse.json({ error: 'PIN must be 4 numbers' }, { status: 400 });
    }

    const finalRole = role === 'admin' ? 'admin' : 'user';

    // Hash PIN
    const pinHash = hashPin(pin);

    try {
        const stmt = db.prepare(`
        INSERT INTO users (first_name, last_name, pin_hash, role, permissions)
        VALUES (?, ?, ?, ?, ?)
      `);

        const res = stmt.run(firstName, lastName, pinHash, finalRole, JSON.stringify(permissions));

        // Log
        db.prepare('INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)')
            .run(session.id, 'CREATE_USER', JSON.stringify({ firstName, lastName }));

        return NextResponse.json({ success: true, id: res.lastInsertRowid });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await req.json();
    if (id === session.id) return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 });

    try {
        db.prepare('DELETE FROM users WHERE id = ?').run(id);
        db.prepare('INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)')
            .run(session.id, 'DELETE_USER', JSON.stringify({ userId: id }));

        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    }
}
