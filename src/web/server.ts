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

// Voice recording state
let isRecording = false;
let currentConnections = new Set<any>();

// Allow dynamic ports, default to 3000 for HTTP and HTTP+1 for WebSocket
const HTTP_PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const WS_PORT = process.env.WS_PORT ? parseInt(process.env.WS_PORT) : HTTP_PORT + 1;

function serveFile(res: http.ServerResponse, filePath: string, contentType: string) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    res.writeHead(200, { 
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('File not found');
  }
}

// HTTP Server for serving the single localhost page and widget
const httpServer = http.createServer((req, res) => {
  const url = req.url || '/';

  if (url === '/' || url === '/index.html') {
    const indexPath = path.join(__dirname, 'index.html');
    serveFile(res, indexPath, 'text/html');
  } else if (url === '/widget.js') {
    res.writeHead(200, { 
      'Content-Type': 'application/javascript',
      'Cache-Control': 'no-cache'
    });
    res.end(getSimpleWidget());
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

// Voice recording handler
async function handleVoiceCommand(action: 'start' | 'stop'): Promise<void> {
  if (action === 'start' && !isRecording) {
    try {
      console.log('🎤 Starting voice recording...');
      isRecording = true;
      broadcastToClients({ type: 'status', message: 'Recording...' });
      
      await audioRecorder.startRecording();
      console.log('✅ Voice recording started');
      
    } catch (error) {
      console.error('❌ Failed to start recording:', error);
      isRecording = false;
      broadcastToClients({ type: 'error', message: 'Failed to start recording' });
    }
    
  } else if (action === 'stop' && isRecording) {
    try {
      console.log('⏹️ Stopping voice recording...');
      broadcastToClients({ type: 'status', message: 'Processing...' });
      
      const audioPath = await audioRecorder.stopRecording();
      isRecording = false;
      
      if (!audioPath) {
        console.error('❌ No audio file created');
        broadcastToClients({ type: 'error', message: 'No audio recorded' });
        return;
      }

      console.log('🧠 Transcribing audio...');
      broadcastToClients({ type: 'status', message: 'Transcribing...' });
      
      if (!config.isValid() || !whisperClient) {
        console.error('❌ OpenAI API key not configured');
        broadcastToClients({ type: 'error', message: 'API key not configured' });
        audioRecorder.cleanup(audioPath);
        return;
      }

      const transcript = await whisperClient.transcribe(audioPath);
      audioRecorder.cleanup(audioPath);
      
      if (!transcript) {
        console.error('❌ Transcription failed');
        broadcastToClients({ type: 'error', message: 'Transcription failed' });
        return;
      }

      console.log(`📝 Transcript: "${transcript}"`);
      broadcastToClients({ type: 'transcript', message: transcript });

      console.log('🎯 Injecting into Cursor...');
      broadcastToClients({ type: 'status', message: 'Injecting into Cursor...' });
      
      const success = await cursorAutomator.injectText(transcript, true);
      
      if (success) {
        console.log('✅ Successfully injected into Cursor');
        broadcastToClients({ type: 'success', message: 'Command executed successfully!' });
      } else {
        console.error('❌ Failed to inject into Cursor');
        broadcastToClients({ type: 'error', message: 'Failed to inject into Cursor' });
      }
      
    } catch (error) {
      console.error('❌ Voice command processing failed:', error);
      isRecording = false;
      broadcastToClients({ type: 'error', message: 'Processing failed' });
    }
  }
}

// Broadcast to all connected clients
function broadcastToClients(message: any) {
  const messageStr = JSON.stringify(message);
  currentConnections.forEach(ws => {
    if (ws.readyState === ws.OPEN) {
      ws.send(messageStr);
    }
  });
}

// Simplified auto-refresh via polling src/web/index.html for changes
class SimpleAutoRefresh {
  private connections = new Set<any>();
  private lastMTime = 0;
  private building = false;

  constructor() {
    this.updateMTime();
    setInterval(() => this.check(), 1000);
    console.log('🔍 Watching for changes in src/web/index.html...');
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
        console.log('📁 File change detected, rebuilding...');
        this.lastMTime = st;
        this.building = true;
        
        await execAsync('npm run build');
        console.log('🔄 Sending refresh signal to all clients...');
        
        this.connections.forEach(ws => {
          if (ws.readyState === ws.OPEN) {
            ws.send('refresh');
          }
        });
        
        this.building = false;
      }
    } catch (error) {
      console.error('❌ Auto-refresh error:', error);
      this.building = false;
    }
  }
}

// Embed widget for auto-refresh indicator and functionality
function getSimpleWidget(): string {
  return `(function(){
    // Container for indicator and mic button
    var container = document.createElement('div');
    container.id = 'vibetalk-widget';
    container.style.cssText = 'position:fixed;bottom:10px;right:10px;z-index:10000;display:flex;flex-direction:column;align-items:center;gap:5px;';

    // Status indicator
    var indicator = document.createElement('div');
    indicator.style.cssText = 'background:#10b981;color:white;padding:5px 10px;border-radius:5px;font-family:monospace;font-size:12px;min-width:120px;text-align:center;';
    indicator.textContent = 'Connecting...';

    // Microphone button
    var micButton = document.createElement('button');
    micButton.textContent = '🎙️';
    micButton.title = 'Click to start/stop voice recording';
    micButton.style.cssText = 'background:#3b82f6;color:white;border:none;padding:10px;border-radius:50%;font-size:20px;cursor:pointer;transition:all 0.3s ease;';
    
    var currentSessionId = null;
    var summaryDiv = document.createElement('div');
    summaryDiv.style.cssText = 'margin-top:8px;color:#fbbf24;font-size:13px;text-align:center;min-height:18px;';

    // Toggle recording on click
    var recording = false;
    micButton.onclick = function() {
      if (!recording) {
        currentSessionId = 'session_' + Date.now();
        ws.send(JSON.stringify({action:'start',sessionId:currentSessionId}));
        indicator.textContent = '🎤 Recording...';
        indicator.style.background = '#ef4444';
        micButton.style.background = '#ef4444';
        micButton.style.transform = 'scale(1.1)';
        recording = true;
        summaryDiv.textContent = '';
      } else {
        ws.send(JSON.stringify({action:'stop',sessionId:currentSessionId}));
        indicator.textContent = '⏳ Processing...';
        indicator.style.background = '#f59e0b';
        micButton.style.background = '#3b82f6';
        micButton.style.transform = 'scale(1)';
        recording = false;
      }
    };

    container.appendChild(indicator);
    container.appendChild(micButton);
    container.appendChild(summaryDiv);
    document.body.appendChild(container);

    // WebSocket for commands and auto-refresh
    var ws = new WebSocket('ws://' + location.hostname + ':${WS_PORT}');
    
    ws.onopen = function() {
      indicator.textContent = '✅ Ready';
      indicator.style.background = '#10b981';
      console.log('🔗 VibeTalk widget connected');
    };
    
    ws.onmessage = function(event) {
      var data = event.data;
      
      // Handle refresh signal
      if (data === 'refresh') {
        indicator.textContent = '🔄 Refreshing...';
        indicator.style.background = '#8b5cf6';
        setTimeout(function() {
          location.reload();
        }, 500);
        return;
      }
      
      // Handle JSON messages
      try {
        var message = JSON.parse(data);
        // Only process messages for the latest session
        if (message.sessionId && currentSessionId && message.sessionId !== currentSessionId) return;
        switch (message.type) {
          case 'status':
            indicator.textContent = message.message;
            indicator.style.background = '#f59e0b';
            break;
          case 'transcript':
            indicator.textContent = '📝 ' + message.message.substring(0, 15) + '...';
            indicator.style.background = '#8b5cf6';
            break;
          case 'success':
            indicator.textContent = '✅ Success!';
            indicator.style.background = '#10b981';
            if (message.summary) {
              summaryDiv.textContent = message.summary;
              if (window.speechSynthesis) {
                var utter = new window.SpeechSynthesisUtterance(message.summary);
                utter.rate = 1.05;
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(utter);
              }
            }
            setTimeout(function() {
              indicator.textContent = '✅ Ready';
              recording = false;
              micButton.style.background = '#3b82f6';
              micButton.style.transform = 'scale(1)';
            }, 2000);
            break;
          case 'error':
            indicator.textContent = '❌ Error';
            indicator.style.background = '#ef4444';
            setTimeout(function() {
              indicator.textContent = '✅ Ready';
              recording = false;
              micButton.style.background = '#3b82f6';
              micButton.style.transform = 'scale(1)';
            }, 3000);
            break;
        }
      } catch (e) {
        console.log('Non-JSON message:', data);
      }
    };
    
    ws.onclose = function() {
      indicator.textContent = '❌ Disconnected';
      indicator.style.background = '#6b7280';
    };
    
    ws.onerror = function(error) {
      console.error('WebSocket error:', error);
      indicator.textContent = '❌ Error';
      indicator.style.background = '#ef4444';
    };
  })();`;
}

// Start WebSocket server
const wss = new WebSocketServer({ port: WS_PORT });
const autoRefresh = new SimpleAutoRefresh();

wss.on('connection', ws => {
  console.log('🔗 New WebSocket connection');
  
  // Track connections
  currentConnections.add(ws);
  autoRefresh.addConnection(ws);
  
  // Handle voice commands
  ws.on('message', async (data) => {
    const msg = data.toString();
    if (msg === 'start' || msg === 'stop') {
      console.log(`🎤 Voice command: ${msg}`);
      await handleVoiceCommand(msg);
    }
  });
  
  ws.on('close', () => {
    console.log('🔌 WebSocket connection closed');
    currentConnections.delete(ws);
  });
  
  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
    currentConnections.delete(ws);
  });
});

// Launch HTTP and WebSocket servers
httpServer.listen(HTTP_PORT, () => {
  console.log('🌐 VibeTalk Web Server Started');
  console.log(`📱 HTTP Server: http://localhost:${HTTP_PORT}`);
  console.log(`🔌 WebSocket Server: ws://localhost:${WS_PORT}`);
  console.log('');
  
  if (!config.isValid()) {
    console.log('⚠️  OpenAI API key not configured');
    console.log('💡 Set your API key: export OPENAI_API_KEY="your-key-here"');
  } else {
    console.log('✅ OpenAI API key configured');
  }
  
  console.log('🎤 Ready for voice commands!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});

export { httpServer, wss }; 