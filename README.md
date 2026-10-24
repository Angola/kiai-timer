# Kiai Timer 気合

オフラインで動くインターバル／ワークアウトタイマー（PWA）。Tabata・HIIT・サーキット・ボクシングラウンドなどを自由に組んで使えます。

An offline-first interval & workout timer PWA. Build Tabata, HIIT, circuits or boxing rounds and run them with sound, voice and vibration cues.

## 機能 / Features

- ワークアウト作成：ワーク／休憩インターバルを好きな数だけ並べ、ラウンド・セット・セット間休憩・準備・クールダウンを設定
- プリセット：Tabata / HIIT 40/20 / Full Body Circuit / Boxing Rounds / EMOM 10（複製して編集可）
- 実行画面：大きなカウントダウン、進捗リング、フェーズごとの色、次のインターバル表示、全体の経過／残り
- 3-2-1 のビープ、フェーズ切替音、音声ガイド（日本語／英語）、バイブレーション
- 画面スリープ防止（Screen Wake Lock API）
- タイマーは実時刻ベースなので、タブがバックグラウンドで間引かれてもズレない
- 履歴、JSON でのバックアップ書き出し／読み込み
- 日本語／英語 UI、ホーム画面に追加してアプリとして使用可能、完全オフライン動作

## 使い方 / Usage

公開版を開いて「ホーム画面に追加」→ アプリとして起動。

ローカル開発:

```sh
npm start      # http://localhost:5173/ (依存パッケージなし)
npm test       # node:test によるユニットテスト
npm run icons  # PNG アイコンを再生成
```

## セキュリティ / Security

- **ランタイム依存ゼロ、開発依存ゼロ。** npm パッケージは一切使っていません（テストは `node:test`、開発サーバとアイコン生成も Node 標準モジュールのみ）。サプライチェーンのリスクを最小化しています。
- 厳格な Content-Security-Policy（`default-src 'none'`、`script-src 'self'`、インラインスクリプト／スタイルなし、外部オリジンなし）。
- DOM は `textContent` / `createElement` のみで構築し、`innerHTML` を使わないためユーザー入力経由の XSS を防止。
- localStorage や読み込んだバックアップの値はすべてスキーマ検証・型変換・長さ／範囲制限を通してから使用（`app/js/model.js`）。
- 通信なし：データは端末内にのみ保存され、解析・広告・外部 API はありません。
- GitHub Actions はコミット SHA で固定し、ジョブごとに最小権限。Dependabot（14 日クールダウン付き）で更新。

GitHub Pages ではカスタム HTTP ヘッダを設定できないため、CSP は `<meta>` で指定しています（`frame-ancestors` は meta では効かない点に注意）。

## 構成 / Structure

```
app/            公開される静的ファイル（GitHub Pages にそのままデプロイ）
  js/engine.js  タイムライン生成と実時刻ベースのランナー（DOM 非依存）
  js/model.js   データの検証・サニタイズ
  js/app.js     UI
  sw.js         Service Worker（オフラインキャッシュ）
test/           ユニットテスト
tools/          開発サーバ・アイコン生成
```

## iOS に関する注意

iOS の PWA は画面ロック中に JavaScript が停止するため、ロック中の音声キューは鳴りません。実行中は画面スリープ防止を有効にしてください（設定でオン）。復帰時はタイマー位置が実時刻から正しく再計算されます。

## License

MIT
