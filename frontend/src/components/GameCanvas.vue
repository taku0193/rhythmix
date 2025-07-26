<template>
  <div class="game-canvas">   
    <div class="split-container">
      <div class="pane video-pane">
        <video ref="videoRef" autoplay muted playsinline />
        <canvas ref="userCanvasRef" />
        <div v-if="displayBpm !== null" class="hr-display">
          ❤️ {{ displayBpm }} bpm
        </div>
      </div>

      <div class="pane template-pane">
        <div class="action-label" v-if="currentSegment">
          ▶ {{ currentSegment.action }}
        </div>
        <div class="next-label" v-if="showNext">
          ⏭ {{ nextSegment?.action }}
        </div>
        <div class="judgement" v-if="judgeResult">
          {{ judgeResult.grade }}
        </div>
        <div class="feedback" v-if="judgeResult">
          {{ judgeResult.message }}
        </div>
        <canvas ref="templateCanvasRef" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ref,
  onMounted,
  onBeforeUnmount,
  computed,
  defineProps,
  defineEmits
} from 'vue'
import { Pose, POSE_CONNECTIONS } from '@mediapipe/pose'
import { Camera } from '@mediapipe/camera_utils'
import { judgePose, type JudgeResult } from '../utils/poseJudge'
import RppgWorker from '../workers/rppgWorker.ts?worker'
import { sendHR } from '../utils/sendHR'

// ======= props / emit =======
const props = defineProps<{ bpm: number }>()
const emit = defineEmits<{ (e: 'update:bpm', val: number): void }>()
const localBpm = ref(props.bpm)
function applyBpm() {
  emit('update:bpm', localBpm.value)
}

// ======= ループ設定 =======
const loop = ref(true)

// ======= セグメント定義 =======
interface Segment {
  file: string; start: number; end: number; action: string; part: string;
  intensityLabel: string; intensity: number; template: string; duration: number;
}
const segments = ref<Segment[]>([])
const templateMap = ref<Record<string, Array<{ x: number; y: number }>>>({})
const INTENSITY_MAP: Record<string, number> = { '低': 0.2, '中': 0.6, '高': 0.9 }
const currentIndex = ref(0)
let segmentStartTime = 0
const elapsed = ref(0)
const currentSegment = computed(() => segments.value[currentIndex.value] || null)
const nextSegment = computed(() => {
  if (!segments.value.length) return null
  const nx = currentIndex.value + 1
  return segments.value[nx < segments.value.length ? nx : (loop.value ? 0 : -1)] || null
})
const leadTime = 2
const showNext = computed(() => !!currentSegment.value && elapsed.value > currentSegment.value.duration - leadTime)

// ======= refs =======
const videoRef = ref<HTMLVideoElement>()
const userCanvasRef = ref<HTMLCanvasElement>()
const templateCanvasRef = ref<HTMLCanvasElement>()

// ===== 判定用 =====
const judgeResult = ref<JudgeResult | null>(null)
let lastUserLm: Array<{ x: number; y: number }> = []
let lastJudgeTime = 0
const JUDGE_INTERVAL = 150

// ===== rPPG 関連 =====
const displayBpm = ref<number | null>(null)
const rppgWorker = new RppgWorker()
const showDebugDots = ref(false)
let lastEstimateTime = 0; let lastSendTime = 0
const FRAME_SEND_INTERVAL = 50; const ESTIMATE_INTERVAL = 1000
const HR_SEND_INTERVAL = 2000; let lastHrPostTime = 0
const roiCanvas = document.createElement('canvas'); const roiCtx = roiCanvas.getContext('2d')
let prevBpm: number | null = null; const SMOOTH_ALPHA = 0.3
rppgWorker.onmessage = (e: MessageEvent) => {
  if (e.data?.type === 'bpm') {
    const { bpm: rawBpm, confidence } = e.data.payload || {}
    if (typeof rawBpm === 'number') {
      if (prevBpm === null) prevBpm = rawBpm
      else prevBpm = prevBpm * (1 - SMOOTH_ALPHA) + rawBpm * SMOOTH_ALPHA
      const rounded = Math.round(prevBpm)
      displayBpm.value = rounded;
      (window as any).__HR_BPM__ = rounded
      const now = performance.now()
      if (now - lastHrPostTime > HR_SEND_INTERVAL) {
        sendHR(rounded, confidence); lastHrPostTime = now
      }
    }
  }
}
function parseTime(s: string) { const [m, sec] = s.split(':').map(Number); return m * 60 + sec }
async function loadCSV() {
  const res = await fetch('/static/video_label.csv')
  const lines = (await res.text()).trim().split('\n').slice(1)
  segments.value = lines.map((l) => {
    const [file, start, end, action, part, intensityLabel] = l.split(',')
    const s = parseTime(start), e = parseTime(end)
    const key = action.replace(/\s*[（(]\s*/g, '_').replace(/[)）]/g, '').replace(/_+/g, '_').replace(/^_|_$/g, '')
    return { file, start: s, end: e, action, part, intensityLabel, intensity: INTENSITY_MAP[intensityLabel] ?? 0.5, template: `${key}.json`, duration: e - s }
  })
}
async function preloadTemplates() {
  const names = Array.from(new Set(segments.value.map((s) => s.template)))
  await Promise.all(
    names.map(async (name) => {
      try {
        const r = await fetch(`/static/templates/${encodeURIComponent(name)}`)
        if (!r.ok) throw new Error(`Failed to fetch template: ${name}`)
        const raw: Array<{ frame_id: number; landmarks: Array<{ x: number; y: number }> }> = await r.json()
        templateMap.value[name] = raw.map((f) => f.landmarks || [])
      } catch (error) {
        console.error(error)
      }
    })
  )
}
function nextSeg() {
  currentIndex.value++;
  if (currentIndex.value >= segments.value.length) {
    if (loop.value) currentIndex.value = 0; else return
  }
  segmentStartTime = performance.now();
  const seg = segments.value[currentIndex.value];
  if (seg) { (window as any).__EX_INTENSITY__ = seg.intensity }
}

