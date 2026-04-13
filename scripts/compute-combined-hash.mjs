import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

const TEST_DATA_DIR = 'F:/ots-proof/TestData';
const encoder = new TextEncoder();

const normalize = (p) => p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');

// Real files under assets/
const realEntries = readdirSync(TEST_DATA_DIR)
    .filter(f => !f.startsWith('.'))
    .map(f => ({
        path: normalize(`assets/${f}`),
        content: new Uint8Array(readFileSync(join(TEST_DATA_DIR, f))),
    }));

// Deep hierarchy
const deepEntries = [
    { path: 'chapter/01/scene/01.txt', content: encoder.encode('幕が上がる') },
    { path: 'chapter/01/scene/02.txt', content: encoder.encode('主人公登場') },
    { path: 'chapter/02/scene/01.txt', content: encoder.encode('転換') },
    { path: 'README.md',               content: encoder.encode('# テスト') },
];

// Empty file
const emptyEntry = { path: 'empty.txt', content: new Uint8Array(0) };

// 20 generated files
const generatedEntries = Array.from({ length: 20 }, (_, i) => ({
    path: `generated/file-${String(i).padStart(3, '0')}.txt`,
    content: encoder.encode(`content of file ${i}`),
}));

const all = [...realEntries, ...deepEntries, emptyEntry, ...generatedEntries];
all.sort((a, b) => a.path.localeCompare(b.path));

const parts = [];
for (const entry of all) {
    const pathBytes = encoder.encode(entry.path);
    const pathLen = new ArrayBuffer(8);
    new DataView(pathLen).setBigUint64(0, BigInt(pathBytes.length), false);
    const contentLen = new ArrayBuffer(8);
    new DataView(contentLen).setBigUint64(0, BigInt(entry.content.length), false);
    parts.push(new Uint8Array(pathLen), pathBytes, new Uint8Array(contentLen), entry.content);
}
const totalSize = parts.reduce((acc, p) => acc + p.length, 0);
const buf = new Uint8Array(totalSize);
let offset = 0;
for (const p of parts) { buf.set(p, offset); offset += p.length; }

const hash = createHash('sha256').update(buf).digest('hex');
console.log('Total entries:', all.length);
console.log('Frozen hash:', hash);
