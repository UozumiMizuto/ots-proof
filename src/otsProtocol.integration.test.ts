// @vitest-environment node

/**
 * ============================================================================
 * INTEGRATION TESTS — Real test data
 * ============================================================================
 * Binary files (jpg/png/webp/wav/mp3) and a Japanese-named text file are
 * hashed together to verify:
 *   - Binary content is handled correctly (not mangled by text encoding)
 *   - Japanese filenames are NFC-normalized and sorted correctly
 *   - Empty files are handled correctly
 *   - Deep folder hierarchies are sorted and hashed correctly
 *   - Large numbers of files produce a stable result
 *   - The full TLV → SHA-256 pipeline produces a stable, frozen result
 *
 * ⚠️  If any frozen hash test fails, the protocol has changed and existing
 *     .ots proofs may be invalidated. Do NOT update expected values —
 *     fix the implementation instead.
 * ============================================================================
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { otsProtocol } from './otsProtocol';

const TEST_DATA_DIR = join(__dirname, '..', 'TestData');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(path: string, contentStr: string) {
    return { path, content: new TextEncoder().encode(contentStr) };
}

function makeEmptyEntry(path: string) {
    return { path, content: new Uint8Array(0) };
}

async function hashEntries(entries: { path: string; content: Uint8Array }[]): Promise<string> {
    const sorted = otsProtocol.sortEntries(entries);
    const tlvBytes = otsProtocol.generateTlvBytes(sorted);
    const hash = await otsProtocol.calculateHash(tlvBytes);
    return otsProtocol.bytesToHex(hash);
}

async function hashTestDataDir(): Promise<string> {
    const filenames = readdirSync(TEST_DATA_DIR).filter(f => !f.startsWith('.'));
    const entries = filenames.map(f => ({
        path: otsProtocol.normalizePath(f),
        content: new Uint8Array(readFileSync(join(TEST_DATA_DIR, f))),
    }));
    return hashEntries(entries);
}

// ---------------------------------------------------------------------------
// 1. Real files (binary + Japanese filename)
// ---------------------------------------------------------------------------

describe('Integration — real test data (binary + Japanese filename)', () => {

    it('sorted file order matches expected sequence', () => {
        const filenames = readdirSync(TEST_DATA_DIR).filter(f => !f.startsWith('.'));
        const entries = filenames.map(f => ({ path: otsProtocol.normalizePath(f), content: new Uint8Array() }));
        const sorted = otsProtocol.sortEntries(entries);
        expect(sorted.map(e => e.path)).toEqual([
            '2c36718f-e2fe-465f-923c-e18b12b67e1c.webp',
            '9d5a1328-6756-419d-9722-2cb18e9f70e8.jpg',
            'acbfd6f8-ab55-4a06-9bc2-31126a1ee013.png',
            'clap.wav',
            'test.mp3',
            '雨ニモマケズ.txt',
        ]);
    });

    it('each binary/text file SHA-256 must match frozen value', async () => {
        // ⚠️ FROZEN — recompute with: node scripts/compute-file-hashes.mjs
        const frozenHashes: Record<string, string> = {
            '2c36718f-e2fe-465f-923c-e18b12b67e1c.webp': '1e38d9bb8bfea82ab8eef2472a758d9e93735c3aa9d70e88b8e9be876e4ffc55',
            '9d5a1328-6756-419d-9722-2cb18e9f70e8.jpg':  'db8dbda7aa961cfaaf7f6b924f7b8070b9eafbe52f3510f4d367b177d4e521df',
            'acbfd6f8-ab55-4a06-9bc2-31126a1ee013.png':  'f4d0256a3ae4dd582d46081f489e8ca07788078588e1620c5054109de0748326',
            'clap.wav':                                  '882e701babfb030c741246f09c95a1e67e8addcee9b18672565d94a4177d34f0',
            'test.mp3':                                  'b26c150278ccfd1790617a60ede3c4210f303db9e625e544415e0a6dd648db6c',
            '雨ニモマケズ.txt':                           '445069266e34dee94ad27400c4bc4b3288efdceda574f33ffcd631b901686aae',
        };
        for (const [filename, expected] of Object.entries(frozenHashes)) {
            const content = new Uint8Array(readFileSync(join(TEST_DATA_DIR, filename)));
            const hash = await otsProtocol.calculateHash(content);
            expect(otsProtocol.bytesToHex(hash), `${filename}`).toBe(expected);
        }
    });

    it('full repo hash (all 6 files) must match frozen value', async () => {
        // ⚠️ FROZEN — recompute with: node scripts/compute-hash.mjs
        const FROZEN = '41921b2a06d39a6e47382140fd6c561a2a011f97d0c933d1d863a293e409ce76';
        expect(await hashTestDataDir()).toBe(FROZEN);
    });

});

// ---------------------------------------------------------------------------
// 2. Empty file
// ---------------------------------------------------------------------------

describe('Integration — empty file handling', () => {

    it('single empty file produces a stable hash', async () => {
        const entries = [makeEmptyEntry('empty.txt')];
        const hash = await hashEntries(entries);
        // TLV: [8 bytes path len][9 bytes "empty.txt"][8 bytes content len=0]
        expect(hash).toMatchSnapshot();
    });

    it('empty file mixed with non-empty files does not corrupt hash', async () => {
        const entries = [
            makeEntry('a.txt', 'hello'),
            makeEmptyEntry('b.txt'),
            makeEntry('c.txt', 'world'),
        ];
        const hash1 = await hashEntries(entries);
        // Verify it differs from the same set without the empty file
        const entriesNoEmpty = [makeEntry('a.txt', 'hello'), makeEntry('c.txt', 'world')];
        const hash2 = await hashEntries(entriesNoEmpty);
        expect(hash1).not.toBe(hash2);
        // And is stable across calls
        expect(await hashEntries(entries)).toBe(hash1);
    });

});

// ---------------------------------------------------------------------------
// 3. Deep folder hierarchy
// ---------------------------------------------------------------------------

describe('Integration — deep folder hierarchy', () => {

    it('deep nested paths sort correctly', () => {
        const paths = [
            'z/z/z/deep.txt',
            'a/b/c/d/e/very-deep.txt',
            'a/b/c/d/sibling.txt',
            'a/b/c/file.txt',
            'a/b/file.txt',
            'a/file.txt',
            'root.txt',
        ];
        const entries = paths.map(p => ({ path: p, content: new Uint8Array() }));
        const sorted = otsProtocol.sortEntries(entries);
        expect(sorted.map(e => e.path)).toEqual([
            'a/b/c/d/e/very-deep.txt',
            'a/b/c/d/sibling.txt',
            'a/b/c/file.txt',
            'a/b/file.txt',
            'a/file.txt',
            'root.txt',
            'z/z/z/deep.txt',
        ]);
    });

    it('deep hierarchy hash is stable', async () => {
        const entries = [
            makeEntry('chapter/01/scene/01.txt',  '幕が上がる'),
            makeEntry('chapter/01/scene/02.txt',  '主人公登場'),
            makeEntry('chapter/02/scene/01.txt',  '転換'),
            makeEntry('assets/images/cover.png',  '\x89PNG'),
            makeEntry('assets/audio/bgm.mp3',     'ID3'),
            makeEntry('README.md',                 '# テスト'),
        ];
        const hash1 = await hashEntries(entries);
        const hash2 = await hashEntries(entries);
        expect(hash1).toBe(hash2);
        expect(hash1).toMatchSnapshot();
    });

    it('same content at different paths produces different hashes', async () => {
        const a = [makeEntry('dir1/file.txt', 'same content')];
        const b = [makeEntry('dir2/file.txt', 'same content')];
        expect(await hashEntries(a)).not.toBe(await hashEntries(b));
    });

});

// ---------------------------------------------------------------------------
// 4. Large number of files
// ---------------------------------------------------------------------------

describe('Integration — large number of files', () => {

    it('100 files produce a stable hash', async () => {
        const entries = Array.from({ length: 100 }, (_, i) => {
            const idx = String(i).padStart(3, '0');
            return makeEntry(`files/file-${idx}.txt`, `content of file ${idx}`);
        });
        const hash1 = await hashEntries(entries);
        const hash2 = await hashEntries([...entries].reverse()); // order before sort shouldn't matter
        expect(hash1).toBe(hash2);
        expect(hash1).toMatchSnapshot();
    });

    it('adding one file to 100 changes the hash', async () => {
        const base = Array.from({ length: 100 }, (_, i) =>
            makeEntry(`files/file-${String(i).padStart(3, '0')}.txt`, `content ${i}`)
        );
        const withExtra = [...base, makeEntry('files/file-extra.txt', 'extra')];
        expect(await hashEntries(base)).not.toBe(await hashEntries(withExtra));
    });

});

// ---------------------------------------------------------------------------
// 5. Combined — all test types together
// ---------------------------------------------------------------------------

describe('Integration — combined (real binaries + deep hierarchy + empty + generated)', () => {

    it('31-entry mixed repo hash must match frozen value', async () => {
        // Combines:
        //   - 6 real binary/text files from TestData/ (under assets/)
        //   - 4 deep-hierarchy text entries (chapter/...)
        //   - 1 empty file
        //   - 20 generated text files (generated/...)
        //
        // ⚠️ FROZEN — recompute with: node scripts/compute-combined-hash.mjs
        const FROZEN = 'e5029aba609bea502f31468a8e4e328c8912f350a69f7d6786e070a4e4ce6951';

        const realEntries = readdirSync(TEST_DATA_DIR)
            .filter(f => !f.startsWith('.'))
            .map(f => ({
                path: otsProtocol.normalizePath(`assets/${f}`),
                content: new Uint8Array(readFileSync(join(TEST_DATA_DIR, f))),
            }));

        const deepEntries = [
            makeEntry('chapter/01/scene/01.txt', '幕が上がる'),
            makeEntry('chapter/01/scene/02.txt', '主人公登場'),
            makeEntry('chapter/02/scene/01.txt', '転換'),
            makeEntry('README.md',               '# テスト'),
        ];

        const generatedEntries = Array.from({ length: 20 }, (_, i) =>
            makeEntry(`generated/file-${String(i).padStart(3, '0')}.txt`, `content of file ${i}`)
        );

        const all = [...realEntries, ...deepEntries, makeEmptyEntry('empty.txt'), ...generatedEntries];
        expect(all.length).toBe(31);
        expect(await hashEntries(all)).toBe(FROZEN);
    });

});
