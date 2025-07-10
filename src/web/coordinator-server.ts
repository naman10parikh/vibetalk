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
import fetch from 'node-fetch';

const execAsync = promisify(exec);

// Coordinator server configuration
const COORDINATOR_PORT = process.env.COORDINATOR_PORT ? parseInt(process.env.COORDINATOR_PORT) : 3003;

// Initialize VibeTalk components
const config = new Config();
const audioRecorder = new AudioRecorder();
const whisperClient = config.isValid() ? new WhisperClient(config.openaiApiKey) : null;
const cursorAutomator = new CursorAutomator();

// Voice recording state
let isRecording = false;
let currentConnections = new Set<any>();
let currentSessionId: string | null = null;

// Track server start for elapsed-time logging
const startTime = Date.now();

// Helper function to communicate with audio server via HTTP
async function sendToAudioServer(sessionId: string, text: string): Promise<void> {
  try {
    const response = await fetch('http://localhost:3003/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, text })
    });
    if (!response.ok) {
      console.error('❌ Failed to send to audio server:', response.statusText);
    }
  } catch (error) {
    console.error('❌ Error communicating with audio server:', error);
  }
}

// Enhanced voice command handler
async function handleVoiceCommand(action: 'start' | 'stop', sessionId: string): Promise<void> {
  if (action === 'start' && !isRecording) {
    try {
      console.log(`🎤 Starting voice session: ${sessionId}`);
      isRecording = true;
      currentSessionId = sessionId;
      
      // Notify audio server
      await sendToAudioServer(sessionId, 'Voice recording started');
      
      // Start recording
      await audioRecorder.startRecording();
      await sleep(200);
      
      // Send status to clients
      broadcastToClients({ 
        type: 'voice-status', 
        step: 'listening',
        message: '👂 Listening - speak your command clearly',
        sessionId
      });
      
    } catch (error) {
      console.error('❌ Failed to start recording:', error);
      isRecording = false;
      broadcastToClients({ 
        type: 'error', 
        message: 'Failed to start recording. Please check microphone permissions.',
        sessionId
      });
    }
    
  } else if (action === 'stop' && isRecording) {
    try {
      console.log('⏹️ Stopping voice recording...');
      broadcastToClients({ 
        type: 'voice-status', 
        step: 'processing',
        message: '⏸️ Processing your voice input',
        sessionId
      });
      
      const audioPath = await audioRecorder.stopRecording();
      isRecording = false;
      
      if (!audioPath) {
        broadcastToClients({ 
          type: 'error', 
          message: 'No audio captured. Please try speaking again.',
          sessionId
        });
        return;
      }

      await sleep(300);
      
      // Transcribe audio
      broadcastToClients({ 
        type: 'voice-status', 
        step: 'transcribing',
        message: '🧠 Converting speech to text with AI',
        sessionId
      });
      
      if (!config.isValid() || !whisperClient) {
        broadcastToClients({ 
          type: 'error', 
          message: 'OpenAI API key not configured',
          sessionId
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
          sessionId
        });
        return;
      }

      await sleep(200);
      
      // Show transcription
      broadcastToClients({ 
        type: 'transcription', 
        message: transcript,
        sessionId
      });

      await sleep(600);
      
      // Send to Cursor
      broadcastToClients({ 
        type: 'voice-status', 
        step: 'cursor-sending',
        message: '🎯 Sending command to Cursor AI',
        sessionId
      });
      
      const success = await cursorAutomator.injectText(transcript, true);
      
      if (success) {
        await sleep(300);
        
        // AI Processing
        broadcastToClients({ 
          type: 'voice-status', 
          step: 'ai-processing',
          message: '🤖 Cursor AI is analyzing and executing your request',
          sessionId
        });
        
        await sleep(800);
        
        // Waiting for changes
        broadcastToClients({ 
          type: 'voice-status', 
          step: 'waiting-changes',
          message: '⏳ Waiting for code changes to be applied',
          sessionId
        });

        // Generate summary and speak it
        const summaryText = await generateFriendlySummary(transcript);
        await sendToAudioServer(sessionId, summaryText);
        
        broadcastToClients({
          type: 'summary',
          summary: summaryText,
          sessionId
        });
        
        console.log(`Summary: ${summaryText}`);
      } else {
        broadcastToClients({ 
          type: 'error', 
          message: 'Failed to inject into Cursor',
          sessionId
        });
      }
      
    } catch (error) {
      console.error('❌ Failed to process voice command:', error);
      isRecording = false;
      broadcastToClients({ 
        type: 'error', 
        message: 'Failed to process voice command',
        sessionId
      });
    }
  }
}

// Generate friendly summary
async function generateFriendlySummary(transcript: string): Promise<string> {
  try {
    const { stdout: changedFiles } = await execAsync('git diff --name-only');
    const files = changedFiles.split('\n').filter(Boolean);
    
    if (files.length === 0) {
      return `I processed your request: "${transcript}". No files were changed.`;
    }
    
    const fileList = files.slice(0, 3).join(', ');
    const moreFiles = files.length > 3 ? ` and ${files.length - 3} more` : '';
    
    return `I processed your request: "${transcript}". Updated ${files.length} file${files.length > 1 ? 's' : ''}: ${fileList}${moreFiles}.`;
  } catch (error) {
    return `I processed your request: "${transcript}". Changes have been applied.`;
  }
}

// Broadcast to clients
function broadcastToClients(message: any): void {
  const enhancedMessage = {
    ...message,
    timestamp: Date.now()
  };
  
  const messageStr = JSON.stringify(enhancedMessage);
  currentConnections.forEach(ws => {
    if (ws.readyState === ws.OPEN) {
      ws.send(messageStr);
    }
  });
}

// Utility function
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// HTTP Server for coordinator
const httpServer = http.createServer((req, res) => {
  const url = req.url || '/';

  if (url === '/status') {
    res.writeHead(200, { 
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    });
    res.end(JSON.stringify({
      status: 'running',
      isRecording,
      currentSessionId,
      connections: currentConnections.size,
      uptime: Date.now() - startTime
    }));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

// WebSocket server for coordinator
const wss = new WebSocketServer({ port: COORDINATOR_PORT });

wss.on('connection', ws => {
  console.log('🔗 New coordinator WebSocket connection');
  currentConnections.add(ws);
  
  ws.on('message', async (data) => {
    let msgObj;
    try {
      msgObj = JSON.parse(data.toString());
    } catch {
      msgObj = { action: data.toString() };
    }
    const { action, sessionId } = msgObj;
    if ((action === 'start' || action === 'stop') && sessionId) {
      console.log(`🎤 Voice command: ${action} (${sessionId})`);
      await handleVoiceCommand(action, sessionId);
    }
  });
  
  ws.on('close', () => {
    console.log('🔌 Coordinator WebSocket connection closed');
    currentConnections.delete(ws);
  });
  
  ws.on('error', (error) => {
    console.error('❌ Coordinator WebSocket error:', error);
    currentConnections.delete(ws);
  });
});

// Only start servers if this file is run directly
if (require.main === module) {
  // Start HTTP server
  httpServer.listen(COORDINATOR_PORT + 1, () => {
    console.log(`🌐 Coordinator HTTP server started on port ${COORDINATOR_PORT + 1}`);
    console.log(`🔗 Coordinator WebSocket server started on port ${COORDINATOR_PORT}`);
  });
} 