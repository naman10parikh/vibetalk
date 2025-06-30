#!/usr/bin/env node

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import WebSocket, { WebSocketServer } from 'ws';
import { CursorAutomator } from '../cursor/automator';

const HTTP_PORT = 3000;
const WS_PORT = 3001;

function serveFile(res: http.ServerResponse, filePath: string, contentType: string) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch (error) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('File not found');
  }
}

// HTTP Server for serving the web interface
const httpServer = http.createServer((req, res) => {
  const url = req.url || '/';
  
  if (url === '/' || url === '/index.html') {
    const indexPath = path.join(__dirname, 'index.html');
    serveFile(res, indexPath, 'text/html');
  } else if (url === '/widget.js') {
    // Serve test widget instead of regular widget
    const testWidgetPath = path.join(__dirname, 'test-widget.js');
    if (fs.existsSync(testWidgetPath)) {
      serveFile(res, testWidgetPath, 'application/javascript');
    } else {
      // Fallback to inline test widget
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(getInlineTestWidget());
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

// WebSocket Server with improved connection management
const wss = new WebSocketServer({ 
  port: WS_PORT,
  perMessageDeflate: false
});

class VibeTalkTestService {
  private cursorAutomator: CursorAutomator;
  private activeConnections: Set<WebSocket> = new Set();
  private testMode = true;

  constructor() {
    this.cursorAutomator = new CursorAutomator();
  }

  async initialize() {
    console.log('🧪 VibeTalk Test Service initialized!');
    console.log('📝 Running in TEST MODE - no OpenAI API key required');
  }

  /**
   * Add connection to active set and set up heartbeat
   */
  addConnection(ws: WebSocket) {
    this.activeConnections.add(ws);
    
    // Set up heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.ping();
        } catch (error) {
          console.log('❌ Ping failed, removing connection');
          clearInterval(heartbeat);
          this.activeConnections.delete(ws);
        }
      } else {
        clearInterval(heartbeat);
        this.activeConnections.delete(ws);
      }
    }, 25000); // Ping every 25 seconds
    
    // Handle pong responses
    ws.on('pong', () => {
      // Connection is alive
    });
    
    // Clean up on close
    ws.on('close', () => {
      clearInterval(heartbeat);
      this.activeConnections.delete(ws);
    });
    
    // Handle errors
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clearInterval(heartbeat);
      this.activeConnections.delete(ws);
    });
  }

  /**
   * Send message with better error handling and connection validation
   */
  private sendSafeMessage(ws: WebSocket, message: any): boolean {
    try {
      if (ws.readyState === WebSocket.OPEN && this.activeConnections.has(ws)) {
        ws.send(JSON.stringify(message));
        return true;
      } else {
        console.log('⚠️  WebSocket not ready for message:', message.type);
        return false;
      }
    } catch (error) {
      console.error('❌ Failed to send WebSocket message:', error);
      this.activeConnections.delete(ws);
      return false;
    }
  }

  /**
   * Validate WebSocket connection
   */
  private validateConnection(ws: WebSocket): boolean {
    return ws.readyState === WebSocket.OPEN && this.activeConnections.has(ws);
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async processAudioData(audioData: number[], mimeType: string, ws: WebSocket) {
    const processId = Date.now();
    
    try {
      console.log(`🧪 Starting TEST audio processing session: ${processId}`);
      
      // Validate connection before starting
      if (!this.validateConnection(ws)) {
        console.log('❌ WebSocket invalid at start, aborting processing');
        return;
      }

      // Step 1: Processing status
      if (!this.sendSafeMessage(ws, {
        type: 'status',
        message: '🔄 Processing your audio...',
        className: 'processing',
        processId
      })) return;

      await this.sleep(1000);

      // Step 2: Mock transcription
      if (!this.validateConnection(ws)) {
        console.log(`❌ Session ${processId}: WebSocket invalid before transcription`);
        return;
      }

      if (!this.sendSafeMessage(ws, {
        type: 'status',
        message: '🧠 Transcribing with AI (TEST MODE)...',
        className: 'processing',
        processId
      })) return;

      await this.sleep(2000); // Simulate transcription delay

      // Mock transcript
      const mockTranscripts = [
        "Change the main heading to say 'Test Mode Active'",
        "Add a new button that says 'WebSocket Test Button'",
        "Change the background gradient to use blue and green colors",
        "Add a test message that says 'VibeTalk is working correctly'",
        "Update the page title to show test results"
      ];
      
      const transcript = mockTranscripts[Math.floor(Math.random() * mockTranscripts.length)];
      console.log(`📝 Session ${processId}: Mock transcription: "${transcript}"`);

      // Step 3: Show transcription result
      if (!this.validateConnection(ws)) {
        console.log(`❌ Session ${processId}: WebSocket invalid after transcription`);
        return;
      }

      if (!this.sendSafeMessage(ws, {
        type: 'transcription',
        text: transcript,
        message: `✅ Got it: "${transcript}"`,
        processId
      })) return;

      await this.sleep(1000);

      // Step 4: Cursor injection status
      if (!this.validateConnection(ws)) {
        console.log(`❌ Session ${processId}: WebSocket invalid before Cursor injection`);
        return;
      }

      if (!this.sendSafeMessage(ws, {
        type: 'injection',
        message: '💬 Sending to Cursor AI (TEST MODE)...',
        processId
      })) return;

      // Test Cursor operations
      const cursorRunning = await this.cursorAutomator.isCursorRunning();
      
      let success = false;
      if (cursorRunning) {
        try {
          await this.cursorAutomator.openComposer();
          success = await this.cursorAutomator.injectText(transcript, true);
        } catch (error) {
          console.log(`⚠️  Cursor injection failed: ${error}`);
          success = false;
        }
      } else {
        console.log('⚠️  Cursor not running - simulating success for test');
        success = true; // Simulate success for testing
      }

      if (success) {
        console.log(`✅ Session ${processId}: Successfully completed (or simulated)`);
        
        // Step 5: Success status
        if (!this.validateConnection(ws)) {
          console.log(`❌ Session ${processId}: WebSocket invalid at success`);
          return;
        }

        if (!this.sendSafeMessage(ws, {
          type: 'success',
          message: '🎯 Request sent to Cursor! Working on it...',
          processId
        })) return;
        
        // Step 6: Processing status
        setTimeout(() => {
          if (this.validateConnection(ws)) {
            this.sendSafeMessage(ws, {
              type: 'processing', 
              message: '⚙️ Cursor is processing your request...',
              processId
            });
          }
        }, 2000);
        
        // Step 7: Prepare for refresh
        setTimeout(() => {
          if (this.validateConnection(ws)) {
            this.sendSafeMessage(ws, {
              type: 'refresh',
              message: '🔄 Changes ready! Refreshing page in 3 seconds...',
              processId
            });
            
            // Additional delay before actual refresh
            setTimeout(() => {
              if (this.validateConnection(ws)) {
                console.log(`🔄 Session ${processId}: Sending refresh-now signal`);
                this.sendSafeMessage(ws, {
                  type: 'refresh-now',
                  message: '🔄 Refreshing now...',
                  processId
                });
              }
            }, 3000);
          }
        }, 5000); // Shorter delay for testing
        
      } else {
        throw new Error('Failed to inject text into Cursor');
      }

      console.log(`✅ Session ${processId}: Test completed successfully`);

    } catch (error) {
      console.error(`❌ Session ${processId}: Error processing audio:`, error);
      
      this.sendSafeMessage(ws, {
        type: 'error',
        message: `❌ Test error: ${error instanceof Error ? error.message : String(error)}`,
        processId
      });
    }
  }
}

