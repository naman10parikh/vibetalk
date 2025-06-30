#!/usr/bin/env node

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { WebSocketServer } from 'ws';
import { exec } from 'child_process';
import { promisify } from 'util';
import { AudioRecorder } from '../audio/recorder';
import { WhisperClient } from '../whisper/client';
import { CursorAutomator } from '../cursor/automator';
import { Config } from '../config/config';

const execAsync = promisify(exec);

// Initialize VibeTalk components
const config = new Config();
const audioRecorder = new AudioRecorder();
const whisperClient = config.isValid() ? new WhisperClient(config.openaiApiKey) : null;
const cursorAutomator = new CursorAutomator();

// Enhanced state management
let currentConnections = new Set<any>();
let isRecording = false;
let sessionId = '';

// Ports
const HTTP_PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const WS_PORT = process.env.WS_PORT ? parseInt(process.env.WS_PORT) : HTTP_PORT + 1;

// Enhanced message broadcasting with detailed status
function broadcastToClients(message: any): void {
  const enhancedMessage = {
    ...message,
    timestamp: Date.now(),
    sessionId: sessionId
  };
  
  const messageStr = JSON.stringify(enhancedMessage);
  currentConnections.forEach(ws => {
    if (ws.readyState === ws.OPEN) {
      ws.send(messageStr);
    }
  });
  
  // Log detailed status for debugging
  console.log(`📡 Broadcasting: ${message.type} - ${message.message || message.status}`);
}

// Enhanced auto-refresh with detailed progress
class EnhancedAutoRefresh {
  private connections = new Set<any>();
  private lastMTime = 0;
  private building = false;

  constructor() {
    this.updateMTime();
    setInterval(() => this.check(), 800); // Faster checking
    console.log('🔍 Enhanced file watching active...');
  }

  addConnection(ws: any) {
    this.connections.add(ws);
    ws.on('close', () => this.connections.delete(ws));
  }

  private updateMTime() {
    try {
      this.lastMTime = fs.statSync(path.join(process.cwd(), 'src/web/index.html')).mtimeMs;
    } catch {}
  }

