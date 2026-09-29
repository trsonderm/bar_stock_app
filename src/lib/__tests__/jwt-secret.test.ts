/**
 * @jest-environment node
 */
const env = process.env as Record<string, string | undefined>;
const ORIGINAL_ENV = { ...env };

afterEach(() => {
    for (const key of Object.keys(env)) delete env[key];
    Object.assign(env, ORIGINAL_ENV);
    jest.resetModules();
});

function load() {
    return require('../jwt-secret') as typeof import('../jwt-secret');
}

describe('getJwtSecretKey', () => {
    it('refuses to run in production without JWT_SECRET', () => {
        env.NODE_ENV = 'production';
        delete env.JWT_SECRET;
        expect(() => load().getJwtSecretKey()).toThrow(/JWT_SECRET/);
    });

    it('uses JWT_SECRET when it is set', () => {
        env.NODE_ENV = 'production';
        env.JWT_SECRET = 'configured-secret';
        expect(new TextDecoder().decode(load().getJwtSecretKey())).toBe('configured-secret');
    });

    it('falls back to a development key outside production', () => {
        env.NODE_ENV = 'development';
        delete env.JWT_SECRET;
        jest.spyOn(console, 'warn').mockImplementation(() => { });
        expect(load().getJwtSecretKey().length).toBeGreaterThan(0);
    });
});
