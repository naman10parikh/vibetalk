#!/usr/bin/env node

import WebSocket from 'ws';

class WebSocketTester {
  private ws: WebSocket | null = null;
  private connectionCount = 0;
  private messagesReceived: any[] = [];
  private testStartTime = 0;
  private processId = '';

  async runTest(): Promise<void> {
    console.log('🧪 Starting WebSocket Connection Stability Test...\n');
    
    // Test 1: Basic connection
    console.log('1️⃣ Testing basic WebSocket connection...');
    const connected = await this.connectToServer();
    
    if (!connected) {
      console.log('❌ Failed to connect to WebSocket server');
      console.log('💡 Make sure to run: npm run test-web');
      return;
    }
    
    console.log('✅ Successfully connected to WebSocket server\n');
    
    // Test 2: Simulate audio processing workflow
    console.log('2️⃣ Testing complete audio processing workflow...');
    await this.simulateAudioProcessing();
    
    // Wait for all messages to process
    await this.sleep(15000); // 15 seconds should be enough for the complete flow
    
    // Test 3: Analyze results
    console.log('\n3️⃣ Analyzing test results...');
    this.analyzeResults();
  }

  private async connectToServer(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        this.ws = new WebSocket('ws://localhost:3001');
        
        this.ws.on('open', () => {
          this.connectionCount++;
          console.log(`🔗 Connection ${this.connectionCount} established`);
          resolve(true);
        });
        
        this.ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          this.messagesReceived.push({
            ...message,
            timestamp: Date.now() - this.testStartTime,
            connectionActive: this.ws?.readyState === WebSocket.OPEN
          });
          
          console.log(`📨 [${this.messagesReceived.length}] Received: ${message.type} - ${message.message}`);
          
          // Track process ID
          if (message.processId) {
            this.processId = message.processId;
          }
        });
        
        this.ws.on('close', (code, reason) => {
          console.log(`❌ WebSocket closed: Code ${code}, Reason: ${reason}`);
        });
        
        this.ws.on('error', (error) => {
          console.error(`❌ WebSocket error:`, error);
          resolve(false);
        });
        
        // Timeout after 5 seconds
        setTimeout(() => {
          if (this.ws?.readyState !== WebSocket.OPEN) {
            resolve(false);
          }
        }, 5000);
        
      } catch (error) {
        console.error('❌ Failed to create WebSocket:', error);
        resolve(false);
      }
    });
  }

  private async simulateAudioProcessing(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log('❌ WebSocket not ready for audio simulation');
      return;
    }
    
    this.testStartTime = Date.now();
    
    // Create fake audio data (simulate webm audio blob)
    const fakeAudioData = new Array(50000).fill(0).map(() => Math.floor(Math.random() * 256));
    
    console.log(`📤 Sending simulated audio data (${fakeAudioData.length} bytes)...`);
    
    const audioMessage = {
      type: 'audio',
      data: fakeAudioData,
      mimeType: 'audio/webm',
      timestamp: Date.now()
    };
    
    try {
      this.ws.send(JSON.stringify(audioMessage));
      console.log('✅ Audio data sent successfully');
    } catch (error) {
      console.error('❌ Failed to send audio data:', error);
    }
  }

  private analyzeResults(): void {
    console.log('\n📊 TEST RESULTS ANALYSIS:\n');
    
    // Basic stats
    console.log(`📈 Total messages received: ${this.messagesReceived.length}`);
    console.log(`🔗 Connection count: ${this.connectionCount}`);
    console.log(`🆔 Process ID: ${this.processId || 'Not detected'}`);
    
    // Check message sequence
    const messageTypes = this.messagesReceived.map(m => m.type);
    console.log(`📋 Message sequence: ${messageTypes.join(' → ')}`);
    
    // Expected sequence for a complete flow
    const expectedTypes = ['status', 'status', 'status', 'transcription', 'injection', 'success', 'processing', 'refresh', 'refresh-now'];
    
    console.log('\n🔍 DETAILED ANALYSIS:\n');
    
    // Check if we got the expected message types
    let sequenceCorrect = true;
    for (let i = 0; i < expectedTypes.length; i++) {
      const expected = expectedTypes[i];
      const received = messageTypes[i];
      
      if (expected === received) {
        console.log(`✅ Step ${i + 1}: ${expected} (received at ${this.messagesReceived[i]?.timestamp}ms)`);
      } else {
        console.log(`❌ Step ${i + 1}: Expected ${expected}, got ${received || 'nothing'}`);
        sequenceCorrect = false;
      }
    }
    
    // Check for connection stability
    const connectionStable = this.messagesReceived.every(m => m.connectionActive);
    console.log(`\n🔗 Connection stability: ${connectionStable ? '✅ STABLE' : '❌ UNSTABLE'}`);
    
    // Check for premature disconnections
    const refreshNowReceived = messageTypes.includes('refresh-now');
    console.log(`🔄 Refresh signal received: ${refreshNowReceived ? '✅ YES' : '❌ NO'}`);
    
    // Final verdict
    console.log('\n🎯 FINAL VERDICT:\n');
    
    if (sequenceCorrect && connectionStable && refreshNowReceived) {
      console.log('🎉 ✅ WEBSOCKET TEST PASSED!');
      console.log('   - All expected messages received in correct order');
      console.log('   - Connection remained stable throughout the process');
      console.log('   - Refresh signal was properly sent');
      console.log('   - Focus management should work correctly');
    } else {
      console.log('❌ WEBSOCKET TEST FAILED!');
      
      if (!sequenceCorrect) {
        console.log('   - Message sequence was incorrect');
      }
      if (!connectionStable) {
        console.log('   - Connection was unstable during processing');
      }
      if (!refreshNowReceived) {
        console.log('   - Refresh signal was not received');
      }
    }
    
    // Current connection status
    const currentStatus = this.ws?.readyState === WebSocket.OPEN ? 'OPEN' : 'CLOSED';
    console.log(`\n📊 Current WebSocket status: ${currentStatus}`);
    
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('✅ WebSocket is still connected - this is good!');
    } else {
      console.log('⚠️  WebSocket is closed - this may be expected after refresh signal');
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the test
async function main() {
  const tester = new WebSocketTester();
  
  try {
    await tester.runTest();
  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
  
  process.exit(0);
}

if (require.main === module) {
  main();
} 