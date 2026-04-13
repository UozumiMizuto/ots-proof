# ots-proof

[![CI](https://github.com/UozumiMizuto/ots-proof/actions/workflows/ci.yml/badge.svg?event=push)](https://github.com/UozumiMizuto/ots-proof/actions/workflows/ci.yml)

**Master:** https://github.com/UozumiMizuto/ots-proof
**Mirror:** https://gitlab.com/UozumiMizuto/ots-proof

---

小説・シナリオ執筆ツール「[書いてんか](https://github.com/UozumiMizuto/StoryWritingTool)」における OpenTimestamps (OTS) を用いたファイル存在証明の透明性確保のために切り出したリポジトリです。

「書いてんか」はリポジトリに含まれるすべての文章・画像・データベースをローカル上でハッシュ化し、そのハッシュ値を Bitcoin ブロックチェーンにタイムスタンプとして刻みます。本リポジトリはそのハッシュ化のアルゴリズムと検証ツールを公開・管理します。

**現在のバージョン:** v1.0.0

## 概要

- **`src/otsProtocol.ts`** — ハッシュアルゴリズム本体（CODE FREEZE）
- **`src/otsUtils.ts`** — スタンプ・アップグレード等のユーティリティ
- **`verifier/`** — ブラウザで動作するスタンドアロン検証ツール

## 検証ツールの使い方

```bash
git clone https://github.com/UozumiMizuto/ots-proof.git
cd ots-proof
npm install
npm run dev
```

ブラウザで `http://localhost:5173` を開き、ZIP ファイルと .ots ファイルを選択してください。

## テスト

```bash
npm test
```

プロトコルのアルゴリズムが変更されていないことを回帰テストで検証します。
テストが失敗した場合、過去に発行された全 .ots 証明が無効になる可能性があります。

## 依存ライブラリ

| ライブラリ | 用途 | 備考 |
|---|---|---|
| [opentimestamps](https://github.com/opentimestamps/javascript-opentimestamps) | Bitcoin タイムスタンプの発行・検証 | ブラウザ用ビルドを同梱 (`verifier/public/`) |
| [@isomorphic-git/lightning-fs](https://github.com/isomorphic-git/lightning-fs) | 仮想ファイルシステム経由のリポジトリ読み取り | `otsUtils.ts` が使用 |
| [jszip](https://github.com/Stuk/jszip) | 検証ツールでの ZIP 展開 | `verifier/` が使用 |

## ライセンス

本リポジトリのコード（`src/`、`verifier/src/`）は **CC0 1.0 Universal** です。
詳細は [`LICENSE`](./LICENSE) を参照してください。

### サードパーティライセンス

本リポジトリには以下のサードパーティライブラリが含まれています。

| ファイル | ライブラリ | バージョン | ライセンス |
|---|---|---|---|
| `verifier/public/opentimestamps.min.js` | [javascript-opentimestamps](https://github.com/opentimestamps/javascript-opentimestamps) | 0.4.9 | LGPL-3.0-or-later |

LGPL-3.0 のライセンス全文は [`LICENSES/opentimestamps-LGPL-3.0.txt`](./LICENSES/opentimestamps-LGPL-3.0.txt) を参照してください。
 