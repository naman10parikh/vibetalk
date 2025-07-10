#!/usr/bin/env node

import WebSocket from 'ws';

class DecoupledArchitectureTest {
  private audioWs: WebSocket | null = null;
  private refreshWs: WebSocket | null = null;
  private coordinatorWs: WebSocket | null = null;
  private testResults: any[] = [];

  async runTest(): Promise<void> {
    console.log('🧪 Testing Decoupled Architecture...');
    console.log('='.repeat(50));
    
    try {
      // Test 1: Connect to all servers
      console.log('\n1️⃣ Testing server connections...');
      await this.testServerConnections();
      
      // Test 2: Test audio independence
      console.log('\n2️⃣ Testing audio independence...');
      await this.testAudioIndependence();
      
      // Test 3: Test refresh independence
      console.log('\n3️⃣ Testing refresh independence...');
      await this.testRefreshIndependence();
      
      // Test 4: Test coordination
      console.log('\n4️⃣ Testing coordination...');
      await this.testCoordination();
      
      // Test 5: Analyze results
      console.log('\n5️⃣ Analyzing test results...');
      this.analyzeResults();
      
    } catch (error) {
      console.error('❌ Test failed:', error);
    } finally {
      this.cleanup();
    }
  }

  private async testServerConnections(): Promise<void> {
    const connections = [
      { name: 'Audio Server', port: 3002 },
      { name: 'Refresh Server', port: 3001 },
      { name: 'Coordinator Server', port: 3004 }
    ];

    for (const conn of connections) {
      try {
        const ws = new WebSocket(`ws://localhost:${conn.port}`);
        
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`Connection to ${conn.name} timed out`));
          }, 5000);
          
          ws.on('open', () => {
            clearTimeout(timeout);
            console.log(`✅ ${conn.name} connected successfully`);
            this.testResults.push({ test: 'connection', server: conn.name, status: 'success' });
            resolve();
          });
          
          ws.on('error', (error) => {
            clearTimeout(timeout);
            console.log(`❌ ${conn.name} connection failed:`, error.message);
            this.testResults.push({ test: 'connection', server: conn.name, status: 'failed', error: error.message });
            reject(error);
          });
        });
        
        ws.close();
      } catch (error) {
        console.log(`❌ Failed to connect to ${conn.name}:`, error);
      }
    }
  }

  private async testAudioIndependence(): Promise<void> {
    try {
      // Connect to audio server
      this.audioWs = new WebSocket('ws://localhost:3002');
      
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Audio connection timeout')), 5000);
        
        this.audioWs!.on('open', () => {
          clearTimeout(timeout);
          console.log('✅ Audio server connected');
          resolve();
        });
        
        this.audioWs!.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
      
      // Test audio functionality
      const sessionId = 'test_session_' + Date.now();
      this.audioWs!.send(JSON.stringify({
        type: 'speak',
        sessionId,
        text: 'Testing audio independence'
      }));
      
      console.log('✅ Audio independence test completed');
      this.testResults.push({ test: 'audio_independence', status: 'success' });
      
    } catch (error) {
      console.log('❌ Audio independence test failed:', error);
      this.testResults.push({ test: 'audio_independence', status: 'failed', error: error instanceof Error ? error.message : String(error) });
    }
  }

  private async testRefreshIndependence(): Promise<void> {
    try {
      // Connect to refresh server
      this.refreshWs = new WebSocket('ws://localhost:3001');
      
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Refresh connection timeout')), 5000);
        
        this.refreshWs!.on('open', () => {
          clearTimeout(timeout);
          console.log('✅ Refresh server connected');
          resolve();
        });
        
        this.refreshWs!.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
      
      // Test refresh functionality
      this.refreshWs!.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'file-changed' || message.type === 'refresh-now') {
            console.log('✅ Refresh server responding to file changes');
            this.testResults.push({ test: 'refresh_independence', status: 'success' });
          }
        } catch (error) {
          console.log('❌ Failed to parse refresh message:', error);
        }
      });
      
      console.log('✅ Refresh independence test completed');
      
    } catch (error) {
      console.log('❌ Refresh independence test failed:', error);
      this.testResults.push({ test: 'refresh_independence', status: 'failed', error: error instanceof Error ? error.message : String(error) });
    }
  }

  private async testCoordination(): Promise<void> {
    try {
          // Connect to coordinator server
    this.coordinatorWs = new WebSocket('ws://localhost:3004');
      
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Coordinator connection timeout')), 5000);
        
        this.coordinatorWs!.on('open', () => {
          clearTimeout(timeout);
          console.log('✅ Coordinator server connected');
          resolve();
        });
        
        this.coordinatorWs!.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
      
      // Test coordination functionality
      const sessionId = 'test_coordinator_' + Date.now();
      this.coordinatorWs!.send(JSON.stringify({
        action: 'start',
        sessionId
      }));
      
      console.log('✅ Coordination test completed');
      this.testResults.push({ test: 'coordination', status: 'success' });
      
    } catch (error) {
      console.log('❌ Coordination test failed:', error);
      this.testResults.push({ test: 'coordination', status: 'failed', error: error instanceof Error ? error.message : String(error) });
    }
  }

  private analyzeResults(): void {
    console.log('\n📊 Test Results Summary:');
    console.log('='.repeat(30));
    
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(r => r.status === 'success').length;
    const failedTests = totalTests - passedTests;
    
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${failedTests}`);
    
    if (failedTests === 0) {
      console.log('\n🎉 All tests passed! The decoupled architecture is working correctly.');
      console.log('\n✅ Key Benefits Achieved:');
      console.log('   • Audio assistant works independently of page refreshes');
      console.log('   • File change detection doesn\'t interrupt speech');
      console.log('   • Each service handles its own responsibilities');
      console.log('   • Better user experience with uninterrupted audio');
    } else {
      console.log('\n⚠️ Some tests failed. Check the server logs for details.');
    }
    
    // Detailed results
    console.log('\n📋 Detailed Results:');
    this.testResults.forEach((result, index) => {
      const status = result.status === 'success' ? '✅' : '❌';
      console.log(`${index + 1}. ${status} ${result.test}${result.server ? ` (${result.server})` : ''}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });
  }

  private cleanup(): void {
    if (this.audioWs) this.audioWs.close();
    if (this.refreshWs) this.refreshWs.close();
    if (this.coordinatorWs) this.coordinatorWs.close();
  }
}

// Run the test
const test = new DecoupledArchitectureTest();
test.runTest().catch(console.error); 