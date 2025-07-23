// src/utils/poseJudge.ts
import type { NormalizedLandmark } from "@mediapipe/pose"  // もし型を使うなら

export interface JudgeResult {
  score: number
  grade: "Good" | "OK" | "Bad"
  jointErrors: Array<{ index: number; err: number }>
  message: string
}

/**
 * ランドマークを「中心平行移動 + スケール正規化 (+回転補正)」して返す
 */
export function normalizeLandmarks(
  lm: Array<{ x: number; y: number }>,
  doRotate = true
): Array<{ x: number; y: number }> {
  if (!lm.length) return lm

  // 必要な関節index（MediaPipe Poseの想定）
  const LEFT_HIP = 23, RIGHT_HIP = 24
  const LEFT_SHOULDER = 11, RIGHT_SHOULDER = 12

  // 中心：腰の中点
  const cx = (lm[LEFT_HIP]?.x ?? lm[0].x + lm[RIGHT_HIP]?.x ?? lm[0].x) / 2
  const cy = (lm[LEFT_HIP]?.y ?? lm[0].y + lm[RIGHT_HIP]?.y ?? lm[0].y) / 2

  // 平行移動
  let moved = lm.map(p => ({ x: p.x - cx, y: p.y - cy }))

  // スケール：肩幅
  const sx = (lm[LEFT_SHOULDER]?.x ?? lm[0].x) - (lm[RIGHT_SHOULDER]?.x ?? lm[0].x)
  const sy = (lm[LEFT_SHOULDER]?.y ?? lm[0].y) - (lm[RIGHT_SHOULDER]?.y ?? lm[0].y)
  const shoulderDist = Math.hypot(sx, sy) || 1
  moved = moved.map(p => ({ x: p.x / shoulderDist, y: p.y / shoulderDist }))

  if (doRotate) {
    // 肩ベクトルの角度を x軸に合わせるよう回転
    const angle = Math.atan2(sy, sx)
    const cosA = Math.cos(-angle)
    const sinA = Math.sin(-angle)
    moved = moved.map(p => ({
      x: p.x * cosA - p.y * sinA,
      y: p.x * sinA + p.y * cosA
    }))
  }

  return moved
}

/**
 * 2つの正規化済みランドマーク配列の誤差を計算
 */
export function calcErrors(
  tmpl: Array<{ x: number; y: number }>,
  user: Array<{ x: number; y: number }>
): Array<number> {
  const n = Math.min(tmpl.length, user.length)
  const errs: number[] = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    const dx = (user[i].x ?? 0) - (tmpl[i].x ?? 0)
    const dy = (user[i].y ?? 0) - (tmpl[i].y ?? 0)
    errs[i] = Math.hypot(dx, dy)
  }
  return errs
}

export function judgePose(
  tmplLm: Array<{ x: number; y: number }>,
  userLm: Array<{ x: number; y: number }>
): JudgeResult {
  const tmplN = normalizeLandmarks(tmplLm, true)
  const userN = normalizeLandmarks(userLm, true)

  const errs = calcErrors(tmplN, userN)
  const validErrs = errs.filter(e => isFinite(e))
  const avg = validErrs.reduce((p, c) => p + c, 0) / (validErrs.length || 1)

  // スコア: 0〜1（0が最良）
  const score = Math.max(0, 1 - avg / 0.08)  // 0.08 は適当な正規化幅
  let grade: JudgeResult["grade"] = "Bad"
  if (avg < 0.03) grade = "Good"
  else if (avg < 0.06) grade = "OK"

  // 大きい誤差TOP3
  const joints = errs
    .map((err, index) => ({ index, err }))
    .sort((a, b) => b.err - a.err)
    .slice(0, 3)

  const message = buildFeedback(joints)

  return { score, grade, jointErrors: joints, message }
}

// 簡単な関節名マップ（必要なら増やす）
const JOINT_NAMES: Record<number, string> = {
  0:  "鼻",
  1:  "左目内側",
  2:  "左目中央",
  3:  "左目外側",
  4:  "右目内側",
  5:  "右目中央",
  6:  "右目外側",
  7:  "左耳",
  8:  "右耳",
  9:  "口左端",
  10: "口右端",
  11: "左肩",
  12: "右肩",
  13: "左肘",
  14: "右肘",
  15: "左手首",
  16: "右手首",
  17: "左小指先",
  18: "右小指先",
  19: "左人差し指先",
  20: "右人差し指先",
  21: "左親指先",
  22: "右親指先",
  23: "左腰",
  24: "右腰",
  25: "左膝",
  26: "右膝",
  27: "左足首",
  28: "右足首",
  29: "左かかと",
  30: "右かかと",
  31: "左足先(親指付け根)",
  32: "右足先(親指付け根)",
}

function buildFeedback(joints: Array<{ index: number; err: number }>): string {
  if (!joints.length) return ""
  const parts = joints
    .filter(j => j.err > 0.03) // ある程度大きいエラーのみ
    .map(j => JOINT_NAMES[j.index] || `#${j.index}`)
  if (!parts.length) return "いい感じです！そのまま！"
  return `${parts.join("・")} がずれているよ。位置/角度を意識してみて！`
}
