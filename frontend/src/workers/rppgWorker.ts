// src/workers/rppgWorker.ts
// ===============================================
// rPPG心拍推定（POS法）+ 信頼度(SNR) + 外れ値抑制
//  - RGB平均を蓄積
//  - ウィンドウ内で正規化 → POS法でPPG抽出
//  - FFTでピーク周波数→BPM
//  - 信頼度閾値で無効化
// ===============================================

export default null as any

interface RGB {
  r: number
  g: number
  b: number
  t?: number   // 送れれば推奨(ms)。無ければ内部で擬似時刻
}

interface BPMResult {
  bpm: number | null
  confidence: number  // 0〜1目安
}

const WINDOW_SEC = 12           // 解析窓長（秒）
const OVERLAP_SEC = 4           // 最低必要データ（秒）
const LOW_HZ = 0.7              // 42 bpm
const HIGH_HZ = 3.0             // 180 bpm
const HR_MIN = 40
const HR_MAX = 200
const JUMP_LIMIT = 25           // 連続推定での最大ジャンプ量(bpm)
const CONF_TH = 0.35            // 信頼度しきい値（要調整）

// バッファ
const rBuf: number[] = []
const gBuf: number[] = []
const bBuf: number[] = []
const tBuf: number[] = []       // timestamp(秒)

// 推定履歴
let lastBpm: number | null = null

// 擬似タイムスタンプ用
let pseudoT = 0
let lastPushTS = performance.now()

onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data || {}
  switch (type) {
    case 'pushRGB':
      pushRGB(payload as RGB)
      break
    case 'estimate':
      postBpm()
      break
  }
}

// RGBを蓄積
function pushRGB({ r, g, b, t }: RGB) {
  const now = t != null ? t : performance.now()
  const dt = (now - lastPushTS) / 1000
  lastPushTS = now
  pseudoT += dt || 1 / 30 // 0除算保険・fps30仮定

  rBuf.push(r)
  gBuf.push(g)
  bBuf.push(b)
  tBuf.push(pseudoT)

  // 長さ制限（WINDOW_SEC を少し超える程度）
  const maxLen = Math.ceil((WINDOW_SEC + 2) * fpsEstimate())
  while (rBuf.length > maxLen) {
    rBuf.shift(); gBuf.shift(); bBuf.shift(); tBuf.shift()
  }
}

// BPM推定
function postBpm() {
  const fs = fpsEstimate()
  if (rBuf.length < OVERLAP_SEC * fs) {
    post({ bpm: null, confidence: 0 })
    return
  }

  // ウィンドウ切り出し（最新 WINDOW_SEC 秒分）
  const cutIdx = Math.max(0, rBuf.length - Math.round(WINDOW_SEC * fs))
  const R = rBuf.slice(cutIdx)
  const G = gBuf.slice(cutIdx)
  const B = bBuf.slice(cutIdx)
  const T = tBuf.slice(cutIdx)

  const res = estimateHR_POS(R, G, B, T)
  const bpmFiltered = validateBpm(res.bpm, res.confidence)
  post({ bpm: bpmFiltered, confidence: res.confidence })
}

function post(payload: BPMResult) {
  ;(postMessage as any)({ type: 'bpm', payload })
}

// ========= 核心アルゴリズム =========

// POS法でPPG抽出 → FFTでピーク → 信頼度算出
function estimateHR_POS(R: number[], G: number[], B: number[], T: number[]): BPMResult {
  const fs = fpsFromT(T)
  // 正規化（平均除去＆平均で割る）
  const norm = (arr: number[]) => {
    const m = mean(arr)
    return arr.map(v => (v - m) / m)
  }
  const Rn = norm(R)
  const Gn = norm(G)
  const Bn = norm(B)

  // POS 法 (Wang et al. 2017)
  const X = Rn.map((v, i) => v - Gn[i])
  const Y = Gn.map((v, i) => v - Bn[i])
  const stdX = std(X)
  const stdY = std(Y) || 1e-8
  const alpha = stdX / stdY
  const ppg = X.map((v, i) => v - alpha * Y[i])

  // ハニング窓
  const N = ppg.length
  const windowed = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)))
    windowed[i] = ppg[i] * w
  }

  // FFT
  const { freqs, mags } = fftMag(windowed, fs)

  // 対象帯域のみ検索
  let peakFreq = 0
  let peakMag = 0
  let noise = 0
  let bins = 0
  for (let i = 0; i < freqs.length; i++) {
    const f = freqs[i]
    if (f < LOW_HZ || f > HIGH_HZ) continue
    const m = mags[i]
    noise += m
    bins++
    if (m > peakMag) {
      peakMag = m
      peakFreq = f
    }
  }

  if (!peakFreq) return { bpm: null, confidence: 0 }

  // SNR っぽい指標 (ピーク / 平均ノイズ)
  const avgNoise = bins ? noise / bins : 1
  const confidence = clamp(peakMag / (avgNoise + 1e-8), 0, 2) // 大体0〜2くらい

  return { bpm: Math.round(peakFreq * 60), confidence }
}

// ========= バリデーション/平滑化 =========
function validateBpm(bpm: number | null, conf: number) {
  if (bpm == null || conf < CONF_TH) return null
  if (bpm < HR_MIN || bpm > HR_MAX) return null

  if (lastBpm != null && Math.abs(bpm - lastBpm) > JUMP_LIMIT) {
    // 大ジャンプは信頼度次第で弾く
    return null
  }
  lastBpm = bpm
  return bpm
}

// ========= ヘルパー =========
function fpsEstimate() {
  if (tBuf.length < 2) return 30
  const dt = (tBuf[tBuf.length - 1] - tBuf[0]) / (tBuf.length - 1)
  return dt > 0 ? 1 / dt : 30
}
function fpsFromT(T: number[]) {
  if (T.length < 2) return 30
  const dt = (T[T.length - 1] - T[0]) / (T.length - 1)
  return dt > 0 ? 1 / dt : 30
}

function mean(a: number[]) {
  return a.reduce((p, c) => p + c, 0) / a.length
}
function std(a: number[]) {
  const m = mean(a)
  const v = a.reduce((p, c) => p + (c - m) ** 2, 0) / (a.length - 1)
  return Math.sqrt(Math.max(v, 1e-12))
}
function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max)
}

// 単純なDFTで振幅スペクトル取得
function fftMag(sig: Float32Array, fs: number) {
  const N = sig.length
  const re = new Float32Array(N)
  const im = new Float32Array(N)
  for (let k = 0; k < N; k++) {
    let sumRe = 0
    let sumIm = 0
    for (let n = 0; n < N; n++) {
      const angle = (2 * Math.PI * k * n) / N
      sumRe += sig[n] * Math.cos(angle)
      sumIm -= sig[n] * Math.sin(angle)
    }
    re[k] = sumRe
    im[k] = sumIm
  }
  // 0〜Nyquistのみ使用
  const half = Math.floor(N / 2)
  const mags = new Float32Array(half)
  const freqs = new Float32Array(half)
  for (let k = 0; k < half; k++) {
    const mag = re[k] * re[k] + im[k] * im[k]
    mags[k] = mag
    freqs[k] = (fs * k) / N
  }
  return { freqs, mags }
}
