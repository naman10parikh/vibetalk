#!/usr/bin/env node

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { WebSocketServer } from 'ws';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { AudioRecorder } from '../audio/recorder';
import { WhisperClient } from '../whisper/client';
import { CursorAutomator } from '../cursor/automator';
import { Config } from '../config/config';
import OpenAI from 'openai';
import screenshot from 'screenshot-desktop';
import os from 'os';

const execAsync = promisify(exec);

// Preserve original console.log for later use
const nativeLog = console.log;

// Initialize VibeTalk components
const config = new Config();
const audioRecorder = new AudioRecorder();
const whisperClient = config.isValid() ? new WhisperClient(config.openaiApiKey) : null;
const cursorAutomator = new CursorAutomator();
const openaiClient = config.isValid() ? new OpenAI({ apiKey: config.openaiApiKey }) : null;
fs.mkdirSync(path.join(process.cwd(), 'temp'), { recursive: true });

// Track server start for elapsed-time logging
const startTime = Date.now();

// Enhanced state management
let currentConnections = new Set<any>();
let isRecording = false;
let sessionId = '';
let latestSessionId: string | null = null;
let sessionBaseline: Record<string, string> = {};
// Periodic summary interval handles
const sessionIntervals: Record<string, NodeJS.Timeout> = {};
// Track periodic screenshot polling per session to detect AI replies
const conversationPollIntervals: Record<string, NodeJS.Timeout> = {};
const lastAIOutputs: Record<string, string> = {};

// Ports
const HTTP_PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const WS_PORT = process.env.WS_PORT ? parseInt(process.env.WS_PORT) : HTTP_PORT + 1;

// Flush buffered status every 6 s to sound more natural
const SUMMARY_FLUSH_MS = 6000;

// Track last spoken summary per session to avoid repeats
interface LastSummaryInfo { text: string; time: number; }
const lastSummary: Record<string, LastSummaryInfo> = {};

// ────────────────────────────────────────────────────────────────────────────────
// Session-level status buffering so we can create short, spoken summaries instead
// of dumping every low-level log line on the user.
interface SessionState { buffer: string[]; timeout?: NodeJS.Timeout; }
const sessionState: Record<string, SessionState> = {};

// Helper: generate TTS for status updates and broadcast to clients
async function queueStatusSpeech(text: string, targetSessionId?: string) {
  if (!openaiClient) return;
  try {
    const fileName = await generateSpeechAudio(text);
    if (fileName) {
      broadcastToClients({
        type: 'status-audio',
        audioUrl: `/speech/${fileName}`,
        sessionId: targetSessionId
      });
    }
  } catch (err) {
    console.error('❌ Failed to generate status speech:', err);
  }
}

// Utility: remove leading emojis/symbols for cleaner speech output
function stripEmoji(t: string): string {
  return t.replace(/^[^a-zA-Z0-9]+/, '').trim();
}

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
  
  // Buffer low-level status + progress so we can speak a short summary later.
  if ([ 'voice-status', 'progress', 'log' ].includes(message.type) && message.message) {
    // Skip early microphone prompts – they should be visual only.
    if (message.step && ['initializing', 'listening'].includes(message.step)) {
      // No spoken summary for these, as they often become stale quickly.
    } else {
      const sid = message.sessionId ?? sessionId;
      const st = (sessionState[sid] ||= { buffer: [] });
      const cleanMsg = stripEmoji(message.message);
      
      // Skip technical logs that shouldn't be spoken
      const skipPatterns = [
        /^⏳ Monitoring file changes/,
        /^Transcription received:/,
        /^AI-output polling/,
        /^📋 First AI reply/,
        /^⌛ No AI reply yet/,
        /^AI-output:/,
        /^File change detected/,
        /^Summary:/
      ];
      
      for (const pattern of skipPatterns) {
        if (pattern.test(cleanMsg)) {
          return;
        }
      }
      
      st.buffer.push(cleanMsg);

      // If no pending flush timer, schedule one. This prevents perpetual delay under heavy logging.
      if (!st.timeout) {
        st.timeout = setTimeout(() => {
          st.timeout = undefined;
          flushStatusSummary(sid);
        }, SUMMARY_FLUSH_MS);
      }
    }
  }
  // Debug logging to terminal disabled to reduce noise
}

// ===== Console.log Override =====
// Funnel all subsequent console logs to clients as generic 'log' entries
console.log = (...args: any[]) => {
  nativeLog(...args);
  try {
    const text = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    
    // Skip broadcasting certain technical logs
    const skipBroadcast = [
      /^AI-output:/,
      /^📋 First AI reply/,
      /^⌛ No AI reply yet/,
      /^Summary:/,
      /^Transcription received:/
    ];
    
    for (const pattern of skipBroadcast) {
      if (pattern.test(text)) {
        return; // Log to console but don't broadcast
      }
    }
    
    broadcastToClients({ type: 'log', message: text });
  } catch {/* swallow */}
};

