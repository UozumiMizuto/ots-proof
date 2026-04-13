/**
 * ============================================================================
 * 🧊 CODE FREEZE: OTS PROTOCOL ALGORITHM
 * ============================================================================
 * ⚠️ WARNING: DO NOT MODIFY THIS FILE.
 *
 * This file contains the core hashing protocol for OpenTimestamps (OTS) v2.
 * The output hash depends strictly on the implementation details herein
 * (path normalization, sorting, TLV structure, etc.).
 *
 * CHANGING EVEN A SINGLE BYTE OF THIS LOGIC WILL INVALIDATE ALL PAST
 * AND FUTURE .ots PROOFS CREATED BY THIS TOOL.
 *
 * If you must update the hashing mechanism for future revisions, DO NOT modify this
 * file. Instead, create a new versioned file (e.g., `otsProtocolV3.ts`) and ensure
 * the application can support multiple versions of the protocol simultaneously.
 * ============================================================================
 */

export interface OTSFileEntry {
    path: string;
    content: Uint8Array;
}

export const otsProtocol = {
    /**
     * Normalize path for OTS calculation: NFC, forward slashes, no leading dot/slash.
     */
    normalizePath(path: string): string {
        let p = path.normalize('NFC').replace(/\\/g, '/');
        if (p.startsWith('./')) p = p.slice(2);
        if (p.startsWith('/')) p = p.slice(1);
        return p;
    },

    /**
     * Sort file entries by their normalized paths.
     */
    sortEntries(entries: OTSFileEntry[]): OTSFileEntry[] {
        return [...entries].sort((a, b) => a.path.localeCompare(b.path));
    },

    /**
     * Generate the TLV (Type-Length-Value) byte concatenation for a list of files.
     * entries MUST be sorted and paths MUST be normalized before calling this.
     */
    generateTlvBytes(entries: OTSFileEntry[]): Uint8Array {
        const parts: Uint8Array[] = [];
        const encoder = new TextEncoder();

        for (const entry of entries) {
            const pathBytes = encoder.encode(entry.path);

            // uint64 big-endian length for path
            const pathLenBuf = new ArrayBuffer(8);
            new DataView(pathLenBuf).setBigUint64(0, BigInt(pathBytes.byteLength), false);

            // uint64 big-endian length for content
            const contentLenBuf = new ArrayBuffer(8);
            new DataView(contentLenBuf).setBigUint64(0, BigInt(entry.content.byteLength), false);

            parts.push(new Uint8Array(pathLenBuf));
            parts.push(pathBytes);
            parts.push(new Uint8Array(contentLenBuf));
            parts.push(entry.content);
        }

        const totalSize = parts.reduce((acc, p) => acc + p.byteLength, 0);
        const allBytes = new Uint8Array(totalSize);
        let offset = 0;
        for (const p of parts) {
            allBytes.set(p, offset);
            offset += p.byteLength;
        }
        return allBytes;
    },

    /**
     * Calculate SHA-256 hash of the given bytes.
     */
    async calculateHash(bytes: Uint8Array): Promise<Uint8Array> {
        const hashBuffer = await crypto.subtle.digest('SHA-256', bytes as any);
        return new Uint8Array(hashBuffer);
    },

    /**
     * Convert bytes to hex string.
     */
    bytesToHex(bytes: Uint8Array): string {
        return Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
    },

    /**
     * Convert hex string to Uint8Array.
     */
    hexToBytes(hex: string): Uint8Array {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
            bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
        }
        return bytes;
    },
};

/**
 * ============================================================================
 * PROTOCOL TEST VECTORS
 * ============================================================================
 * These values are the ground truth for the OTS v2 protocol.
 * If any test using these vectors fails, it means the protocol has been
 * accidentally modified and ALL existing OTS proofs may be invalidated.
 * ============================================================================
 */
export const OTS_PROTOCOL_TEST_VECTORS = {
    /**
     * calculateHash of UTF-8("hello world") via WebCrypto SHA-256.
     * Verify with:
     *   node -e "require('crypto').webcrypto.subtle.digest('SHA-256',
     *     new TextEncoder().encode('hello world'))
     *     .then(b => console.log(Buffer.from(b).toString('hex')))"
     */
    calculateHash: {
        input: 'hello world',
        expectedHex: 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    },
    /**
     * Two-file repo TLV → SHA-256.
     * Files: file1.txt("content1"), dir1/file2.txt("content2") — sorted by path.
     * This is the canonical multi-file hash used in all integration tests.
     */
    generateRepoHash: {
        files: [
            { path: 'dir1/file2.txt', content: 'content2' },
            { path: 'file1.txt',      content: 'content1' },
        ],
        expectedHex: '62cbc8b6eace0c96a3e01e2e2b3b5e741cdd1db9aa90131ab0662b5958f5e8ad',
    },
} as const;
