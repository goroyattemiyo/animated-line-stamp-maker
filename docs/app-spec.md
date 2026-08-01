# アプリケーション仕様

## 1. 文書の位置づけ

この文書を、アプリ本体の要件・設計・実装判断・受け入れ基準の正本とする。

画面ごとの細かな説明や画像処理ごとの設計書を別ファイルへ分割せず、原則として本書へ追記する。開発手順だけは `docs/roadmap.md`、GPT側の出力契約は `docs/gpt-spec.md` で管理する。

## 2. 目的

専用GPTなどで生成された「横4列×縦2行・合計8フレーム」のPNGシートを読み込み、LINEアニメーションスタンプ用のAPNGへ、再現可能かつ非破壊で整形する。

本アプリが担当する範囲は次のとおり。

- 入力PNGの検査
- 4列×2行への分割
- 分割境界の手動修正
- 位置合わせマーカー領域の除外
- 全フレーム共通キャンバスの生成
- フレームごとの位置調整
- フレーム順・表示時間・ループ設定
- 透明背景を含むプレビュー
- LINE向けサイズへの変換
- APNG生成
- 生成したAPNGの再検査
- プロジェクト保存

## 3. 対象外

MVPでは次を行わない。

- キャラクター画像そのもののAI生成
- 欠損した手や顔の修復
- AIによるフレーム補間
- 高度な背景除去
- LINE Creators Marketへの自動アップロード
- 8個・16個・24個セット全体の管理
- macOS・Linuxの正式サポート
- クラウド保存

入力画像のキャラクター崩れや作画不整合は、原則としてGPT側で再生成する。アプリは機械的に再現できる整形へ責任範囲を限定する。

## 4. 設計原則

### 4.1 非破壊

元画像を上書きしない。編集内容は設定値として保持し、表示・書き出し時に画像処理パイプラインへ適用する。

### 4.2 決定的処理

同じ入力画像、同じ設定、同じアプリバージョンでは、同じフレーム順・寸法・画素・再生時間の出力を得られることを目標とする。

### 4.3 固定グリッド優先

トンボやマーカーの認識を前提条件にしない。

```text
固定4列×2行
  ↓
必要な場合だけ境界を手動補正
  ↓
将来、マーカー検出で補正候補を提示
```

### 4.4 自動補正を勝手に適用しない

画像生成時の位置ずれと、意図した身体の動きは区別しにくい。自動位置合わせは候補表示までとし、MVPでは手動補正を主とする。

### 4.5 書き出し後に再検査する

設定値が正しくても、APNGエンコーダの結果が同じとは限らない。出力ファイルをPNGチャンクおよびデコード結果から再検査し、検査に失敗したファイルは完成扱いにしない。

### 4.6 LINE仕様値を画像処理コードへ散在させない

寸法、容量、フレーム数、再生時間、ループ回数などは、1か所のルール定義へ集約する。

## 5. 想定ユーザー操作

```text
1. フレームシートPNGを開く
2. 4×2の分割結果を確認する
3. 必要なら境界線を動かす
4. トンボ除去範囲を確認する
5. 各フレームの位置を調整する
6. フレーム順・時間・ループを調整する
7. 白・黒・市松背景で再生確認する
8. LINE仕様チェックを確認する
9. APNGを書き出す
10. アプリが出力ファイルを再検査する
```

正常な入力では、手順2・3・4をほぼ確認だけで通過できる状態を目標とする。

## 6. アプリケーション構成

### 6.1 採用構成

- Electron
- electron-vite
- React
- TypeScript
- electron-builder
- Sharp
- APNGエンコーダはアダプター経由
- Vitest
- Playwright

Electron ForgeのVite連携は実験的扱いが続いているため、初期候補は `electron-vite + electron-builder` とする。ただし実装開始時に、WindowsビルドとSharpのネイティブ依存を含む最小構成を先に検証する。

### 6.2 プロセス分離

```text
Renderer
  React UI、編集状態、プレビュー操作
       │
       │ 型付きの限定API
       ▼
Preload
  contextBridge、引数検証
       │
       ▼
Main Process
  ファイルダイアログ、保存、ウィンドウ制御、処理ジョブ管理
       │
       ▼
Image Worker
  PNG復号、分割、解析、合成、リサイズ、APNG生成、再検査
```