// Summarise buffered status messages into ONE friendly spoken sentence
async function flushStatusSummary(sid: string) {
  const st = sessionState[sid];
  if (!st || st.buffer.length === 0) return;
  const raw = st.buffer.join(' · ');
  st.buffer.length = 0;

  let spoken = raw;
  if (openaiClient) {
    try {
      const completion = await openaiClient.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a friendly developer buddy. Turn the following status logs into ONE super-concise, chill spoken update (<=12 words). Keep it casual and upbeat.' },
          { role: 'user', content: raw }
        ]
      });
      spoken = completion.choices[0]?.message?.content?.trim() || raw;
    } catch (err) {
      console.error('❌ GPT summarisation failed:', err);
    }
  }

  const now = Date.now();
  const last = lastSummary[sid];
  if (last && spoken === last.text && now - last.time < 20000) {
    return; // skip identical summary within 20s window
  }
  lastSummary[sid] = { text: spoken, time: now };

  const file = await generateSpeechAudio(spoken);
  broadcastToClients({
    type: 'assistant',
    text: spoken,
    audioUrl: file ? `/speech/${file}` : undefined,
    sessionId: sid
  });
}

// Enhanced auto-refresh with detailed progress
class EnhancedAutoRefresh {
  private connections = new Set<any>();
  private lastMTime = 0;
  private building = false;

