const { SignJWT } = require('jose');

const SECRET_KEY = new TextEncoder().encode('test-secret');

async function test() {
    try {
        const payload = {
            firstName: undefined,
            lastName: 'Doe'
        };
        console.log('Payload:', payload);
        const token = await new SignJWT(payload)
            .setProtectedHeader({ alg: 'HS256' })
            .sign(SECRET_KEY);
        console.log('Token created:', token);
    } catch (error) {
        console.error('Error creating token:', error);
    }
}

test();
