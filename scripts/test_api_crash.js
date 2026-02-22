const http = require('http');

const options = {
    hostname: 'localhost',
    port: 6050,
    path: '/api/admin/categories',
    method: 'GET',
    headers: {
        // Fake cookie to pass middleware check if needed, though categories checks session
        // We expect 401 if auth works, or 500 if it crashes BEFORE auth.
        // If it crashes inside route, it might need auth to get there.
        // But 500 usually implies crash.
    }
};

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    res.setEncoding('utf8');
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        console.log('BODY: ' + data);
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.end();