画像処理をRendererで行わず、重い処理で画面操作が止まらないようにする。Image WorkerはNode.jsの `worker_threads` を第一候補とする。

### 6.3 Rendererの責任

- プロジェクト編集状態の表示
- ユーザー操作をActionへ変換
- サムネイル・プレビュー表示
- 検証結果の表示
- 未保存状態の管理

Rendererは任意パスの読み書き、Node.js APIの直接利用、APNGエンコードを行わない。

### 6.4 Main Processの責任

- ファイル選択ダイアログ
- 保存先選択ダイアログ
- 入出力パスの検証
- Image Workerの起動・停止・キャンセル
- 一時ファイルから完成ファイルへの原子的置換
- ウィンドウを閉じる際の未保存確認

### 6.5 Image Workerの責任

- 入力画像の署名・寸法・画素数・形式検査
- Sharpによる復号とRGBA化
- 4×2分割
- トリミングと共通キャンバス計算
- プレビュー用縮小画像作成
- 出力用フレームのレンダリング
- APNGエンコード
- APNG再検査

## 7. セキュリティとプライバシー

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- Rendererへ汎用的な `ipcRenderer.send` を公開しない
- IPCごとに専用メソッドを公開する
- IPCの送信元と引数をMain側で検証する
- 外部Webページ、`webview`、リモートJavaScriptを読み込まない
- Content Security Policyを設定する
- 画像を外部サーバーへ送信しない
- 主要処理は完全オフラインで動作する

入力画像は信頼できないデータとして扱い、次の上限を設定する。

- 入力ファイルサイズ初期上限: 50MB
- 入力総画素数初期上限: 64MP
- 幅・高さの最小値: 400px × 200px
- 復号エラー時は処理停止
- Sharpの安全制限を無効化しない

上限値は将来設定可能にしてもよいが、通常UIから無制限にはできないようにする。

## 8. ドメインモデル

将来の8個・16個・24個セット管理へ拡張できるよう、MVPでもプロジェクト内に `items` 配列を持つ。ただしMVPのUIでは1件だけを扱う。

```ts
type ProjectDocument = {
  schemaVersion: 1
  projectId: string
  createdAt: string
  updatedAt: string
  appVersion: string
  items: StickerItem[]
}

type StickerItem = {
  id: string
  name: string
  source: SourceImageReference
  grid: GridDefinition
  markerTrim: MarkerTrimDefinition
  frames: FrameDefinition[]
  canvas: CanvasDefinition
  animation: AnimationDefinition
  export: ExportDefinition
}
```

### 8.1 入力画像参照

```ts
type SourceImageReference = {
  path: string
  fileName: string
  sha256: string
  byteLength: number
  width: number
  height: number
  channels: number
  hasAlpha: boolean
  importedAt: string
}
```

プロジェクト再読込時にSHA-256を照合する。元画像が見つからない場合は、同じハッシュの画像を再指定できる。

### 8.2 グリッド

```ts
type GridDefinition = {
  columns: 4
  rows: 2
  order: 'row-major'
  xRatios: [number, number, number, number, number]
  yRatios: [number, number, number]
  manuallyAdjusted: boolean
}
```

初期値:

```ts
xRatios = [0, 0.25, 0.5, 0.75, 1]
yRatios = [0, 0.5, 1]
```

境界はピクセルではなく0〜1の正規化座標で保存し、元画像解像度が同じであれば再現できるようにする。

### 8.3 マーカー除去

```ts
type EdgeInsets = {
  top: number
  right: number
  bottom: number
  left: number
}

type MarkerTrimDefinition = {
  unit: 'ratio'
  global: EdgeInsets
  perFrameOverrides: Record<string, Partial<EdgeInsets>>
}
```

各値はセル短辺に対する比率とする。初期値は上下左右 `0.06`。

### 8.4 フレーム

```ts
type FrameDefinition = {
  id: string
  sourceCellIndex: number
  enabled: boolean
  manualOffsetX: number
  manualOffsetY: number
  durationMs: number
}
```

