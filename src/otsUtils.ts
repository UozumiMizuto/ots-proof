import { otsProtocol, type OTSFileEntry } from './otsProtocol';

/**
 * Get the OpenTimestamps (OTS) global object defined by the library loaded via script tag.
 */
const getOts = () => (window as any).OpenTimestamps;

/**
 * OTS Registry structure for pending.json
 */
export type OTSPendingRegistry = Record<string, string | null>;

/**
 * OpenTimestamps utility functions for OTS v2.
 */
export const otsUtil = {
    /**
     * Calculate SHA-256 hash of the content.
     */
    async calculateHash(content: string | Uint8Array): Promise<Uint8Array> {
        const data = typeof content === 'string' ? new TextEncoder().encode(content) : content;
        return await otsProtocol.calculateHash(data);
    },

    /**
     * Convert Uint8Array to hex string.
     */
    bytesToHex(bytes: Uint8Array): string {
        return otsProtocol.bytesToHex(bytes);
    },

    /**
     * Convert hex string to Uint8Array.
     */
    hexToBytes(hex: string): Uint8Array {
        return otsProtocol.hexToBytes(hex);
    },

    /**
     * Ensure OTS directory hierarchy exists.
     */
    async ensureOtsDir(fs: any): Promise<void> {
        const dirs = ['/.tool', '/.tool/settings', '/.tool/settings/ots'];
        for (const dir of dirs) {
            try {
                await fs.promises.mkdir(dir);
            } catch (e) {
                // Ignore if exists
            }
        }
    },

    /**
     * Recursively get all files in the repository, excluding .git and .tool/settings/ots/.
     */
    async getAllFilesRecursive(fs: any, dir: string): Promise<string[]> {
        const subdirs = await fs.promises.readdir(dir);
        const files: string[] = [];

        for (const subdir of subdirs) {
            const path = dir === '/' ? `/${subdir}` : `${dir}/${subdir}`;

            // Exclude .git and .tool/settings/ots/
            if (subdir === '.git') continue;
            if (path === '/.tool/settings/ots' || path === '.tool/settings/ots') continue;

            const stat = await fs.promises.stat(path);
            if (stat.type === 'dir') {
                const subfiles = await this.getAllFilesRecursive(fs, path);
                files.push(...subfiles);
            } else {
                files.push(path);
            }
        }
        return files;
    },

    /**
     * Generate a repository-wide SHA-256 hash using the TLV format defined in OTS v2.
     */
    async generateRepoHash(fs: any, dir: string = '/'): Promise<Uint8Array> {
        // 1. Get all files
        const allFiles = await this.getAllFilesRecursive(fs, dir);

        // 2. Filter out OTS directory itself
        const targets = allFiles.filter(f => !f.includes('/.tool/settings/ots/') && !f.includes('/.git/'));

        // 3. Normalized entries
        const entries: OTSFileEntry[] = await Promise.all(
            targets.map(async (f) => {
                return {
                    path: otsProtocol.normalizePath(f),
                    content: (await fs.promises.readFile(f)) as Uint8Array,
                };
            })
        );

        // 4. Sort and Concat
        const sorted = otsProtocol.sortEntries(entries);
        const allBytes = otsProtocol.generateTlvBytes(sorted);

        // 5. Final SHA-256
        return await otsProtocol.calculateHash(allBytes);
    },

    /**
     * Create a timestamp for the given hash.
     * Returns the serialized .ots file content.
     */
    async stampHash(hash: Uint8Array): Promise<Uint8Array> {
        const ots = getOts();
        const detached = ots.DetachedTimestampFile.fromHash(new (ots.Ops.OpSHA256)(), hash);
        await ots.stamp(detached);
        return detached.serializeToBytes();
    },

    /**
     * Attempt to upgrade all pending OTS timestamps.
     */
    async upgradeAll(fs: any): Promise<{ confirmedHashes: string[] }> {
        const otsPath = '/.tool/settings/ots';
        const pendingJsonPath = `${otsPath}/pending.json`;
        const confirmedHashes: string[] = [];

        await this.ensureOtsDir(fs);

        let registry: OTSPendingRegistry = {};
        try {
            const content = await fs.promises.readFile(pendingJsonPath, 'utf8');
            registry = JSON.parse(content as string);
        } catch (e) {
            return { confirmedHashes };
        }

        const now = Date.now();
        const twoHours = 2 * 60 * 60 * 1000;
        const upgradeResults: Record<string, string | null | 'DELETED'> = {};
        let changedAny = false;

        const entries = Object.entries(registry);
        if (entries.length === 0) return { confirmedHashes };

        console.log(`[OTS] Checking ${entries.length} pending timestamps...`);

        for (const [hash, lastAttempt] of entries) {
            const shouldTry = !lastAttempt || (now - new Date(lastAttempt).getTime() >= twoHours);

            if (shouldTry) {
                const filePath = `${otsPath}/${hash}.ots`;
                try {
                    const otsData = await fs.promises.readFile(filePath) as Uint8Array;
                    const ots = getOts();
                    if (!ots) throw new Error('OpenTimestamps library not loaded');

                    const attemptTime = new Date().toISOString();
                    upgradeResults[hash] = attemptTime;
                    changedAny = true;

                    const detached = ots.DetachedTimestampFile.deserialize(otsData);

                    const changed = await Promise.race([
                        ots.upgrade(detached),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('OTS upgrade timeout')), 30000)
                        ),
                    ]) as boolean;

                    if (changed) {
                        const updatedBytes = detached.serializeToBytes();
                        await fs.promises.writeFile(filePath, updatedBytes);
                        console.log(`[OTS] Confirmed: ${hash}`);
                        upgradeResults[hash] = 'DELETED';
                        confirmedHashes.push(hash);
                    }
                } catch (err) {
                    console.error(`[OTS] Failed to upgrade ${hash}:`, err);
                }
            }
        }

        if (changedAny) {
            try {
                let latestContent = '{}';
                try {
                    latestContent = await fs.promises.readFile(pendingJsonPath, 'utf8') as string;
                } catch (e) { /* ignore missing */ }

                const latestRegistry: OTSPendingRegistry = JSON.parse(latestContent);
                const mergedRegistry = { ...latestRegistry };

                for (const [hash, result] of Object.entries(upgradeResults)) {
                    if (result === 'DELETED') {
                        delete mergedRegistry[hash];
                    } else {
                        mergedRegistry[hash] = result;
                    }
                }

                await this.ensureOtsDir(fs);
                await fs.promises.writeFile(pendingJsonPath, JSON.stringify(mergedRegistry, null, 2), 'utf8');
                console.log('[OTS] Registry updated successfully.');
            } catch (saveErr) {
                console.error('[OTS] Failed to save merged registry:', saveErr);
            }
        }

        return { confirmedHashes };
    },

    /**
     * Get human readable info string from an OTS file.
     */
    getInfo(otsData: Uint8Array): string {
        const ots = getOts();
        const detached = ots.DetachedTimestampFile.deserialize(otsData);
        return ots.info(detached);
    },
};
