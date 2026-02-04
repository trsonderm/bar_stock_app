import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import { sendSMS } from '@/lib/twilio';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const organizationId = session.organizationId;

        // 1. Get Settings
        const org = await db.one('SELECT ai_ordering_config, sms_enabled FROM organizations WHERE id = $1', [organizationId]);
        const config = org.ai_ordering_config ? JSON.parse(org.ai_ordering_config) : {};

        if (!config.enabled) {
            return NextResponse.json({ message: 'Automation is disabled' });
        }

        // 2. Logic to find what to order (Mocked for now)
        // Find a supplier enabled in config
        const enabledSupplierIds = config.supplier_ids || [];
        if (enabledSupplierIds.length === 0) return NextResponse.json({ message: 'No suppliers enabled' });

        const supplierId = enabledSupplierIds[0];
        const supplier = await db.one('SELECT name FROM suppliers WHERE id = $1', [supplierId]);

        // Mock items
        const mockItems = [
            { id: 101, name: 'Mock Item A', quantity: 12 },
            { id: 102, name: 'Mock Item B', quantity: 6 }
        ];

        // 3. Create Pending Order
        const token = uuidv4();
        await db.execute(
            `INSERT INTO pending_orders (token, organization_id, supplier_id, items_json, status) VALUES ($1, $2, $3, $4, 'pending')`,
            [token, organizationId, supplierId, JSON.stringify(mockItems)]
        );

        const approvalLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/orders/${token}`;

        // 4. Send Confirmation if required
        if (config.require_confirmation) {
            // Get CC Users
            const ccUserIds = config.cc_user_ids || [];
            // Assuming we added users to the session or logic
            // For now, let's just log or try to send if we had phone numbers.
            // In a real app, 'users' table needs 'phone' column.

            // Checking if org has SMS enabled (Super Admin toggle)
            if (org.sms_enabled) {
                // Fetch users phone numbers
                // const users = await db.query('SELECT phone FROM users WHERE id IN (...)');
                // users.forEach(u => sendSMS(u.phone, `Approve Order: ${approvalLink}`));
                console.log(`[SMS MOCK] Sending link to CC users: ${approvalLink}`);
            }
        }

        return NextResponse.json({ success: true, link: approvalLink, message: 'Order generated successfully' });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