  constructor() {
    this.updateMTime();
    setInterval(() => this.check(), 800); // Faster checking
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
        // Log changed files with elapsed time
        const { stdout: changedStd } = await execAsync('git diff --name-only');
        const files = changedStd.split('\n').filter(Boolean);
        const elapsed1 = ((Date.now() - startTime) / 1000).toFixed(1);
        broadcastToClients({ type: 'log', message: `[+${elapsed1}s] 📂 Files changed: ${files.join(', ') || 'none'}` });
        broadcastToClients({ type: 'log', message: `[+${elapsed1}s] 📁 Change detected - starting enhanced rebuild...` });
        console.log('File change detected');
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
        
        const elapsed2 = ((Date.now() - startTime) / 1000).toFixed(1);
        broadcastToClients({ type: 'log', message: `[+${elapsed2}s] ✅ Enhanced rebuild complete` });
        this.building = false;
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
async function handleVoiceCommand(action: 'start' | 'stop', sessionId: string): Promise<void> {
  // Record baseline commit SHA at session start to scope file diffs
  if (action === 'start') {
    try {
      const { stdout: sha } = await execAsync('git rev-parse HEAD');
      sessionBaseline[sessionId] = sha.trim();
    } catch (err) {
      console.error('❌ Failed to record baseline SHA:', err);
    }
  }
  if (action === 'start' && !isRecording) {
    // Reset last captured AI output and stop any previous polling for this session
    lastAIOutputs[sessionId] = '';
    stopConversationPolling(sessionId);
    try {
      broadcastToClients({ type: 'log', message: `🎤 Starting enhanced voice session: ${sessionId}` });
      console.log(`🎤 Starting enhanced voice session: ${sessionId}`);
      isRecording = true;
      
      // Start periodic summary interval (every 5s)
      if (!sessionIntervals[sessionId]) {
        sessionIntervals[sessionId] = setInterval(() => {
          if (sessionState[sessionId]?.buffer.length) {
            flushStatusSummary(sessionId);
          }
        }, 5000);
      }
      
      // Step 1: Initializing
      broadcastToClients({ 
        type: 'voice-status', 
        step: 'initializing',
        message: '🎤 Initializing voice recording',
        status: 'listening-start',
        sessionId
      });
      
      await audioRecorder.startRecording();
      await sleep(200);
      
      // Step 2: Active listening
      broadcastToClients({ 
        type: 'voice-status', 
        step: 'listening',
        message: '👂 Listening - speak your command clearly',
        status: 'listening-active',
        sessionId
      });
      
    } catch (error) {
      console.error('❌ Failed to start enhanced recording:', error);
      isRecording = false;
      broadcastToClients({ 
        type: 'error', 
        message: 'Failed to start recording. Please check microphone permissions.',
        step: 'error',
        sessionId
      });
    }
    
  } else if (action === 'stop' && isRecording) {
    try {
      broadcastToClients({ type: 'log', message: '⏹️ Stopping enhanced voice recording...' });
      
      // Step 1: Processing audio
      broadcastToClients({ 
        type: 'voice-status', 
        step: 'processing',
        message: '⏸️ Processing your voice input',
        status: 'processing',
        sessionId
      });
      
      const audioPath = await audioRecorder.stopRecording();
      isRecording = false;
      
      if (!audioPath) {
        broadcastToClients({ 
          type: 'error', 
          message: 'No audio captured. Please try speaking again.',
          step: 'error',
          sessionId
        });
        return;
      }

      await sleep(300);
      
      // Step 2: Transcribing
      broadcastToClients({ 
        type: 'voice-status', 
        step: 'transcribing',
        message: '🧠 Converting speech to text with AI',
        status: 'transcribing',
        sessionId
      });
      
      if (!config.isValid() || !whisperClient) {
        broadcastToClients({ 
          type: 'error', 
          message: 'OpenAI API key not configured',
          step: 'error',
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
          step: 'error',
          sessionId
        });
        return;
      }

      await sleep(200);
      
      // Step 3: Show transcription
      // Log transcription received (console only, no broadcast)
      console.log(`Transcription received: "${transcript}"`);
      broadcastToClients({ 
        type: 'transcription', 
        step: 'received',
        message: transcript,
        sessionId
      });

      // Step 3: Generate and speak immediate response
      const immediateResponse = await generateImmediateResponse(transcript);
      const immediateAudioFile = await generateSpeechAudio(immediateResponse);
      
      broadcastToClients({
        type: 'assistant',
        text: immediateResponse,
        audioUrl: immediateAudioFile ? `/speech/${immediateAudioFile}` : undefined,
        sessionId
      });
      
      // Start AI output polling (silent)
      startConversationPolling(sessionId);

      // Brief pause before injection
      await sleep(800);
      
      const success = await cursorAutomator.injectText(transcript, true);
      
      if (success) {
        // Bring Cursor to front briefly so Vision screenshots capture its UI
        await cursorAutomator.activateCursor();

        // Wait up to 8s for first AI reply before going back to browser
        const firstAI = await waitForFirstAIOutput(sessionId, 8000);

        // After waiting, return to browser (if we were originally in browser)
        if (firstAI) {
          console.log('📋 First AI reply captured.');
        } else {
          console.log('⌛ No AI reply yet (timeout).');
        }
        
        // Wait a bit longer for file changes to be written
        await sleep(2000);
        
        // Stop the conversation polling before generating summary
        stopConversationPolling(sessionId);
        
        // After code changes, flush any pending status and create final summary
        await flushStatusSummary(sessionId);
        
        // Create session-scoped diff summary and speak it
        const summaryText = await generateFriendlySummary(transcript);
        if (summaryText && summaryText.trim()) {
          const audioFileName = await generateSpeechAudio(summaryText);
          
          broadcastToClients({
            type: 'summary',
            summary: summaryText,
            audioUrl: audioFileName ? `/speech/${audioFileName}` : undefined,
            sessionId
          });
          console.log(`Summary: ${summaryText}`);
        }
        
      } else {
        broadcastToClients({ 
          type: 'error', 
          message: 'Failed to send command to Cursor. Please ensure Cursor is open.',
          step: 'error',
          sessionId
        });
      }
      
    } catch (error) {
      console.error('❌ Enhanced voice command processing failed:', error);
      isRecording = false;
      broadcastToClients({ 
        type: 'error', 
        message: `Processing failed: ${error instanceof Error ? error.message : String(error)}`,
        step: 'error',
        sessionId
      });
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function startConversationPolling(sessionId: string) {
  // Clear any existing poller for this session first
  stopConversationPolling(sessionId);
  
  // Initialize buffer for this session
  aiOutputBuffer[sessionId] = { content: '', lastUpdate: 0 };
  
  // Track meaningful AI outputs to avoid repetitive speech
  let lastMeaningfulOutput = '';
  let outputChangeCount = 0;
  let lastOutputLength = 0;
  let lastOutputHash = ''; // Add hash tracking to prevent duplicates
  
  conversationPollIntervals[sessionId] = setInterval(async () => {
    const aiOut = await extractLatestAIOutput();
    if (!aiOut) {
      // Check if we have buffered content that's ready to speak
      const buffer = aiOutputBuffer[sessionId];
      if (buffer.content && Date.now() - buffer.lastUpdate > AI_OUTPUT_BUFFER_TIMEOUT) {
        // Process the buffered content
        await processAIOutput(buffer.content, sessionId, lastMeaningfulOutput);
        lastMeaningfulOutput = buffer.content;
        buffer.content = '';
      }
      return;
    }
    
    // Create a simple hash of the output to detect exact duplicates
    const currentHash = aiOut.substring(0, 100) + aiOut.length;
    
    // Skip if exactly the same as last time (by hash)
    if (lastOutputHash === currentHash) return;
    lastOutputHash = currentHash;
    
    // Skip if exactly the same as last stored output for this session
    if (lastAIOutputs[sessionId] === aiOut) return;
    
    // Log the raw output for debugging (but don't speak it)
    console.log(`🤖 AI-output detected (${aiOut.length} chars)`);
    
    // Update the buffer with new content
    const buffer = aiOutputBuffer[sessionId];
    if (aiOut.length > buffer.content.length) {
      buffer.content = aiOut;
      buffer.lastUpdate = Date.now();
    }
    
    // Always update the last output for comparison
    lastAIOutputs[sessionId] = aiOut;
    
    // Trigger first AI callback if waiting
    if (firstAICallbacks[sessionId]) {
      firstAICallbacks[sessionId](aiOut);
      delete firstAICallbacks[sessionId];
    }
  }, 2000); // Reduced from 6s to 2s since we're using buffering now
}

// New function to process accumulated AI output
async function processAIOutput(aiOut: string, sessionId: string, lastMeaningfulOutput: string) {
  // Check if this is a meaningful change worth speaking about
  const isMeaningfulChange = isMeaningfulAIOutput(aiOut, lastMeaningfulOutput);
  
  if (isMeaningfulChange) {
    console.log(`📢 Processing complete AI output (${aiOut.length} chars)`);
    
    // Only speak if we haven't spoken too recently (avoid spam)
    const timeSinceLastSpeech = Date.now() - (lastSpeechTime[sessionId] || 0);
    if (timeSinceLastSpeech > 10000) { // Increased from 8s to 10s
      // Convert AI output to conversational update
      const conversationalUpdate = await humanizeAIOutput(aiOut);
      
      console.log(`🎙️ Generating speech for: "${conversationalUpdate}"`);
      
      // Only speak if the update is actually meaningful and not repetitive
      if (conversationalUpdate && conversationalUpdate.length > 10 && 
          !conversationalUpdate.toLowerCase().includes('working on it')) {
        const audioFile = await generateSpeechAudio(conversationalUpdate);
        
        console.log(`🔊 Generated audio file: ${audioFile ? audioFile : 'failed'}`);
        
        broadcastToClients({
          type: 'assistant',
          text: conversationalUpdate,
          audioUrl: audioFile ? `/speech/${audioFile}` : undefined,
          sessionId
        });
        
        lastSpeechTime[sessionId] = Date.now();
      }
    } else {
      console.log(`⏰ Speech throttled - last speech was ${(timeSinceLastSpeech/1000).toFixed(1)}s ago`);
    }
  }
}

// Helper to determine if AI output is worth speaking about
function isMeaningfulAIOutput(currentOutput: string, lastMeaningfulOutput: string): boolean {
  if (!currentOutput || currentOutput.trim().length < 10) return false;
  
  // Skip partial outputs - wait for complete sentences
  const lastChar = currentOutput.trim().slice(-1);
  const endsWithPunctuation = ['.', '!', '?', ':', ')'].includes(lastChar);
  if (!endsWithPunctuation && currentOutput.length < 200) {
    console.log('🔄 Skipping partial output, waiting for complete sentence...');
    return false;
  }
  
  // Skip if too similar to last meaningful output
  if (lastMeaningfulOutput && currentOutput.includes(lastMeaningfulOutput.substring(0, 50))) {
    return false;
  }
  
  // Skip generic/repetitive phrases
  const genericPhrases = [
    'Plan, search, build anything',
    'The account page now provides',
    'seamlessly integrates with your homepage',
    'luxury shopping experience',
    'WeddingEase',
    'Revamp account page UI',
    'Enhanced Color Scheme',
    'polished, luxury shopping',
    'I can see your website currently has',
    'What color would you like to change it to',
    'Here are some popular options',
    'Just let me know what you prefer',
    'I\'ll help you change the background color',
    'Voice Command: The user spoke this request'
  ];
  
  for (const phrase of genericPhrases) {
    if (currentOutput.includes(phrase)) {
      return false;
    }
  }
  
  // Skip if it's about the wrong project (not VibeTalk)
  const wrongProjectIndicators = [
    'wedding', 'luxury', 'shopping', 'account page', 'wishlist',
    'ecommerce', 'e-commerce', 'cart', 'checkout', 'product catalog'
  ];
  
  const lowerOutput = currentOutput.toLowerCase();
  for (const indicator of wrongProjectIndicators) {
    if (lowerOutput.includes(indicator) && !lowerOutput.includes('vibetalk')) {
      return false;
    }
  }
  
  // Skip if it's just asking questions back to the user
  const questionPatterns = [
    /what.*would you like/i,
    /what.*do you prefer/i,
    /which.*would you/i,
    /do you want/i,
    /would you like me to/i,
    /let me know/i
  ];
  
  for (const pattern of questionPatterns) {
    if (pattern.test(currentOutput)) {
      return false;
    }
  }
  
  // Skip if it's just a continuation of previous output (growing text)
  if (lastMeaningfulOutput && currentOutput.startsWith(lastMeaningfulOutput.substring(0, 30))) {
    return false;
  }
  
  // Skip technical implementation details
  if (currentOutput.includes('// Server side:') || 
      currentOutput.includes('// Client side') ||
      currentOutput.includes('wsServer.clients') ||
      currentOutput.includes('socket.onmessage')) {
    return false;
  }
  
  // Look for actual meaningful updates about file changes or progress
  const meaningfulIndicators = [
    'successfully changed', 'updated', 'modified', 'created', 'added',
    'fixed', 'removed', 'implemented', 'completed', 'finished',
    'perfect!', 'done!', 'all set!'
  ];
  
  const hasMeaningfulIndicator = meaningfulIndicators.some(indicator => 
    lowerOutput.includes(indicator)
  );
  
  // Only return true if it's a complete thought with meaningful content
  return (hasMeaningfulIndicator || currentOutput.length > 150) && endsWithPunctuation;
}

// Track last speech time to avoid spam
const lastSpeechTime: Record<string, number> = {};

// Add buffer for accumulating AI outputs before speaking
const aiOutputBuffer: Record<string, { content: string; lastUpdate: number }> = {};
const AI_OUTPUT_BUFFER_TIMEOUT = 2000; // Wait 2 seconds for output to stabilize

function stopConversationPolling(sessionId: string) {
  if (conversationPollIntervals[sessionId]) {
    clearInterval(conversationPollIntervals[sessionId]);
    delete conversationPollIntervals[sessionId];
  }
  // Clean up buffer
  delete aiOutputBuffer[sessionId];
}

// Resolve-once promise helpers so smartInject can await first AI reply
const firstAICallbacks: Record<string, (msg: string)=>void> = {};
function waitForFirstAIOutput(sessionId: string, timeoutMs = 8000): Promise<string|null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      delete firstAICallbacks[sessionId];
      resolve(null);
    }, timeoutMs);
    firstAICallbacks[sessionId] = (msg)=>{
      clearTimeout(timer);
      resolve(msg);
    };
  });
}

