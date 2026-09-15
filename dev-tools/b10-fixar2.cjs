const fs = require('fs');
const esc = String.fromCharCode(27);
let s = fs.readFileSync('src/i18n/ar.ts', 'utf8');
const A = '\u063a';
console.log('unicode in file ok: ' + A + ' len=' + A.length);
const lines = [
  "R1",
  "R2",
];
console.log(lines.join('|'));
// Replace placeholder lines with real Arabic built from code points to avoid shell encoding issues
const selfAr = '\u0644\u0627 \u064a\u0645\u0643\u0646\u0643 \u062a\u0642\u064a\u064a\u0645 \u0646\u0641\u0633\u0643 \u0623\u0648 \u0645\u0646\u0627\u0641\u0633\u062a\u0643';
const watchAr = '\u064a\u062c\u0628 \u0645\u0634\u0627\u0647\u062f\u0629 \u0627\u0644\u0645\u0646\u0627\u0641\u0633\u0629 \u0642\u0628\u0644 \u062a\u0642\u064a\u064a\u0645\u0647\u0627';
const windowAr = '\u0627\u0646\u062a\u0647\u062a \u0646\u0627\u0641\u0630\u0629 \u0627\u0644\u062a\u0642\u064a\u064a\u0645 (24 \u0633\u0627\u0639\u0629 \u0645\u0646 \u0627\u0646\u062a\u0647\u0627\u0621 \u0627\u0644\u0645\u0646\u0627\u0641\u0633\u0629)';
s = s.replace("'PLACEHOLDER-A'", "'" + selfAr + "'");
s = s.replace("'WATCH-AR'", "'" + watchAr + "'");
s = s.replace("'WINDOW-AR'", "'" + windowAr + "'");
fs.writeFileSync('src/i18n/ar.ts', s, 'utf8');
console.log('ar fixed');
