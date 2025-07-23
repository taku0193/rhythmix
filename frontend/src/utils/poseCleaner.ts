// poseCleaner.ts
// テンプレ読み込み後にその場で正規化＆平滑化する場合に使用
// （Pythonで事前クリーン済みなら最小限でOK）

export type LM = { x: number; y: number; z?: number; visibility?: number }
export type Frame = { frame_id: number; landmarks: LM[] }

const L_SHOULDER = 11, R_SHOULDER = 12
const L_HIP = 23, R_HIP = 24
const LEFT_RIGHT_PAIRS = [
  [11, 12], [13, 14], [15, 16],
  [23, 24], [25, 26], [27, 28]
] as const

// -------- Matrix helpers --------
function matMul3(R: number[][], v: number[]): number[] {
  return [
    R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2],
    R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2],
    R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2]
  ]
}

function transpose(A: number[][]): number[][] {
  return A[0].map((_, i) => A.map(r => r[i]))
}

function svd2x2(A: number[][]): {V:number[][], S:number[], Wt:number[][]} {
  // very small helper for 3x3? -> We'll just use numeric approach? but keep simple
  // For simplicity and performance, use numeric.js or move to Python.
  // Here we implement a quick SVD via mathjs? If you can import, do so.
  // ---- Simplify: Use Kabsch only on torso 4 points -> we can compute rotation via orthonormal basis.
  throw new Error('Use basis-alignment instead (see below).')
}

// ---- Instead of full Kabsch in TS, do basis alignment:
function buildRotation(fromX: number[], fromY: number[], toX: number[], toY: number[]): number[][] {
  // Make orthonormal basis fromX/fromY -> toX/toY
  const norm = (v:number[]) => {
    const l = Math.hypot(...v); return l>1e-8? v.map(x=>x/l): [0,0,0]
  }
  const cross = (a:number[], b:number[]) => [
    a[1]*b[2]-a[2]*b[1],
    a[2]*b[0]-a[0]*b[2],
    a[0]*b[1]-a[1]*b[0]
  ]

  const fx = norm(fromX)
  let fy = fromY
  // remove component on fx
  const dot = fx[0]*fy[0]+fx[1]*fy[1]+fx[2]*fy[2]
  fy = [fy[0]-dot*fx[0], fy[1]-dot*fx[1], fy[2]-dot*fx[2]]
  fy = norm(fy)
  const fz = cross(fx, fy)

  const tx = norm(toX)
  let ty = toY
  const dot2 = tx[0]*ty[0]+tx[1]*ty[1]+tx[2]*ty[2]
  ty = [ty[0]-dot2*tx[0], ty[1]-dot2*tx[1], ty[2]-dot2*tx[2]]
  ty = norm(ty)
  const tz = cross(tx, ty)

  const F = [fx, fy, fz] // from basis
  const T = [tx, ty, tz] // to basis

  // rotation R: F -> T  => R = T * F^T
  const Ft = transpose(F)
  const R = [
    [ T[0][0]*Ft[0][0] + T[0][1]*Ft[1][0] + T[0][2]*Ft[2][0],
      T[0][0]*Ft[0][1] + T[0][1]*Ft[1][1] + T[0][2]*Ft[2][1],
      T[0][0]*Ft[0][2] + T[0][1]*Ft[1][2] + T[0][2]*Ft[2][2] ],
    [ T[1][0]*Ft[0][0] + T[1][1]*Ft[1][0] + T[1][2]*Ft[2][0],
      T[1][0]*Ft[0][1] + T[1][1]*Ft[1][1] + T[1][2]*Ft[2][1],
      T[1][0]*Ft[0][2] + T[1][1]*Ft[1][2] + T[1][2]*Ft[2][2] ],
    [ T[2][0]*Ft[0][0] + T[2][1]*Ft[1][0] + T[2][2]*Ft[2][0],
      T[2][0]*Ft[0][1] + T[2][1]*Ft[1][1] + T[2][2]*Ft[2][1],
      T[2][0]*Ft[0][2] + T[2][1]*Ft[1][2] + T[2][2]*Ft[2][2] ]
  ]
  return R
}

