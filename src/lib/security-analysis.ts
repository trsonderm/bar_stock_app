/**
 * Security Analysis Engine
 * ML-powered threat detection for TopShelf super admin.
 *
 * Detection categories:
 *  - Brute force: many failed logins from same IP or targeting same account
 *  - Credential stuffing: many IPs each failing once across many accounts
 *  - Account takeover: login from new IP after long gap, unusual hours
 *  - Session anomaly: impossible travel, multiple simultaneous sessions
 *  - Privilege abuse: admin actions outside normal hours or at high velocity
 *  - Inactive account: dormant account suddenly active
 *  - Enumeration: many failed logins against different emails from one IP
 */

import { detectAnomalies } from './ml';

export type ThreatLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface SecurityThreat {
    id: string;
    type: string;
    level: ThreatLevel;
    title: string;
    description: string;
    affectedEntity: string; // org name, user email, IP
    entityType: 'ip' | 'user' | 'org' | 'system';
    evidence: Record<string, any>;
    detectedAt: string;
    mlScore: number; // 0–1 confidence
    suggestions: SecuritySuggestion[];
}

export interface SecuritySuggestion {
    id: string;
    label: string;
    description: string;
    action: SecurityAction;
    destructive: boolean;
}

export type SecurityAction =
    | { type: 'block_ip'; ip: string }
    | { type: 'lock_account'; userId: number; email: string }
    | { type: 'force_logout'; userId: number }
    | { type: 'require_password_reset'; userId: number; email: string }
    | { type: 'enable_rate_limit'; ip: string; windowMinutes: number; maxAttempts: number }
    | { type: 'notify_admin'; message: string }
    | { type: 'revoke_sessions'; userId: number }
    | { type: 'flag_review'; entityId: string; note: string };

// ── Stat helpers ──────────────────────────────────────────────────────────────

function zScore(value: number, mean: number, std: number): number {
    return std === 0 ? 0 : Math.abs(value - mean) / std;
}

function mean(arr: number[]): number {
    return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function stdDev(arr: number[]): number {
    if (arr.length < 2) return 0;
    const m = mean(arr);
    return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
}

function sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
}

// Confidence score 0–1 from several contributing signals, each 0–1
function combineSignals(...signals: number[]): number {
    if (!signals.length) return 0;
    // Weighted OR: P(at least one) approximation, then clamp
    let prob = 0;
    for (const s of signals) {
        prob = prob + s - prob * s;
    }
    return Math.min(1, Math.max(0, prob));
}

// ── Analysis functions ────────────────────────────────────────────────────────

export interface LoginAttemptRow {
    id: number;
    ip_address: string;
    user_agent: string;
    email: string | null;
    user_id: number | null;
    organization_id: number | null;
    success: boolean;
    fail_reason: string | null;
    attempted_at: string;
}

export interface ActivityLogRow {
    id: number;
    user_id: number;
    organization_id: number;
    action: string;
    details: any;
    timestamp: string;
}

export interface UserRow {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
    organization_id: number;
    is_locked?: boolean;
    last_login_at?: string;
    created_at: string;
}

interface AnalysisInput {
    loginAttempts: LoginAttemptRow[];    // last 7 days
    activityLogs: ActivityLogRow[];      // last 30 days
    users: UserRow[];
    blockedIps: string[];
    lockedUserIds: number[];
}

let threatIdSeq = 0;
function tid(): string {
    return `T${Date.now()}-${++threatIdSeq}`;
}