// =======================================================
// ★★★★★★★★★★★★ 描画 & 判定ロジック ★★★★★★★★★★★★
// =======================================================

/**
 * ズレの大きさに応じて色を返すヘルパー関数
 */
const getErrorColor = (err: number): string => {
  if (err < 3) return "lime"   // Good
  if (err < 2) return "yellow" // OK
  return "red"                    // Bad
};

/**
 * 骨格を描画する共通関数
 */
function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: Array<{ x: number; y: number; visibility?: number }>, // visibilityを追加
  jointErrors?: Array<{ index: number; err: number }>
) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (!landmarks.length) return;

  const errMap = new Map(jointErrors?.map((e) => [e.index, e.err]));

  // 骨（線）の描画
  ctx.lineWidth = 5;
  POSE_CONNECTIONS.forEach(([i, j]) => {
    const p1 = landmarks[i];
    const p2 = landmarks[j];
    if (!p1 || !p2 || (p1.visibility ?? 0) < 0.5 || (p2.visibility ?? 0) < 0.5) return;

    ctx.beginPath();
    if (jointErrors) {
      const err1 = errMap.get(i);
      const err2 = errMap.get(j);
      const err = Math.max(err1 ?? 0, err2 ?? 0);
      ctx.strokeStyle = getErrorColor(err);
    } else {
      ctx.strokeStyle = "white";
    }
    ctx.moveTo(p1.x * w, p1.y * h);
    ctx.lineTo(p2.x * w, p2.y * h);
    ctx.stroke();
  });

  // 関節（点）の描画
  landmarks.forEach((p, i) => {
    if (!p || (p.visibility ?? 0) < 0.5) return;
    ctx.beginPath();
    if (jointErrors) {
      const err = errMap.get(i);
      ctx.fillStyle = err !== undefined ? getErrorColor(err) : "white";
    } else {
      ctx.fillStyle = "white";
    }
    ctx.arc(p.x * w, p.y * h, 8, 0, Math.PI * 2);
    ctx.fill();
  });
}

/**
 * テンプレ描画 & 判定ループ
 */
