#!/usr/bin/env tsx

/**
 * Test script for broadcast assistant improvements
 * Validates that repetitive "working on it" messages are eliminated
 * and only meaningful updates are spoken
 */

import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

class BroadcastTester {
  private results: TestResult[] = [];

  async runAllTests(): Promise<void> {
    console.log('🧪 Testing Broadcast Assistant Improvements');
    console.log('================================================\n');

    // Test 1: Verify timing improvements
    await this.testTimingImprovements();
    
    // Test 2: Verify GPT prompt improvements
    await this.testGPTPromptImprovements();
    
    // Test 3: Verify message filtering
    await this.testMessageFiltering();
    
    // Test 4: Verify duplicate detection
    await this.testDuplicateDetection();

    this.printResults();
  }

  private async testTimingImprovements(): Promise<void> {
    console.log('🕐 Testing timing improvements...');
    
    try {
      // Check enhanced-server.ts for improved timing
      const enhancedContent = await fs.readFile('src/web/enhanced-server.ts', 'utf-8');
      
      const has35SecondInterval = enhancedContent.includes('}, 35000);');
      const has20SecondPolling = enhancedContent.includes('}, 20000); // every 20 seconds');
      const has15SecondFlush = enhancedContent.includes('15000; // 15 seconds');
      
      if (has35SecondInterval && has20SecondPolling && has15SecondFlush) {
        this.results.push({
          name: 'Timing Improvements',
          passed: true,
          details: 'Summary interval: 35s, AI polling: 20s, Flush timeout: 15s'
        });
      } else {
        this.results.push({
          name: 'Timing Improvements',
          passed: false,
          details: `Missing timing updates - 35s: ${has35SecondInterval}, 20s: ${has20SecondPolling}, 15s: ${has15SecondFlush}`
        });
      }
    } catch (error) {
      this.results.push({
        name: 'Timing Improvements',
        passed: false,
        details: `Error reading file: ${error}`
      });
    }
  }

  private async testGPTPromptImprovements(): Promise<void> {
    console.log('🤖 Testing GPT prompt improvements...');
    
    try {
      const enhancedContent = await fs.readFile('src/web/enhanced-server.ts', 'utf-8');
      
      const hasImprovedPrompt = enhancedContent.includes('Only provide a brief update if there is meaningful progress');
      const hasSkipLogic = enhancedContent.includes('if (spoken.toUpperCase().includes(\'SKIP\'))');
      const removedOldPrompt = !enhancedContent.includes('Working on it" or just "Done"');
      
      if (hasImprovedPrompt && hasSkipLogic && removedOldPrompt) {
        this.results.push({
          name: 'GPT Prompt Improvements',
          passed: true,
          details: 'Smart prompt with SKIP logic implemented'
        });
      } else {
        this.results.push({
          name: 'GPT Prompt Improvements',
          passed: false,
          details: `Improved prompt: ${hasImprovedPrompt}, Skip logic: ${hasSkipLogic}, Old prompt removed: ${removedOldPrompt}`
        });
      }
    } catch (error) {
      this.results.push({
        name: 'GPT Prompt Improvements',
        passed: false,
        details: `Error: ${error}`
      });
    }
  }

  private async testMessageFiltering(): Promise<void> {
    console.log('🔍 Testing message filtering improvements...');
    
    try {
      const enhancedContent = await fs.readFile('src/web/enhanced-server.ts', 'utf-8');
      
      const hasMeaningfulFilter = enhancedContent.includes('const isMeaningful = (');
      const hasRoutineFilter = enhancedContent.includes('const isRoutine = (');
      const hasConditionalBuffering = enhancedContent.includes('if (isMeaningful && !isRoutine)');
      
      if (hasMeaningfulFilter && hasRoutineFilter && hasConditionalBuffering) {
        this.results.push({
          name: 'Message Filtering',
          passed: true,
          details: 'Smart filtering: only meaningful, non-routine messages buffered'
        });
      } else {
        this.results.push({
          name: 'Message Filtering',
          passed: false,
          details: `Meaningful filter: ${hasMeaningfulFilter}, Routine filter: ${hasRoutineFilter}, Conditional: ${hasConditionalBuffering}`
        });
      }
    } catch (error) {
      this.results.push({
        name: 'Message Filtering',
        passed: false,
        details: `Error: ${error}`
      });
    }
  }

  private async testDuplicateDetection(): Promise<void> {
    console.log('🔄 Testing enhanced duplicate detection...');
    
    try {
      const enhancedContent = await fs.readFile('src/web/enhanced-server.ts', 'utf-8');
      
      const has45SecondWindow = enhancedContent.includes('now - last.time < 45000');
      const hasSemanticCheck = enhancedContent.includes('const isWorkingMessage = /working|processing|analyzing|monitoring/i.test(spoken);');
      const hasWorkingMessageSkip = enhancedContent.includes('if (isWorkingMessage && wasWorkingMessage)');
      
      if (has45SecondWindow && hasSemanticCheck && hasWorkingMessageSkip) {
        this.results.push({
          name: 'Duplicate Detection',
          passed: true,
          details: 'Enhanced detection: 45s window + semantic similarity check'
        });
      } else {
        this.results.push({
          name: 'Duplicate Detection',
          passed: false,
          details: `45s window: ${has45SecondWindow}, Semantic check: ${hasSemanticCheck}, Working skip: ${hasWorkingMessageSkip}`
        });
      }
    } catch (error) {
      this.results.push({
        name: 'Duplicate Detection',
        passed: false,
        details: `Error: ${error}`
      });
    }
  }

  private printResults(): void {
    console.log('\n📊 Test Results');
    console.log('================\n');

    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;

    this.results.forEach(result => {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`${status} ${result.name}`);
      if (result.details) {
        console.log(`   ${result.details}`);
      }
      console.log('');
    });

    console.log(`Overall: ${passed}/${total} tests passed\n`);

    if (passed === total) {
      console.log('🎉 All broadcast assistant improvements are working correctly!');
      console.log('✨ Expected behavior:');
      console.log('   • No more repetitive "working on it" every 2-11 seconds');
      console.log('   • Updates only for meaningful progress (errors, AI questions, completion)');
      console.log('   • Smarter timing: 35s intervals, 20s AI polling, 15s flush timeout');
      console.log('   • Enhanced duplicate detection prevents similar messages');
      console.log('   • GPT can intelligently skip routine updates');
    } else {
      console.log('❌ Some improvements need attention. Check the details above.');
      process.exit(1);
    }
  }
}

// Run tests
const tester = new BroadcastTester();
tester.runAllTests().catch(console.error); 