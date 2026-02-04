import twilio from 'twilio';
import { db } from '@/lib/db';

let twilioClient: any = null;

async function getClient() {
    if (twilioClient) return twilioClient;

    // Fetch keys from DB system_settings
    // We assume keys are 'twilio_sid', 'twilio_token', 'twilio_from'
    const valid = await db.one("SELECT value FROM system_settings WHERE key = 'twilio_sid'");
    const token = await db.one("SELECT value FROM system_settings WHERE key = 'twilio_token'");

    if (valid && token) {
        twilioClient = twilio(valid.value, token.value);
        return twilioClient;
    }
    return null;
}

export async function sendSMS(to: string, body: string) {
    try {
        const client = await getClient();
        if (!client) {
            console.warn('Twilio client not configured');
            return false;
        }

        const fromRow = await db.one("SELECT value FROM system_settings WHERE key = 'twilio_from'");
        const from = fromRow ? fromRow.value : null;

        if (!from) {
            console.warn('Twilio "From" number not configured');
            return false;
        }

        await client.messages.create({
            body,
            from,
            to
        });
        console.log('SMS sent to', to);
        return true;

    } catch (error) {
        console.error('Twilio Error:', error);
        return false;
    }
}
