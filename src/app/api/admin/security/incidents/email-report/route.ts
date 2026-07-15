import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getSmtpConfig } from '@/lib/mail';
import { generateIncidentPdf } from '@/lib/incident-pdf';
import { buildZip, parseDataUri, mimeToExt } from '@/lib/incident-zip';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { incidentId, to } = await req.json();

    if (!incidentId || typeof incidentId !== 'number') {
        return NextResponse.json({ error: 'Missing incidentId' }, { status: 400 });
    }
    if (!to || !EMAIL_RE.test(String(to).trim())) {
        return NextResponse.json({ error: 'Invalid recipient email address' }, { status: 400 });
    }

    // Fetch incident (scoped to session org)
    const incident = await db.one(
        `SELECT si.*,
                sb.name AS barred_person_name
         FROM security_incidents si
         LEFT JOIN security_barred sb ON sb.id = si.barred_person_id
         WHERE si.id = $1 AND si.organization_id = $2`,
        [incidentId, session.organizationId]
    );
    if (!incident) return NextResponse.json({ error: 'Incident not found' }, { status: 404 });

    const [persons, timeline] = await Promise.all([
        db.query(
            `SELECT * FROM incident_persons WHERE incident_id = $1 ORDER BY sort_order ASC, id ASC`,
            [incidentId]
        ),
        db.query(
            `SELECT * FROM incident_timeline WHERE incident_id = $1
             ORDER BY sort_order ASC, segment_date ASC NULLS LAST, segment_time ASC NULLS LAST`,
            [incidentId]
        ),
    ]);

    const inc = {
        ...incident,
        media: Array.isArray(incident.media) ? incident.media : (incident.media ? JSON.parse(incident.media) : []),
        persons: persons.map((p: any) => ({
            ...p,
            aliases: Array.isArray(p.aliases) ? p.aliases : (p.aliases ? JSON.parse(p.aliases) : []),
            media: Array.isArray(p.media) ? p.media : (p.media ? JSON.parse(p.media) : []),
        })),
        timeline,
    };

    // Generate PDF
    const pdfBytes = await generateIncidentPdf(inc);

    // Collect media for zip
    const mediaEntries: { name: string; data: Uint8Array }[] = [];
    let mIdx = 1;
    const addMedia = (items: { type: string; data: string; name: string }[], prefix: string) => {
        for (const m of items) {
            const parsed = parseDataUri(m.data);
            if (!parsed) continue;
            mediaEntries.push({ name: `${prefix}_${mIdx++}.${mimeToExt(parsed.mime)}`, data: parsed.bytes });
        }
    };
    addMedia(inc.media || [], 'incident_media');
    (inc.persons || []).forEach((p: any, pi: number) => addMedia(p.media || [], `person${pi + 1}_media`));

    const zipBytes = buildZip([{ name: 'report.pdf', data: pdfBytes }, ...mediaEntries]);

    // Build filename
    const getName = (p: any) => (p?.last_name || p?.first_name || '').replace(/[^a-zA-Z0-9]/g, '');
    const name1 = getName(inc.persons?.[0]);
    const name2 = getName(inc.persons?.[1]);
    const incDate = inc.incident_date
        ? String(inc.incident_date).split('T')[0].replace(/-/g, '_')
        : new Date(inc.created_at).toISOString().split('T')[0].replace(/-/g, '_');
    const zipFilename = ['Incident', name1, name2, incDate].filter(Boolean).join('_') + '.zip';

    // Date for subject
    const subjectDate = inc.incident_date
        ? new Date(String(inc.incident_date).split('T')[0] + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : new Date(inc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    // Send via nodemailer
    const smtpConfig = await getSmtpConfig('support');
    const transporter = nodemailer.createTransport(smtpConfig);

    await transporter.sendMail({
        from: smtpConfig.auth.user,
        to: String(to).trim(),
        subject: `Incident Report #${inc.id} — ${subjectDate}`,
        text: `Please find the incident report attached.\n\nIncident ID: #${inc.id}\nDate: ${subjectDate}${inc.case_number ? `\nCase #: ${inc.case_number}` : ''}\n\nThis report was generated from the security management system.`,
        attachments: [
            {
                filename: zipFilename,
                content: Buffer.from(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength),
                contentType: 'application/zip',
            },
        ],
    });

    return NextResponse.json({ ok: true });
}
