
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const organizationId = session.organizationId;
        const reports = await db.query(
            'SELECT * FROM saved_reports WHERE organization_id = $1 ORDER BY created_at DESC',
            [organizationId]
        );
        return NextResponse.json({ reports });
    } catch (error) {
        console.error('Error fetching reports:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { name, description, sections } = body;
        const organizationId = session.organizationId;

        // 1. Create Report
        const report = await db.one(
            'INSERT INTO saved_reports (organization_id, name, description, created_by) VALUES ($1, $2, $3, $4) RETURNING id',
            [organizationId, name, description, session.id]
        );

        // 2. Create Sections
        if (sections && Array.isArray(sections)) {
            for (let i = 0; i < sections.length; i++) {
                const s = sections[i];
                await db.query(
                    'INSERT INTO report_sections (report_id, type, title, data_source, config, sort_order) VALUES ($1, $2, $3, $4, $5, $6)',
                    [report.id, s.type, s.title, s.data_source, JSON.stringify(s.config || {}), i]
                );
            }
        }

        return NextResponse.json({ success: true, id: report.id });
    } catch (error) {
        console.error('Error creating report:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