- `sourceCellIndex` は元シートの0〜7
- タイムラインで複製した場合、同じ `sourceCellIndex` を持つ別のFrameDefinitionを作成する
- 位置調整値は出力前スケールの作業キャンバス上のピクセル
- 表示時間は正の整数ミリ秒

### 8.5 キャンバス

```ts
type CanvasDefinition = {
  alphaThreshold: number
  paddingPx: number
  compositionMode: 'union-bounds'
}
```

初期値:

- `alphaThreshold`: 8
- `paddingPx`: 2
- `compositionMode`: `union-bounds`

### 8.6 アニメーション

```ts
type AnimationDefinition = {
  loopDurationMs: 1000 | 2000 | 3000 | 4000
  loopCount: 1 | 2 | 3 | 4
}
```

フレームの `durationMs` 合計と `loopDurationMs` は一致しなければならない。

### 8.7 出力

```ts
type ExportDefinition = {
  profileId: 'line-animated-sticker-v1'
  resizeKernel: 'lanczos3'
  colorMode: 'rgba8'
  optimization: 'lossless'
}
```

MVPでは色削減や非可逆圧縮を自動適用しない。

## 9. 編集状態

### 9.1 正本と派生データ

正本として保存するのはProjectDocumentだけとする。次は派生データであり保存しない。

- 分割後PNGバッファ
- サムネイル
- アルファ外接矩形
- 共通キャンバス寸法
- LINE出力寸法
- プレビュー画像
- 検証結果

派生データは、元画像ハッシュと関係する設定値からキャッシュキーを作成して再生成する。

### 9.2 Action方式

UI操作は直接オブジェクトを書き換えず、明示的なActionで更新する。

例:

```text
IMPORT_SOURCE
SET_GRID_BOUNDARY
SET_GLOBAL_MARKER_TRIM
SET_FRAME_MARKER_TRIM
SET_FRAME_OFFSET
REORDER_FRAMES
DUPLICATE_FRAME
REMOVE_FRAME
SET_FRAME_DURATION
SET_LOOP_DURATION
SET_LOOP_COUNT
SET_EXPORT_PROFILE
```

この方式により、Undo/Redoを後から追加できる。Undo履歴自体はプロジェクトファイルへ保存しない。

## 10. 入力処理

### 10.1 読み込み方法

- 「画像を開く」ボタン
- ドラッグ&ドロップ

どちらも最終的にはMain Processが実在パスとファイル種別を検証してからImage Workerへ渡す。

### 10.2 PNG検査

拡張子だけでは判定しない。

- PNG署名
- IHDRの存在
- 幅・高さ
- bit depth
- color type
- 復号可否
- alphaの有無

APNGを入力した場合はMVPでは拒否し、「フレームシートPNGを指定してください」と表示する。

### 10.3 透過なし入力

透過なしでも分割・プレビューは許可するが、LINE出力はエラー扱いとする。

MVPでは単色背景の自動除去を行わない。誤削除の危険が高いため、GPT側で透明背景を再生成する案内を優先する。

## 11. グリッド分割

### 11.1 初期境界

```text
x[i] = round(width  × xRatios[i])
y[i] = round(height × yRatios[i])
```

各セルは半開区間 `[x0, x1)`、`[y0, y1)` として扱う。これにより、全画素を重複・欠落なく8セルへ割り当てる。

### 11.2 手動境界調整

元画像上に縦3本・横1本の境界線を表示し、ドラッグ可能にする。

制約:

- 境界線の順序を入れ替えられない
- 各セルの幅・高さは画像全体の10%以上
- 移動中は低解像度プレビュー
- ドラッグ終了時に高解像度の分割結果を再生成
- 「均等へ戻す」で初期値へ戻せる

境界線をフレームごとに個別設定しない。シート全体で1組だけ持つ。

### 11.3 フレーム順

```text
01 02 03 04
05 06 07 08
```

内部は0始まり、UI・出力ファイル名は1始まりとする。

## 12. マーカー領域除去

### 12.1 方針

マーカーの画像認識ではなく、各セル外周を比率で除外する方式をMVPとする。

初期値:

- 上: 6%
- 右: 6%
- 下: 6%
- 左: 6%

選択肢:

- 0%
- 4%
- 6%
- 8%
- 数値入力

