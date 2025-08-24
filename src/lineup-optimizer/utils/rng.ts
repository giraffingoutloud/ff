/**
 * Seeded Random Number Generator
 * Uses a simple but effective PRNG for reproducible simulations
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
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  
  /**
   * Generate uniform in [a, b)
   */
  uniform(a: number = 0, b: number = 1): number {
    return a + (b - a) * this.next();
  }
  
  /**
   * Generate integer in [0, n)
   */
  nextInt(n?: number): number {
    if (n === undefined) return Math.floor(this.next() * 2147483647);
    return Math.floor(this.next() * n);
  }
}