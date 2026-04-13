/**
 * ============================================================================
 * PROTOCOL REGRESSION TESTS
 * ============================================================================
 * These tests guard against accidental changes to the OTS v2 hashing protocol.
 *
 * ⚠️  IF ANY TEST HERE FAILS, it means otsProtocol.ts has been modified.
 *     This would silently invalidate ALL existing .ots proof files.
 *     Do NOT modify expected values — fix the implementation instead.
 * ============================================================================
 */
import { describe, it, expect } from 'vitest';
import { otsProtocol, OTS_PROTOCOL_TEST_VECTORS } from './otsProtocol';

describe('OTS Protocol — regression (CODE FREEZE)', () => {

    it('calculateHash: SHA-256 of "hello world" must match frozen value', async () => {
        const { input, expectedHex } = OTS_PROTOCOL_TEST_VECTORS.calculateHash;
        const bytes = new TextEncoder().encode(input);
        const hash = await otsProtocol.calculateHash(bytes);
        expect(otsProtocol.bytesToHex(hash)).toBe(expectedHex);
    });

    it('normalizePath: strips leading slash and dot-slash', () => {
        expect(otsProtocol.normalizePath('/foo/bar.txt')).toBe('foo/bar.txt');
        expect(otsProtocol.normalizePath('./foo/bar.txt')).toBe('foo/bar.txt');
        expect(otsProtocol.normalizePath('foo/bar.txt')).toBe('foo/bar.txt');
        expect(otsProtocol.normalizePath('\\foo\\bar.txt')).toBe('foo/bar.txt');
    });

    it('sortEntries: sorts by path lexicographically', () => {
        const entries = [
            { path: 'z.txt', content: new Uint8Array() },
            { path: 'a.txt', content: new Uint8Array() },
            { path: 'm.txt', content: new Uint8Array() },
        ];
        const sorted = otsProtocol.sortEntries(entries);
        expect(sorted.map(e => e.path)).toEqual(['a.txt', 'm.txt', 'z.txt']);
    });

    it('generateRepoHash: two-file TLV hash must match frozen value', async () => {
        const { files, expectedHex } = OTS_PROTOCOL_TEST_VECTORS.generateRepoHash;
        const encoder = new TextEncoder();

        const entries = files.map(f => ({
            path: f.path,
            content: encoder.encode(f.content),
        }));
        // entries in this test vector are already sorted
        const tlvBytes = otsProtocol.generateTlvBytes(entries);
        const hash = await otsProtocol.calculateHash(tlvBytes);
        expect(otsProtocol.bytesToHex(hash)).toBe(expectedHex);
    });

    it('bytesToHex / hexToBytes: round-trip', () => {
        const original = new Uint8Array([0x00, 0xab, 0xff, 0x12]);
        const hex = otsProtocol.bytesToHex(original);
        expect(hex).toBe('00abff12');
        const back = otsProtocol.hexToBytes(hex);
        expect(back).toEqual(original);
    });

});
