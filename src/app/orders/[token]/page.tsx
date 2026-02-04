import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Public dynamic route or handled via middleware?
// Since it's a [token], it's a dynamic path.
// Layout: Public (no auth required for token holder, or minimal auth).
// We'll make it a simple standalone page.

export const metadata = {
    title: 'Order Approval | Topshelf Stock',
};

// Start with the Client Component
import OrderApprovalClient from './OrderApprovalClient';

export default function OrderApprovalPage({ params }: { params: { token: string } }) {
    return <OrderApprovalClient token={params.token} />;
}
