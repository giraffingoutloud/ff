/**
 * Seeded random number generator for reproducibility
 * Uses Mulberry32 algorithm
 */
export class RNG {
  private state: number;
  
  constructor(seed: number = 123456789) {
    this.state = seed >>> 0;
  }
  
  /**
   * Generate uniform random in [0, 1)
   */
  next(): number {
    let t = (this.state += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  
  /**
   * Generate standard normal using Box-Muller
   */
  normal(): number {
    let u = 0, v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }
  
  /**
   * Generate normal with mean and stddev
   */
  normalWithParams(mean: number, stdDev: number): number {
    return mean + stdDev * this.normal();
  }
}