全フレーム共通値を基本とし、崩れたセルだけ個別上書きできる。

### 12.2 安全表示

- 除去領域を半透明オーバーレイ表示
- 残る領域を実線で表示
- 拡大表示可能
- 変更前後を切替可能

### 12.3 内容切断警告

L字マーカーがある四隅の小領域は警告判定から除外する。

提案した内側境界をまたぐ非透明画素が、四隅以外に存在する場合は「キャラクターまたは文字が切れる可能性」として警告する。

警告があってもユーザーは処理を続行できる。

## 13. 共通キャンバス生成

フレームを個別に最小トリミングすると、再生時に基準位置が変わる。必ず全フレーム共通の描画範囲を使用する。

処理順:

```text
セル切り出し
  ↓
マーカー領域除去
  ↓
フレームごとの手動オフセット適用
  ↓
各フレームのアルファ外接矩形を取得
  ↓
全フレームの外接矩形を合成
  ↓
安全余白を加える
  ↓
全フレームを同じキャンバスへ配置
```

### 13.1 アルファ閾値

初期値は `8 / 255` とする。

- 0に近い半透明ゴミを外接矩形へ含めにくくする
- 半透明の影や効果が消えないよう、画素自体は削除しない
- 閾値は外接矩形の計算だけに利用する

### 13.2 安全余白

初期値は2px。アンチエイリアスの端が切れないための最低限とし、大きな透明余白を自動追加しない。

## 14. 位置調整

### 14.1 MVP

MVPで正式に提供するのは手動X/Y調整とオニオンスキンである。

- 1px単位の数値入力
- 矢印ボタン
- キーボード矢印キー
- Shift + 矢印で10px
- リセット
- 前フレームとの半透明重ね合わせ
- 基準フレームを固定して比較

### 14.2 自動位置合わせをMVPから外す理由

アルファ重心や外接矩形中心は、手を振る・ジャンプする・エフェクトが出る動作で大きく変化する。これを全体の位置ずれと誤認すると、意図した動きを消してしまう。

将来の候補:

- 中央領域だけを使った位相相関
- ユーザー指定アンカー領域
- 足元線の推定
- 自動補正候補の提示

いずれも自動適用せず、補正前後を比較して採用する方式とする。

## 15. タイムライン

### 15.1 基本機能

- サムネイル表示
- ドラッグ並べ替え
- 選択
- 複製
- 削除
- 元の8フレームへ戻す
- 逆順
- 往復列生成

往復列は端点を重複しない。

```text
1 2 3 4 5 6 7 8 7 6 5 4 3 2
```

### 15.2 フレーム数

LINE向け出力時は5〜20フレーム。

- 4以下: エラー
- 21以上: エラー
- 元の8フレーム: 正常

### 15.3 1フレーム目

先頭フレームに「静止表示」バッジを付ける。

アプリは先頭フレームを別管理せず、実際のAPNG先頭フレームを静止表示用として扱う。別の絵を先頭にしたい場合は、並べ替えまたは複製で明示的にタイムラインへ含める。

### 15.4 表示時間

フレームごとに整数ミリ秒で保持する。

初期値:

```text
125ms × 8 = 1000ms
```

制約:

- 1フレーム最小20ms
- フレーム時間合計が1000、2000、3000、4000msのいずれか
- APNG出力時のdelay denominatorは1000を基本とする

### 15.5 合計時間へ合わせる

「1秒へ合わせる」などを実行した場合、現在のフレーム時間の比率を維持して目標時間へスケールする。

丸め誤差は最大剰余法で分配し、最終合計を目標値へ完全一致させる。

### 15.6 同一フレーム

- 隣接する完全同一画素フレームを警告する
- 全フレームが同一ならエラー
- 同一フレームを自動削除・統合しない
- APNG出力後の実フレーム数を再確認する

## 16. ループ

- 1〜4回
- `1ループの時間 × ループ回数 <= 4000ms`

例:

```text
1秒 × 4回 = 可
2秒 × 2回 = 可
3秒 × 1回 = 可
3秒 × 2回 = 不可
4秒 × 1回 = 可
```

