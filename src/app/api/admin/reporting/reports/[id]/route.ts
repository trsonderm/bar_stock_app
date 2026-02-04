
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const reportId = params.id;
        const organizationId = session.organizationId;

        const report = await db.one('SELECT * FROM saved_reports WHERE id = $1 AND organization_id = $2', [reportId, organizationId]);
        if (!report) {
            return NextResponse.json({ error: 'Report not found' }, { status: 404 });
        }

        const sections = await db.query('SELECT * FROM report_sections WHERE report_id = $1 ORDER BY sort_order ASC', [reportId]);

        // Also fetch schedule?
        const schedules = await db.query('SELECT * FROM report_schedules WHERE report_id = $1', [reportId]);

        return NextResponse.json({ report: { ...report, sections, schedules } });
    } catch (error) {
        console.error('Error fetching report:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const reportId = params.id;
        const organizationId = session.organizationId;
        const body = await req.json();
        const { name, description, sections } = body; // Full update of sections

        // Verify ownership
        const existing = await db.one('SELECT id FROM saved_reports WHERE id = $1 AND organization_id = $2', [reportId, organizationId]);
        if (!existing) {
            return NextResponse.json({ error: 'Report not found' }, { status: 404 });
        }

        // Update Report Metadata
        await db.query('UPDATE saved_reports SET name = $1, description = $2, updated_at = NOW() WHERE id = $3', [name, description, reportId]);

        // Update Sections (Delete all and recreate)
        // This is simpler than diffing for now
        await db.query('DELETE FROM report_sections WHERE report_id = $1', [reportId]);

        if (sections && Array.isArray(sections)) {
            for (let i = 0; i < sections.length; i++) {
                const s = sections[i];
                await db.query(
                    'INSERT INTO report_sections (report_id, type, title, data_source, config, sort_order) VALUES ($1, $2, $3, $4, $5, $6)',
                    [reportId, s.type, s.title, s.data_source, JSON.stringify(s.config || {}), i]
                );
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating report:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const reportId = params.id;
        const organizationId = session.organizationId;

        await db.query('DELETE FROM saved_reports WHERE id = $1 AND organization_id = $2', [reportId, organizationId]); // Cascade deletes sections

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting report:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
