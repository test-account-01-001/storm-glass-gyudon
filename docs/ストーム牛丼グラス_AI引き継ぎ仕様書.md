# ストーム牛丼グラス AI引き継ぎ仕様書

版: v1.1（UI指示書反映版）
対象読者: 本アプリを保守・改修する別のAI（Claude等）または開発者。この文書と`index.html`だけで改修できることを目的とする。設計思想・UI詳細は「設計書」を参照。

---

## 1. システム概要

天気×気温で、画面下部の丼から具材（肉・米・玉ねぎ等）が浮遊・沈殿・白濁・枝状拡散する待受風PWA。ストームグラスのオマージュ。背景も天気・時間帯で変化。サーバーレス・1画面。

## 2. ファイル構成

| ファイル | 役割 |
|---|---|
| `index.html` | 本体。CONFIG／天気取得／変換ロジック／Three.js描画／UI全部入りの単一ファイル |
| `manifest.json` | PWA定義（name, display:fullscreen, orientation:portrait, icons） |
| `sw.js` | Service Worker。静的ファイルをキャッシュ。天気APIはネット優先＋失敗時キャッシュ |
| `icon-192.png` `icon-512.png` | アイコン |
| `README.md` | 利用者向け手順 |

## 3. index.html 内部構成（セクション順）

```
<script>
  1. CONFIG            … 全設定値（ここだけ触れば大半の調整が完了）
  2. weatherState / appState … 状態
  3. fetchWeather() / fetchPlaceName() … API取得
  4. decidePattern() / weatherToBowl()  … 変換ロジック（心臓部）
  5. Three.jsシーン     … initScene()/具材生成/背景/アニメーションループ
  6. UI                … 時計・情報パネル・操作ボタン・待受モード
  7. 起動処理           … init()
</script>
```

## 4. 主要変数一覧

| 変数 | 型 | 用途 |
|---|---|---|
| `CONFIG` | const object | 全設定値。DEFAULT_LOCATION / UPDATE_INTERVAL_MIN / INGREDIENTS / TEMP_TABLE / PATTERN_TABLE / PATTERN_PRIORITY / BACKGROUNDS / STORM_NAMES / HOT_DAY_TEMP / COLD_DAY_TEMP / WIND_BRANCH_SPEED / RICE_MAX_COUNT / MEAT_MAX_COUNT / SHOW_CLOCK / LOW_SPEC_MODE |
| `weatherState` | object | `{code, temperature, apparentTemp, windSpeed, humidity, precipProbability, fetchedAt, place}` |
| `appState` | object | `{pattern, viewMode:"auto"/"manual", patternHistory:[], eggMode:"raw"/"onsen", minimalUI:bool}`。eggModeとminimalUIのみlocalStorageに保存 |
| `bowlParams` | object | `{riceAmount, meatAmount, scatter, turbidity, drift, steam}` 各0〜1 |
| `targetParams` | object | 遷移先のbowlParams（lerpでなめらかに変化） |
| `scene, camera, renderer` | Three.js | 標準3点セット |
| `ingredientMeshes` | object | 具材種別ごとのInstancedMesh辞書 `{rice, meat, onion, drop, ginger, sparkle}`。可視数はcountプロパティで制御 |
| `bowlGroup` | Group | 丼＋卵＋盛り。画面下部に固定 |
| `eggMesh` | Mesh | 卵。eggModeでマテリアル切替（生=光沢オレンジ／温玉=白濁） |
| `bgLayer` | - | 背景（グラデーション空・遠景シルエット・雨/雪パーティクル） |
| `fogEffect` | Fog | 白濁表現。turbidityで濃度制御 |
| `wakeLock` | WakeLockSentinel | スリープ防止ハンドル |

## 5. 関数一覧