// Initialize the service
const vibeTalkTestService = new VibeTalkTestService();

// Track connection count for testing
let connectionCount = 0;

// WebSocket connection handling
wss.on('connection', (ws) => {
  connectionCount++;
  const connId = connectionCount;
  
  console.log(`🔗 Client ${connId} connected to WebSocket (Total: ${vibeTalkTestService['activeConnections'].size + 1})`);
  
  // Add to active connections
  vibeTalkTestService.addConnection(ws);

  // Send initial status
  ws.send(JSON.stringify({
    type: 'status',
    message: '✅ Connected to VibeTalk (TEST MODE)!',
    className: 'ready'
  }));

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      if (data.type === 'audio') {
        console.log(`🧪 Client ${connId}: Received audio data: ${data.data.length} bytes`);
        await vibeTalkTestService.processAudioData(data.data, data.mimeType, ws);
      } else if (data.type === 'ping') {
        // Respond to client pings
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch (error) {
      console.error(`❌ Client ${connId}: Error handling message:`, error);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Failed to process message'
        }));
      }
    }
  });

  ws.on('error', (error) => {
    console.error(`❌ Client ${connId}: WebSocket error:`, error);
  });

  ws.on('close', (code, reason) => {
    console.log(`❌ Client ${connId} disconnected from WebSocket (Code: ${code}, Reason: ${reason}, Remaining: ${vibeTalkTestService['activeConnections'].size})`);
  });
});