// Helper to just get AI_output as plain string, resilient to parsing issues
async function extractLatestAIOutput(): Promise<string | null> {
  const turn = await captureConversationTurn();
  if (!turn) {
    console.log('🔍 captureConversationTurn returned null');
    return null;
  }
  if (turn.AI_output) {
    console.log('✅ AI_output found in turn:', turn.AI_output.trim());
    return turn.AI_output.trim();
  }
  console.log('🔍 No AI_output found in turn:', turn);
  return null;
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
  } else if (url.startsWith('/speech/')) {
    const fileName = path.basename(url);
    const audioPath = path.join(process.cwd(), 'temp', fileName);
    try {
      const audioContent = fs.readFileSync(audioPath);
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache'
      });
      res.end(audioContent);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Audio not found');
    }
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
    var currentSessionId = null;

    // 🔊 Enhanced audio queue with better error handling and timeouts
    var audioQueue = [];
    var isPlayingAudio = false;
    var audioTimeout = null;
    
    function enqueueAudio(url) {
      if (!url) return;
      // Keep the queue short so updates don't get stale
      if (audioQueue.length > 2) {
        console.log('Audio queue full, dropping oldest');
        audioQueue.shift();
      }
      audioQueue.push(url);
      playNextAudio();
    }
    
    function playNextAudio() {
      if (isPlayingAudio || audioQueue.length === 0) return;
      
      var url = audioQueue.shift();
      var audio = new Audio(url);
      isPlayingAudio = true;
      
      // Set a timeout to prevent stuck audio
      audioTimeout = setTimeout(function() {
        console.log('Audio playback timeout, moving to next');
        isPlayingAudio = false;
        audio.pause();
        audio.src = '';
        playNextAudio();
      }, 10000); // 10 second timeout
      
      audio.onended = function() {
        clearTimeout(audioTimeout);
        isPlayingAudio = false;
        playNextAudio();
      };
      
      audio.onerror = function(err) {
        console.error('Audio playback error:', err);
        clearTimeout(audioTimeout);
        isPlayingAudio = false;
        playNextAudio();
      };
      
      // Add canplaythrough event to ensure audio is ready
      audio.oncanplaythrough = function() {
        audio.play().catch(function(err) {
          console.error('Audio play failed:', err);
          clearTimeout(audioTimeout);
          isPlayingAudio = false;
          playNextAudio();
        });
      };
    }
    
    // Clear audio queue on new recording
    function clearAudioQueue() {
      audioQueue = [];
      if (audioTimeout) {
        clearTimeout(audioTimeout);
        audioTimeout = null;
      }
    }

    // Safe WebSocket send function
    function wsSend(data) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
        return true;
      } else {
        console.warn('WebSocket not ready, message queued:', data);
        // Try to reconnect if not already reconnecting
        if (!ws || ws.readyState === WebSocket.CLOSED) {
          connectWebSocket();
        }
        return false;
      }
    }

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

    // Restore summary div for future text messages
    var summaryDiv = document.createElement('div');
    summaryDiv.style.cssText = 'display:none;';
    container.appendChild(summaryDiv);
    document.body.appendChild(container);

    // WebSocket connection with better reconnection
    function connectWebSocket() {
      if (ws && ws.readyState === WebSocket.OPEN) {
        console.log('WebSocket already connected');
        return;
      }
      
      ws = new WebSocket('ws://' + location.hostname + ':${WS_PORT}');
      
      ws.onopen = function() {
        console.log('WebSocket connected');
        updateStatus('Ready for voice commands', '🎙️', '#10a37f');
      };
      
      ws.onmessage = function(event) {
        try {
          var message = JSON.parse(event.data);
          handleMessage(message);
        } catch (e) {
          console.error('Failed to parse message:', e);
          if (event.data.includes('refresh-now')) {
            showRefreshAnimation();
          }
        }
      };
      
      ws.onclose = function() {
        console.log('WebSocket closed, reconnecting...');
        updateStatus('Reconnecting...', '🔄', '#f59e0b');
        ws = null;
        setTimeout(connectWebSocket, 2000);
      };
      
      ws.onerror = function(error) {
        console.error('WebSocket error:', error);
        updateStatus('Connection error', '❌', '#ef4444');
      };
    }
    
    function handleMessage(message) {
      // Only process messages for the latest session
      if (message.sessionId && currentSessionId && message.sessionId !== currentSessionId) return;
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
        case 'summary':
          handleSummary(message);
          break;
        case 'status-audio':
          if (message.audioUrl) {
            enqueueAudio(message.audioUrl);
          }
          break;
        case 'assistant':
          handleAssistant(message);
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
    
    function handleSummary(message) {
      if (message.audioUrl) {
        enqueueAudio(message.audioUrl);
      } else if (window.speechSynthesis && message.summary) {
        var utter = new window.SpeechSynthesisUtterance(message.summary);
        utter.rate = 1.05;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utter);
      }
    }
    
    // Handle friendly assistant replies
    function handleAssistant(message) {
      if (message.audioUrl) {
        enqueueAudio(message.audioUrl);
      } else if (window.speechSynthesis && message.text) {
        var utter = new window.SpeechSynthesisUtterance(message.text);
        utter.rate = 1.05;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utter);
      }
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
        currentSessionId = 'session_' + Date.now();
        clearAudioQueue(); // Clear any pending audio
        if (wsSend({action:'start',sessionId:currentSessionId})) {
          mainBar.style.transform = 'scale(1.02)';
          summaryDiv.textContent = '';
        } else {
          recording = false;
          updateStatus('Connection lost - please wait', '⚠️', '#f59e0b');
        }
      } else {
        recording = false;
        wsSend({action:'stop',sessionId:currentSessionId});
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
    
    // Handle page visibility changes
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) {
        console.log('Page hidden, maintaining connection');
      } else {
        console.log('Page visible, checking connection');
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          connectWebSocket();
        }
      }
    });
    
    // Clean up before page unload
    window.addEventListener('beforeunload', function() {
      if (recording && currentSessionId) {
        // Try to send stop command before leaving
        wsSend({action:'stop',sessionId:currentSessionId});
      }
      clearAudioQueue();
      if (ws) {
        ws.close();
      }
    });
    
    // Also handle page reload specifically
    window.addEventListener('unload', function() {
      clearAudioQueue();
    });
  })();`;
}

// Create enhanced auto-refresh instance
const autoRefresh = new EnhancedAutoRefresh();

// WebSocket server
const wss = new WebSocketServer({ port: WS_PORT });

// Add heartbeat to keep connections alive
function heartbeat(this: any) {
  this.isAlive = true;
}

// Ping clients every 30 seconds
const wsHeartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws: any) => {
    if (ws.isAlive === false) {
      console.log('💔 Terminating dead WebSocket connection');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('connection', ws => {
  broadcastToClients({ type: 'log', message: '🔗 New enhanced WebSocket connection' });
  currentConnections.add(ws);
  autoRefresh.addConnection(ws);
  
  // Setup heartbeat
  (ws as any).isAlive = true;
  ws.on('pong', heartbeat);
  
  ws.on('message', async (data) => {
    let msgObj;
    try {
      msgObj = JSON.parse(data.toString());
    } catch {
      msgObj = { action: data.toString() };
    }
    const { action, sessionId } = msgObj;
    if ((action === 'start' || action === 'stop') && sessionId) {
      latestSessionId = sessionId;
      broadcastToClients({ type: 'log', message: `🎤 Enhanced voice command: ${action} (${sessionId})` });
      await handleVoiceCommand(action, sessionId);
    }
  });
  
  ws.on('close', () => {
    broadcastToClients({ type: 'log', message: '🔌 Enhanced WebSocket connection closed' });
    currentConnections.delete(ws);
    
    // Clean up any active sessions for this connection
    if (latestSessionId) {
      cleanupSession(latestSessionId);
    }
  });
  
  ws.on('error', (error) => {
    console.error('❌ Enhanced WebSocket error:', error);
    currentConnections.delete(ws);
  });
});

// Add cleanup function for sessions
function cleanupSession(sessionId: string) {
  console.log(`🧹 Cleaning up session: ${sessionId}`);
  
  // Stop conversation polling
  stopConversationPolling(sessionId);
  
  // Clear periodic summary interval
  if (sessionIntervals[sessionId]) {
    clearInterval(sessionIntervals[sessionId]);
    delete sessionIntervals[sessionId];
  }
  
  // Clear session state
  delete sessionState[sessionId];
  delete lastAIOutputs[sessionId];
  delete lastSummary[sessionId];
  delete lastSpeechTime[sessionId];
  delete sessionBaseline[sessionId];
  delete aiOutputBuffer[sessionId];
  
  // Clear any pending callbacks
  delete firstAICallbacks[sessionId];
}

// Clean up on server shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down VibeTalk server...');
  clearInterval(wsHeartbeatInterval);
  wss.clients.forEach((ws: any) => ws.close());
  wss.close();
  process.exit(0);
});

// Helper: summarize diff + transcript into friendly summary
async function generateFriendlySummary(transcript: string): Promise<string> {
  // Determine baseline for this session
  const baseline = latestSessionId ? sessionBaseline[latestSessionId] || null : null;
  
  // Always try to get the current diff first
  let diff = '';
  let filesChanged: string[] = [];
  
  try {
    // Get list of changed files
    const { stdout: statusOut } = await execAsync('git status --porcelain');
    const modifiedFiles = statusOut.split('\n')
      .filter(line => line.trim())
      .map(line => line.substring(3).trim())
      .filter(file => !file.includes('temp/') && !file.includes('.wav'));
    
    filesChanged = modifiedFiles;
    
    // Get the actual diff
    if (filesChanged.length > 0) {
      const { stdout: diffOut } = await execAsync('git diff --unified=2');
      diff = diffOut.slice(0, 4000); // Limit diff size
      console.log(`📝 Files changed: ${filesChanged.join(', ')}`);
    }
  } catch (err) {
    console.error('❌ Failed to get git diff:', err);
  }
  
  // Fallback when no API key
  if (!openaiClient) {
    if (filesChanged.length === 0) {
      return `Hmm, I didn't see any file changes. The command might still be processing.`;
    }
    return `Updated ${filesChanged.length} file(s): ${filesChanged.join(', ')}`;
  }

  // When API key is present, craft a grounded, file-aware summary
  const systemPrompt = `You are a friendly coding assistant who just completed a user's request. Create a natural, conversational summary that sounds like you're talking to a colleague. 

Rules:
1. Start with an enthusiastic confirmation (e.g., "Done!", "Perfect!", "All set!")
2. Briefly explain what you accomplished in simple terms (no technical jargon)
3. Keep it conversational and upbeat (10-25 words total)
4. If files were changed, mention the key change made
5. Focus on the user's original request and what was actually done
6. If no changes were detected, be honest but helpful

Examples:
- "Done! I updated the background to a beautiful gradient just like you asked."
- "Perfect! Changed the background color of your website - looks great!"
- "All set! Your website now has that warm sunset gradient background."`;

  const userPrompt = `User's original request: "${transcript}"

Files that were changed: ${filesChanged.join(', ') || '[no files changed yet]'}

Key changes in the diff:
${diff ? diff.substring(0, 1000) : '[no diff available]'}

Based on the files changed and the diff, what did you actually accomplish?`;

  try {
    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 100,
      temperature: 0.7
    });
    
    const aiContent = completion.choices[0]?.message?.content ?? '';
    return aiContent.trim();
  } catch (err) {
    console.error('❌ Failed to generate diff summary:', err);
    if (filesChanged.length === 0) {
      return `I processed your request but haven't seen file changes yet. They might still be saving.`;
    }
    return `Done! Updated ${filesChanged.length} file(s) for your request.`;
  }
}