| 関数 | 役割 |
|---|---|
| `init()` | 起動。ローディング表示→位置取得→天気取得→シーン構築→ループ開始→タイマー設定 |
| `getLocation()` | Geolocation。拒否/失敗時はCONFIG.DEFAULT_LOCATION＋place="東京(デフォルト)" |
| `fetchWeather(lat, lon)` | Open-Meteo呼び出し→weatherState更新→viewModeを"auto"に戻す→decidePattern()。失敗時は前回値維持＋エラーUI＋5分後再試行 |
| `fetchPlaceName(lat, lon)` | Open-Meteo Geocoding APIで地名取得。失敗時は"現在地" |
| `decidePattern(state)` | **心臓部1**。weatherState→6パターンのどれかを決定。CONFIG.PATTERN_PRIORITYの順に条件判定（結晶>白濁>枝状>浮遊>沈殿>澄み） |
| `weatherToBowl(state, pattern)` | **心臓部2**。パターン＋TEMP_TABLE（線形補間）→bowlParams算出 |
| `setPattern(name, {manual})` | パターン適用。manual=trueならviewMode="manual"＋patternHistoryにpush＋「鑑賞モード」バッジ表示 |
| `cyclePattern()` | 「パターン変更」ボタン。6パターンを順送り（鑑賞モード） |
| `undoPattern()` | 「戻す」ボタン。patternHistoryからpop |
| `toggleEgg()` | 「卵チェンジ」。raw⇔onsen切替＋localStorage保存 |
| `toggleMinimalUI()` | 「待受モード」。情報パネル・ボタンの表示切替。最小UI中は画面タップで復帰 |
| `wmoToCategory(code)` | WMOコード→'clear'/'cloudy'/'fog'/'rain'/'snow'/'thunder' |
| `initScene()` | 丼（LatheGeometry）・卵・具材InstancedMesh・ライト・背景を生成 |
| `updateBackground()` | 時間帯（端末時刻: 朝5-10/昼10-16/夕16-19/夜19-5）×天気で背景切替 |
| `animate()` | rAFループ。bowlParams→targetParamsへlerp(0.02)、updateParticles()、render |
| `updateParticles(dt)` | パターン別の具材運動。パターン名で分岐（澄み=静止/白濁=舞い降り/浮遊=漂い/沈殿=堆積/結晶=枝生成＋乱舞/枝状=流線たなびき） |
| `updateClock()` / `updateOverlay()` | 時計・日付／情報パネル（地点・気温・体感・降水確率・湿度・風速・Storm名・Pattern名）更新 |
| `requestWakeLock()` | Wake Lock取得。visibilitychangeで再取得。非対応は無視 |

## 6. 処理フロー

```
init()
 ├─ ローディングUI表示
 ├─ getLocation() ──失敗──→ DEFAULT_LOCATION
 ├─ fetchWeather()＋fetchPlaceName() ─失敗──→ 前回値 or デモ値(晴れ20℃)＋エラーUI
 ├─ decidePattern() → weatherToBowl() → targetParams
 ├─ initScene() → animate()ループ開始
 ├─ setInterval(fetchWeather, UPDATE_INTERVAL_MIN分)  ※これが走ると鑑賞モード解除
 └─ setInterval(updateClock, 1秒)

ボタン操作:
 パターン変更 → cyclePattern() → viewMode="manual"
 天気更新    → fetchWeather() → viewMode="auto"に復帰
 戻す        → undoPattern()
 卵チェンジ  → toggleEgg()
 待受モード  → toggleMinimalUI()
```

## 7. 外部連携一覧

| 連携先 | エンドポイント | 認証 |
|---|---|---|
| Open-Meteo 天気 | `https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,precipitation_probability&timezone=auto` | 不要 |
| Open-Meteo 逆ジオ | `https://geocoding-api.open-meteo.com/v1/search`（地名取得。実装時に逆引き可否を確認し、不可なら地名表示を省略して"現在地"表記にする） | 不要 |
| Three.js CDN | `https://cdnjs.cloudflare.com/ajax/libs/three.js/`（バージョンはindex.html冒頭コメントに記載） | 不要 |

レスポンス参照: `data.current.temperature_2m` / `.apparent_temperature` / `.weather_code` / `.wind_speed_10m` / `.relative_humidity_2m` / `.precipitation_probability`

## 8. 修正ポイント一覧（どこを変えると何が変わるか）

