# ots-proof

OpenTimestamps (OTS) v2 プロトコル実装と検証ツールです。

## 概要

- **`src/otsProtocol.ts`** — ハッシュアルゴリズム本体（CODE FREEZE）
- **`src/otsUtils.ts`** — スタンプ・アップグレード等のユーティリティ
- **`verifier/`** — ブラウザで動作するスタンドアロン検証ツール

## 検証ツールの使い方

```bash
git clone https://github.com/YOUR_USERNAME/ots-proof.git
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

## ライセンス

本リポジトリのコード（`src/`、`verifier/src/`）は **CC0 1.0 Universal** です。
詳細は [`LICENSE`](./LICENSE) を参照してください。

### サードパーティライセンス

本リポジトリには以下のサードパーティライブラリが含まれています。

| ファイル | ライブラリ | バージョン | ライセンス |
|---|---|---|---|
| `verifier/public/opentimestamps.min.js` | [javascript-opentimestamps](https://github.com/opentimestamps/javascript-opentimestamps) | 0.4.9 | LGPL-3.0-or-later |

LGPL-3.0 のライセンス全文は [`LICENSES/opentimestamps-LGPL-3.0.txt`](./LICENSES/opentimestamps-LGPL-3.0.txt) を参照してください。