UIでは不可能な組み合わせを無効化し、設定済みのループ時間を変更した場合はループ回数を勝手に変更せずエラー表示する。

## 17. プレビュー

### 17.1 再生

- 再生
- 一時停止
- 停止して先頭へ戻る
- 前後1フレーム送り
- 1ループ再生
- 指定ループ回数再生
- 連続確認用の無限再生

無限再生は確認専用で、出力設定とは分離する。

### 17.2 背景

- 透明市松
- 白
- 黒
- 明るいグレー
- 任意色

背景色はプレビューだけに使い、出力画像へ合成しない。

### 17.3 オニオンスキン

- 前フレーム
- 次フレーム
- 基準フレーム

重ねる対象と不透明度を選択できる。MVPでは前フレームだけでもよいが、データ構造は3種類へ拡張可能にする。

### 17.4 表示倍率

- 全体表示
- 100%
- 200%
- 400%

ピクセル境界、白フチ、透明ゴミを確認できるようにする。

## 18. LINE向け出力寸法

公式条件:

- 最大320 × 270px
- 横または縦のどちらかが270px以上
- 縦を長辺にする場合、縦は270px
- 全フレームは同じ寸法

### 18.1 自動寸法決定

共通キャンバスの幅を `w`、高さを `h` とする。

```text
scale = min(320 / w, 270 / h)
scaledWidth  = w × scale
scaledHeight = h × scale
```

この方式では、横長画像は幅320px、正方形または縦長画像は高さ270pxに到達し、公式の最低辺条件を満たす。

### 18.2 偶数化

出力幅・高さは偶数へ正規化する。最大寸法を超えない範囲で最も近い偶数へ丸め、必要な場合は透明キャンバスを1px追加する。

### 18.3 リサイズ

- SharpのLanczos3を初期値とする
- 全フレームを同じ倍率で処理する
- フレームごとの個別フィットは行わない
- アルファ付きRGBA 8bitへ統一する

## 19. LINE仕様プロファイル

MVPでは次を `line-animated-sticker-v1` として定義する。

```ts
const LINE_ANIMATED_STICKER_RULES = {
  maxWidth: 320,
  maxHeight: 270,
  minLongSide: 270,
  minFrames: 5,
  maxFrames: 20,
  allowedLoopDurationsMs: [1000, 2000, 3000, 4000],
  minLoopCount: 1,
  maxLoopCount: 4,
  maxTotalPlaybackMs: 4000,
  maxFileBytes: 1_000_000,
  requireAlpha: true,
  requireRgb: true,
} as const
```

公式仕様更新時に確認できるよう、ルール定義へ確認日と参照URLをコメントとして付ける。

## 20. APNGエンコード

### 20.1 エンコーダ抽象化

特定ライブラリへ依存しないインターフェースを設ける。

```ts
type ApngEncodeInput = {
  width: number
  height: number
  rgbaFrames: Uint8Array[]
  delaysMs: number[]
  loopCount: number
}

interface ApngEncoder {
  encode(input: ApngEncodeInput): Promise<Uint8Array>
}
```

第一候補は `@upng/upng-js` または `upng-js` 系だが、実装前に技術検証する。

検証項目:

- 5〜20フレームを保持できる
- 透過RGBAを保持できる
- delayを保持できる
- 1〜4ループを保持できる
- 色を無断で減色しない
- Windowsパッケージ後も動く
- ライセンスを満たす

### 20.2 lossless優先

MVPではフルカラーの可逆出力を初期値とする。1MBを超えた場合、無断で色数を落とさない。

表示する対策候補:

- 不要な半透明ゴミの確認
- フレーム数を減らす
- 動く範囲を小さくする
- 元のGPT生成を単純化する
- 将来の減色最適化を明示的に使用する

## 21. APNG再検査

書き出したAPNGを完成扱いにする前に、次を検査する。

### 21.1 PNGチャンク検査

- PNG署名
- IHDR
- acTL
- fcTLの個数
- IDATまたはfdAT
- IEND
- 幅・高さ
- フレーム数
- ループ回数
- delay numerator / denominator

### 21.2 デコード検査

- 全フレームを復号できる
- 各フレームの寸法が同じ
- RGBAを取得できる
- 入力したフレーム数と一致する
- 先頭フレームが期待画像と一致する
- 全フレーム同一ではない

