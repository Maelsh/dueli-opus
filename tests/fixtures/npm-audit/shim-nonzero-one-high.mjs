/**
 * Test shim: mimics npm audit exiting non-zero while printing valid audit JSON.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
process.stdout.write(readFileSync(join(dir, 'one-high.json'), 'utf8'));
process.exit(1);
