#!/usr/bin/env node

import WebSocket from 'ws';
import { CursorAutomator } from './cursor/automator';

class EnhancedExperienceTestSuite {
  private results: Array<{name: string, passed: boolean, details: string}> = [];
  private ws: WebSocket | null = null;

  async runAllTests(): Promise<void> {
    console.log('🧪 Enhanced VibeTalk Experience Test Suite');
    console.log('='.repeat(60));

    await this.testServerAvailability();
    await this.testWebSocketConnection();
    await this.testCursorIntegration();
    
    this.printSummary();
  }

  private async testServerAvailability(): Promise<void> {
    console.log('1️⃣ Testing Enhanced Server...');
    try {
      const response = await fetch('http://localhost:3000/enhanced-widget.js');
      if (response.ok) {
        const content = await response.text();
        const hasEnhancedFeatures = content.includes('conversationPanel') && 
                                  content.includes('statusPanel');
        this.addResult('Enhanced Server', hasEnhancedFeatures, 
          hasEnhancedFeatures ? 'Enhanced features detected' : 'Missing enhanced features');
      } else {
        this.addResult('Enhanced Server', false, `HTTP ${response.status}`);
      }
    } catch (error) {
      this.addResult('Enhanced Server', false, 'Connection failed');
    }
  }

  private async testWebSocketConnection(): Promise<void> {
    console.log('2️⃣ Testing WebSocket...');
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.addResult('WebSocket Connection', false, 'Timeout');
        resolve();
      }, 5000);

      this.ws = new WebSocket('ws://localhost:3001');
      this.ws.on('open', () => {
        clearTimeout(timeout);
        this.addResult('WebSocket Connection', true, 'Connected successfully');
        resolve();
      });
      this.ws.on('error', () => {
        clearTimeout(timeout);
        this.addResult('WebSocket Connection', false, 'Connection error');
        resolve();
      });
    });
  }

  private async testCursorIntegration(): Promise<void> {
    console.log('3️⃣ Testing Cursor Integration...');
    try {
      const cursorAutomator = new CursorAutomator();
      const isRunning = await cursorAutomator.isCursorRunning();
      this.addResult('Cursor Integration', isRunning, 
        isRunning ? 'Cursor detected and ready' : 'Cursor not running');
    } catch (error) {
      this.addResult('Cursor Integration', false, 'Integration test failed');
    }
  }

  private addResult(name: string, passed: boolean, details: string): void {
    this.results.push({ name, passed, details });
    console.log(`   ${passed ? '✅' : '❌'} ${name}: ${details}`);
  }

  private printSummary(): void {
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    
    console.log(`\n📊 Results: ${passed}/${total} tests passed`);
    
    if (passed === total) {
      console.log('🎉 All tests passed! Enhanced experience is ready.');
      console.log('\n💡 Next steps:');
      console.log('   1. Run: npm run web-enhanced');
      console.log('   2. Open: http://localhost:3000');
      console.log('   3. Use the enhanced voice interface!');
    } else {
      console.log('⚠️  Some tests failed. Check the issues above.');
    }
  }

  async cleanup(): Promise<void> {
    if (this.ws) this.ws.close();
  }
}

async function main() {
  const testSuite = new EnhancedExperienceTestSuite();
  try {
    await testSuite.runAllTests();
  } finally {
    await testSuite.cleanup();
  }
}

if (require.main === module) {
  main();
}
