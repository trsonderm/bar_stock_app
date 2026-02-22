import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'app.log');

export function logToFile(message: string, data?: any) {
    const timestamp = new Date().toISOString();
    let logEntry = `[${timestamp}] ${message}`;

    if (data) {
        try {
            logEntry += ` ${JSON.stringify(data)}`;
        } catch (e) {
            logEntry += ` [Circular/Unserializable Data]`;
        }
    }

    logEntry += '\n';

    fs.appendFile(LOG_FILE, logEntry, (err) => {
        if (err) console.error('Failed to write to log file:', err);
    });
}