### 21.3 原子的保存

```text
出力先.tmpへ書き込み
  ↓
再検査
  ↓ 成功
完成ファイル名へrename
```

再検査に失敗した場合、完成ファイル名を残さない。一時ファイルは削除し、エラー詳細を表示する。

## 22. 検証結果の分類

### 22.1 Error

書き出し不可。

- PNGを復号できない
- フレーム数が5〜20外
- 合計時間が1〜4秒外
- 合計再生時間が4秒超
- 透過なし
- 寸法条件違反
- APNG生成失敗
- APNG再検査失敗

### 22.2 Warning

ユーザー確認後に書き出し可能。

- マーカーが完全に消えていない可能性
- キャラクターが切れる可能性
- 大きな位置移動
- 連続する完全同一フレーム
- 半透明ゴミの可能性
- 1フレーム目だけで意味が伝わりにくい
- 1MB超過予測

ファイル容量が実際に1MBを超えた場合はErrorへ昇格する。

### 22.3 Info

- 入力解像度
- 出力解像度
- フレーム数
- 1ループ時間
- ループ回数
- 総再生時間
- 推定容量または実容量

## 23. エラーモデル

```ts
type AppError = {
  code: string
  severity: 'error' | 'warning'
  userMessage: string
  technicalMessage?: string
  recoverable: boolean
  context?: Record<string, unknown>
}
```

主なコード:

```text
INPUT_NOT_PNG
INPUT_APNG_NOT_SUPPORTED
INPUT_TOO_LARGE
INPUT_PIXEL_LIMIT
IMAGE_DECODE_FAILED
GRID_INVALID
MARKER_TRIM_INVALID
CONTENT_CUT_RISK
SOURCE_NOT_FOUND
SOURCE_HASH_MISMATCH
NO_ALPHA_CHANNEL
FRAME_COUNT_INVALID
DURATION_INVALID
LOOP_INVALID
APNG_ENCODE_FAILED
APNG_VERIFY_FAILED
OUTPUT_TOO_LARGE
OUTPUT_WRITE_FAILED
JOB_CANCELLED
```

通常画面には `userMessage` だけを表示し、技術情報は「詳細を表示」から確認できるようにする。

## 24. 処理ジョブとキャンセル

画像処理要求ごとに `jobId` を付ける。

- 新しい要求が来た場合、古いプレビュー処理をキャンセル
- Export処理は明示的なキャンセル操作だけを受け付ける
- 完了済みでない古いjobの結果をUIへ反映しない
- スライダー操作は100ms程度デバウンス

進捗段階:

```text
validating
splitting
compositing
resizing
encoding
verifying
writing
complete
```

## 25. キャッシュ

プレビュー処理を高速化するため、次をキャッシュ可能とする。

- 元画像の復号RGBA
- 分割済みセル
- マーカー除去済みセル
- サムネイル
- 共通キャンバス

キャッシュキーは次から生成する。

```text
source SHA-256
+ grid settings
+ marker trim settings
+ frame offsets
+ canvas settings
```

MVPではメモリキャッシュを基本とし、ディスクキャッシュは必要性を確認してから追加する。

## 26. プロジェクト保存

### 26.1 形式

- UTF-8 JSON
- 推奨拡張子 `.alstamp.json`
- schemaVersion必須
- 画像本体は埋め込まない

### 26.2 読み込み時

1. JSON SchemaまたはZodで構造検証
2. schemaVersion確認
3. 元画像パス確認
4. SHA-256照合
5. 不一致なら再指定を求める
6. 設定を適用して派生データを再生成

### 26.3 保存されないもの

- ウィンドウ位置
- 一時プレビュー
- Undo履歴
- エラー表示状態
- Workerのキャッシュ

### 26.4 未保存確認

次の場合に確認する。

- ウィンドウを閉じる
- 別プロジェクトを開く
- 新規プロジェクトを作る

## 27. UI構成

複数ページを行き来するウィザードではなく、1画面の制作ワークスペースを基本とする。

