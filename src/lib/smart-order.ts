import { db } from './db';
import { sendEmail } from './mail';

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
        await sendProposalEmail(config, item, newQuantity);
    }
}

async function sendProposalEmail(config: any, item: ProposalItem, currentStock: number) {
    const emailTo = config.email;
    if (!emailTo) return;

    // Proposal Logic: Suggest order amount
    const suggestedOrder = Math.max(item.low_stock_threshold * 4, 12);

    const html = `
        <div style="font-family: sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
            <div style="background: #2563eb; color: white; padding: 20px;">
                <h2 style="margin: 0; font-size: 1.25rem;">Smart Order Proposal</h2>
            </div>
            <div style="padding: 24px; background: white;">
                <p style="margin-top: 0; color: #374151;">
                    <strong>${item.name}</strong> has dropped to <strong>${currentStock}</strong> (Threshold: ${item.low_stock_threshold}).
                </p>

                <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
                    <div style="font-size: 0.9rem; color: #64748b; margin-bottom: 5px;">PROPOSED ORDER</div>
                    <div style="font-size: 2rem; font-weight: bold; color: #1e40af;">${suggestedOrder} units</div>
                </div>
            </div>
            <div style="background: #f9fafb; padding: 12px 24px; font-size: 0.75rem; color: #6b7280; border-top: 1px solid #e5e7eb;">
                Sent by TopShelf Smart Ordering
            </div>
        </div>
    `;

    await sendEmail('admin', {
        to: emailTo,
        subject: `Order Proposal: ${item.name}`,
        html,
    });
}
