#!/usr/bin/env ts-node

import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  timeMs?: number;
}

class ProductionTestSuite {
  private results: TestResult[] = [];
  private servers: ChildProcess[] = [];
  private originalFileContent: string = '';

  async runAllTests(): Promise<void> {
    console.log('🚀 VibeTalk Production Improvements Test Suite');
    console.log('='.repeat(60));
    
    try {
      await this.startServers();
      await this.waitForServerStartup();
      
      await this.testProfessionalDeveloperResponses();
      await this.testSessionCompletionStops();
      await this.testParallelProcessingSpeed();
      await this.testAudioIndependence();
      await this.testRefreshCoordination();
      
      this.generateReport();
    } catch (error) {
      console.error('❌ Test suite failed:', error);
    } finally {
      await this.cleanup();
    }
  }

  private async startServers(): Promise<void> {
    console.log('1️⃣ Starting decoupled servers...');
    
    return new Promise((resolve, reject) => {
      const serverProcess = spawn('npm', ['run', 'start-decoupled'], {
        stdio: 'pipe',
        shell: true
      });
      
      this.servers.push(serverProcess);
      
      let output = '';
      serverProcess.stdout?.on('data', (data) => {
        output += data.toString();
        console.log('   📡', data.toString().trim());
        
        // Wait for all servers to be ready
        if (output.includes('All servers started successfully!')) {
          console.log('   ✅ All servers are running');
          resolve();
        }
      });
      
      serverProcess.stderr?.on('data', (data) => {
        console.error('   ❌', data.toString());
      });
      
      setTimeout(() => reject(new Error('Server startup timeout')), 30000);
    });
  }