```text
┌─────────────────────────────────────────┐
│ ファイル / プロジェクト / Undo / Redo / Export │
├─────────────┬──────────────────┬──────────┤
│ 元シート・分割 │ 現在フレーム編集     │ 設定・検証 │
│ 境界・除去範囲 │ オニオンスキン       │ タブ       │
├─────────────┴──────────────────┴──────────┤
│ タイムライン / 時間 / 先頭フレーム / 再生操作   │
└─────────────────────────────────────────┘
```

### 27.1 右側設定タブ

- 分割
- マーカー除去
- 位置
- アニメーション
- 出力

### 27.2 初期表示

入力前は大きなドラッグ&ドロップ領域と「画像を開く」だけを表示し、無効な設定項目を大量に並べない。

### 27.3 常時表示する情報

- 現在のフレーム数
- 1ループ時間
- ループ回数
- 総再生時間
- 出力予定寸法
- LINEチェックのError件数
- 未保存状態

### 27.4 キーボード操作

- Space: 再生・一時停止
- ← / →: フレーム移動または選択フレームを1px移動
- Shift + ← / → / ↑ / ↓: 10px移動
- Ctrl+Z: Undo
- Ctrl+Shift+Z: Redo
- Ctrl+S: プロジェクト保存
- Ctrl+E: 書き出し

入力欄へフォーカス中はショートカットの競合を避ける。

## 28. パフォーマンス目標

基準入力を4096 × 2048px、8セルとする。

目標:

- 読み込みから初期サムネイル表示: 2秒以内
- 境界・トリム変更後の低解像度プレビュー: 200ms以内
- 高解像度プレビュー更新: 1秒以内
- APNG書き出し: 10秒以内
- UI操作中にRendererが1秒以上応答不能にならない

実測環境をREADMEまたはリリースノートへ記録する。達成できない場合は、処理の分割・キャッシュ・Worker移行を優先し、UIで偽の進捗を表示しない。

## 29. ディレクトリ構成

```text
src/
├─ main/
│  ├─ windows/
│  ├─ ipc/
│  ├─ files/
│  └─ jobs/
├─ preload/
│  ├─ index.ts
│  └─ api.ts
├─ renderer/
│  ├─ app/
│  ├─ components/
│  ├─ features/
│  │  ├─ import-sheet/
│  │  ├─ grid-editor/
│  │  ├─ marker-trim/
│  │  ├─ frame-editor/
│  │  ├─ timeline/
│  │  ├─ preview/
│  │  └─ export/
│  └─ styles/
├─ worker/
│  ├─ pipeline/
│  ├─ apng/
│  ├─ analysis/
│  └─ worker-entry.ts
└─ shared/
   ├─ domain/
   ├─ schemas/
   ├─ rules/
   ├─ errors/
   └─ ipc/
```

画像処理の純粋関数をReactコンポーネントやIPCハンドラーへ直接書かない。

## 30. 主要モジュール境界

```text
SourceInspector
GridSplitter
MarkerTrimmer
AlphaBoundsAnalyzer
FrameComposer
FrameResizer
TimelineNormalizer
LineRuleValidator
ApngEncoder
ApngInspector
ProjectRepository
ExportService
```

各モジュールは入力と出力の型を明示し、UIを知らないようにする。

## 31. テスト戦略

### 31.1 Unit Test

対象:

- 比率からのグリッド境界計算
- 端数を含む分割
- マーカー除去座標
- アルファ外接矩形
- 全フレーム共通外接矩形
- 出力サイズ計算
- 偶数化
- フレーム時間の正規化
- 往復列生成
- LINEルール判定
- ProjectDocument検証

### 31.2 Fixture Test

最低限の入力Fixture:

- 正常な4×2透明シート
- 幅・高さが割り切れないシート
- トンボが一部欠損したシート
- キャラクターがトリム境界に近いシート
- 透過なしシート
- 半透明エフェクト付きシート
- 全体位置ずれあり
- 大きくジャンプするシート
- 完全同一フレームを含むシート

分割処理は期待座標と画素欠落の有無を検証する。リサイズ結果はSharp/libvipsの更新差を考慮し、画素ハッシュだけへ依存しない。

### 31.3 APNG Integration Test