| やりたいこと | 触る場所 |
|---|---|
| デフォルト地点・更新間隔 | `CONFIG.DEFAULT_LOCATION` / `UPDATE_INTERVAL_MIN` |
| 気温と米量の関係 | `CONFIG.TEMP_TABLE`（[気温, riceAmount]配列。間は自動補間） |
| パターンの発動条件・優先順位 | `decidePattern()` ＋ `CONFIG.PATTERN_PRIORITY` / `HOT_DAY_TEMP` / `COLD_DAY_TEMP` / `WIND_BRANCH_SPEED` |
| パターンごとの散らばり・濁り | `CONFIG.PATTERN_TABLE` |
| Storm表示名（"牛丼乱気流"等） | `CONFIG.STORM_NAMES` |
| 具材の追加・色・数 | `CONFIG.INGREDIENTS`（配列に1項目追加→自動でInstancedMesh生成） |
| 背景の色・時間帯区分 | `CONFIG.BACKGROUNDS` / `updateBackground()` |
| 具材の動き方そのもの | `updateParticles()` 内のパターン別分岐 |
| 丼・卵の形 | `initScene()` のLatheGeometry輪郭点／eggMesh |
| ボタン・情報パネルのデザイン | HTML内 `#overlay` `#buttons` のCSS |
| 軽量化 | `CONFIG.LOW_SPEC_MODE` / 各MAX_COUNT |

## 9. よくある改修例

1. **具材追加（ねぎ等）**: `CONFIG.INGREDIENTS`に`{name:'negi', color:0x88cc44, size:.., maxCount:..}`を追加するだけ。動きは既定で米粒と同じ。専用の動きが要る場合のみ`updateParticles()`に分岐追加
2. **都市選択の追加**: CONFIGに`CITIES:[{name,lat,lon}]`追加→情報パネルに`<select>`を置き、変更時に`fetchWeather(lat,lon)`を呼ぶ
3. **明日の天気モード**: APIのURLに`&daily=weather_code,temperature_2m_max`を追加し、ボタンで`decidePattern()`に渡す値を切替
4. **壁紙画像保存**: `renderer.domElement.toDataURL()`でPNG化（rendererに`preserveDrawingBuffer:true`が必要な点に注意）
5. **パターンを7種類に増やす**: PATTERN_TABLE＋STORM_NAMES＋`updateParticles()`の分岐＋`cyclePattern()`の順送りリストの4箇所を揃えて追加

## 10. 注意事項（壊れやすい箇所・変更禁止）

- **位置情報とService WorkerはHTTPS必須**。file://ではGeolocationが動かない端末がある。動作確認はGitHub Pages上か`localhost`で
- **WMOコードのマッピング**（`wmoToCategory`）変更時はOpen-Meteo公式コード表を確認。0〜99で歯抜けあり
- **precipitation_probabilityはcurrentで取れない場合がある**（Open-Meteoの仕様変動）。取れない場合は`hourly`の直近値で代替する実装。改修時にAPIレスポンスを実際に確認すること
- **InstancedMeshの最大数は生成時固定**。maxCountを増やしたら再読み込みが必要。表示数の増減は`count`プロパティで実施
- **lerp遷移を消さない**: targetParamsへ直接代入せずlerp経由なのは、天気更新やパターン切替時に「ぬるっと」変化させる演出のため
- **viewModeの整合性**: `fetchWeather()`成功時は必ず`viewMode="auto"`に戻す。ここを消すと鑑賞モードから永遠に戻れなくなる
- **patternHistoryは上限20件**でshiftする。無限に積むとメモリを食う
- **sw.jsのキャッシュ名**（`CACHE_VERSION`）はindex.html更新のたびに必ず上げる。上げないと利用者に旧版が出続ける
- **丼は常に画面下部**（UI指示書の必須要件）。カメラやレイアウト変更時もbowlGroupの画面内位置を維持すること

## 11. 動作確認手順（改修後に必ず実施）

```
STEP1: GitHub Pagesにpush後、スマホで開く
STEP2: 位置情報「許可」→ 現在地の地名・天気・気温が出るか
STEP3: 位置情報「拒否」→ 東京(デフォルト)表示になるか
STEP4: 機内モードで再読み込み → 前回状態＋エラー表示が出るか
STEP5: パターン変更を6回タップ → 全パターンが順送りで出るか、「鑑賞モード」表示が出るか
STEP6: 天気更新をタップ → 実際の天気のパターンに復帰するか
STEP7: 戻す → 直前のパターンに戻るか／卵チェンジ → 生⇔温玉が切り替わり再読み込み後も維持されるか
STEP8: 待受モード → 最小UIになり、タップで復帰するか
STEP9: 5分放置 → 画面がスリープしないか（Wake Lock対応端末）
```