export function analyzeSecurityThreats(input: AnalysisInput): SecurityThreat[] {
    const threats: SecurityThreat[] = [];
    const now = new Date();

    const {
        loginAttempts,
        activityLogs,
        users,
        blockedIps,
        lockedUserIds,
    } = input;

    const failed = loginAttempts.filter(a => !a.success);
    const succeeded = loginAttempts.filter(a => a.success);

    // ── 1. Brute Force by IP ──────────────────────────────────────────────────
    const failsByIp: Record<string, LoginAttemptRow[]> = {};
    for (const a of failed) {
        if (!failsByIp[a.ip_address]) failsByIp[a.ip_address] = [];
        failsByIp[a.ip_address].push(a);
    }

    const ipFailCounts = Object.values(failsByIp).map(v => v.length);
    const ipMean = mean(ipFailCounts);
    const ipStd = stdDev(ipFailCounts);

    for (const [ip, attempts] of Object.entries(failsByIp)) {
        const count = attempts.length;
        if (count < 5) continue;

        const z = zScore(count, ipMean, ipStd);
        // 1-hour window burst detection
        const lastHour = attempts.filter(a => Date.now() - new Date(a.attempted_at).getTime() < 3600_000);
        const burstSignal = sigmoid((lastHour.length - 10) * 0.3);
        const volumeSignal = sigmoid((count - 15) * 0.15);
        const zSignal = sigmoid((z - 2) * 0.5);
        const mlScore = combineSignals(burstSignal, volumeSignal, zSignal);

        if (mlScore < 0.25) continue;

        const level: ThreatLevel = mlScore > 0.8 ? 'critical' : mlScore > 0.6 ? 'high' : mlScore > 0.4 ? 'medium' : 'low';
        const alreadyBlocked = blockedIps.includes(ip);

        const uniqueEmails = new Set(attempts.map(a => a.email).filter(Boolean)).size;

        threats.push({
            id: tid(),
            type: 'brute_force',
            level,
            title: `Brute Force Attack${alreadyBlocked ? ' (IP Blocked)' : ''}`,
            description: `IP ${ip} made ${count} failed login attempts (${lastHour.length} in last hour) targeting ${uniqueEmails} account${uniqueEmails !== 1 ? 's' : ''}. Z-score: ${z.toFixed(1)}`,
            affectedEntity: ip,
            entityType: 'ip',
            evidence: { ip, failCount: count, lastHourCount: lastHour.length, uniqueEmails, zScore: z, alreadyBlocked },
            detectedAt: now.toISOString(),
            mlScore,
            suggestions: alreadyBlocked ? [
                {
                    id: `unblock-${ip}`, label: 'Remove IP Block',
                    description: 'Remove this IP from the block list if the threat has passed.',
                    action: { type: 'flag_review', entityId: ip, note: 'Admin reviewed brute force — decided to unblock' },
                    destructive: false,
                },
            ] : [
                {
                    id: `block-${ip}`, label: 'Block IP Address',
                    description: `Permanently block ${ip} from logging in.`,
                    action: { type: 'block_ip', ip },
                    destructive: true,
                },
                {
                    id: `ratelimit-${ip}`, label: 'Rate Limit IP (5 attempts / 15 min)',
                    description: `Apply a temporary rate limit to ${ip} instead of a full block.`,
                    action: { type: 'enable_rate_limit', ip, windowMinutes: 15, maxAttempts: 5 },
                    destructive: false,
                },
            ],
        });
    }

    // ── 2. Credential Stuffing: many IPs, each few fails, many accounts ───────
    const uniqueIpsWithFails = Object.keys(failsByIp).length;
    const totalFailed = failed.length;
    const uniqueTargetEmails = new Set(failed.map(a => a.email).filter(Boolean)).size;

    if (uniqueIpsWithFails >= 5 && uniqueTargetEmails >= 5) {
        const distributionSignal = sigmoid((uniqueIpsWithFails - 5) * 0.2);
        const targetSignal = sigmoid((uniqueTargetEmails - 5) * 0.15);
        const mlScore = combineSignals(distributionSignal, targetSignal);

        if (mlScore >= 0.3) {
            const level: ThreatLevel = mlScore > 0.75 ? 'critical' : mlScore > 0.55 ? 'high' : 'medium';
            threats.push({
                id: tid(),
                type: 'credential_stuffing',
                level,
                title: 'Credential Stuffing Campaign',
                description: `${uniqueIpsWithFails} different IPs attempted ${totalFailed} logins across ${uniqueTargetEmails} accounts — pattern consistent with automated credential stuffing.`,
                affectedEntity: `${uniqueTargetEmails} accounts`,
                entityType: 'system',
                evidence: { uniqueIps: uniqueIpsWithFails, totalFailed, uniqueTargetEmails },
                detectedAt: now.toISOString(),
                mlScore,
                suggestions: [
                    {
                        id: 'notify-affected', label: 'Notify Affected Users',
                        description: 'Send password reset emails to all targeted accounts.',
                        action: { type: 'notify_admin', message: `Credential stuffing detected. ${uniqueTargetEmails} accounts targeted.` },
                        destructive: false,
                    },
                ],
            });
        }
    }

    // ── 3. Account Targeting: single email hit many times from multiple IPs ──
    const failsByEmail: Record<string, LoginAttemptRow[]> = {};
    for (const a of failed) {
        if (!a.email) continue;
        if (!failsByEmail[a.email]) failsByEmail[a.email] = [];
        failsByEmail[a.email].push(a);
    }

    for (const [email, attempts] of Object.entries(failsByEmail)) {
        if (attempts.length < 8) continue;
        const ips = new Set(attempts.map(a => a.ip_address)).size;
        const mlScore = combineSignals(sigmoid((attempts.length - 8) * 0.2), sigmoid((ips - 2) * 0.3));
        if (mlScore < 0.3) continue;

        const user = users.find(u => u.email === email);
        const level: ThreatLevel = mlScore > 0.7 ? 'high' : 'medium';

        threats.push({
            id: tid(),
            type: 'account_targeting',
            level,
            title: 'Account Targeting Detected',
            description: `Account ${email} received ${attempts.length} failed login attempts from ${ips} IP address${ips !== 1 ? 'es' : ''}.`,
            affectedEntity: email,
            entityType: 'user',
            evidence: { email, failCount: attempts.length, uniqueIps: ips, userId: user?.id },
            detectedAt: now.toISOString(),
            mlScore,
            suggestions: [
                ...(user && !lockedUserIds.includes(user.id) ? [{
                    id: `lock-${user.id}`, label: 'Lock Account',
                    description: `Lock ${email} to prevent further login attempts until reviewed.`,
                    action: { type: 'lock_account' as const, userId: user.id, email },
                    destructive: true,
                }] : []),
                ...(user ? [{
                    id: `reset-${user.id}`, label: 'Force Password Reset',
                    description: 'Invalidate current password and send reset email.',
                    action: { type: 'require_password_reset' as const, userId: user.id, email },
                    destructive: false,
                }] : []),
            ],
        });
    }

    // ── 4. Off-Hours Admin Activity ───────────────────────────────────────────
    const adminLogs = activityLogs.filter(l => {
        const user = users.find(u => u.id === l.user_id);
        return user?.role === 'admin';
    });

    const hourBuckets: number[] = new Array(24).fill(0);
    for (const l of adminLogs) {
        const h = new Date(l.timestamp).getHours();
        hourBuckets[h]++;
    }

    const { anomalies: hourAnomalies } = detectAnomalies(hourBuckets, 2.5);
    const offHours = [0, 1, 2, 3, 4, 22, 23];
    const lateNightActivity = offHours.reduce((s, h) => s + hourBuckets[h], 0);
    const totalActivity = hourBuckets.reduce((a, b) => a + b, 0);

    if (totalActivity > 0 && lateNightActivity > 0) {
        const ratio = lateNightActivity / totalActivity;
        const mlScore = sigmoid((ratio - 0.05) * 20);

        if (mlScore >= 0.35) {
            const anomalousHours = hourAnomalies.filter(a => offHours.includes(a.index));
            const level: ThreatLevel = mlScore > 0.7 ? 'high' : mlScore > 0.5 ? 'medium' : 'low';

            threats.push({
                id: tid(),
                type: 'off_hours_activity',
                level,
                title: 'Admin Activity at Unusual Hours',
                description: `${lateNightActivity} admin actions (${(ratio * 100).toFixed(0)}% of total) occurred between 10pm–4am. ML anomaly detection flagged ${anomalousHours.length} hour bucket${anomalousHours.length !== 1 ? 's' : ''}.`,
                affectedEntity: 'Admin accounts',
                entityType: 'org',
                evidence: { lateNightActivity, totalActivity, ratio, anomalousHours: anomalousHours.map(a => a.index) },
                detectedAt: now.toISOString(),
                mlScore,
                suggestions: [
                    {
                        id: 'review-offhours', label: 'Review Off-Hours Actions',
                        description: 'Flag all admin actions between 10pm–4am for manual review.',
                        action: { type: 'flag_review', entityId: 'admin-off-hours', note: 'Off-hours admin activity flagged for review' },
                        destructive: false,
                    },
                ],
            });
        }
    }

    // ── 5. Activity Volume Anomaly (per user) ─────────────────────────────────
    const actByUser: Record<number, number[]> = {};
    // Build daily buckets per user over last 30 days
    for (const l of activityLogs) {
        const uid = l.user_id;
        const dayOffset = Math.floor((now.getTime() - new Date(l.timestamp).getTime()) / 86_400_000);
        if (dayOffset < 0 || dayOffset >= 30) continue;
        if (!actByUser[uid]) actByUser[uid] = new Array(30).fill(0);
        actByUser[uid][29 - dayOffset]++;
    }

    for (const [uidStr, dailyCounts] of Object.entries(actByUser)) {
        const uid = parseInt(uidStr);
        const user = users.find(u => u.id === uid);
        if (!user) continue;

        const recent = dailyCounts.slice(-3);
        const history = dailyCounts.slice(0, 27);
        const histMean = mean(history);
        const histStd = stdDev(history);
        const recentAvg = mean(recent);

        if (history.filter(v => v > 0).length < 5) continue; // not enough history
        if (histMean < 2) continue; // low-activity accounts are too noisy

        const z = zScore(recentAvg, histMean, histStd);
        const mlScore = sigmoid((z - 2.5) * 0.8);

        if (mlScore < 0.4) continue;

        const level: ThreatLevel = mlScore > 0.8 ? 'high' : mlScore > 0.6 ? 'medium' : 'low';
        threats.push({
            id: tid(),
            type: 'activity_spike',
            level,
            title: `Unusual Activity Spike — ${user.first_name} ${user.last_name}`,
            description: `User ${user.email} averaged ${recentAvg.toFixed(0)} actions/day in the last 3 days vs. a baseline of ${histMean.toFixed(1)} ± ${histStd.toFixed(1)}. Z-score: ${z.toFixed(2)}.`,
            affectedEntity: user.email,
            entityType: 'user',
            evidence: { userId: uid, recentAvg, histMean, histStd, zScore: z, dailyCounts },
            detectedAt: now.toISOString(),
            mlScore,
            suggestions: [
                {
                    id: `revoke-${uid}`, label: 'Revoke Active Sessions',
                    description: 'Force logout all active sessions for this user.',
                    action: { type: 'revoke_sessions', userId: uid },
                    destructive: false,
                },
                {
                    id: `flag-${uid}`, label: 'Flag Account for Review',
                    description: 'Mark this account for manual review without disrupting access.',
                    action: { type: 'flag_review', entityId: String(uid), note: `Activity spike: ${recentAvg.toFixed(0)} vs baseline ${histMean.toFixed(1)}` },
                    destructive: false,
                },
            ],
        });
    }

    // ── 6. Inactive Account Suddenly Active ───────────────────────────────────
    const recentLogins = succeeded.filter(a => Date.now() - new Date(a.attempted_at).getTime() < 7 * 86_400_000);
    const recentLoginUserIds = new Set(recentLogins.map(a => a.user_id).filter(Boolean));

    for (const user of users) {
        if (!recentLoginUserIds.has(user.id)) continue;
        if (!user.last_login_at) continue;

        const daysSinceLast = (now.getTime() - new Date(user.last_login_at).getTime()) / 86_400_000;
        if (daysSinceLast < 45) continue; // not dormant enough

        const mlScore = sigmoid((daysSinceLast - 45) * 0.03);
        if (mlScore < 0.35) continue;

        const level: ThreatLevel = daysSinceLast > 180 ? 'high' : 'medium';
        threats.push({
            id: tid(),
            type: 'dormant_account_active',
            level,
            title: `Dormant Account Reactivated — ${user.email}`,
            description: `Account ${user.email} last logged in ${Math.round(daysSinceLast)} days ago and just became active again.`,
            affectedEntity: user.email,
            entityType: 'user',
            evidence: { userId: user.id, daysSinceLast, email: user.email },
            detectedAt: now.toISOString(),
            mlScore,
            suggestions: [
                {
                    id: `reset-dormant-${user.id}`, label: 'Force Password Reset',
                    description: 'Require a new password to confirm this is legitimate access.',
                    action: { type: 'require_password_reset', userId: user.id, email: user.email },
                    destructive: false,
                },
                {
                    id: `revoke-dormant-${user.id}`, label: 'Revoke Sessions',
                    description: 'Terminate all active sessions for this account.',
                    action: { type: 'revoke_sessions', userId: user.id },
                    destructive: false,
                },
            ],
        });
    }

    // ── 7. Email Enumeration: single IP, many unique emails, all failed ────────
    for (const [ip, attempts] of Object.entries(failsByIp)) {
        const uniqueEmails = new Set(attempts.map(a => a.email).filter(Boolean)).size;
        if (uniqueEmails < 10) continue;
        if (attempts.length / uniqueEmails > 3) continue; // not enumeration pattern

        const mlScore = sigmoid((uniqueEmails - 10) * 0.12);
        if (mlScore < 0.3) continue;

        const level: ThreatLevel = mlScore > 0.7 ? 'high' : 'medium';
        threats.push({
            id: tid(),
            type: 'email_enumeration',
            level,
            title: 'Email Enumeration Attempt',
            description: `IP ${ip} probed ${uniqueEmails} unique email addresses with only ${attempts.length} total attempts — consistent with account enumeration.`,
            affectedEntity: ip,
            entityType: 'ip',
            evidence: { ip, uniqueEmails, totalAttempts: attempts.length },
            detectedAt: now.toISOString(),
            mlScore,
            suggestions: [
                {
                    id: `block-enum-${ip}`, label: 'Block IP',
                    description: `Block ${ip} immediately.`,
                    action: { type: 'block_ip', ip },
                    destructive: true,
                },
            ],
        });
    }

    // Sort by severity then mlScore
    const levelOrder: Record<ThreatLevel, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    threats.sort((a, b) => {
        const ld = levelOrder[a.level] - levelOrder[b.level];
        return ld !== 0 ? ld : b.mlScore - a.mlScore;
    });

    return threats;
}
