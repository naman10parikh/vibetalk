#!/usr/bin/env node

import WebSocket from 'ws';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  timing?: number;
}

class E2ETestSuite {
  private results: TestResult[] = [];
  private ws: WebSocket | null = null;
  private messagesReceived: any[] = [];
  private refreshReceived = false;
  private originalFileContent = '';

  async runFullTest(): Promise<void> {
    console.log('🧪 VibeTalk End-to-End Test Suite');
    console.log('='.repeat(60));
    console.log('📋 Testing the complete voice command → auto-refresh workflow');
    console.log('');

    try {
      // Test sequence
      await this.testServerAvailability();
      await this.testWebSocketConnection();
      await this.testMinimalUI();
      await this.testAutoRefreshMechanism();
      await this.testVoiceCommandFlow();
      
      // Print results
      this.printTestSummary();
      
    } finally {
      await this.cleanup();
    }
  }

  private async testServerAvailability(): Promise<void> {
    console.log('1️⃣ Testing Enhanced Server Availability...');
    
    try {
      // Test main page
      const indexResponse = await fetch('http://localhost:3000/');
      const indexOk = indexResponse.ok;
      
      // Test enhanced widget
      const widgetResponse = await fetch('http://localhost:3000/enhanced-widget.js');
      const widgetOk = widgetResponse.ok;
      
      if (indexOk && widgetOk) {
        const widgetCode = await widgetResponse.text();
        
        // Check for minimal UI features (not complex ones)
        const hasMinimalFeatures = widgetCode.includes('statusDiv') && 
                                 widgetCode.includes('micButton') &&
                                 !widgetCode.includes('conversationPanel'); // Should be minimal!
        
        this.addResult('Server Availability', hasMinimalFeatures, 
          hasMinimalFeatures ? 'Minimal UI detected' : 'UI is too complex');
      } else {
        this.addResult('Server Availability', false, 
          `HTTP status: index=${indexResponse.status}, widget=${widgetResponse.status}`);
      }
    } catch (error) {
      this.addResult('Server Availability', false, 
        `Server connection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async testWebSocketConnection(): Promise<void> {
    console.log('2️⃣ Testing WebSocket Connection...');
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.addResult('WebSocket Connection', false, 'Connection timeout');
        resolve();
      }, 5000);

      this.ws = new WebSocket('ws://localhost:3001');
      
      this.ws.on('open', () => {
        clearTimeout(timeout);
        this.addResult('WebSocket Connection', true, 'Connected successfully');
        
        // Set up message listener
        this.ws!.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            this.messagesReceived.push(message);
            
            if (message.type === 'refresh-now') {
              this.refreshReceived = true;
            }
          } catch (e) {
            // Non-JSON message
          }
        });
        
        resolve();
      });
      
      this.ws.on('error', (error) => {
        clearTimeout(timeout);
        this.addResult('WebSocket Connection', false, 
          `Connection error: ${error.message}`);
        resolve();
      });
    });
  }

  private async testMinimalUI(): Promise<void> {
    console.log('3️⃣ Testing Minimal UI Implementation...');
    
    try {
      const widgetResponse = await fetch('http://localhost:3000/enhanced-widget.js');
      const widgetCode = await widgetResponse.text();
      
      // Check for minimal design patterns
      const checks = {
        'OpenAI-style button': widgetCode.includes('#10a37f'), // OpenAI green
        'No complex panels': !widgetCode.includes('conversationPanel'),
        'Simple status': widgetCode.includes('statusDiv'),
        'Auto-hide status': widgetCode.includes('setTimeout'),
        'Proper refresh handling': widgetCode.includes('refresh-now')
      };
      
      const passed = Object.values(checks).every(Boolean);
      const details = Object.entries(checks)
        .map(([check, result]) => `${result ? '✅' : '❌'} ${check}`)
        .join(', ');
      
      this.addResult('Minimal UI', passed, details);
      
    } catch (error) {
      this.addResult('Minimal UI', false, 
        `UI test failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async testAutoRefreshMechanism(): Promise<void> {
    console.log('4️⃣ Testing Auto-Refresh Mechanism...');
    
    try {
      // Read original file content
      const filePath = path.join(process.cwd(), 'src/web/index.html');
      this.originalFileContent = fs.readFileSync(filePath, 'utf8');
      
      // Make a test change
      const testMarker = `<!-- Test change at ${Date.now()} -->`;
      const modifiedContent = this.originalFileContent + testMarker;
      
      console.log('   📝 Making test file change...');
      fs.writeFileSync(filePath, modifiedContent);
      
      // Wait for auto-refresh to trigger
      console.log('   ⏳ Waiting for auto-refresh detection...');
      await this.waitForRefresh();
      
      const refreshDetected = this.refreshReceived;
      this.addResult('Auto-Refresh Mechanism', refreshDetected, 
        refreshDetected ? 'File change triggered refresh' : 'No refresh signal received');
      
    } catch (error) {
      this.addResult('Auto-Refresh Mechanism', false, 
        `Auto-refresh test failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async testVoiceCommandFlow(): Promise<void> {
    console.log('5️⃣ Testing Voice Command Flow...');
    
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.addResult('Voice Command Flow', false, 'WebSocket not connected');
      return;
    }
    
    return new Promise((resolve) => {
      let statusReceived = false;
      const startTime = Date.now();
      
      // Clear previous messages
      this.messagesReceived = [];
      
      // Simulate voice command start
      console.log('   🎤 Simulating voice command start...');
      this.ws!.send('start');
      
      // Monitor for status updates
      const monitor = setInterval(() => {
        const statusMessages = this.messagesReceived.filter(msg => msg.type === 'status');
        
        if (statusMessages.length > 0) {
          statusReceived = true;
          clearInterval(monitor);
          
          const timing = Date.now() - startTime;
          this.addResult('Voice Command Flow', true, 
            `Status updates working. Response time: ${timing}ms`, timing);
          
          // Send stop command
          this.ws!.send('stop');
          resolve();
        }
        
        // Timeout after 10 seconds
        if (Date.now() - startTime > 10000) {
          clearInterval(monitor);
          this.addResult('Voice Command Flow', false, 
            `No status response within 10 seconds. Messages: ${this.messagesReceived.length}`);
          resolve();
        }
      }, 100);
    });
  }

  private async waitForRefresh(): Promise<void> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve();
      }, 8000); // Wait up to 8 seconds for refresh
      
      const checkRefresh = setInterval(() => {
        if (this.refreshReceived) {
          clearInterval(checkRefresh);
          clearTimeout(timeout);
          resolve();
        }
      }, 100);
    });
  }

  private addResult(name: string, passed: boolean, details: string, timing?: number): void {
    this.results.push({ name, passed, details, timing });
    const status = passed ? '✅ PASS' : '❌ FAIL';
    const timingInfo = timing ? ` (${timing}ms)` : '';
    console.log(`   ${status}: ${details}${timingInfo}`);
  }

  private printTestSummary(): void {
    console.log('\n📊 End-to-End Test Results:');
    console.log('='.repeat(60));
    
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    const percentage = Math.round((passed / total) * 100);
    
    console.log(`\n📈 Overall: ${passed}/${total} tests passed (${percentage}%)`);
    
    if (passed === total) {
      console.log('\n🎉 ✅ ALL TESTS PASSED! Voice command workflow is working correctly!');
      console.log('\n✨ Verified Features:');
      console.log('   ✅ Minimal OpenAI-style UI');
      console.log('   ✅ WebSocket connectivity');
      console.log('   ✅ Auto-refresh on file changes');
      console.log('   ✅ Voice command status updates');
      console.log('   ✅ Complete localhost workflow');
      
      console.log('\n🚀 Ready for Production:');
      console.log('   1. Run: npm run web-enhanced');
      console.log('   2. Open: http://localhost:3000');
      console.log('   3. Click microphone and speak your commands');
      console.log('   4. Watch real-time updates and auto-refresh');
      
    } else {
      console.log('\n⚠️  Some tests failed. Issues detected:');
      this.results.filter(r => !r.passed).forEach(result => {
        console.log(`   ❌ ${result.name}: ${result.details}`);
      });
      
      console.log('\n🔧 Troubleshooting:');
      console.log('   1. Ensure enhanced server is running: npm run web-enhanced');
      console.log('   2. Check WebSocket port 3001 is available');
      console.log('   3. Verify file permissions for auto-refresh');
    }
    
    // Timing analysis
    const timedResults = this.results.filter(r => r.timing);
    if (timedResults.length > 0) {
      const avgTiming = timedResults.reduce((sum, r) => sum + r.timing!, 0) / timedResults.length;
      console.log(`\n⏱️  Average response time: ${Math.round(avgTiming)}ms`);
    }
  }

  private async cleanup(): Promise<void> {
    // Restore original file content
    if (this.originalFileContent) {
      try {
        const filePath = path.join(process.cwd(), 'src/web/index.html');
        fs.writeFileSync(filePath, this.originalFileContent);
        console.log('\n🧹 Restored original file content');
      } catch (error) {
        console.log('⚠️  Could not restore original file:', error);
      }
    }
    
    // Close WebSocket
    if (this.ws) {
      this.ws.close();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the comprehensive test
async function main() {
  const testSuite = new E2ETestSuite();
  
  console.log('🔍 Prerequisites Check:');
  console.log('   • Enhanced server should be running on http://localhost:3000');
  console.log('   • WebSocket server should be running on ws://localhost:3001');
  console.log('   • File system should be writable for auto-refresh tests');
  console.log('');
  
  try {
    await testSuite.runFullTest();
  } catch (error) {
    console.error('❌ Test suite failed:', error);
  }
}

if (require.main === module) {
  main();
}

export { E2ETestSuite }; 