1. 既知のRGBAフレームを生成
2. APNGへエンコード
3. PNGチャンクを検査
4. 再デコード
5. フレーム数・寸法・delay・loopを比較
6. 先頭フレームと透過画素を比較

エンコーダと検査器を同じ実装へ依存させない。

### 31.4 E2E Test

- アプリ起動
- Fixture読込
- 境界変更
- トリム変更
- フレーム移動
- 時間変更
- プレビュー再生
- APNG書き出し
- 完了表示

### 31.5 Windows Build Test

GitHub Actionsの `windows-latest` で次を確認する。

- npm install
- typecheck
- lint
- unit test
- build
- package

リリース前は生成したWindowsパッケージを実機で起動確認する。

## 32. ログ

ローカル診断ログへ次を記録する。

- アプリバージョン
- OS
- 処理jobId
- 入力寸法とファイルサイズ
- 各処理の所要時間
- エラーコード
- APNG検査結果

画像本体、ユーザーのファイル名、完全なファイルパスは通常ログへ記録しない。

## 33. 配布

初期対応はWindows x64。

候補:

- NSISインストーラー
- portable zip

コード署名前の配布ではWindows SmartScreen警告が出る可能性がある。一般公開時はコード署名の費用と運用を別途判断する。

自動更新はMVPへ含めない。

## 34. 技術検証で先に潰す項目

本実装前に、最小コードで次を確認する。

1. electron-vite + electron-builder + SharpをWindowsでパッケージできる
2. パッケージ後もPNGのcrop・resize・RGBA取得が動く
3. APNGを5〜20フレームで生成できる
4. delay・loop・alphaが保持される
5. 出力APNGを独立検査できる
6. 1MB前後の容量傾向を測定できる
7. Worker内でSharpとAPNGエンコーダを利用できる

この技術検証に失敗した場合、UI実装を進めず、構成またはエンコーダを変更する。

## 35. MVP受け入れ基準

### 入力

- 任意解像度のPNGフレームシートを読み込める
- 4×2で全画素を重複・欠落なく分割できる
- 手動でグリッド境界を修正できる
- 透過なしを検出できる

### 整形

- 全体・個別のマーカー除去量を設定できる
- 共通キャンバスで8フレームを保持できる
- 1px単位で位置調整できる
- オニオンスキンでずれを確認できる

### アニメーション

- 5〜20フレームで編集できる
- 並べ替え・複製・削除・逆順・往復が動く
- フレーム時間合計を1〜4秒へ正確に合わせられる
- 1〜4ループを設定できる
- 設定どおりにプレビューできる

### 出力

- LINE寸法へ全フレームを同一倍率で変換できる
- 透過RGBAのAPNGを生成できる
- 出力APNGのフレーム数・delay・loop・寸法・透過を再検査できる
- 1MB超過をエラー表示できる
- 検査成功後だけ完成ファイルを残す
- 連番PNGも書き出せる

### プロジェクト

- 編集内容をJSONへ保存できる
- 再読込して同じ状態を復元できる
- 元画像変更をSHA-256で検出できる
- 元画像を上書きしない

### 品質

- Unit TestとAPNG Integration Testが合格する
- Windowsパッケージが起動する
- Rendererが画像処理で長時間停止しない

## 36. 将来拡張の境界

MVP完了後、同じProjectDocumentの `items` を増やす形で次へ拡張する。

- 8個・16個・24個セット管理
- 一括共通設定
- メイン画像生成
- トークルームタブ画像生成
- ファイル名整形
- ZIP出力
- 容量最適化
- 透過ゴミ検出
- マーカー自動認識
- 自動位置合わせ候補
- フレーム補間

これらを先行実装して、単体APNGの確実な生成と検証を複雑化させない。

## 37. 参照先

- LINEアニメーションスタンプ制作ガイドライン: https://creator.line.me/ja/guideline/animationsticker/
- LINEアニメーション詳細ガイド: https://creator.line.me/ja/guideline/animationsticker/detail/
- Electron Security: https://www.electronjs.org/docs/latest/tutorial/security
- electron-vite: https://electron-vite.org/
- electron-builder: https://github.com/electron-userland/electron-builder
- Sharp: https://sharp.pixelplumbing.com/
- UPNG.js: https://github.com/photopea/UPNG.js
