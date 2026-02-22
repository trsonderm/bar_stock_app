import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get('orgId');

    if (!orgId) return NextResponse.json({ error: 'Missing orgId' });

    try {
        const query = `
            SELECT bll.option_label, bll.timestamp 
            FROM bottle_level_logs bll
            JOIN activity_logs al ON bll.activity_log_id = al.id
            WHERE al.organization_id = $1
            ORDER BY bll.timestamp DESC
        `;
        const logs = await db.query(query, [orgId]);

        const optionsRes = await db.query(
            'SELECT label FROM bottle_level_options WHERE organization_id = $1 ORDER BY display_order',
            [orgId]
        );
        const configuredOptions = optionsRes.map((o: any) => o.label);

        const foundLabels = new Set(logs.map((l: any) => l.option_label));
        const extraLabels = Array.from(foundLabels).filter((l: string) => !configuredOptions.includes(l));
        const finalOptions = [...configuredOptions, ...extraLabels];

        return NextResponse.json({
            orgId,
            logCount: logs.length,
            configuredOptions,
            foundLabels: Array.from(foundLabels),
            extraLabels,
            finalOptions,
            sampleLogs: logs.slice(0, 3)
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message, stack: e.stack });
    }
}
