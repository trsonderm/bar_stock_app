import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { sendEmail } from '@/lib/mail';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { table, columns, rows } = await req.json();

        if (!rows || rows.length === 0) {
            return NextResponse.json({ error: 'No data to send' }, { status: 400 });
        }

        // Generate an HTML Table
        let htmlContext = \`<h2>Custom Report: \${table}</h2>\n\`;
        htmlContext += \`<table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; font-family: monospace;">\n\`;
        
        // Headers
        htmlContext += \`<thead><tr>\`;
        for (const col of columns) {
            htmlContext += \`<th style="background-color: #f3f4f6; color: #374151;">\${col}</th>\`;
        }
        htmlContext += \`</tr></thead>\n\`;

        // Body
        htmlContext += \`<tbody>\`;
        for (const row of rows) {
            htmlContext += \`<tr>\`;
            for (const col of columns) {
                htmlContext += \`<td>\${String(row[col])}</td>\`;
            }
            htmlContext += \`</tr>\n\`;
        }
        htmlContext += \`</tbody></table>\`;

        htmlContext += \`<p style="color: #6b7280; font-size: 12px; margin-top: 20px;">Generated automatically by the Bar Stock App Custom Report Builder.</p>\`;

        // Dispatch via 'reporting' tier
        const targetEmail = (session as any).email || 'superadmin@topshelfinventory.com';
        
        const success = await sendEmail('reporting', {
            to: targetEmail,
            subject: \`Data Report \${new Date().toLocaleDateString()}: \${table}\`,
            html: htmlContext
        });

        if (!success) {
            return NextResponse.json({ error: 'Mail dispatcher failed to send' }, { status: 500 });
        }

        return NextResponse.json({ success: true });

    } catch (e: any) {
        console.error('Report Sending Failed:', e);
        return NextResponse.json({ error: 'Generation Failed' }, { status: 500 });
    }
}
