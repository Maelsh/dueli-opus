const fs = require('fs');
let s = fs.readFileSync('src/i18n/ar.ts', 'utf8');
s = s.replace('SELF-AR', 'PLACEHOLDER-A');
fs.writeFileSync('src/i18n/ar.ts', s, 'utf8');
console.log('step ok ' + s.includes('rating_self_forbidden'));
