import { otsProtocol, type OTSFileEntry } from '../../src/otsProtocol';
import JSZip from 'jszip';

/**
 * OpenTimestamps global object defined by the external library.
 */
declare const OpenTimestamps: any;

const zipInput = document.getElementById('zip-file') as HTMLInputElement;
const otsInput = document.getElementById('ots-file') as HTMLInputElement;
const zipDropzone = document.getElementById('zip-dropzone') as HTMLElement;
const otsDropzone = document.getElementById('ots-dropzone') as HTMLElement;
const zipLabel = document.getElementById('zip-label') as HTMLElement;
const otsLabel = document.getElementById('ots-label') as HTMLElement;
const verifyBtn = document.getElementById('verify-btn') as HTMLButtonElement;

let selectedZip: File | null = null;
let selectedOts: File | null = null;

/**
 * Update the verification button state based on file selection.
 */
function checkReady() {
    verifyBtn.disabled = !(selectedZip && selectedOts);
}

/**
 * Setup drag & drop and click listeners for file inputs.
 */
function setupInput(inputEl: HTMLInputElement, dropzoneEl: HTMLElement, labelEl: HTMLElement, ext: string, onSelect: (file: File) => void) {
    dropzoneEl.addEventListener('click', () => inputEl.click());

    inputEl.addEventListener('change', (e: any) => {
        if (e.target.files.length > 0) processFile(e.target.files[0]);
    });

    dropzoneEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzoneEl.classList.add('dragover');
    });
    dropzoneEl.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropzoneEl.classList.remove('dragover');
    });
    dropzoneEl.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzoneEl.classList.remove('dragover');
        if (e.dataTransfer?.files.length) processFile(e.dataTransfer.files[0]);
    });

    function processFile(file: File) {
        if (!file.name.toLowerCase().endsWith(ext)) {
            alert(`拡張子が ${ext} のファイルを選択してください。`);
            return;
        }
        labelEl.textContent = file.name;
        labelEl.classList.add('text-blue-600', 'font-bold');
        onSelect(file);
        checkReady();
    }
}

