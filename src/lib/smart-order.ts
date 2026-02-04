import { db } from './db';
import nodemailer from 'nodemailer';

interface ProposalItem {
    id: number;
    name: string;
    low_stock_threshold: number;
}

export async function checkAndTriggerSmartOrder(
    organizationId: number,
    item: ProposalItem,
    newQuantity: number,
    oldQuantity: number
) {
    // 1. Check if Smart Ordering is Enabled for Org
    const org = await db.one('SELECT ai_ordering_config FROM organizations WHERE id = $1', [organizationId]);
    if (!org || !org.ai_ordering_config) return;

    let config;
    try {
        config = JSON.parse(org.ai_ordering_config);
    } catch { return; }

    if (!config.enabled) return;

    // 2. Check Falling Edge (Just crossed threshold)
    // We only trigger if we went from ABOVE threshold to AT or BELOW threshold.
    // If we were already below, we don't spam.
    const threshold = item.low_stock_threshold;
    if (oldQuantity > threshold && newQuantity <= threshold) {
        await sendProposalEmail(organizationId, config, item, newQuantity);
    }
}

async function sendProposalEmail(organizationId: number, config: any, item: ProposalItem, currentStock: number) {
    // Fetch SMTP Settings
    const settingsRows = await db.query('SELECT key, value FROM settings WHERE organization_id = $1', [organizationId]);
    const settings: Record<string, string> = {};
    settingsRows.forEach((r: any) => settings[r.key] = r.value);

    // Need SMTP to send
    if (!settings.smtp_host || !settings.smtp_user) {
        console.log('Smart Order triggered but SMTP not configured.');
        return;
    }

    const emailTo = config.email;
    if (!emailTo) return;

    // Proposal Logic: Suggest order amount (Simple logic: Max(Threshold * 3, 10))
    // Real logic would use burn rate, but let's keep it simple or fetch predictive stats if needed.
    // user said "following the same logic... approve edit decline"
    const suggestedOrder = Math.max(item.low_stock_threshold * 4, 12);

    const html = `
        <div style="font-family: sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
            <div style="background: #2563eb; color: white; padding: 20px;">
                <h2 style="margin: 0; font-size: 1.25rem;">🤖 Smart Order Proposal</h2>
            </div>
            <div style="padding: 24px; background: white;">
                <p style="margin-top: 0; color: #374151;">
                    <strong>${item.name}</strong> has dropped to <strong>${currentStock}</strong> (Threshold: ${item.low_stock_threshold}).
                </p>
                
                <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
                    <div style="font-size: 0.9rem; color: #64748b; margin-bottom: 5px;">PROPOSED ORDER</div>
                    <div style="font-size: 2rem; font-weight: bold; color: #1e40af;">${suggestedOrder} units</div>
                </div>

                <div style="display: flex; gap: 10px; justify-content: center;">
                    <a href="http://localhost:3000/admin/orders/approve?itemId=${item.id}&qty=${suggestedOrder}" style="background: #16a34a; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold;">Approve</a>
                    <a href="http://localhost:3000/admin/orders/edit?itemId=${item.id}" style="background: #ca8a04; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold;">Edit</a>
                    <a href="http://localhost:3000/admin/orders/decline?itemId=${item.id}" style="background: #dc2626; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold;">Decline</a>
                </div>
            </div>
            <div style="background: #f9fafb; padding: 12px 24px; font-size: 0.75rem; color: #6b7280; border-top: 1px solid #e5e7eb;">
                Sent by Foster's Smart Ordering AI
            </div>
        </div>
    `;

    const transporter = nodemailer.createTransport({
        host: settings.smtp_host,
        port: parseInt(settings.smtp_port) || 587,
        secure: false,
        auth: {
            user: settings.smtp_user,
            pass: settings.smtp_pass,
        },
    });

    try {
        await transporter.sendMail({
            from: `"Smart Order AI" <${settings.smtp_user}>`,
            to: emailTo,
            subject: `Order Proposal: ${item.name}`,
            html: html,
        });
        console.log(`Smart Order Proposal sent for ${item.name}`);
    } catch (e) {
        console.error('Failed to send proposal email:', e);
    }
}