// Helper: generate immediate human-like response to user's voice command
async function generateImmediateResponse(transcript: string): Promise<string> {
  if (!openaiClient) {
    // Fallback responses if no OpenAI client
    const fallbacks = [
      "Got it! Working on that for you.",
      "Sure thing! Let me handle that.",
      "On it! I'll take care of that right away.",
      "Perfect! I'll get that done for you.",
      "Absolutely! Working on it now."
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  try {
    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { 
          role: 'system', 
          content: 'You are a helpful coding assistant. The user just gave you a voice command. Respond with a brief, enthusiastic acknowledgment (8-15 words) that shows you understood and are working on it. Be conversational and upbeat, like a friendly colleague who is about to help them with their coding task. Examples: "Got it! I\'ll update the background color right away." or "Perfect! Let me add that button for you." or "Sure thing! I\'ll make those styling changes." or "Absolutely! Working with Cursor to get that done."' 
        },
        { role: 'user', content: `Voice command: "${transcript}"` }
      ],
      max_tokens: 50
    });
    
    const response = completion.choices[0]?.message?.content?.trim() || "Got it! Working on that for you.";
    return response;
  } catch (err) {
    console.error('❌ Failed to generate immediate response:', err);
    return "Got it! Working on that for you.";
  }
}

// Helper: convert raw AI output to conversational updates
async function humanizeAIOutput(aiOutput: string): Promise<string> {
  // Quick check for specific success messages that should be spoken directly
  const lowerOutput = aiOutput.toLowerCase();
  if (lowerOutput.includes('perfect!') && lowerOutput.includes('successfully changed')) {
    // Extract just the success message
    const match = aiOutput.match(/Perfect!.*?(?:background|color|gradient).*?\./i);
    if (match) return match[0];
  }
  
  if (!openaiClient) {
    // Simple fallback - extract key information
    if (aiOutput.includes('successfully')) {
      return "Great! I've successfully made those changes.";
    }
    if (aiOutput.includes('change') && aiOutput.includes('background')) {
      return "Working on changing the background color now.";
    }
    return "";
  }

  try {
    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { 
          role: 'system', 
          content: `You are a friendly coding assistant giving progress updates. Convert the AI agent's output into a brief, natural spoken update (8-20 words).
          
Rules:
1. Focus on what's actively being done or what was just completed
2. Be conversational and friendly
3. Skip technical details, focus on the outcome
4. If the AI mentions successful changes, emphasize that
5. Never mention file names or technical implementation
6. Return empty string if the output is just asking questions or providing options

Examples:
- "I'm updating the background color to that warm sunset gradient now."
- "Perfect! Just changed your website's background to those beautiful colors."
- "Working on applying those background changes you requested."` 
        },
        { role: 'user', content: `AI output: "${aiOutput}"` }
      ],
      max_tokens: 60,
      temperature: 0.7
    });
    
    const response = completion.choices[0]?.message?.content?.trim() || "";
    
    // Don't return generic responses
    if (response.toLowerCase().includes('working on it') || response.length < 5) {
      return "";
    }
    
    return response;
  } catch (err) {
    console.error('❌ Failed to humanize AI output:', err);
    return "";
  }
}

