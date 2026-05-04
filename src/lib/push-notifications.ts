import { db } from './db';

// Firebase Cloud Messaging v1 HTTP API
// Handles both iOS (via APNs bridge) and Android
// Set FIREBASE_PROJECT_ID and FIREBASE_SERVICE_ACCOUNT_JSON in environment

interface PushPayload {
    title: string;
    body: string;
    data?: Record<string, string>;
    badge?: number;
}

async function getFirebaseAccessToken(): Promise<string | null> {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) return null;

    try {
        const serviceAccount = JSON.parse(serviceAccountJson);
        const now = Math.floor(Date.now() / 1000);
        const header = { alg: 'RS256', typ: 'JWT' };
        const claim = {
            iss: serviceAccount.client_email,
            sub: serviceAccount.client_email,
            aud: 'https://oauth2.googleapis.com/token',
            iat: now,
            exp: now + 3600,
            scope: 'https://www.googleapis.com/auth/firebase.messaging',
        };

        const encode = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
        const signingInput = `${encode(header)}.${encode(claim)}`;

        // Use Node crypto to sign with RS256
        const { createSign } = await import('crypto');
        const sign = createSign('RSA-SHA256');
        sign.update(signingInput);
        const signature = sign.sign(serviceAccount.private_key, 'base64url');
        const jwt = `${signingInput}.${signature}`;

        const res = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                assertion: jwt,
            }),
        });
        const data = await res.json();
        return data.access_token || null;
    } catch (err) {
        console.error('Firebase access token error:', err);
        return null;
    }
}

async function sendToToken(token: string, platform: string, payload: PushPayload, accessToken: string): Promise<boolean> {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (!projectId) return false;

    const message: any = {
        token,
        notification: { title: payload.title, body: payload.body },
        data: Object.fromEntries(
            Object.entries(payload.data || {}).map(([k, v]) => [k, String(v)])
        ),
    };

    if (platform === 'ios') {
        message.apns = {
            payload: {
                aps: {
                    badge: payload.badge ?? 1,
                    sound: 'default',
                    'content-available': 1,
                },
            },
        };
    } else {
        message.android = {
            priority: 'high',
            notification: { sound: 'default', channel_id: 'topshelf_alerts' },
        };
    }

    try {
        const res = await fetch(
            `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message }),
            }
        );
        if (!res.ok) {
            const err = await res.json();
            // Token is invalid/unregistered — clean it up
            if (err?.error?.status === 'NOT_FOUND' || err?.error?.status === 'UNREGISTERED') {
                await db.execute('DELETE FROM device_tokens WHERE token = $1', [token]).catch(() => {});
            }
            return false;
        }
        return true;
    } catch (err) {
        console.error('FCM send error:', err);
        return false;
    }
}

export async function sendPushToUser(userId: number, payload: PushPayload): Promise<void> {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!projectId || !serviceAccount) return; // Push not configured — silent no-op

    const tokens = await db.query('SELECT token, platform FROM device_tokens WHERE user_id = $1', [userId]);
    if (!tokens.length) return;

    const accessToken = await getFirebaseAccessToken();
    if (!accessToken) return;

    await Promise.allSettled(tokens.map((t: any) => sendToToken(t.token, t.platform, payload, accessToken)));
}

export async function sendPushToUsers(userIds: number[], payload: PushPayload): Promise<void> {
    if (!userIds.length) return;
    await Promise.allSettled(userIds.map(uid => sendPushToUser(uid, payload)));
}

// Save a notification to DB and push to device
export async function notify(
    userId: number,
    organizationId: number,
    type: string,
    title: string,
    message: string,
    data: Record<string, any> = {}
): Promise<void> {
    await db.execute(
        `INSERT INTO notifications (organization_id, user_id, type, title, message, data)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [organizationId, userId, type, title, message, JSON.stringify(data)]
    ).catch(console.error);

    await sendPushToUser(userId, { title, body: message, data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])) });
}
