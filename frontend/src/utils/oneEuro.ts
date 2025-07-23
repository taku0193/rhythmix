// Simple One Euro Filter implementation for realtime smoothing
// https://cristal.univ-lille.fr/~casiez/1euro/

export class OneEuroFilter {
  private freq: number
  private minCutoff: number
  private beta: number
  private dCutoff: number
  private xPrev: number | null = null
  private dxPrev: number | null = null
  private lastTime: number | null = null

  constructor(freq = 120, minCutoff = 1.0, beta = 0.0, dCutoff = 1.0){
    this.freq=freq; this.minCutoff=minCutoff; this.beta=beta; this.dCutoff=dCutoff
  }
  private alpha(cutoff:number){
    const te = 1.0/this.freq
    const tau = 1.0/(2*Math.PI*cutoff)
    return 1.0/(1.0+tau/te)
  }
  filter(x:number, timestamp?:number){
    if(this.xPrev===null){ this.xPrev=x; return x }
    const dt = timestamp && this.lastTime? (timestamp-this.lastTime)/1000 : 1.0/this.freq
    if(dt>0) this.freq = 1.0/dt
    const dx = (x - this.xPrev)/dt
    const aD = this.alpha(this.dCutoff)
    const dxHat = this.dxPrev===null? dx : aD*dx + (1-aD)*this.dxPrev
    const cutoff = this.minCutoff + this.beta*Math.abs(dxHat)
    const a = this.alpha(cutoff)
    const xHat = a*x + (1-a)*this.xPrev
    this.xPrev = xHat
    this.dxPrev = dxHat
    this.lastTime = timestamp ?? this.lastTime
    return xHat
  }
}