// Helper: convert text to speech using OpenAI TTS. Returns filename (within temp/) or null.
async function generateSpeechAudio(text: string): Promise<string | null> {
  if (!openaiClient) return null;
  try {
    const mp3 = await openaiClient!.audio.speech.create({
      model: 'tts-1',
      voice: 'alloy',
      input: text,
      speed: 1.11
    });
    const buffer = Buffer.from(await mp3.arrayBuffer());
    const fileName = `speech_${Date.now()}.mp3`;
    const filePath = path.join(process.cwd(), 'temp', fileName);
    await fs.promises.writeFile(filePath, buffer);
    return fileName;
  } catch (err) {
    console.error('❌ Failed to generate speech audio:', err);
    return null;
  }
}

// Robust capture: try to grab the first Cursor window (even when not focused). Fallback to full-screen if anything fails.
async function captureCursorWindowImage(): Promise<Buffer> {
  // Try Python-based capture leveraging Quartz for Cursor IDE window
  try {
    console.log('🖼️ Attempting Python-based Cursor window capture...');
    const buf: Buffer = execSync(`python3 - << 'END_PY'
import sys, os
sys.path.insert(0, os.getcwd())
from test import capture_cursor_window
buf = capture_cursor_window()
sys.stdout.buffer.write(buf)
END_PY`, { encoding: 'buffer' });
    console.log('✅ Python-based capture successful');
    return buf;
  } catch (err) {
    console.error('⚠️ Python-based capture failed, falling back to full-screen:', err);
  }

  // Fallback: full-screen capture (cross-platform)
  try {
    console.log('🖼️ Attempting full-screen capture...');
    const screenshotBuf = await screenshot({ format: 'png' });
    console.log('✅ Full-screen capture successful');
    return screenshotBuf;
  } catch (err) {
    console.error('❌ Full-screen capture failed:', err);
    throw err;
  }
}

