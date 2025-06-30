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

// Simple state management
let currentConnections = new Set<any>();
let isRecording = false;

// Ports
const HTTP_PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const WS_PORT = process.env.WS_PORT ? parseInt(process.env.WS_PORT) : HTTP_PORT + 1;

// Enhanced message broadcasting
function broadcastToClients(message: any): void {
  const messageStr = JSON.stringify(message);
  currentConnections.forEach(ws => {
    if (ws.readyState === ws.OPEN) {
      ws.send(messageStr);
    }
  });
}

// Restored auto-refresh functionality (this was working before!)
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
        
        // Broadcast that we're rebuilding
        this.connections.forEach(ws => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'status', message: '🔄 Changes detected, refreshing...' }));
          }
        });
        
        await execAsync('npm run build');
        console.log('🔄 Sending refresh signal to all clients...');
        
        // Send refresh signal
        this.connections.forEach(ws => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'refresh-now' }));
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

// Enhanced voice command handler with proper success detection
async function handleVoiceCommand(action: 'start' | 'stop'): Promise<void> {
  if (action === 'start' && !isRecording) {
    try {
      console.log('🎤 Starting voice recording...');
      isRecording = true;
      broadcastToClients({ type: 'status', message: '🎤 Listening... Speak your command clearly' });
      
      await audioRecorder.startRecording();
      console.log('✅ Voice recording started');
      
    } catch (error) {
      console.error('❌ Failed to start recording:', error);
      isRecording = false;
      broadcastToClients({ type: 'error', message: 'Failed to start recording. Check microphone permissions.' });
    }
    
  } else if (action === 'stop' && isRecording) {
    try {
      console.log('⏹️ Stopping voice recording...');
      broadcastToClients({ type: 'status', message: '⏸️ Processing audio...' });
      
      const audioPath = await audioRecorder.stopRecording();
      isRecording = false;
      
      if (!audioPath) {
        console.error('❌ No audio file created');
        broadcastToClients({ type: 'error', message: 'No audio recorded. Please try again.' });
        return;
      }

      console.log('🧠 Transcribing audio...');
      broadcastToClients({ type: 'status', message: '🧠 Converting speech to text...' });
      
      if (!config.isValid() || !whisperClient) {
        console.error('❌ OpenAI API key not configured');
        broadcastToClients({ type: 'error', message: 'OpenAI API key not configured' });
        audioRecorder.cleanup(audioPath);
        return;
      }

      const transcript = await whisperClient.transcribe(audioPath);
      audioRecorder.cleanup(audioPath);
      
      if (!transcript) {
        console.error('❌ Transcription failed');
        broadcastToClients({ type: 'error', message: 'Speech transcription failed. Please speak more clearly.' });
        return;
      }

      console.log(`📝 Transcript: "${transcript}"`);
      broadcastToClients({ type: 'transcription', message: transcript });

      console.log('🎯 Sending to Cursor AI...');
      broadcastToClients({ type: 'status', message: '🤖 Sending command to Cursor AI...' });
      
      // Enhanced injection with success monitoring
      const success = await cursorAutomator.injectText(transcript, true);
      
      if (success) {
        console.log('✅ Command sent to Cursor AI');
        broadcastToClients({ type: 'injection', message: 'Command sent to Cursor AI successfully' });
        broadcastToClients({ type: 'status', message: '🔨 AI is processing your request...' });
        
        // Wait for actual changes to be made and refresh to happen
        // The auto-refresh will handle detecting changes and refreshing
        setTimeout(() => {
          broadcastToClients({ type: 'status', message: '✅ Command completed! Watch for changes...' });
        }, 1000);
        
      } else {
        console.error('❌ Failed to inject into Cursor');
        broadcastToClients({ type: 'error', message: 'Failed to send command to Cursor' });
      }
      
    } catch (error) {
      console.error('❌ Voice command processing failed:', error);
      isRecording = false;
      broadcastToClients({ type: 'error', message: `Processing failed: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
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
    res.end(getMinimalWidget());
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

// Minimal OpenAI-style widget
function getMinimalWidget(): string {
  return `(function(){
    var recording = false;
    var ws = null;
    
    // Minimal container
    var container = document.createElement('div');
    container.id = 'vibetalk-widget';
    container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:10000;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';

    // Status display (minimal)
    var statusDiv = document.createElement('div');
    statusDiv.style.cssText = 'background:rgba(0,0,0,0.9);color:white;padding:12px 16px;border-radius:8px;margin-bottom:10px;font-size:14px;display:none;min-width:200px;backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.1);';
    
    // Microphone button (OpenAI style)
    var micButton = document.createElement('button');
    micButton.innerHTML = '🎙️';
    micButton.title = 'Click to start/stop voice recording';
    micButton.style.cssText = 'background:#10a37f;color:white;border:none;padding:16px;border-radius:50%;font-size:20px;cursor:pointer;transition:all 0.2s ease;box-shadow:0 4px 12px rgba(16,163,127,0.3);width:56px;height:56px;display:flex;align-items:center;justify-content:center;';
    
    container.appendChild(statusDiv);
    container.appendChild(micButton);
    document.body.appendChild(container);

    // WebSocket connection
    function connectWebSocket() {
      ws = new WebSocket('ws://' + location.hostname + ':${WS_PORT}');
      
      ws.onopen = function() {
        console.log('🔗 VibeTalk connected');
      };
      
      ws.onmessage = function(event) {
        var data = event.data;
        
        // Handle refresh signal
        if (typeof data === 'string' && data.includes('refresh-now')) {
          location.reload();
          return;
        }
        
        // Handle JSON messages
        try {
          var message = JSON.parse(data);
          handleMessage(message);
        } catch (e) {
          console.log('Non-JSON message:', data);
        }
      };
      
      ws.onclose = function() {
        // Auto-reconnect
        setTimeout(connectWebSocket, 2000);
      };
      
      ws.onerror = function(error) {
        console.error('WebSocket error:', error);
      };
    }
    
    function handleMessage(message) {
      switch (message.type) {
        case 'status':
          showStatus(message.message);
          break;
        case 'transcription':
          showStatus('📝 "' + message.message + '"');
          break;
        case 'injection':
          showStatus('✅ ' + message.message);
          break;
        case 'error':
          showStatus('❌ ' + message.message, '#ef4444');
          break;
        case 'refresh-now':
          location.reload();
          break;
      }
    }
    
    function showStatus(text, bgColor = 'rgba(0,0,0,0.9)') {
      statusDiv.textContent = text;
      statusDiv.style.background = bgColor;
      statusDiv.style.display = 'block';
      
      // Auto-hide after 8 seconds for non-error messages
      if (!text.includes('❌')) {
        setTimeout(function() {
          if (!recording) {
            statusDiv.style.display = 'none';
          }
        }, 8000);
      }
    }
    
    // Microphone button handler
    micButton.onclick = function() {
      if (!recording) {
        recording = true;
        micButton.innerHTML = '⏹️';
        micButton.style.background = '#ef4444';
        micButton.style.transform = 'scale(1.05)';
        ws.send('start');
      } else {
        recording = false;
        micButton.innerHTML = '🎙️';
        micButton.style.background = '#10a37f';
        micButton.style.transform = 'scale(1)';
        ws.send('stop');
      }
    };
    
    // Initialize
    connectWebSocket();
  })();`;
}

// Create auto-refresh instance
const autoRefresh = new SimpleAutoRefresh();

// WebSocket server
const wss = new WebSocketServer({ port: WS_PORT });

wss.on('connection', ws => {
  console.log('🔗 New WebSocket connection');
  currentConnections.add(ws);
  autoRefresh.addConnection(ws);
  
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

// Launch servers
httpServer.listen(HTTP_PORT, () => {
  console.log('🚀 Enhanced VibeTalk Server Started');
  console.log(`📱 HTTP Server: http://localhost:${HTTP_PORT}`);
  console.log(`🔌 WebSocket Server: ws://localhost:${WS_PORT}`);
  console.log('');
  
  if (!config.isValid()) {
    console.log('⚠️  OpenAI API key not configured');
    console.log('💡 Set your API key: export OPENAI_API_KEY="your-key-here"');
  } else {
    console.log('✅ OpenAI API key configured');
  }
  
  console.log('🎤 Minimal voice interface ready!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});

export { httpServer, wss }; 