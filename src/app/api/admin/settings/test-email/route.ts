import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import nodemailer from 'nodemailer';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        // Allow passing settings in body for immediate testing of unsaved changes, 
        // OR fallback to DB settings.
        // The Client currently has a "Test Email" button that probably sends the *current form state*.

        // Let's assume the client sends the settings to test.
        const settings = body;

        if (!settings.smtp_host || !settings.report_emails) {
            return NextResponse.json({ error: 'Missing SMTP Host or Recipient Email' }, { status: 400 });
        }

        const transporter = nodemailer.createTransport({
            host: settings.smtp_host,
            port: parseInt(settings.smtp_port) || 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: settings.smtp_user,
                pass: settings.smtp_pass,
            },
        });

        // 1. Send Generic Test Email
        await transporter.sendMail({
            from: `"Test Bot" <${settings.smtp_user}>`,
            to: settings.report_emails,
            subject: `Test Email from TopShelf - ${new Date().toLocaleTimeString()}`,
            text: 'If you are reading this, your SMTP settings are correct!',
            html: `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
                    <h2 style="color: #10b981;">✅ SMTP Connection Successful</h2>
                    <p>Your email settings are configured correctly.</p>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p style="color: #666; font-size: 0.9em;">
                        <strong>Host:</strong> ${settings.smtp_host}<br/>
                        <strong>Port:</strong> ${settings.smtp_port}<br/>
                        <strong>User:</strong> ${settings.smtp_user}
                    </p>
                </div>
            `
        });

        // 2. Send Sample Stock Alert (Mock)
        const html = `
        <div style="font-family: sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
            <div style="background: #7f1d1d; color: white; padding: 20px;">
                <h2 style="margin: 0; font-size: 1.25rem;">⚠️ TEST: Low Stock Alert</h2>
            </div>
            <div style="padding: 24px; background: white;">
                <p style="margin-top: 0; color: #374151;">The following items are at or below your threshold (5):</p>
                
                <ul style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 16px 32px; margin: 16px 0;">
                    <li style="margin-bottom: 8px; color: #7c2d12;">Tito's Vodka: <b>3</b></li>
                    <li style="margin-bottom: 8px; color: #7c2d12;">Jameson: <b>2</b></li>
                </ul>

                <div style="margin-top: 24px;">
                    <a href="#" style="display: inline-block; background: #c2410c; color: white; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; font-size: 0.9rem;">Go to Dashboard</a>
                </div>
            </div>
            <div style="background: #f9fafb; padding: 12px 24px; font-size: 0.75rem; color: #6b7280; border-top: 1px solid #e5e7eb;">
                Sent automatically by Foster's Inventory System (Test)
            </div>
        </div>
        `;

        await transporter.sendMail({
            from: `"Inventory Alert" <${settings.smtp_user}>`,
            to: settings.report_emails,
            subject: `TEST: Low Stock Alert - ${new Date().toLocaleTimeString()}`,
            html: html,
        });

        return NextResponse.json({ success: true, message: 'Emails Sent Successfully' });

    } catch (e: any) {
        console.error('Test Email Failed:', e);
        return NextResponse.json({ error: e.message || 'Failed to send email' }, { status: 500 });
    }
}
