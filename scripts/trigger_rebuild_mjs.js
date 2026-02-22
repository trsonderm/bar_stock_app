const fs = require('fs');
const path = require('path');

const configPath = path.join(process.cwd(), 'next.config.mjs');

try {
    const content = fs.readFileSync(configPath, 'utf8');
    fs.writeFileSync(configPath, content);
    console.log('Touched next.config.mjs to trigger rebuild');
} catch (e) {
    console.error('Failed to touch next.config.mjs', e);
}