  private async check() {
    if (this.building) return;
    try {
      const p = path.join(process.cwd(), 'src/web/index.html');
      const st = fs.statSync(p).mtimeMs;
      if (st > this.lastMTime) {
        console.log('📁 Change detected - starting enhanced rebuild...');
        this.lastMTime = st;
        this.building = true;
        
        // Step 1: Notify of change detection
        this.connections.forEach(ws => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ 
              type: 'progress', 
              step: 'changes-detected',
              message: '📁 Changes detected in source files',
              progress: 25
            }));
          }
        });
        
        await this.sleep(300);
        
        // Step 2: Building
        this.connections.forEach(ws => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ 
              type: 'progress', 
              step: 'building',
              message: '🔨 Rebuilding project with your changes',
              progress: 50
            }));
          }
        });
        
        await execAsync('npm run build');
        await this.sleep(200);
        
        // Step 3: Preparing refresh
        this.connections.forEach(ws => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ 
              type: 'progress', 
              step: 'preparing-refresh',
              message: '🔄 Preparing to refresh your page',
              progress: 75
            }));
          }
        });
        
        await this.sleep(500);
        
        // Step 4: Refreshing
        this.connections.forEach(ws => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ 
              type: 'progress', 
              step: 'refreshing',
              message: '✨ Refreshing page with changes',
              progress: 100
            }));
          }
        });
        
        await this.sleep(300);
        
        // Final refresh
        this.connections.forEach(ws => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'refresh-now' }));
          }
        });
        
        this.building = false;
        console.log('✅ Enhanced rebuild complete');
      }
    } catch (error) {
      console.error('❌ Enhanced auto-refresh error:', error);
      this.building = false;
    }
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Enhanced voice command handler with detailed progress
async function handleVoiceCommand(action: 'start' | 'stop'): Promise<void> {
  if (action === 'start' && !isRecording) {
    try {
      sessionId = `session_${Date.now()}`;
      console.log(`🎤 Starting enhanced voice session: ${sessionId}`);
      isRecording = true;
      
      // Step 1: Initializing
      broadcastToClients({ 
        type: 'voice-status', 
        step: 'initializing',
        message: '🎤 Initializing voice recording',
        status: 'listening-start'
      });
      
      await audioRecorder.startRecording();
      await sleep(200);
      
      // Step 2: Active listening
      broadcastToClients({ 
        type: 'voice-status', 
        step: 'listening',
        message: '👂 Listening - speak your command clearly',
        status: 'listening-active'
      });
      
      console.log('✅ Enhanced voice recording started');
      
    } catch (error) {
      console.error('❌ Failed to start enhanced recording:', error);
      isRecording = false;
      broadcastToClients({ 
        type: 'error', 
        message: 'Failed to start recording. Please check microphone permissions.',
        step: 'error'
      });
    }
    
  } else if (action === 'stop' && isRecording) {
    try {
      console.log('⏹️ Stopping enhanced voice recording...');
      
      // Step 1: Processing audio
      broadcastToClients({ 
        type: 'voice-status', 
        step: 'processing',
        message: '⏸️ Processing your voice input',
        status: 'processing'
      });
      
      const audioPath = await audioRecorder.stopRecording();
      isRecording = false;
      
      if (!audioPath) {
        broadcastToClients({ 
          type: 'error', 
          message: 'No audio captured. Please try speaking again.',
          step: 'error'
        });
        return;
      }

      await sleep(300);
      
      // Step 2: Transcribing
      broadcastToClients({ 
        type: 'voice-status', 
        step: 'transcribing',
        message: '🧠 Converting speech to text with AI',
        status: 'transcribing'
      });
      
      if (!config.isValid() || !whisperClient) {
        broadcastToClients({ 
          type: 'error', 
          message: 'OpenAI API key not configured',
          step: 'error'
        });
        audioRecorder.cleanup(audioPath);
        return;
      }

      const transcript = await whisperClient.transcribe(audioPath);
      audioRecorder.cleanup(audioPath);
      
      if (!transcript) {
        broadcastToClients({ 
          type: 'error', 
          message: 'Could not understand speech. Please try speaking more clearly.',
          step: 'error'
        });
        return;
      }

      await sleep(200);
      
      // Step 3: Show transcription
      console.log(`📝 Enhanced transcript: "${transcript}"`);
      broadcastToClients({ 
        type: 'transcription', 
        step: 'transcribed',
        message: `📝 Understood: "${transcript}"`,
        transcript: transcript
      });
      
      await sleep(600);
      
      // Step 4: Sending to Cursor
      broadcastToClients({ 
        type: 'voice-status', 
        step: 'cursor-sending',
        message: '🎯 Sending command to Cursor AI',
        status: 'cursor-processing'
      });
      
      const success = await cursorAutomator.injectText(transcript, true);
      
      if (success) {
        await sleep(300);
        
        // Step 5: AI Processing
        broadcastToClients({ 
          type: 'voice-status', 
          step: 'ai-processing',
          message: '🤖 Cursor AI is analyzing and executing your request',
          status: 'ai-working'
        });
        
        await sleep(800);
        
        // Step 6: Waiting for changes
        broadcastToClients({ 
          type: 'voice-status', 
          step: 'waiting-changes',
          message: '⏳ Waiting for code changes to be applied',
          status: 'waiting'
        });
        
        // The auto-refresh system will handle the rest
        console.log('✅ Enhanced command sent to Cursor AI');
        
      } else {
        broadcastToClients({ 
          type: 'error', 
          message: 'Failed to send command to Cursor. Please ensure Cursor is open.',
          step: 'error'
        });
      }
      
    } catch (error) {
      console.error('❌ Enhanced voice command processing failed:', error);
      isRecording = false;
      broadcastToClients({ 
        type: 'error', 
        message: `Processing failed: ${error instanceof Error ? error.message : String(error)}`,
        step: 'error'
      });
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// HTTP Server
const httpServer = http.createServer((req, res) => {
  const url = req.url || '/';

  if (url === '/' || url === '/index.html') {
    const indexPath = path.join(__dirname, 'index.html');
    
    try {
      const content = fs.readFileSync(indexPath, 'utf8');
      res.writeHead(200, { 
        'Content-Type': 'text/html',
        'Cache-Control': 'no-cache'
      });
      res.end(content);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found');
    }
  } else if (url === '/enhanced-widget.js') {
    res.writeHead(200, { 
      'Content-Type': 'application/javascript',
      'Cache-Control': 'no-cache'
    });
    res.end(getChatGPTStyleWidget());
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

// ChatGPT Mac App Style Widget
function getChatGPTStyleWidget(): string {
  return `(function(){
    var recording = false;
    var ws = null;
    var currentStep = '';
    
    // Main container - ChatGPT style
    var container = document.createElement('div');
    container.id = 'vibetalk-widget';
    container.style.cssText = \`
      position: fixed;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    \`;

    // Main bar - ChatGPT style
    var mainBar = document.createElement('div');
    mainBar.style.cssText = \`
      background: rgba(0, 0, 0, 0.95);
      backdrop-filter: blur(20px);
      border-radius: 24px;
      padding: 12px 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      min-width: 320px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      transition: all 0.3s ease;
    \`;
    
    // Voice visualization (like Whisper model)
    var voiceViz = document.createElement('div');
    voiceViz.style.cssText = \`
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #10a37f;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
    \`;
    voiceViz.innerHTML = '🎙️';
    
    // Status text
    var statusText = document.createElement('div');
    statusText.style.cssText = \`
      color: white;
      font-size: 14px;
      font-weight: 500;
      flex: 1;
      text-align: center;
    \`;
    statusText.textContent = 'Click to start voice command';
    
    // Action button (cross/check)
    var actionBtn = document.createElement('button');
    actionBtn.style.cssText = \`
      background: rgba(255, 255, 255, 0.1);
      border: none;
      color: white;
      width: 28px;
      height: 28px;
      border-radius: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      transition: all 0.2s ease;
    \`;
    actionBtn.innerHTML = '●';
    
    // Progress bar
    var progressBar = document.createElement('div');
    progressBar.style.cssText = \`
      position: absolute;
      bottom: 0;
      left: 0;
      height: 2px;
      background: #10a37f;
      border-radius: 0 0 24px 24px;
      width: 0%;
      transition: width 0.3s ease;
    \`;
    
    mainBar.appendChild(voiceViz);
    mainBar.appendChild(statusText);
    mainBar.appendChild(actionBtn);
    mainBar.appendChild(progressBar);
    container.appendChild(mainBar);
    document.body.appendChild(container);

    // WebSocket connection
    function connectWebSocket() {
      ws = new WebSocket('ws://' + location.hostname + ':${WS_PORT}');
      
      ws.onopen = function() {
        console.log('🔗 VibeTalk ChatGPT-style interface connected');
        updateStatus('Ready for voice commands', '🎙️', '#10a37f');
      };
      
      ws.onmessage = function(event) {
        try {
          var message = JSON.parse(event.data);
          handleMessage(message);
        } catch (e) {
          if (event.data.includes('refresh-now')) {
            showRefreshAnimation();
          }
        }
      };
      
      ws.onclose = function() {
        updateStatus('Reconnecting...', '🔄', '#f59e0b');
        setTimeout(connectWebSocket, 2000);
      };
      
      ws.onerror = function(error) {
        updateStatus('Connection error', '❌', '#ef4444');
      };
    }
    
    function handleMessage(message) {
      switch (message.type) {
        case 'voice-status':
          handleVoiceStatus(message);
          break;
        case 'transcription':
          handleTranscription(message);
          break;
        case 'progress':
          handleProgress(message);
          break;
        case 'error':
          handleError(message);
          break;
        case 'refresh-now':
          showRefreshAnimation();
          break;
      }
    }
    
    function handleVoiceStatus(message) {
      currentStep = message.step;
      
      switch (message.step) {
        case 'initializing':
          updateStatus('Initializing microphone...', '🎤', '#10a37f');
          actionBtn.innerHTML = '⏹️';
          break;
        case 'listening':
          updateStatus('Listening - speak now', '👂', '#10a37f');
          startVoiceAnimation();
          actionBtn.innerHTML = '⏹️';
          break;
        case 'processing':
          updateStatus('Processing audio...', '⚡', '#f59e0b');
          stopVoiceAnimation();
          actionBtn.innerHTML = '⏳';
          break;
        case 'transcribing':
          updateStatus('Converting speech to text...', '🧠', '#8b5cf6');
          actionBtn.innerHTML = '✨';
          break;
        case 'cursor-sending':
          updateStatus('Sending to Cursor AI...', '🎯', '#3b82f6');
          actionBtn.innerHTML = '📤';
          break;
        case 'ai-processing':
          updateStatus('AI is working on your request...', '🤖', '#6366f1');
          actionBtn.innerHTML = '🔄';
          break;
        case 'waiting-changes':
          updateStatus('Waiting for changes...', '⏳', '#f59e0b');
          actionBtn.innerHTML = '👀';
          break;
      }
    }
    
    function handleTranscription(message) {
      var shortTranscript = message.transcript.length > 40 ? 
        message.transcript.substring(0, 40) + '...' : message.transcript;
      updateStatus('Understood: "' + shortTranscript + '"', '✅', '#10b981');
      actionBtn.innerHTML = '✅';
    }
    
    function handleProgress(message) {
      updateStatus(message.message, '🔄', '#8b5cf6');
      progressBar.style.width = message.progress + '%';
      
      if (message.step === 'refreshing') {
        actionBtn.innerHTML = '🔄';
      }
    }
    
    function handleError(message) {
      updateStatus(message.message, '❌', '#ef4444');
      actionBtn.innerHTML = '❌';
      recording = false;
      setTimeout(() => {
        updateStatus('Ready for voice commands', '🎙️', '#10a37f');
        actionBtn.innerHTML = '●';
        progressBar.style.width = '0%';
      }, 4000);
    }
    
    function updateStatus(text, icon, color) {
      statusText.textContent = text;
      voiceViz.innerHTML = icon;
      voiceViz.style.background = color;
    }
    
    function startVoiceAnimation() {
      voiceViz.style.animation = 'pulse 1.5s infinite';
      var style = document.createElement('style');
      style.textContent = \`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.2); opacity: 0.7; }
          100% { transform: scale(1); opacity: 1; }
        }
      \`;
      document.head.appendChild(style);
    }
    
    function stopVoiceAnimation() {
      voiceViz.style.animation = 'none';
    }
    
    function showRefreshAnimation() {
      updateStatus('Refreshing with changes...', '✨', '#10b981');
      actionBtn.innerHTML = '✨';
      progressBar.style.width = '100%';
      
      setTimeout(() => {
        location.reload();
      }, 800);
    }
    
    // Click handler for the entire bar
    mainBar.onclick = function() {
      if (!recording) {
        recording = true;
        ws.send('start');
        mainBar.style.transform = 'scale(1.02)';
      } else {
        recording = false;
        ws.send('stop');
        mainBar.style.transform = 'scale(1)';
      }
    };
    
    // Hover effects
    mainBar.onmouseenter = function() {
      if (!recording) {
        mainBar.style.background = 'rgba(16, 163, 127, 0.1)';
      }
    };
    
    mainBar.onmouseleave = function() {
      if (!recording) {
        mainBar.style.background = 'rgba(0, 0, 0, 0.95)';
      }
    };
    
    // Initialize
    connectWebSocket();
  })();`;
}

// Create enhanced auto-refresh instance
const autoRefresh = new EnhancedAutoRefresh();

// WebSocket server
const wss = new WebSocketServer({ port: WS_PORT });

wss.on('connection', ws => {
  console.log('🔗 New enhanced WebSocket connection');
  currentConnections.add(ws);
  autoRefresh.addConnection(ws);
  
  ws.on('message', async (data) => {
    const msg = data.toString();
    if (msg === 'start' || msg === 'stop') {
      console.log(`🎤 Enhanced voice command: ${msg}`);
      await handleVoiceCommand(msg);
    }
  });
  
  ws.on('close', () => {
    console.log('🔌 Enhanced WebSocket connection closed');
    currentConnections.delete(ws);
  });
  
  ws.on('error', (error) => {
    console.error('❌ Enhanced WebSocket error:', error);
    currentConnections.delete(ws);
  });
});

// Launch servers
httpServer.listen(HTTP_PORT, () => {
  console.log('🚀 Enhanced ChatGPT-Style VibeTalk Server Started');
  console.log(`📱 HTTP Server: http://localhost:${HTTP_PORT}`);
  console.log(`🔌 WebSocket Server: ws://localhost:${WS_PORT}`);
  console.log('');
  
  if (!config.isValid()) {
    console.log('⚠️  OpenAI API key not configured');
    console.log('💡 Set your API key: export OPENAI_API_KEY="your-key-here"');
  } else {
    console.log('✅ OpenAI API key configured');
  }
  
  console.log('🎤 ChatGPT-style voice interface ready!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});

export { httpServer, wss }; 