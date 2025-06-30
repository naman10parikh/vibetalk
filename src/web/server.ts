#!/usr/bin/env node

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import WebSocket, { WebSocketServer } from 'ws';
import { AudioRecorder } from '../audio/recorder';
import { WhisperClient } from '../whisper/client';
import { CursorAutomator } from '../cursor/automator';
import { Config } from '../config/config';

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
    const widgetPath = path.join(__dirname, 'widget.js');
    serveFile(res, widgetPath, 'application/javascript');
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

// WebSocket Server with improved connection management
const wss = new WebSocketServer({ 
  port: WS_PORT,
  perMessageDeflate: false // Disable compression to reduce connection issues
});

class VibeTalkWebService {
  private config: Config;
  private audioRecorder: AudioRecorder;
  private whisperClient: WhisperClient;
  private cursorAutomator: CursorAutomator;
  private activeConnections: Set<WebSocket> = new Set();

  constructor() {
    this.config = new Config();
    this.audioRecorder = new AudioRecorder();
    this.whisperClient = new WhisperClient(this.config.openaiApiKey);
    this.cursorAutomator = new CursorAutomator();
  }

  async initialize() {
    // Check if API key is configured
    if (!this.config.openaiApiKey) {
      console.error('❌ OpenAI API key not found. Please set OPENAI_API_KEY environment variable.');
      process.exit(1);
    }

    // Test Cursor connection
    const cursorRunning = await this.cursorAutomator.isCursorRunning();
    if (!cursorRunning) {
      console.log('⚠️  Cursor is not running. Please start Cursor first.');
    }

    console.log('✅ VibeTalk Web Service initialized!');
  }