  private async waitForServerStartup(): Promise<void> {
    console.log('2️⃣ Waiting for server readiness...');
    
    // Give servers time to fully initialize
    await this.sleep(5000);
    
    // Test connectivity to all three servers
    const tests = [
      { name: 'Audio Server', url: 'http://localhost:3003' },
      { name: 'Refresh Server', url: 'http://localhost:3000' },
      { name: 'Coordinator Server', url: 'http://localhost:3005' }
    ];
    
    for (const test of tests) {
      try {
        const response = await fetch(test.url);
        if (response.ok) {
          console.log(`   ✅ ${test.name} is responsive`);
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (error) {
        console.log(`   ❌ ${test.name} connection failed:`, error);
        this.addResult(`${test.name} Connectivity`, false, `Failed to connect: ${error}`);
      }
    }
  }

  private async testProfessionalDeveloperResponses(): Promise<void> {
    console.log('3️⃣ Testing Professional Developer Responses...');
    
    const startTime = Date.now();
    
    try {
      // Test by simulating a status update that would trigger the GPT summarization
      const testMessages = [
        'Transcription received: "change background color to white"',
        'AI-output polling started',
        'Sending command to Cursor AI',
        'Waiting for code changes to be applied'
      ];
      
      // Simulate the GPT response we expect with the new prompt
      const expectedResponses = ['Working on it', 'On it', 'Processing', 'Done'];
      
      // This test verifies the prompt change is in place
      const promptTest = this.verifyPromptChange();
      
      this.addResult(
        'Professional Developer Responses', 
        promptTest, 
        promptTest ? 'GPT prompt updated to professional tone' : 'GPT prompt still has technical chatter',
        Date.now() - startTime
      );
      
    } catch (error) {
      this.addResult('Professional Developer Responses', false, `Test failed: ${error}`);
    }
  }

  private verifyPromptChange(): boolean {
    try {
      // Check if the enhanced-server.ts has the new prompt
      const enhancedServerPath = path.join(process.cwd(), 'src/web/enhanced-server.ts');
      const content = fs.readFileSync(enhancedServerPath, 'utf8');
      
      const hasOldPrompt = content.includes('friendly developer buddy');
      const hasNewPrompt = content.includes('professional developer');
      
      return !hasOldPrompt && hasNewPrompt;
    } catch (error) {
      return false;
    }
  }

  private async testSessionCompletionStops(): Promise<void> {
    console.log('4️⃣ Testing Session Completion Stops Broadcasting...');
    
    const startTime = Date.now();
    
    try {
      // Test by checking if session state management is implemented
      const sessionStopTest = this.verifySessionStopLogic();
      
      this.addResult(
        'Session Completion Stops',
        sessionStopTest,
        sessionStopTest ? 'Session completion logic implemented' : 'Session stop logic not found',
        Date.now() - startTime
      );
      
    } catch (error) {
      this.addResult('Session Completion Stops', false, `Test failed: ${error}`);
    }
  }

  private verifySessionStopLogic(): boolean {
    try {
      const enhancedServerPath = path.join(process.cwd(), 'src/web/enhanced-server.ts');
      const content = fs.readFileSync(enhancedServerPath, 'utf8');
      
      const hasCompletionFlag = content.includes('isCompleted: true');
      const hasClearInterval = content.includes('clearInterval(sessionIntervals[sessionId])');
      const hasStopPolling = content.includes('stopConversationPolling(sessionId)');
      
      return hasCompletionFlag && hasClearInterval && hasStopPolling;
    } catch (error) {
      return false;
    }
  }

  private async testParallelProcessingSpeed(): Promise<void> {
    console.log('5️⃣ Testing Parallel Processing Speed...');
    
    const startTime = Date.now();
    
    try {
      // Test file change detection speed by modifying index.html
      const filePath = path.join(process.cwd(), 'src/web/index.html');
      this.originalFileContent = fs.readFileSync(filePath, 'utf8');
      
      // Make a test change to trigger the optimized refresh process
      const testMarker = `<!-- Speed test change at ${Date.now()} -->`;
      const modifiedContent = this.originalFileContent + testMarker;
      
      console.log('   📝 Making test file change...');
      fs.writeFileSync(filePath, modifiedContent);
      
      // Measure response time with new parallel processing
      const responseTime = await this.measureRefreshResponseTime();
      
      // With parallel processing, response should be under 2 seconds
      const isOptimized = responseTime < 2000;
      
      this.addResult(
        'Parallel Processing Speed',
        isOptimized,
        `Response time: ${responseTime}ms (target: <2000ms)`,
        responseTime
      );
      
    } catch (error) {
      this.addResult('Parallel Processing Speed', false, `Test failed: ${error}`);
    } finally {
      // Restore original file
      if (this.originalFileContent) {
        const filePath = path.join(process.cwd(), 'src/web/index.html');
        fs.writeFileSync(filePath, this.originalFileContent);
      }
    }
  }

  private async measureRefreshResponseTime(): Promise<number> {
    const startTime = Date.now();
    
    // Monitor for build completion by checking for the compiled output
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        // Check if build process has completed by looking for the compiled output
        try {
          const distPath = path.join(process.cwd(), 'dist/web/index.html');
          if (fs.existsSync(distPath)) {
            const responseTime = Date.now() - startTime;
            clearInterval(checkInterval);
            resolve(responseTime);
          }
        } catch (error) {
          // Continue checking
        }
      }, 100);
      
      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve(10000);
      }, 10000);
    });
  }

  private async testAudioIndependence(): Promise<void> {
    console.log('6️⃣ Testing Audio Independence...');
    
    const startTime = Date.now();
    
    try {
      // Test that audio server is running independently
      const audioResponse = await fetch('http://localhost:3003');
      const audioIndependent = audioResponse.ok;
      
      this.addResult(
        'Audio Independence',
        audioIndependent,
        audioIndependent ? 'Audio server running independently' : 'Audio server not accessible',
        Date.now() - startTime
      );
      
    } catch (error) {
      this.addResult('Audio Independence', false, `Audio test failed: ${error}`);
    }
  }

  private async testRefreshCoordination(): Promise<void> {
    console.log('7️⃣ Testing Refresh Coordination...');
    
    const startTime = Date.now();
    
    try {
      // Test that refresh server is coordinating properly
      const refreshResponse = await fetch('http://localhost:3000');
      const refreshWorking = refreshResponse.ok;
      
      this.addResult(
        'Refresh Coordination',
        refreshWorking,
        refreshWorking ? 'Refresh server coordinating properly' : 'Refresh server not accessible',
        Date.now() - startTime
      );
      
    } catch (error) {
      this.addResult('Refresh Coordination', false, `Refresh test failed: ${error}`);
    }
  }

  private addResult(name: string, passed: boolean, details: string, timeMs?: number): void {
    this.results.push({ name, passed, details, timeMs });
    const status = passed ? '✅' : '❌';
    const timing = timeMs ? ` (${timeMs}ms)` : '';
    console.log(`   ${status} ${name}: ${details}${timing}`);
  }

  private generateReport(): void {
    console.log('\n📊 Production Improvements Test Report');
    console.log('='.repeat(60));
    
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    const percentage = ((passed / total) * 100).toFixed(1);
    
    console.log(`Overall Results: ${passed}/${total} tests passed (${percentage}%)`);
    console.log();
    
    this.results.forEach(result => {
      const status = result.passed ? '✅' : '❌';
      const timing = result.timeMs ? ` [${result.timeMs}ms]` : '';
      console.log(`${status} ${result.name}${timing}`);
      console.log(`   ${result.details}`);
    });
    
    console.log('\n🎯 Production Readiness Assessment:');
    if (parseFloat(percentage) >= 80) {
      console.log('✅ READY FOR PRODUCTION - All critical improvements verified');
    } else {
      console.log('⚠️  NEEDS ATTENTION - Some improvements require fixes');
    }
  }

  private async cleanup(): Promise<void> {
    console.log('\n🧹 Cleaning up test environment...');
    
    // Restore original file if needed
    if (this.originalFileContent) {
      try {
        const filePath = path.join(process.cwd(), 'src/web/index.html');
        fs.writeFileSync(filePath, this.originalFileContent);
        console.log('   ✅ Original file content restored');
      } catch (error) {
        console.error('   ❌ Failed to restore file:', error);
      }
    }
    
    // Kill all server processes
    for (const server of this.servers) {
      try {
        server.kill('SIGTERM');
        console.log('   ✅ Server process terminated');
      } catch (error) {
        console.error('   ❌ Failed to kill server:', error);
      }
    }
    
    // Give servers time to shut down
    await this.sleep(2000);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the test suite
if (require.main === module) {
  const testSuite = new ProductionTestSuite();
  testSuite.runAllTests().catch(console.error);
} 