// Modify captureConversationTurn to use new capture
async function captureConversationTurn(): Promise<{ user_input?: string; AI_output?: string } | null> {
  if (!openaiClient) return null;
  try {
    const imgBuffer = await captureCursorWindowImage();
    const base64Image = imgBuffer.toString('base64');

    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'This is a screenshot of a development IDE. Somewhere on the screen you will find ONLY the AI agent\'s latest reply text. Extract it and RETURN EXACTLY valid JSON in the form:\n{\n  "AI_output": "<ai reply text>"\n}\nIf no AI reply visible, set "AI_output" to an empty string. Do not include code fences or extra text.'
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 500
    });

    const content: string = completion.choices[0]?.message?.content?.trim() || '';
    if (!content) return null;

    // Log the raw content for debugging
    console.log('🔍 Raw Vision API response:', content);

    try {
      const parsed = JSON.parse(content);
      console.log('✅ Parsed Vision JSON:', parsed);
      return parsed;
    } catch (err) {
      console.error('❌ Failed to parse Vision JSON:', err, content);
      // fallback: return all content as AI_output
      return { AI_output: content };
    }
  } catch (err) {
    console.error('❌ captureConversationTurn failed:', err);
    return null;
  }
}

// Launch servers
httpServer.listen(HTTP_PORT, () => {
  broadcastToClients({ type: 'log', message: '🚀 Enhanced ChatGPT-Style VibeTalk Server Started' });
  broadcastToClients({ type: 'log', message: `📱 HTTP Server: http://localhost:${HTTP_PORT}` });
  broadcastToClients({ type: 'log', message: `🔌 WebSocket Server: ws://localhost:${WS_PORT}` });
  broadcastToClients({ type: 'log', message: '' });
  
  if (!config.isValid()) {
    broadcastToClients({ type: 'log', message: '⚠️  OpenAI API key not configured' });
    broadcastToClients({ type: 'log', message: '💡 Set your API key: export OPENAI_API_KEY="your-key-here"' });
  } else {
    broadcastToClients({ type: 'log', message: '✅ OpenAI API key configured' });
  }
  
  broadcastToClients({ type: 'log', message: '🎤 ChatGPT-style voice interface ready!' });
  broadcastToClients({ type: 'log', message: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' });
});

export { httpServer, wss };