if (zipInput && otsInput && zipDropzone && otsDropzone && zipLabel && otsLabel && verifyBtn) {
    setupInput(zipInput, zipDropzone, zipLabel, '.zip', f => selectedZip = f);
    setupInput(otsInput, otsDropzone, otsLabel, '.ots', f => selectedOts = f);

    verifyBtn.addEventListener('click', async () => {
        if (!selectedZip || !selectedOts) return;

        try {
            verifyBtn.disabled = true;
            verifyBtn.textContent = '計算中...';

            const resultArea = document.getElementById('result-area') as HTMLElement;
            const logEl = document.getElementById('log') as HTMLElement;
            const matchStatus = document.getElementById('match-status') as HTMLElement;
            const repoHashEl = document.getElementById('repo-hash') as HTMLElement;
            const otsHashEl = document.getElementById('ots-hash') as HTMLElement;

            resultArea.classList.remove('hidden');
            logEl.textContent = 'ZIPファイルを展開し、ハッシュを計算中...\n';
            matchStatus.className = 'p-4 rounded-lg mb-4 font-bold text-center bg-gray-200 text-gray-700';
            matchStatus.textContent = '計算中...';
            repoHashEl.textContent = '-';
            otsHashEl.textContent = '-';

            // 1. Read ZIP via JSZip
            const zipData = await selectedZip.arrayBuffer();
            const zipBuffer = await JSZip.loadAsync(zipData);

            // 2. Collect RAW paths
            const pathsRaw: { path: string; zipEntry: any }[] = [];
            zipBuffer.forEach((relativePath, zipEntry) => {
                if (zipEntry.dir) return;
                // Use the same normalization logic as the main tool
                let path = otsProtocol.normalizePath(relativePath);
                pathsRaw.push({ path, zipEntry });
            });

            // --- Root directory detection (GitHub ZIPs usually have a single root folder) ---
            let commonPrefix = '';
            if (pathsRaw.length > 0) {
                const firstParts = pathsRaw[0].path.split('/');
                if (firstParts.length > 1) {
                    const potentialPrefix = firstParts[0] + '/';
                    const allHavePrefix = pathsRaw.every(p => p.path.startsWith(potentialPrefix));
                    if (allHavePrefix) {
                        commonPrefix = potentialPrefix;
                    }
                }
            }

            // 3. Filter & Normalize entries using the shared otsProtocol
            const entries: OTSFileEntry[] = [];
            for (const item of pathsRaw) {
                let path = item.path;
                if (commonPrefix && path.startsWith(commonPrefix)) {
                    path = path.substring(commonPrefix.length);
                }

                // Strict exclusion logic matching otsUtil.generateRepoHash in ots.ts
                if (path === '.git' || path.startsWith('.git/') || path.includes('/.git/')) continue;
                if (path.startsWith('.tool/settings/ots/') || path.includes('/.tool/settings/ots/')) continue;

                const content = await item.zipEntry.async('uint8array');
                entries.push({
                    path: otsProtocol.normalizePath(path),
                    content
                });
            }

            // 4. Sort and generate TLV bytes using shared logic
            const sorted = otsProtocol.sortEntries(entries);
            const allBytes = otsProtocol.generateTlvBytes(sorted);

            if (commonPrefix) {
                logEl.textContent += `※ルートディレクトリ '${commonPrefix}' を検出したため自動除外しました。\n`;
            }
            logEl.textContent += `対象ファイル数: ${sorted.length} 件\nTLV連結中...\n\n`;
            logEl.textContent += `[ハッシュ計算対象ファイル (全件・ソート済み)]\n`;
            for (const entry of sorted) {
                logEl.textContent += `  - ${entry.path} (${entry.content.byteLength} bytes)\n`;
            }
            logEl.textContent += `\n`;

            // 5. Final SHA-256 calculation using shared logic
            const hashBytes = await otsProtocol.calculateHash(allBytes);
            const calculatedHash = otsProtocol.bytesToHex(hashBytes).toLowerCase();

            const targetHash = selectedOts.name.replace(/\.ots$/i, '').toLowerCase();

            repoHashEl.textContent = calculatedHash;
            otsHashEl.textContent = targetHash;

            // 6. Verify Match
            const scopeEl = document.getElementById('verification-scope') as HTMLElement;
            if (calculatedHash === targetHash) {
                matchStatus.className = 'p-4 rounded-lg mb-4 font-bold text-center bg-green-100 text-green-800 border border-green-300';
                matchStatus.textContent = '✅ ZIP内容とOTS証明対象のハッシュが完全に一致しました！';
                logEl.textContent += `✓ ハッシュ一致: ${calculatedHash}\n\n`;
                scopeEl.classList.remove('hidden');
            } else {
                matchStatus.className = 'p-4 rounded-lg mb-4 font-bold text-center bg-red-100 text-red-800 border border-red-300';
                matchStatus.textContent = '❌ ハッシュ不一致: ZIPファイルの内容が改ざんされているか、バージョンが異なります。';
                logEl.textContent += `!! 不一致 !!\n計算結果: ${calculatedHash}\nOTS名指定: ${targetHash}\n\n`;
                scopeEl.classList.add('hidden');
            }

            // 7. OTS Library Info display
            logEl.textContent += `--- OTSファイルの解析 ---\n`;
            const otsDataBuf = await selectedOts.arrayBuffer();
            const otsBytes = new Uint8Array(otsDataBuf);

            if (typeof OpenTimestamps !== 'undefined') {
                try {
                    const detached = OpenTimestamps.DetachedTimestampFile.deserialize(otsBytes);
                    const infoStr = OpenTimestamps.info(detached);
                    logEl.textContent += infoStr;

                    // --- Detailed UI Update ---
                    const detailsArea = document.getElementById('details-area') as HTMLElement;
                    const statusEl = document.getElementById('ots-status') as HTMLElement;
                    const heightRow = document.getElementById('row-block-height') as HTMLElement;
                    const heightEl = document.getElementById('ots-block-height') as HTMLElement;
                    const timeRow = document.getElementById('row-block-time') as HTMLElement;
                    const timeEl = document.getElementById('ots-block-time') as HTMLElement;
                    const txRow = document.getElementById('row-tx-ids') as HTMLElement;
                    const txEl = document.getElementById('ots-tx-ids') as HTMLElement;
                    const cryptoVerifyRow = document.getElementById('row-crypto-verify') as HTMLElement;
                    const cryptoVerifyEl = document.getElementById('ots-crypto-verify') as HTMLElement;
                    const upgradeArea = document.getElementById('upgrade-area') as HTMLElement;

                    detailsArea.classList.remove('hidden');

                    // info() actual format:
                    //   verify BitcoinBlockHeaderAttestation(941927)
                    //   # Bitcoin block merkle root 9e4a365a...
                    const heightMatch = infoStr.match(/BitcoinBlockHeaderAttestation\((\d+)\)/i);
                    const merkleRootMatch = infoStr.match(/# Bitcoin block merkle root ([a-f0-9]{64})/i);

                    // Extract transaction IDs that carry the OTS commitment (OP_RETURN)
                    // Only include txids from confirmed branches (followed by BitcoinBlockHeaderAttestation)
                    const confirmedTxIds: string[] = [];
                    const txPattern = /# transaction id ([a-f0-9]{64})/gi;
                    let txMatch;
                    while ((txMatch = txPattern.exec(infoStr)) !== null) {
                        const txid = txMatch[1];
                        // Find the text after this txid and check if it leads to a confirmed attestation
                        const afterTx = infoStr.slice(txMatch.index);
                        const nextAttestation = afterTx.match(/verify (BitcoinBlockHeaderAttestation|PendingAttestation)/i);
                        if (nextAttestation && nextAttestation[1].toLowerCase().includes('bitcoin')) {
                            confirmedTxIds.push(txid);
                        }
                    }

                    // Confirmed if we found a block height attestation
                    if (heightMatch) {
                        const blockHeight = heightMatch[1];

                        statusEl.textContent = '✅ ビットコイン・ブロックチェーン上で確定済み';
                        statusEl.className = 'p-3 font-semibold text-green-700';

                        heightRow.classList.remove('hidden');
                        heightEl.textContent = blockHeight;

                        timeRow.classList.add('hidden');

                        if (confirmedTxIds.length > 0) {
                            txRow.classList.remove('hidden');
                            // Show placeholder while fetching OP_RETURN hashes
                            txEl.innerHTML = confirmedTxIds.map(txid =>
                                `<div class="mb-3" id="tx-entry-${txid.slice(0, 8)}">
                                    <div class="text-slate-400 text-xs mb-0.5">トランザクションID</div>
                                    <a href="https://chainflyer.bitflyer.com/Transaction/${txid}" target="_blank" rel="noopener noreferrer"
                                        class="text-blue-600 hover:underline break-all">${txid}</a>
                                    <div class="text-slate-400 text-xs mt-1 mb-0.5">OP_RETURN (ツリールートハッシュ)</div>
                                    <div id="opreturn-${txid.slice(0, 8)}" class="text-slate-400 italic">取得中...</div>
                                </div>`
                            ).join('');

                            // Fetch OP_RETURN hash for each txid from mempool.space API
                            for (const txid of confirmedTxIds) {
                                const shortId = txid.slice(0, 8);
                                const opReturnEl = document.getElementById(`opreturn-${shortId}`);
                                try {
                                    const resp = await fetch(`https://mempool.space/api/tx/${txid}`);
                                    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                                    const txData = await resp.json();
                                    const opReturnVout = txData.vout?.find((v: any) => v.scriptpubkey_type === 'op_return');
                                    if (opReturnVout && opReturnEl) {
                                        // scriptpubkey format: "6a20{32bytes}" — strip leading 6a20
                                        const raw = opReturnVout.scriptpubkey as string;
                                        const hash = raw.startsWith('6a20') ? raw.slice(4) : raw;
                                        opReturnEl.className = 'font-mono break-all text-slate-800';
                                        opReturnEl.textContent = hash;
                                    } else if (opReturnEl) {
                                        opReturnEl.textContent = '(OP_RETURN出力が見つかりません)';
                                    }
                                } catch (e: any) {
                                    if (opReturnEl) opReturnEl.textContent = `取得失敗: ${e.message}`;
                                }
                            }
                        } else {
                            txRow.classList.add('hidden');
                        }

                        // Cryptographic verify: recompute the full proof path and check against Bitcoin
                        cryptoVerifyRow.classList.remove('hidden');
                        cryptoVerifyEl.innerHTML = '<span class="text-slate-400 italic">検証中 (ネットワーク通信)...</span>';
                        try {
                            const detachedForVerify = OpenTimestamps.DetachedTimestampFile.deserialize(otsBytes);
                            const hashDetached = OpenTimestamps.DetachedTimestampFile.fromHash(
                                new OpenTimestamps.Ops.OpSHA256(), hashBytes
                            );
                            const verifyResult = await Promise.race([
                                OpenTimestamps.verify(detachedForVerify, hashDetached),
                                new Promise<never>((_, rej) => setTimeout(() => rej(new Error('タイムアウト (30秒)')), 30000))
                            ]);
                            // verify() returns a map of { unixTimestamp: attestationType } when confirmed
                            const entries = verifyResult ? Object.entries(verifyResult) : [];
                            if (entries.length > 0) {
                                cryptoVerifyEl.innerHTML = entries.map(([ts, type]) => {
                                    const date = new Date(Number(ts) * 1000).toLocaleString('ja-JP');
                                    return `<span class="text-green-700 font-semibold">✅ 検証成功</span><br>
                                            <span class="text-xs text-slate-600">OTSの操作列を辿った結果がBitcoinブロックチェーン上の記録と一致しました</span><br>
                                            <span class="text-xs text-slate-500">承認時刻: ${date} (${type})</span>`;
                                }).join('<br>');
                            } else {
                                cryptoVerifyEl.innerHTML = '<span class="text-amber-600">⚠️ verify() は空の結果を返しました (Pending の可能性)</span>';
                            }
                        } catch (verifyErr: any) {
                            cryptoVerifyEl.innerHTML = `<span class="text-red-600 font-semibold">❌ 検証失敗</span><br>
                                <span class="text-xs text-slate-500">${verifyErr.message}</span>`;
                        }

                        upgradeArea.classList.add('hidden');
                    } else {
                        // Check if it's explicitly pending or just missing Bitcoin info
                        const isPending = infoStr.toLowerCase().includes('pending');
                        statusEl.textContent = isPending ? '⏳ 承認待ち (Pending)' : '❓ 未アップグレード または 解析不可';
                        statusEl.className = 'p-3 font-semibold text-amber-600';
                        heightRow.classList.add('hidden');
                        timeRow.classList.add('hidden');
                        txRow.classList.add('hidden');
                        cryptoVerifyRow.classList.add('hidden');
                        upgradeArea.classList.remove('hidden');
                    }
                } catch (err: any) {
                    logEl.textContent += `OTSファイルの解析に失敗しました: ${err.message}\n`;
                }
            } else {
                logEl.textContent += `OpenTimestamps ライブラリがロードされていません。\n`;
            }

        } catch (err: any) {
            alert('エラーが発生しました: ' + err.message);
            console.error(err);
        } finally {
            verifyBtn.textContent = '検証を実行する';
            verifyBtn.disabled = false;
        }
    });
}
