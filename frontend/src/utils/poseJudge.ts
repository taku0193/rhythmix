// src/utils/poseJudge.ts
import type { NormalizedLandmark } from "@mediapipe/pose"

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

  const LEFT_HIP = 23, RIGHT_HIP = 24
  const LEFT_SHOULDER = 11, RIGHT_SHOULDER = 12

  const cx = (lm[LEFT_HIP]?.x ?? lm[0].x + lm[RIGHT_HIP]?.x ?? lm[0].x) / 2
  const cy = (lm[LEFT_HIP]?.y ?? lm[0].y + lm[RIGHT_HIP]?.y ?? lm[0].y) / 2

  let moved = lm.map(p => ({ x: p.x - cx, y: p.y - cy }))

  const sx = (lm[LEFT_SHOULDER]?.x ?? lm[0].x) - (lm[RIGHT_SHOULDER]?.x ?? lm[0].x)
  const sy = (lm[LEFT_SHOULDER]?.y ?? lm[0].y) - (lm[RIGHT_SHOULDER]?.y ?? lm[0].y)
  const shoulderDist = Math.hypot(sx, sy) || 1
  moved = moved.map(p => ({ x: p.x / shoulderDist, y: p.y / shoulderDist }))

  if (doRotate) {
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

  // スコアと評価のしきい値を大幅に緩和
  const score = Math.max(0, 1 - avg / 0.30) // 正規化の除数を 0.12 -> 0.25 に変更
  let grade: JudgeResult["grade"] = "Bad"

  // ★★★ しきい値を大幅に引き上げ ★★★
  if (avg < 2) grade = "Good"      // 以前は 0.05
  else if (avg < 3) grade = "OK"  // 以前は 0.1

  const joints = errs
    .map((err, index) => ({ index, err }))
    .sort((a, b) => b.err - a.err)
    .slice(0, 3)

  const message = buildFeedback(joints, grade)

  return { score, grade, jointErrors: errs.map((err, index) => ({ index, err })), message }
}

const JOINT_NAMES: Record<number, string> = {
  11: "左肩", 12: "右肩", 13: "左肘", 14: "右肘", 15: "左手首", 16: "右手首",
  23: "左腰", 24: "右腰", 25: "左膝", 26: "右膝", 27: "左足首", 28: "右足首",
}

// gradeに応じてフィードバックを改善
function buildFeedback(joints: Array<{ index: number; err: number }>, grade: JudgeResult["grade"]): string {
  if (grade === "Good") return "素晴らしい！その調子！"
  if (grade === "OK") return "良い感じ！もう少し！"

  const parts = joints
    .filter(j => j.err > 0.05 && JOINT_NAMES[j.index]) // エラーが大きく、名前が定義されている関節のみ
    .map(j => JOINT_NAMES[j.index])
  if (!parts.length) return "惜しい！全体のバランスを意識してみて！"
  return `${parts.join("・")} の位置がずれているかも？`
}