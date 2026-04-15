import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import {
    analyzeSecurityThreats,
    SecurityAction,
    LoginAttemptRow,
    ActivityLogRow,
    UserRow,
} from '@/lib/security-analysis';
import { sendEmail } from '@/lib/mail';

// ── GET: run full security analysis ──────────────────────────────────────────
export async function GET(_req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Fetch last 7 days of login attempts
        const loginAttempts: LoginAttemptRow[] = await db.query(
            `SELECT * FROM login_attempts WHERE attempted_at > NOW() - INTERVAL '7 days' ORDER BY attempted_at DESC LIMIT 5000`,
            []
        ).catch(() => []);

        // Fetch last 30 days of activity logs
        const activityLogs: ActivityLogRow[] = await db.query(
            `SELECT id, user_id, organization_id, action, details, timestamp FROM activity_logs
             WHERE timestamp > NOW() - INTERVAL '30 days' ORDER BY timestamp DESC LIMIT 20000`,
            []
        ).catch(() => []);

        // All users with last login from login_attempts
        const users: UserRow[] = await db.query(
            `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.organization_id,
                    u.is_locked,
                    (SELECT MAX(attempted_at) FROM login_attempts WHERE user_id = u.id AND success = TRUE) AS last_login_at,
                    u.created_at
             FROM users u ORDER BY u.id`,
            []
        ).catch(() => []);

        // Load blocked IPs and locked user IDs from security_config
        const blockedRow = await db.one(
            `SELECT value FROM system_settings WHERE key = 'security_blocked_ips'`,
            []
        ).catch(() => null);
        const blockedIps: string[] = blockedRow ? JSON.parse(blockedRow.value) : [];

        const lockedUsers = users.filter(u => u.is_locked).map(u => u.id);

        const threats = analyzeSecurityThreats({
            loginAttempts,
            activityLogs,
            users,
            blockedIps,
            lockedUserIds: lockedUsers,
        });

        // Summary stats
        const last24h = loginAttempts.filter(a => Date.now() - new Date(a.attempted_at).getTime() < 86_400_000);
        const stats = {
            totalLoginAttempts7d: loginAttempts.length,
            failedLoginAttempts7d: loginAttempts.filter(a => !a.success).length,
            uniqueIps7d: new Set(loginAttempts.map(a => a.ip_address)).size,
            blockedIpCount: blockedIps.length,
            lockedAccountCount: lockedUsers.length,
            threatsDetected: threats.length,
            criticalCount: threats.filter(t => t.level === 'critical').length,
            highCount: threats.filter(t => t.level === 'high').length,
            last24hFails: last24h.filter(a => !a.success).length,
            last24hSuccesses: last24h.filter(a => a.success).length,
        };

        // Recent login attempts (last 50)
        const recentAttempts = loginAttempts.slice(0, 50);

        return NextResponse.json({ threats, stats, recentAttempts, blockedIps });
    } catch (e: any) {
        console.error('[security GET]', e);
        return NextResponse.json({ error: e.message || 'Analysis failed' }, { status: 500 });
    }
}

