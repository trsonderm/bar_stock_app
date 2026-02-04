// Native fetch
// In this env we use native fetch usually, but let's be safe and use what worked last time (native)
// Removing require just in case.

const BASE_URL = 'http://localhost:6050/api/auth/login';

async function testLogin(email, password) {
    console.log(`Testing Login: ${email}`);
    try {
        const response = await fetch(BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();
        console.log(`Status: ${response.status}`);
        console.log(`Response:`, JSON.stringify(data));
    } catch (e) {
        console.error('Request failed:', e.message);
    }
}

// Test Super Admin
testLogin('admin@topshelf.com', 'password');