function ensureFrontFacing(xyz: number[][]): number[][] {
  const Ls = xyz[L_SHOULDER], Rs = xyz[R_SHOULDER]
  const Lh = xyz[L_HIP], Rh = xyz[R_HIP]
  const s = [Rs[0]-Ls[0], Rs[1]-Ls[1], Rs[2]-Ls[2]]
  const t = [ (Ls[0]+Rs[0])/2 - (Lh[0]+Rh[0])/2,
              (Ls[1]+Rs[1])/2 - (Lh[1]+Rh[1])/2,
              (Ls[2]+Rs[2])/2 - (Lh[2]+Rh[2])/2 ]
  const cross = (a:number[], b:number[]) => [
    a[1]*b[2]-a[2]*b[1],
    a[2]*b[0]-a[0]*b[2],
    a[0]*b[1]-a[1]*b[0]
  ]
  const n = cross(s,t)
  const cameraDir = [0,0,-1]
  const dot = n[0]*cameraDir[0] + n[1]*cameraDir[1] + n[2]*cameraDir[2]
  if (dot < 0) {
    // swap
    for (const [l,r] of LEFT_RIGHT_PAIRS) {
      const tmp = xyz[l]; xyz[l] = xyz[r]; xyz[r] = tmp
    }
    const R180 = [ [-1,0,0],[0,1,0],[0,0,-1] ]
    for (let j=0;j<xyz.length;j++) {
      const v = xyz[j]
      const vv = matMul3(R180, v)
      xyz[j] = vv
    }
  }
  return xyz
}

function median(arr: number[]): number {
  const a = [...arr].sort((x,y)=>x-y)
  const m = Math.floor(a.length/2)
  return a.length%2? a[m] : (a[m-1]+a[m])/2
}

function removeSpikes(xyz: number[][][], vis: number[][], velK=5): number[][][] {
  const T = xyz.length, J = xyz[0].length
  const vel: number[][] = Array.from({length:T-1}, ()=>Array(J).fill(0))
  for(let t=1;t<T;t++){
    for(let j=0;j<J;j++){
      const dx = xyz[t][j][0]-xyz[t-1][j][0]
      const dy = xyz[t][j][1]-xyz[t-1][j][1]
      const dz = xyz[t][j][2]-xyz[t-1][j][2]
      vel[t-1][j] = Math.hypot(dx,dy,dz)
    }
  }
  const thr: number[] = []
  for(let j=0;j<J;j++){
    const col = vel.map(v=>v[j])
    thr[j] = median(col)*velK + 1e-6
  }
  const spike: boolean[][] = Array.from({length:T},()=>Array(J).fill(false))
  for(let t=1;t<T;t++){
    for(let j=0;j<J;j++){
      if(vel[t-1][j] > thr[j]) spike[t][j] = true
    }
  }
  for(let t=0;t<T;t++){
    for(let j=0;j<J;j++){
      if((vis?.[t]?.[j] ?? 1) < 0.5) spike[t][j] = true
    }
  }
  for(let j=0;j<J;j++){
    const badIdx:number[] = []
    const goodIdx:number[] = []
    for(let t=0;t<T;t++) (spike[t][j]?badIdx:goodIdx).push(t)
    if(badIdx.length){
      for (let c=0;c<3;c++){
        const goodVals = goodIdx.map(t=>xyz[t][j][c])
        for(const t of badIdx){
          // linear interp
          // find nearest prev/next good
          let p = goodIdx.filter(g=>g<t).pop()
          let n = goodIdx.find(g=>g>t)
          if(p===undefined) p = goodIdx[0]
          if(n===undefined) n = goodIdx[goodIdx.length-1]
          const v = xyz[p][j][c] + (xyz[n][j][c]-xyz[p][j][c]) * ((t-p)/(n-p||1))
          xyz[t][j][c] = v
        }
      }
    }
  }
  return xyz
}

function savgolSmooth(data: number[], window=9, poly=2): number[] {
  if (data.length < window) return data
  // simple SG via convolution of precomputed coeffs (window 9, poly2)
  // coeffs for window=9, poly=2 (centered): [-21,14,39,54,59,54,39,14,-21]/231
  const coeff = [-21,14,39,54,59,54,39,14,-21].map(c=>c/231)
  const half = Math.floor(window/2)
  const out = data.slice()
  for(let i=0;i<data.length;i++){
    let acc=0
    for(let k=-half;k<=half;k++){
      let idx=i+k
      if(idx<0) idx=0
      if(idx>=data.length) idx=data.length-1
      acc+= data[idx]*coeff[k+half]
    }
    out[i]=acc
  }
  return out
}

