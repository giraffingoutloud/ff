/**
 * Test Runner for ESPN 2025-2026 Lineup Optimizer
 * Verifies all components work together
 */

import { runAllTests } from './tests/testSuite2025';

// Run all tests
(async () => {
  try {
    console.log('================================');
    console.log('ESPN 2025-2026 Lineup Optimizer');
    console.log('Test Suite Execution');
    console.log('================================\n');
    
    await runAllTests();
    
    console.log('\n================================');
    console.log('All tests completed successfully!');
    console.log('System ready for 2025-2026 season');
    console.log('Default: 1 QB, 2 RB, 2 WR, 1 TE, 1 FLEX, 1 K, 1 DST');
    console.log('================================');
  } catch (error: any) {
    console.error('\n================================');
    console.error('Test failure:', error?.stack || error);
    console.error('================================');
    process.exit(1);
  }
})();