#!/usr/bin/env ts-node

import { spawn, ChildProcess } from 'child_process';
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';

class ReliabilityTest {
  private servers: ChildProcess[] = [];
  private testResults: Array<{test: string, status: 'pass' | 'fail', details: string}> = [];
  
  async runTests(): Promise<void> {
    console.log('🧪 RELIABILITY FIXES VALIDATION TEST');
    console.log('=====================================\n');
    
    try {
      // Start the servers
      await this.startServers();
      await this.waitForServersToStart();
      
      // Run tests
      await this.testAssistantStopsAfterSummary();
      await this.testLocalhostRefreshConsistency();
      await this.testNoAutoRestart();
      
      // Report results
      this.reportResults();
      
    } catch (error) {
      console.error('❌ Test suite failed:', error);
    } finally {
      await this.cleanup();
    }
  }
  
  private async startServers(): Promise<void> {
    console.log('🚀 Starting VibeTalk servers...');
    
    const serverProcess = spawn('npm', ['run', 'start-decoupled'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false
    });
    
    this.servers.push(serverProcess);
    
    serverProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      if (output.includes('All servers started successfully')) {
        console.log('✅ All servers started');
      }
    });
    
    serverProcess.stderr?.on('data', (data) => {
      const error = data.toString();
      if (!error.includes('warning') && !error.includes('deprecated')) {
        console.error('❌ Server error:', error);
      }
    });
  }
  
  private async waitForServersToStart(): Promise<void> {
    console.log('⏳ Waiting for servers to initialize...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  private async testAssistantStopsAfterSummary(): Promise<void> {
    console.log('\n1️⃣ Testing: Assistant stops after summary generation');
    
    try {
      const ws = new WebSocket('ws://localhost:3001');
      let summaryReceived = false;
      let messagesAfterSummary: string[] = [];
      let summaryTime = 0;
      
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);
        
        ws.on('open', () => {
          clearTimeout(timeout);
          console.log('   📡 Connected to refresh server');
          resolve();
        });
        
        ws.on('error', reject);
      });
      
      // Listen for messages
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.type === 'summary') {
            summaryReceived = true;
            summaryTime = Date.now();
            console.log('   📝 Summary received:', message.summary);
          }
          
          // Track messages after summary
          if (summaryReceived && message.type === 'assistant') {
            const timeSinceSummary = Date.now() - summaryTime;
            messagesAfterSummary.push(`${message.text} (${timeSinceSummary}ms after summary)`);
            console.log(`   ❌ Unexpected assistant message after summary: "${message.text}"`);
          }
        } catch (error) {
          // Ignore parsing errors
        }
      });
      
      // Simulate a voice command by sending start/stop signals
      console.log('   🎤 Simulating voice command...');
      ws.send(JSON.stringify({ action: 'start', sessionId: 'test_session_' + Date.now() }));
      
      // Wait for a reasonable time to see if assistant continues after summary
      await new Promise(resolve => setTimeout(resolve, 15000));
      
      const testPassed = summaryReceived && messagesAfterSummary.length === 0;
      this.testResults.push({
        test: 'Assistant Stops After Summary',
        status: testPassed ? 'pass' : 'fail',
        details: testPassed 
          ? 'Assistant correctly stopped after summary'
          : `Assistant continued with ${messagesAfterSummary.length} messages: ${messagesAfterSummary.join(', ')}`
      });
      
      ws.close();
      
    } catch (error) {
      this.testResults.push({
        test: 'Assistant Stops After Summary',
        status: 'fail',
        details: `Test failed: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }
  
  private async testLocalhostRefreshConsistency(): Promise<void> {
    console.log('\n2️⃣ Testing: Localhost refresh consistency');
    
    try {
      const ws = new WebSocket('ws://localhost:3001');
      let refreshCount = 0;
      const testRuns = 3;
      
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 5000);
        
        ws.on('open', () => {
          clearTimeout(timeout);
          console.log('   📡 Connected to refresh server');
          resolve();
        });
        
        ws.on('error', reject);
      });
      
      // Listen for refresh signals
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'refresh-now') {
            refreshCount++;
            console.log(`   🔄 Refresh signal ${refreshCount} received`);
          }
        } catch (error) {
          // Ignore parsing errors
        }
      });
      
      // Test multiple file changes
      const filePath = path.join(process.cwd(), 'src/web/index.html');
      const originalContent = fs.readFileSync(filePath, 'utf8');
      
      for (let i = 1; i <= testRuns; i++) {
        console.log(`   📝 Making test file change ${i}/${testRuns}...`);
        const testContent = originalContent + `\n<!-- Test change ${i} at ${Date.now()} -->`;
        fs.writeFileSync(filePath, testContent);
        
        // Wait for refresh detection
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Restore original content
      fs.writeFileSync(filePath, originalContent);
      
      const testPassed = refreshCount >= testRuns;
      this.testResults.push({
        test: 'Localhost Refresh Consistency',
        status: testPassed ? 'pass' : 'fail',
        details: testPassed 
          ? `All ${testRuns} file changes triggered refreshes`
          : `Only ${refreshCount}/${testRuns} file changes triggered refreshes`
      });
      
      ws.close();
      
    } catch (error) {
      this.testResults.push({
        test: 'Localhost Refresh Consistency',
        status: 'fail',
        details: `Test failed: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }
  
  private async testNoAutoRestart(): Promise<void> {
    console.log('\n3️⃣ Testing: No auto-restart after session completion');
    
    try {
      const ws = new WebSocket('ws://localhost:3001');
      let autoRestartDetected = false;
      let sessionCompletedTime = 0;
      
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 5000);
        
        ws.on('open', () => {
          clearTimeout(timeout);
          console.log('   📡 Connected to refresh server');
          resolve();
        });
        
        ws.on('error', reject);
      });
      
      // Listen for messages
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.type === 'summary') {
            sessionCompletedTime = Date.now();
            console.log('   📝 Session completed with summary');
          }
          
          // Check for auto-restart (voice-status with 'listening' after summary)
          if (sessionCompletedTime > 0 && message.type === 'voice-status' && message.step === 'listening') {
            const timeSinceCompletion = Date.now() - sessionCompletedTime;
            if (timeSinceCompletion > 500 && timeSinceCompletion < 5000) { // Within 5 seconds
              autoRestartDetected = true;
              console.log(`   ❌ Auto-restart detected ${timeSinceCompletion}ms after session completion`);
            }
          }
        } catch (error) {
          // Ignore parsing errors
        }
      });
      
      // Wait for potential auto-restart
      await new Promise(resolve => setTimeout(resolve, 8000));
      
      const testPassed = !autoRestartDetected;
      this.testResults.push({
        test: 'No Auto-Restart After Completion',
        status: testPassed ? 'pass' : 'fail',
        details: testPassed 
          ? 'No auto-restart detected - assistant correctly waits for manual start'
          : 'Auto-restart detected - assistant should wait for manual start'
      });
      
      ws.close();
      
    } catch (error) {
      this.testResults.push({
        test: 'No Auto-Restart After Completion',
        status: 'fail',
        details: `Test failed: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }
  
  private reportResults(): void {
    console.log('\n📊 TEST RESULTS');
    console.log('================');
    
    const passCount = this.testResults.filter(r => r.status === 'pass').length;
    const totalCount = this.testResults.length;
    
    this.testResults.forEach(result => {
      const icon = result.status === 'pass' ? '✅' : '❌';
      console.log(`${icon} ${result.test}: ${result.details}`);
    });
    
    console.log(`\n🎯 OVERALL RESULT: ${passCount}/${totalCount} tests passed`);
    
    if (passCount === totalCount) {
      console.log('🎉 ALL RELIABILITY FIXES WORKING CORRECTLY!');
      console.log('   ✅ Audio assistant stops after summary');
      console.log('   ✅ Localhost refreshes consistently');
      console.log('   ✅ No unwanted auto-restart behavior');
    } else {
      console.log('⚠️  Some reliability issues remain - check failed tests above');
    }
  }
  
  private async cleanup(): Promise<void> {
    console.log('\n🧹 Cleaning up...');
    
    // Kill all server processes
    this.servers.forEach(server => {
      if (!server.killed) {
        server.kill('SIGTERM');
      }
    });
    
    // Wait for graceful shutdown
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Force kill if still running
    this.servers.forEach(server => {
      if (!server.killed) {
        server.kill('SIGKILL');
      }
    });
    
    console.log('✅ Cleanup complete');
  }
}

// Run the test
if (require.main === module) {
  const test = new ReliabilityTest();
  test.runTests().catch(console.error);
}

export default ReliabilityTest; 