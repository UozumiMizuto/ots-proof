import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

const dir = 'F:/ots-proof/TestData';
const files = readdirSync(dir).filter(f => !f.startsWith('.'));

const normalize = (p) => p.replace(/\\/g, '/').replace(/^\.\//,'').replace(/^\//,'');

const entries = files.map(f => ({
    path: normalize(f),
    content: readFileSync(join(dir, f)),
}));
entries.sort((a, b) => a.path.localeCompare(b.path));

console.log('Sorted paths:');
entries.forEach(e => console.log(`  ${e.path} (${e.content.length} bytes)`));

const parts = [];
const encoder = new TextEncoder();
for (const entry of entries) {
    const pathBytes = encoder.encode(entry.path);
    const pathLen = new ArrayBuffer(8);
    new DataView(pathLen).setBigUint64(0, BigInt(pathBytes.length), false);
    const contentLen = new ArrayBuffer(8);
    new DataView(contentLen).setBigUint64(0, BigInt(entry.content.length), false);
    parts.push(new Uint8Array(pathLen), pathBytes, new Uint8Array(contentLen), new Uint8Array(entry.content));
}

const totalSize = parts.reduce((acc, p) => acc + p.length, 0);
const all = new Uint8Array(totalSize);
let offset = 0;
for (const p of parts) { all.set(p, offset); offset += p.length; }

const hash = createHash('sha256').update(all).digest('hex');
console.log('\nExpected hash:', hash);