// Start servers
httpServer.listen(HTTP_PORT, () => {
  console.log(`🧪 VibeTalk TEST Web Interface running at http://localhost:${HTTP_PORT}`);
  console.log(`🔌 WebSocket server running on port ${WS_PORT}`);
  console.log('🎙️ Open the web interface in your browser for testing!');
  console.log('📝 TEST MODE: No OpenAI API key required - uses mock transcription');
});

// Initialize the service
vibeTalkTestService.initialize().catch(console.error);

export { httpServer, wss };

function getInlineTestWidget(): string {
  return `
/**
 * VibeTalk Universal Widget - TEST VERSION
 * This version does NOT auto-refresh to test WebSocket stability
 */

(function() {
    'use strict';
    
    const WEBSOCKET_URL = 'ws://localhost:3001';
    const WIDGET_ID = 'vibetalk-widget';
    
    if (document.getElementById(WIDGET_ID)) {
        console.log('VibeTalk TEST widget already loaded');
        return;
    }
    
    class VibeTalkTestWidget {
        constructor() {
            this.ws = null;
            this.mediaRecorder = null;
            this.audioChunks = [];
            this.isRecording = false;
            this.isProcessing = false;
            this.isReconnecting = false;
            this.connectionAttempts = 0;
            this.heartbeatInterval = null;
            this.widget = null;
            this.statusEl = null;
            this.micBtn = null;
            
            this.createWidget();
            this.connectWebSocket();
            this.setupEventListeners();
        }
        
        createWidget() {
            this.widget = document.createElement('div');
            this.widget.id = WIDGET_ID;
            this.widget.innerHTML = \`
                <div class="vibetalk-container">
                    <div class="vibetalk-status" id="vibetalk-status">Ready</div>
                    <button class="vibetalk-mic-btn" id="vibetalk-mic-btn">🎤</button>
                    <div class="test-indicator">TEST MODE - NO REFRESH</div>
                </div>
            \`;
            
            const styles = document.createElement('style');
            styles.textContent = \`
                #vibetalk-widget {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    z-index: 10000;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }
                
                .vibetalk-container {
                    background: rgba(0, 0, 0, 0.9);
                    backdrop-filter: blur(10px);
                    border-radius: 15px;
                    padding: 15px;
                    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
                    border: 2px solid rgba(255, 165, 0, 0.5);
                    min-width: 250px;
                    max-width: 300px;
                    text-align: center;
                }
                
                .test-indicator {
                    background: rgba(255, 165, 0, 0.3);
                    color: #ffa500;
                    font-size: 10px;
                    font-weight: bold;
                    padding: 4px 8px;
                    border-radius: 8px;
                    margin-top: 8px;
                    border: 1px solid rgba(255, 165, 0, 0.5);
                }
                
                .vibetalk-status {
                    color: white;
                    font-size: 13px;
                    margin-bottom: 10px;
                    opacity: 0.9;
                    font-weight: 500;
                    line-height: 1.4;
                    min-height: 18px;
                    word-wrap: break-word;
                }
                
                .vibetalk-mic-btn {
                    background: linear-gradient(135deg, #10b981, #059669);
                    border: none;
                    border-radius: 50%;
                    width: 60px;
                    height: 60px;
                    color: white;
                    font-size: 2rem;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto;
                }
                
                .vibetalk-mic-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4);
                }
                
                .vibetalk-mic-btn.recording {
                    background: linear-gradient(135deg, #ef4444, #dc2626);
                    box-shadow: 0 4px 15px rgba(239, 68, 68, 0.3);
                    animation: pulse 1.5s infinite;
                }
                
                .vibetalk-mic-btn.processing {
                    background: linear-gradient(135deg, #f59e0b, #d97706);
                    box-shadow: 0 4px 15px rgba(245, 158, 11, 0.3);
                    cursor: not-allowed;
                }
                
                .vibetalk-status.connected { color: #22c55e; }
                .vibetalk-status.disconnected { color: #ef4444; }
                .vibetalk-status.recording { color: #ef4444; }
                .vibetalk-status.processing { color: #f59e0b; }
                .vibetalk-status.success { color: #22c55e; font-weight: 600; }
                .vibetalk-status.refresh { color: #3b82f6; font-weight: 600; }
                .vibetalk-status.error { color: #ef4444; font-weight: 600; }
                
                @keyframes pulse {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                    100% { transform: scale(1); }
                }
            \`;
            
            document.head.appendChild(styles);
            document.body.appendChild(this.widget);
            
            this.statusEl = document.getElementById('vibetalk-status');
            this.micBtn = document.getElementById('vibetalk-mic-btn');
        }
        
        setupEventListeners() {
            this.micBtn.addEventListener('click', () => {
                if (this.isProcessing) return;
                
                if (this.isRecording) {
                    this.stopRecording();
                } else {
                    this.startRecording();
                }
            });
        }
        
        connectWebSocket() {
            try {
                this.ws = new WebSocket(WEBSOCKET_URL);
                this.isReconnecting = false;
                this.connectionAttempts = 0;
                
                this.ws.onopen = () => {
                    console.log('🔗 VibeTalk TEST widget connected');
                    this.updateStatus('🎙️ Ready to record (TEST)', 'connected');
                    this.connectionAttempts = 0;
                    this.setupHeartbeat();
                };
                
                this.ws.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    this.handleServerMessage(data);
                };
                
                this.ws.onclose = (event) => {
                    console.log('❌ VibeTalk TEST widget disconnected:', event.code, event.reason);
                    this.updateStatus('❌ Disconnected', 'disconnected');
                    this.clearHeartbeat();
                };
                
                this.ws.onerror = (error) => {
                    console.error('VibeTalk TEST WebSocket error:', error);
                    this.updateStatus('❌ Connection Error', 'disconnected');
                };
            } catch (error) {
                console.error('Failed to connect to VibeTalk TEST service:', error);
                this.updateStatus('❌ Service Unavailable', 'disconnected');
            }
        }
        
        setupHeartbeat() {
            this.clearHeartbeat();
            this.heartbeatInterval = setInterval(() => {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({ type: 'ping' }));
                }
            }, 20000);
        }
        
        clearHeartbeat() {
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
                this.heartbeatInterval = null;
            }
        }
        
        async startRecording() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    audio: { sampleRate: 16000, channelCount: 1 } 
                });

                this.mediaRecorder = new MediaRecorder(stream, {
                    mimeType: 'audio/webm;codecs=opus'
                });
                
                this.audioChunks = [];
                
                this.mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        this.audioChunks.push(event.data);
                    }
                };

                this.mediaRecorder.onstop = () => {
                    const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                    this.sendAudioToServer(audioBlob);
                    stream.getTracks().forEach(track => track.stop());
                };

                this.mediaRecorder.start();
                this.setRecordingState(true);
                
                console.log('🎤 VibeTalk TEST recording started...');
                
            } catch (error) {
                console.error('Error starting TEST recording:', error);
                this.updateStatus('❌ Mic Access Denied', 'disconnected');
            }
        }
        
        stopRecording() {
            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                this.mediaRecorder.stop();
                this.setRecordingState(false);
                this.setProcessingState(true);
                console.log('⏹️ VibeTalk TEST recording stopped, processing...');
            }
        }
        
        isWebSocketReady() {
            return this.ws && this.ws.readyState === WebSocket.OPEN && !this.isReconnecting;
        }
        
        async sendAudioToServer(audioBlob) {
            if (!this.isWebSocketReady()) {
                console.error('❌ TEST: WebSocket not ready for audio transmission');
                this.updateStatus('❌ Connection not ready', 'error');
                this.setProcessingState(false);
                return;
            }

            try {
                console.log('📤 TEST: Sending audio to server...');
                const arrayBuffer = await audioBlob.arrayBuffer();
                const audioData = new Uint8Array(arrayBuffer);
                
                if (!this.isWebSocketReady()) {
                    throw new Error('WebSocket connection lost during audio preparation');
                }
                
                this.ws.send(JSON.stringify({
                    type: 'audio',
                    data: Array.from(audioData),
                    mimeType: audioBlob.type,
                    timestamp: Date.now()
                }));
                
                console.log('✅ TEST: Audio data sent successfully');
                
            } catch (error) {
                console.error('❌ TEST: Error sending audio:', error);
                this.updateStatus('❌ Failed to send audio', 'error');
                this.setProcessingState(false);
            }
        }
        
        handleServerMessage(data) {
            console.log('📨 TEST: Received message:', data.type, data.processId || '');
            
            switch (data.type) {
                case 'pong':
                    break;
                case 'status':
                    this.updateStatus(data.message + ' (TEST)', 'processing');
                    break;
                case 'transcription':
                    this.updateStatus(\`📝 "\${data.text}" (TEST)\`, 'processing');
                    break;
                case 'injection':
                    this.updateStatus(data.message + ' (TEST)', 'processing');
                    break;
                case 'success':
                    this.updateStatus(data.message + ' (TEST)', 'success');
                    break;
                case 'processing':
                    this.updateStatus(data.message + ' (TEST)', 'processing');
                    break;
                case 'refresh':
                    this.updateStatus('🔄 Would refresh (TEST MODE - No Refresh)', 'refresh');
                    this.setProcessingState(false);
                    setTimeout(() => {
                        this.updateStatus('🎙️ Ready to record (TEST)', 'connected');
                    }, 3000);
                    break;
                case 'refresh-now':
                    this.updateStatus('✅ Test Complete (No Refresh in TEST)', 'success');
                    this.setProcessingState(false);
                    setTimeout(() => {
                        this.updateStatus('🎙️ Ready to record (TEST)', 'connected');
                    }, 3000);
                    break;
                case 'error':
                    this.updateStatus(data.message + ' (TEST)', 'error');
                    this.setProcessingState(false);
                    setTimeout(() => {
                        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                            this.updateStatus('🎙️ Ready to record (TEST)', 'connected');
                        }
                    }, 3000);
                    break;
            }
        }
        
        setRecordingState(recording) {
            this.isRecording = recording;
            
            if (recording) {
                this.micBtn.classList.add('recording');
                this.updateStatus('🔴 Recording... (click to stop) TEST', 'recording');
            } else {
                this.micBtn.classList.remove('recording');
            }
        }
        
        setProcessingState(processing) {
            this.isProcessing = processing;
            
            if (processing) {
                this.micBtn.classList.add('processing');
            } else {
                this.micBtn.classList.remove('processing');
                if (!this.isRecording) {
                    setTimeout(() => {
                        this.updateStatus('🎙️ Ready to record (TEST)', 'connected');
                    }, 1000);
                }
            }
        }
        
        updateStatus(message, className) {
            if (this.statusEl) {
                this.statusEl.textContent = message;
                this.statusEl.className = \`vibetalk-status \${className}\`;
                console.log(\`📊 TEST Status: \${message} (\${className})\`);
            }
        }
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            new VibeTalkTestWidget();
        });
    } else {
        new VibeTalkTestWidget();
    }
    
    console.log('🧪 VibeTalk Universal TEST Widget loaded!');
    console.log('💡 Click the microphone button to test');
    console.log('🚫 Auto-refresh is DISABLED in test mode');
    
})();
  `;
} 