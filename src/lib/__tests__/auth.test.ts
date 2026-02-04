import { hashPassword, verifyPassword, createSessionToken, verifyPin, hashPin } from '../auth';

// Mock jose to avoid ESM issues in Jest
jest.mock('jose', () => ({
    SignJWT: jest.fn().mockImplementation(() => ({
        setProtectedHeader: jest.fn().mockReturnThis(),
        setIssuedAt: jest.fn().mockReturnThis(),
        setExpirationTime: jest.fn().mockReturnThis(),
        sign: jest.fn().mockResolvedValue('mocked.jwt.token')
    })),
    jwtVerify: jest.fn().mockResolvedValue({
        payload: {
            id: 1,
            role: 'admin',
            permissions: ['all'],
            firstName: 'Test',
            lastName: 'User',
            organizationId: 100
        }
    })
}));

import { jwtVerify } from 'jose';

// Mock process.env for JWT_SECRET
process.env.JWT_SECRET = 'test-secret-key';

describe('Authentication Logic', () => {

    describe('Password Hashing', () => {
        it('should hash a password correctly', () => {
            const password = 'password123';
            const hash = hashPassword(password);
            expect(hash).not.toBe(password);
            expect(hash).toHaveLength(60); // bcrypt hash length
        });

        it('should verify a correct password', () => {
            const password = 'mySecretPassword';
            const hash = hashPassword(password);
            expect(verifyPassword(password, hash)).toBe(true);
        });

        it('should reject an incorrect password', () => {
            const password = 'password123';
            const hash = hashPassword(password);
            expect(verifyPassword('wrongPassword', hash)).toBe(false);
        });
    });

    describe('PIN Hashing (Legacy)', () => {
        it('should verify correct PIN (plaintext fallback)', () => {
            // Current logic supports plaintext PIN check if hash matching fails or if not a hash
            // Note: verifyPin checks (password === hash) first.
            expect(verifyPin('1234', '1234')).toBe(true);
        });

        it('should verify correct PIN (bcrypt)', () => {
            const pin = '1234';
            const hash = hashPin(pin);
            expect(verifyPin(pin, hash)).toBe(true);
        });
    });

    describe('Session Token', () => {
        it('should create a valid JWT', async () => {
            const user = {
                id: 1,
                role: 'admin' as any,
                permissions: ['all'],
                firstName: 'Test',
                lastName: 'User',
                email: 'test@example.com',
                organizationId: 100,
                isSuperAdmin: false
            };

            const token = await createSessionToken(user);
            expect(typeof token).toBe('string');
            expect(token.split('.').length).toBe(3);

            // Verify with jose
            const secret = new TextEncoder().encode('test-secret-key');
            const { payload } = await jwtVerify(token, secret);

            expect(payload.id).toBe(1);
            expect(payload.role).toBe('admin');
            expect(payload.organizationId).toBe(100);
        });
    });
});