export function normalizeAndSmooth(frames: Frame[]): Frame[] {
  const T = frames.length
  const J = frames[0].landmarks.length
  const xyz: number[][][] = Array.from({length:T},()=>Array.from({length:J},()=>[0,0,0]))
  const vis: number[][] = Array.from({length:T},()=>Array(J).fill(1))

  for(let t=0;t<T;t++){
    for(let j=0;j<J;j++){
      const lm = frames[t].landmarks[j]
      xyz[t][j][0]= lm.x ?? 0
      xyz[t][j][1]= lm.y ?? 0
      xyz[t][j][2]= lm.z ?? 0
      vis[t][j]   = lm.visibility ?? 1
    }
  }

  // translate
  for(let t=0;t<T;t++){
    const hipC = [
      (xyz[t][L_HIP][0]+xyz[t][R_HIP][0])/2,
      (xyz[t][L_HIP][1]+xyz[t][R_HIP][1])/2,
      (xyz[t][L_HIP][2]+xyz[t][R_HIP][2])/2,
    ]
    for(let j=0;j<J;j++){
      xyz[t][j][0]-=hipC[0]
      xyz[t][j][1]-=hipC[1]
      xyz[t][j][2]-=hipC[2]
    }
  }

  // scale by avg shoulder width
  let sum=0, cnt=0
  for(let t=0;t<T;t++){
    const dx = xyz[t][R_SHOULDER][0]-xyz[t][L_SHOULDER][0]
    const dy = xyz[t][R_SHOULDER][1]-xyz[t][L_SHOULDER][1]
    const dz = xyz[t][R_SHOULDER][2]-xyz[t][L_SHOULDER][2]
    sum += Math.hypot(dx,dy,dz)
    cnt++
  }
  const scale = cnt? sum/cnt : 1
  for(let t=0;t<T;t++){
    for(let j=0;j<J;j++){
      xyz[t][j][0]/=scale
      xyz[t][j][1]/=scale
      xyz[t][j][2]/=scale
    }
  }

  // rotate torso basis
  const targetX = [1,0,0]
  const targetY = [0,1,0]

  for(let t=0;t<T;t++){
    const sx = [ xyz[t][R_SHOULDER][0]-xyz[t][L_SHOULDER][0], xyz[t][R_SHOULDER][1]-xyz[t][L_SHOULDER][1], xyz[t][R_SHOULDER][2]-xyz[t][L_SHOULDER][2] ]
    const tx = [ (xyz[t][L_SHOULDER][0]+xyz[t][R_SHOULDER][0])/2 - (xyz[t][L_HIP][0]+xyz[t][R_HIP][0])/2,
                 (xyz[t][L_SHOULDER][1]+xyz[t][R_SHOULDER][1])/2 - (xyz[t][L_HIP][1]+xyz[t][R_HIP][1])/2,
                 (xyz[t][L_SHOULDER][2]+xyz[t][R_SHOULDER][2])/2 - (xyz[t][L_HIP][2]+xyz[t][R_HIP][2])/2 ]
    const R = buildRotation(sx, tx, targetX, targetY)
    for(let j=0;j<J;j++){
      xyz[t][j] = matMul3(R, xyz[t][j])
    }
    xyz[t] = ensureFrontFacing(xyz[t])
  }

  // spike removal
  removeSpikes(xyz, vis, 5)

  // SG smooth
  for(let j=0;j<J;j++){
    for(let c=0;c<3;c++){
      const series = xyz.map(f=>f[j][c])
      const sm = savgolSmooth(series, 9, 2)
      for(let t=0;t<T;t++) xyz[t][j][c] = sm[t]
    }
  }

  // rebuild
  return frames.map((f, t)=>({
    frame_id: t,
    landmarks: f.landmarks.map((_, j)=>({
      x: xyz[t][j][0],
      y: xyz[t][j][1],
      z: xyz[t][j][2],
      visibility: vis[t][j]
    }))
  }))
}