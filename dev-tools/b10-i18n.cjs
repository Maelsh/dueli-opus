const fs = require('fs');
let s = fs.readFileSync('src/i18n/ar.ts', 'utf8');
s = s.split('}').join('}');
const anchor = "not_authorized:";
const idx = s.indexOf(anchor);
// find end of that line
const lineEnd = s.indexOf('\n', idx);
const insert = "\n        rating_self_forbidden: 'SELF-AR',\n        rating_watch_required: 'WATCH-AR',\n        rating_window_closed: 'WINDOW-AR',";
s = s.slice(0, lineEnd) + insert + s.slice(lineEnd);
fs.writeFileSync('src/i18n/ar.ts', s, 'utf8');
console.log('ar ok');
let e = fs.readFileSync('src/i18n/en.ts', 'utf8');
const idx2 = e.indexOf(anchor);
const lineEnd2 = e.indexOf('\n', idx2);
const insert2 = "\n        rating_self_forbidden: 'You cannot rate yourself or your own competition',\n        rating_watch_required: 'You must watch the competition before rating it',\n        rating_window_closed: 'Rating window has closed (24 hours after the competition ended)',";
e = e.slice(0, lineEnd2) + insert2 + e.slice(lineEnd2);
fs.writeFileSync('src/i18n/en.ts', e, 'utf8');
console.log('en ok');