  /**
   * Add connection to active set and set up heartbeat
   */
  addConnection(ws: WebSocket) {
    this.activeConnections.add(ws);
    
    // Set up heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        clearInterval(heartbeat);
        this.activeConnections.delete(ws);
      }
    }, 30000); // Ping every 30 seconds
    
    // Handle pong responses
    ws.on('pong', () => {
      // Connection is alive
    });
    
    // Clean up on close
    ws.on('close', () => {
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
   * Broadcast message to all active connections
   */
  private broadcast(message: any) {
    let successCount = 0;
    this.activeConnections.forEach(ws => {
      if (this.sendSafeMessage(ws, message)) {
        successCount++;
      }
    });
    return successCount;
  }

  async processAudioData(audioData: number[], mimeType: string, ws: WebSocket) {
    let tempFiles: string[] = [];
    const processId = Date.now(); // Unique ID for this processing session
    
    try {
      console.log(`🎯 Starting audio processing session: ${processId}`);
      
      // Validate connection before starting
      if (!this.validateConnection(ws)) {
        console.log('❌ WebSocket invalid at start, aborting processing');
        return;
      }

      // Step 1: Processing status
      this.sendSafeMessage(ws, {
        type: 'status',
        message: '🔄 Processing your audio...',
        className: 'processing',
        processId
      });

      // Save audio file
      const buffer = Buffer.from(audioData);
      const timestamp = Date.now();
      const tempPath = path.join(this.config.tempDir, `web_recording_${timestamp}.webm`);
      tempFiles.push(tempPath);
      
      // Ensure temp directory exists
      if (!fs.existsSync(this.config.tempDir)) {
        fs.mkdirSync(this.config.tempDir, { recursive: true });
      }
      
      fs.writeFileSync(tempPath, buffer);
      console.log(`📁 Session ${processId}: Saved audio file: ${tempPath} (${buffer.length} bytes)`);

      // Convert audio if needed
      const wavPath = await this.convertToWav(tempPath, timestamp);
      if (wavPath) tempFiles.push(wavPath);
      
      // Step 2: Transcription status
      if (!this.validateConnection(ws)) {
        console.log(`❌ Session ${processId}: WebSocket invalid before transcription`);
        this.cleanupFiles(tempFiles);
        return;
      }

      this.sendSafeMessage(ws, {
        type: 'status',
        message: '🧠 Transcribing with AI (this may take a few seconds)...',
        className: 'processing',
        processId
      });

      const transcript = await this.whisperClient.transcribe(wavPath || tempPath);
      
      if (!transcript) {
        throw new Error('Failed to transcribe audio - empty result');
      }

      console.log(`📝 Session ${processId}: Transcription successful: "${transcript}"`);

      // Step 3: Show transcription result
      if (!this.validateConnection(ws)) {
        console.log(`❌ Session ${processId}: WebSocket invalid after transcription`);
        this.cleanupFiles(tempFiles);
        return;
      }

      this.sendSafeMessage(ws, {
        type: 'transcription',
        text: transcript,
        message: `✅ Got it: "${transcript}"`,
        processId
      });

      // Wait a moment to let user see the transcription
      await this.sleep(1000);

      // Step 4: Cursor injection status
      if (!this.validateConnection(ws)) {
        console.log(`❌ Session ${processId}: WebSocket invalid before Cursor injection`);
        this.cleanupFiles(tempFiles);
        return;
      }

      this.sendSafeMessage(ws, {
        type: 'injection',
        message: '💬 Sending to Cursor AI...',
        processId
      });

      // Perform Cursor operations
      await this.cursorAutomator.openComposer();
      const success = await this.cursorAutomator.injectText(transcript, true);

      if (success) {
        console.log(`✅ Session ${processId}: Successfully injected text into Cursor`);
        
        // Step 5: Success status
        if (this.validateConnection(ws)) {
          this.sendSafeMessage(ws, {
            type: 'success',
            message: '🎯 Request sent to Cursor! Working on it...',
            processId
          });
        }
        
        // Step 6: Processing status (with longer delay)
        setTimeout(() => {
          if (this.validateConnection(ws)) {
            this.sendSafeMessage(ws, {
              type: 'processing', 
              message: '⚙️ Cursor is processing your request...',
              processId
            });
          }
        }, 2000); // Increased delay
        
        // Step 7: Prepare for refresh (with much longer delay for reliability)
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
                this.sendSafeMessage(ws, {
                  type: 'refresh-now',
                  message: '🔄 Refreshing now...',
                  processId
                });
              }
            }, 3000);
          }
        }, 7000); // Much longer delay to ensure Cursor processes the request
        
      } else {
        throw new Error('Failed to inject text into Cursor');
      }

      // Cleanup files
      this.cleanupFiles(tempFiles);
      console.log(`✅ Session ${processId}: Completed successfully`);

    } catch (error) {
      console.error(`❌ Session ${processId}: Error processing audio:`, error);
      
      // Clean up files even on error
      this.cleanupFiles(tempFiles);
      
      // Send helpful error message
      const errorMessage = this.getHelpfulErrorMessage(error);
      this.sendSafeMessage(ws, {
        type: 'error',
        message: errorMessage,
        processId
      });
    }
  }

  /**
   * Validate WebSocket connection
   */
  private validateConnection(ws: WebSocket): boolean {
    return ws.readyState === WebSocket.OPEN && this.activeConnections.has(ws);
  }

  /**
   * Sleep helper with better promise handling
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async convertToWav(webmPath: string, timestamp: number): Promise<string | null> {
    try {
      const wavPath = path.join(this.config.tempDir, `converted_${timestamp}.wav`);
      
      // Use ffmpeg to convert webm to wav
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      await execAsync(`ffmpeg -i "${webmPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${wavPath}" -y`);
      
      return wavPath;
    } catch (error) {
      console.log('Could not convert to WAV, trying original file...');
      return null;
    }
  }

  private cleanupFiles(filePaths: string[]) {
    filePaths.forEach(filePath => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`🗑️  Cleaned up: ${filePath}`);
        }
      } catch (error) {
        console.log(`⚠️  Could not clean up ${filePath}`);
      }
    });
  }

  /**
   * Get a helpful error message based on the error type
   */
  private getHelpfulErrorMessage(error: any): string {
    const errorStr = error instanceof Error ? error.message : String(error);
    
    if (errorStr.includes('API key')) {
      return '❌ API key issue. Check your OpenAI API key.';
    }
    if (errorStr.includes('transcribe')) {
      return '❌ Transcription failed. Try speaking more clearly.';
    }
    if (errorStr.includes('Cursor')) {
      return '❌ Cursor connection failed. Make sure Cursor is open.';
    }
    if (errorStr.includes('audio')) {
      return '❌ Audio processing failed. Check your microphone.';
    }
    
    return `❌ Something went wrong: ${errorStr}`;
  }
}

// Initialize the service
const vibeTalkService = new VibeTalkWebService();

// WebSocket connection handling with improved management
wss.on('connection', (ws) => {
  console.log('🔗 Client connected to WebSocket');
  
  // Add to active connections
  vibeTalkService.addConnection(ws);

  // Send initial status
  ws.send(JSON.stringify({
    type: 'status',
    message: '✅ Connected to VibeTalk!',
    className: 'ready'
  }));

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      if (data.type === 'audio') {
        console.log(`🎵 Received audio data: ${data.data.length} bytes`);
        await vibeTalkService.processAudioData(data.data, data.mimeType, ws);
      } else if (data.type === 'ping') {
        // Respond to client pings
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Failed to process message'
        }));
      }
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  ws.on('close', () => {
    console.log('❌ Client disconnected from WebSocket');
  });
});

// Start servers
httpServer.listen(HTTP_PORT, () => {
  console.log(`🌐 VibeTalk Web Interface running at http://localhost:${HTTP_PORT}`);
  console.log(`🔌 WebSocket server running on port ${WS_PORT}`);
  console.log('🎙️ Open the web interface in your browser for seamless voice control!');
});

// Initialize the service
vibeTalkService.initialize().catch(console.error);

export { httpServer, wss }; 