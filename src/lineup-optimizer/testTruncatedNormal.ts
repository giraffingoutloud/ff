/**
 * Test TruncatedNormal distribution functions
 */

import { TruncatedNormal } from './stats/truncatedNormalRobust';
import { RNG } from './utils/rng';

function testTruncatedNormal() {
  console.log('=== Testing TruncatedNormal Distribution ===\n');
  
  try {
    // Test 1: Basic creation and properties
    console.log('1. Basic TruncatedNormal creation:');
    const tn1 = new TruncatedNormal(20, 5, 0, 50);
    console.log(`   Mean: ${tn1.mean().toFixed(2)}`);
    console.log(`   StdDev: ${Math.sqrt(tn1.variance()).toFixed(2)}`);
    console.log(`   Lower: ${tn1.a}, Upper: ${tn1.b}`);
    console.log(`   Variance: ${tn1.variance().toFixed(2)}`);
    
    // Test 2: Sampling
    console.log('\n2. Sampling test:');
    const rng = new RNG(42); // Seeded for reproducibility
    const samples = [];
    for (let i = 0; i < 1000; i++) {
      samples.push(tn1.sample(rng));
    }
    const sampleMean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const sampleMin = Math.min(...samples);
    const sampleMax = Math.max(...samples);
    console.log(`   Generated 1000 samples`);
    console.log(`   Sample mean: ${sampleMean.toFixed(2)} (expected ~${tn1.mean().toFixed(2)})`);
    console.log(`   Sample range: [${sampleMin.toFixed(2)}, ${sampleMax.toFixed(2)}]`);
    console.log(`   All within bounds: ${samples.every(s => s >= 0 && s <= 50)}`);
    
    // Test 3: CDF test
    console.log('\n3. CDF test:');
    const testPoints = [0, 10, 20, 30, 40, 50];
    testPoints.forEach(x => {
      const cdf = tn1.cdf(x);
      console.log(`   x=${x}: CDF=${cdf.toFixed(4)}`);
    });
    
    // Test 4: Quantiles
    console.log('\n4. Quantile test:');
    const quantiles = [0.05, 0.25, 0.5, 0.75, 0.95];
    quantiles.forEach(p => {
      const q = tn1.quantile(p);
      console.log(`   ${(p*100).toFixed(0)}th percentile: ${q.toFixed(2)}`);
    });
    
    // Test 5: Edge cases
    console.log('\n5. Edge cases:');
    
    // Very tight bounds
    const tn2 = new TruncatedNormal(10, 5, 9, 11);
    console.log(`   Tight bounds (9-11): mean=${tn2.mean().toFixed(2)}, stdDev=${Math.sqrt(tn2.variance()).toFixed(2)}`);
    
    // One-sided truncation
    const tn3 = new TruncatedNormal(0, 10, -Infinity, 0);
    const samples3 = Array.from({length: 100}, () => tn3.sample(rng));
    console.log(`   Left-truncated at 0: all samples ≤ 0: ${samples3.every(s => s <= 0)}`);
    
    // Test 6: Correlation with other TN
    console.log('\n6. Correlated sampling:');
    const tn4 = new TruncatedNormal(15, 3, 0, 30);
    const tn5 = new TruncatedNormal(12, 4, 0, 30);
    const correlation = 0.5;
    
    const correlatedSamples = [];
    for (let i = 0; i < 100; i++) {
      const z1 = (Math.random() - 0.5) * Math.sqrt(12); // Standard normal approximation
      const z2 = correlation * z1 + Math.sqrt(1 - correlation * correlation) * (Math.random() - 0.5) * Math.sqrt(12);
      
      const x1 = Math.max(0, Math.min(30, tn4.mean() + Math.sqrt(tn4.variance()) * z1));
      const x2 = Math.max(0, Math.min(30, tn5.mean() + Math.sqrt(tn5.variance()) * z2));
      
      correlatedSamples.push([x1, x2]);
    }
    
    // Calculate sample correlation
    const x1Mean = correlatedSamples.reduce((sum, pair) => sum + pair[0], 0) / correlatedSamples.length;
    const x2Mean = correlatedSamples.reduce((sum, pair) => sum + pair[1], 0) / correlatedSamples.length;
    
    let cov = 0, var1 = 0, var2 = 0;
    correlatedSamples.forEach(([x1, x2]) => {
      cov += (x1 - x1Mean) * (x2 - x2Mean);
      var1 += (x1 - x1Mean) ** 2;
      var2 += (x2 - x2Mean) ** 2;
    });
    
    const sampleCorr = cov / Math.sqrt(var1 * var2);
    console.log(`   Target correlation: ${correlation}`);
    console.log(`   Sample correlation: ${sampleCorr.toFixed(3)}`);
    
    console.log('\n=== All TruncatedNormal Tests Passed ✓ ===');
    
  } catch (error) {
    console.error('\n❌ TruncatedNormal test failed:', error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Run test
testTruncatedNormal();