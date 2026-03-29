const http = require('http');

const data = JSON.stringify({ email: 'tammy@fosters.com', password: 'password123' });

const req = http.request({
    hostname: 'localhost',
    port: 6050,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
}, (res) => {
    let cookies = res.headers['set-cookie'];

    const adjustData = JSON.stringify({ itemId: 382, change: -1 });
    const req2 = http.request({
        hostname: 'localhost',
        port: 6050,
        path: '/api/inventory/adjust',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': adjustData.length,
            'Cookie': cookies ? cookies.join('; ') : ''
        }
    }, (res2) => {
        let body = '';
        res2.on('data', d => body += d);
        res2.on('end', () => console.log('Response:', res2.statusCode, body));
    });
    req2.write(adjustData);
    req2.end();
});

req.write(data);
req.end();
