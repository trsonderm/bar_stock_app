import { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SECRET_KEY = new TextEncoder().encode(process.env.JWT_SECRET || 'topshelf-secret-key-change-in-prod');

export async function verifyMobileToken(req: NextRequest): Promise<any | null> {
    const auth = req.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) return null;
    const token = auth.slice(7);
    try {
        const { payload } = await jwtVerify(token, SECRET_KEY, { algorithms: ['HS256'] });
        return payload;
    } catch {
        return null;
    }
}
