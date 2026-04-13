import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

const dir = 'F:/ots-proof/TestData';
const files = readdirSync(dir).filter(f => !f.startsWith('.'));
files.sort((a, b) => a.localeCompare(b));

for (const f of files) {
    const content = readFileSync(join(dir, f));
    const hash = createHash('sha256').update(content).digest('hex');
    console.log(`${f}: ${hash}`);
}