function renderTemplate() {
  const canvas = templateCanvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const seg = currentSegment.value;
  if (!ctx || !seg) {
    requestAnimationFrame(renderTemplate);
    return;
  };

  elapsed.value = (performance.now() - segmentStartTime) / 1000;
  if (elapsed.value > seg.duration) {
    nextSeg();
    judgeResult.value = null;
  }

  const seq = templateMap.value[seg.template] || [];
  if (!seq.length) {
    requestAnimationFrame(renderTemplate);
    return;
  }

  const idx = Math.floor((elapsed.value / seg.duration) * seq.length) % seq.length;
  const lm = seq[idx] || [];
  if (!lm.length) {
    requestAnimationFrame(renderTemplate);
    return;
  }

  // --- 判定処理 ---
  const now = performance.now();
  if (lastUserLm.length && now - lastJudgeTime > JUDGE_INTERVAL) {
    judgeResult.value = judgePose(lm, lastUserLm);
    lastJudgeTime = now;
  }

  // --- お手本骨格の描画 ---
  const xs = lm.map((p) => p.x), ys = lm.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = maxX - minX, h = maxY - minY;
  const baseScale = Math.min(canvas.width / w, canvas.height / h);
  const scale = baseScale * 0.67;
  const offsetX = (canvas.width - w * scale) / 2 - minX * scale;
  const offsetY = (canvas.height - h * scale) / 2 - minY * scale;

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
  ctx.strokeStyle = 'rgba(0,0,255,0.8)';
  ctx.lineWidth = 2 / scale;
  POSE_CONNECTIONS.forEach(([i, j]) => {
    const a = lm[i], b = lm[j];
    if (!a || !b) return;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  });
  ctx.fillStyle = 'rgba(0,0,255,0.8)';
  lm.forEach(p => {
    ctx.beginPath(); ctx.arc(p.x, p.y, 6 / scale, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();

  requestAnimationFrame(renderTemplate);
}

function calcForeheadROI(landmarks: any[], vw: number, vh: number) {
    const nose = landmarks[0], lEye = landmarks[2], rEye = landmarks[5];
    if (!nose || !lEye || !rEye) return null;
    const cx = (1 - nose.x) * vw, cy = nose.y * vh;
    const w = Math.abs((lEye.x - rEye.x) * vw) * 1.2, h = w * 0.6;
    const x = cx - w / 2, y = cy - h * 1.8;
    const X = Math.max(0, Math.min(vw - 1, x)), Y = Math.max(0, Math.min(vh - 1, y));
    const W = Math.max(1, Math.min(vw - X, w)), H = Math.max(1, Math.min(vh - Y, h));
    return { x: X, y: Y, w: W, h: H };
}

onMounted(async () => {
  function fit(c: HTMLCanvasElement) { c.width = c.clientWidth; c.height = c.clientHeight; }

  const pose = new Pose({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}` })
  pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 })

  pose.onResults((res) => {
    const uc = userCanvasRef.value;
    if (!uc) return;
    const ctx = uc.getContext('2d');
    if (!ctx) return;

    if (res.poseLandmarks) {
      lastUserLm = res.poseLandmarks; // Keep full landmark data for visibility
      drawSkeleton(ctx, res.poseLandmarks, judgeResult.value?.jointErrors);

      const video = videoRef.value!;
      if (video.videoWidth && video.videoHeight && roiCtx) {
        const now = performance.now();
        if (now - lastSendTime > FRAME_SEND_INTERVAL) {
          const roi = calcForeheadROI(res.poseLandmarks, video.videoWidth, video.videoHeight);
          if (roi) {
            roiCanvas.width = roi.w; roiCanvas.height = roi.h;
            const sx = video.videoWidth - (roi.x + roi.w);
            roiCtx.drawImage(video, sx, roi.y, roi.w, roi.h, 0, 0, roi.w, roi.h);
            const data = roiCtx.getImageData(0, 0, roi.w, roi.h).data;
            let r = 0, g = 0, b = 0, count = 0;
            for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; count++; }
            rppgWorker.postMessage({ type: 'pushRGB', payload: { r: r / count, g: g / count, b: b / count, t: performance.now() } });
            lastSendTime = now;
          }
        }
        if (now - lastEstimateTime > ESTIMATE_INTERVAL) {
          rppgWorker.postMessage({ type: 'estimate' }); lastEstimateTime = now;
        }
      }
    } else {
        ctx.clearRect(0, 0, uc.width, uc.height);
    }
  });

  const video = videoRef.value;
  if (!video) return;

  new Camera(video, { onFrame: async () => await pose.send({ image: video }), width: 640, height: 480 }).start();
  
  await loadCSV();
  await preloadTemplates();
  if (segments.value.length) { (window as any).__EX_INTENSITY__ = segments.value[0].intensity; }
  segmentStartTime = performance.now();

  fit(userCanvasRef.value!); fit(templateCanvasRef.value!);
  window.addEventListener('resize', () => { fit(userCanvasRef.value!); fit(templateCanvasRef.value!) });

  renderTemplate();
});

onBeforeUnmount(() => { rppgWorker.terminate() });
</script>

<style scoped>
.game-canvas { display: flex; flex-direction: column; padding: 16px; }
.controls { display: flex; gap: 16px; align-items: center; margin-bottom: 16px; }
.split-container { display: grid; grid-template-columns: 2fr 1fr; gap: 24px; width: 100%; height: 80vh; }
.pane { position: relative; background: #f3f3f3; border-radius: 8px; overflow: hidden; }
.video-pane { transform: scaleX(-1); }
.video-pane .hr-display { transform: scaleX(-1); left: 12px; right: auto; }
video, canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; }
.action-label { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); background: rgba(255, 255, 255, 0.9); padding: 6px 12px; border-radius: 4px; font-weight: bold; z-index: 2; }
.next-label { position: absolute; top: 12px; right: 12px; background: rgba(255, 255, 255, 0.8); padding: 4px 8px; border-radius: 4px; font-size: 0.9em; z-index: 2; }
.judgement { position: absolute; bottom: 48px; right: 12px; background: rgba(0, 0, 0, 0.6); color: #fff; padding: 6px 12px; border-radius: 4px; font-size: 1.2em; font-weight: bold; z-index: 2; }
.feedback { position: absolute; bottom: 12px; right: 12px; max-width: 60%; background: rgba(0, 0, 0, 0.5); color: #fff; padding: 6px 10px; border-radius: 4px; font-size: 0.9em; line-height: 1.3; z-index: 2; }
.hr-display { position: absolute; top: 12px; right: 12px; background: rgba(255, 255, 255, 0.9); padding: 6px 12px; border-radius: 6px; font-weight: bold; color: #d60000; z-index: 3; font-size: 1.1em; }
.debug-toggle { font-size: 12px; color: #333; }
@media (max-width: 768px) { .split-container { grid-template-columns: 1fr; height: auto; } }
</style>