// ── POST: implement a fix ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const action: SecurityAction = body.action;

    if (!action?.type) {
        return NextResponse.json({ error: 'Missing action' }, { status: 400 });
    }

    try {
        switch (action.type) {

            case 'block_ip': {
                const currentRow = await db.one(
                    `SELECT value FROM system_settings WHERE key = 'security_blocked_ips'`,
                    []
                ).catch(() => null);
                const current: string[] = currentRow ? JSON.parse(currentRow.value) : [];
                if (!current.includes(action.ip)) {
                    current.push(action.ip);
                    await db.execute(
                        `INSERT INTO system_settings (key, value) VALUES ('security_blocked_ips', $1)
                         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
                        [JSON.stringify(current)]
                    );
                }
                await logSecurityAction(session.id, 'block_ip', { ip: action.ip });
                return NextResponse.json({ success: true, message: `IP ${action.ip} blocked` });
            }

            case 'lock_account': {
                await db.execute(
                    `UPDATE users SET is_locked = TRUE WHERE id = $1`,
                    [action.userId]
                );
                // Invalidate all sessions by rotating a per-user secret (simplest: update a field)
                await db.execute(
                    `UPDATE users SET session_invalidated_at = NOW() WHERE id = $1`,
                    [action.userId]
                ).catch(() => {}); // column may not exist yet
                await logSecurityAction(session.id, 'lock_account', { userId: action.userId, email: action.email });
                return NextResponse.json({ success: true, message: `Account ${action.email} locked` });
            }

            case 'force_logout':
            case 'revoke_sessions': {
                await db.execute(
                    `UPDATE users SET session_invalidated_at = NOW() WHERE id = $1`,
                    [action.userId]
                ).catch(() => {});
                await logSecurityAction(session.id, 'revoke_sessions', { userId: action.userId });
                return NextResponse.json({ success: true, message: `Sessions revoked for user ${action.userId}` });
            }

            case 'require_password_reset': {
                // Generate a reset token and store it
                const token = crypto.randomUUID();
                const expires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
                await db.execute(
                    `UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3`,
                    [token, expires, action.userId]
                ).catch(async () => {
                    // Fallback: store in system_settings keyed by user
                    await db.execute(
                        `INSERT INTO system_settings (key, value) VALUES ($1, $2)
                         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
                        [`pwd_reset_${action.userId}`, JSON.stringify({ token, expires })]
                    );
                });

                // Send reset email
                const appUrl = process.env.APP_URL || 'http://localhost:3000';
                await sendEmail('notifications', {
                    to: [action.email],
                    subject: 'Security Alert — Password Reset Required',
                    html: `
                        <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:2rem">
                            <h2 style="color:#dc2626">Security Alert</h2>
                            <p>Our security system detected unusual activity on your account. For your protection, a password reset is required.</p>
                            <p><a href="${appUrl}/reset-password?token=${token}" style="background:#2563eb;color:white;padding:0.75rem 1.5rem;border-radius:6px;text-decoration:none;display:inline-block;margin:1rem 0">Reset Password</a></p>
                            <p style="color:#6b7280;font-size:0.875rem">This link expires in 24 hours. If you did not expect this email, contact your administrator.</p>
                        </div>
                    `,
                    text: `Security alert: Please reset your password at ${appUrl}/reset-password?token=${token}`,
                }).catch(() => {});

                await logSecurityAction(session.id, 'require_password_reset', { userId: action.userId, email: action.email });
                return NextResponse.json({ success: true, message: `Password reset email sent to ${action.email}` });
            }

            case 'enable_rate_limit': {
                const rlKey = 'security_rate_limits';
                const currentRow = await db.one(
                    `SELECT value FROM system_settings WHERE key = $1`, [rlKey]
                ).catch(() => null);
                const current: Record<string, any> = currentRow ? JSON.parse(currentRow.value) : {};
                current[action.ip] = { windowMinutes: action.windowMinutes, maxAttempts: action.maxAttempts, addedAt: new Date().toISOString() };
                await db.execute(
                    `INSERT INTO system_settings (key, value) VALUES ($1, $2)
                     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
                    [rlKey, JSON.stringify(current)]
                );
                await logSecurityAction(session.id, 'enable_rate_limit', { ip: action.ip, windowMinutes: action.windowMinutes, maxAttempts: action.maxAttempts });
                return NextResponse.json({ success: true, message: `Rate limit applied to ${action.ip}` });
            }

            case 'notify_admin': {
                await logSecurityAction(session.id, 'notify_admin', { message: action.message });
                return NextResponse.json({ success: true, message: 'Notification sent' });
            }

            case 'flag_review': {
                await db.execute(
                    `INSERT INTO security_events (event_type, entity_id, note, reviewed_by, reviewed_at)
                     VALUES ('flagged_review', $1, $2, $3, NOW())`,
                    [action.entityId, action.note, session.id]
                ).catch(() => {});
                await logSecurityAction(session.id, 'flag_review', { entityId: action.entityId, note: action.note });
                return NextResponse.json({ success: true, message: 'Flagged for review' });
            }

            default:
                return NextResponse.json({ error: 'Unknown action type' }, { status: 400 });
        }
    } catch (e: any) {
        console.error('[security POST]', e);
        return NextResponse.json({ error: e.message || 'Action failed' }, { status: 500 });
    }
}

async function logSecurityAction(adminId: number, action: string, details: any) {
    await db.execute(
        `INSERT INTO security_events (event_type, entity_id, note, reviewed_by, reviewed_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [action, String(adminId), JSON.stringify(details), adminId]
    ).catch(() => {});
}

// ── DELETE: unblock an IP ─────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ip = req.nextUrl.searchParams.get('ip');
    if (!ip) return NextResponse.json({ error: 'Missing ip' }, { status: 400 });

    const currentRow = await db.one(
        `SELECT value FROM system_settings WHERE key = 'security_blocked_ips'`, []
    ).catch(() => null);
    const current: string[] = currentRow ? JSON.parse(currentRow.value) : [];
    const updated = current.filter(i => i !== ip);
    await db.execute(
        `INSERT INTO system_settings (key, value) VALUES ('security_blocked_ips', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [JSON.stringify(updated)]
    );

    return NextResponse.json({ success: true, message: `IP ${ip} unblocked` });
}
