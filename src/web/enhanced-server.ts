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
interface SessionState { buffer: string[]; timeout?: NodeJS.Timeout; isCompleted: boolean; }
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
        fallbackText: text,
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
  
  // ✨ DEBUG: Log assistant/summary payloads with audio info
  if (['assistant', 'summary'].includes(enhancedMessage.type)) {
    const hasAudio = enhancedMessage.audioUrl ? 'with-audio' : 'no-audio';
    console.log(`📤 Broadcast ${enhancedMessage.type} (${hasAudio}):`, enhancedMessage.text || enhancedMessage.summary || '[no text]');
  }
  
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
      const st = (sessionState[sid] ||= { buffer: [], isCompleted: false });
      const cleanMsg = stripEmoji(message.message);
      // Skip repetitive elapsed timers
      if (/^⏳ Monitoring file changes/.test(cleanMsg)) {
        return;
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
    broadcastToClients({ type: 'log', message: text });
  } catch {/* swallow */}
};

// Summarise buffered status messages into ONE friendly spoken sentence
async function flushStatusSummary(sid: string) {
  const st = sessionState[sid];
  if (!st || st.buffer.length === 0) return;
  
  // PRODUCTION FIX: Check if session is completed - don't flush if it is
  if (st.isCompleted) {
    console.log(`🔇 Skipping status flush - session ${sid} is completed`);
    return;
  }
  
  const raw = st.buffer.join(' · ');
  st.buffer.length = 0;

  let spoken = raw;
  if (openaiClient) {
    try {
      const completion = await openaiClient.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a professional developer. Convert status logs into a simple acknowledgment (2-4 words) like "Working on it" or just "Done" for completion. No technical details or excitement.' },
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
  private pendingRefreshSessions = new Set<string>(); // Track sessions waiting for refresh

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
        console.log('File change detected');
        this.lastMTime = st;
        this.building = true;
        
        // IMMEDIATE FEEDBACK: Instantly notify users and start refresh coordination
        this.connections.forEach(ws => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ 
              type: 'progress', 
              step: 'changes-detected',
              message: '📁 Changes detected - updating now',
              progress: 100
            }));
          }
        });
        
        // PARALLEL PROCESSING: Start build and refresh coordination simultaneously
        const buildPromise = this.runBuildProcess();
        const refreshPromise = this.coordinateRefresh();
        
        // Wait for both to complete
        try {
          await Promise.all([buildPromise, refreshPromise]);
          const elapsed2 = ((Date.now() - startTime) / 1000).toFixed(1);
          broadcastToClients({ type: 'log', message: `[+${elapsed2}s] ✅ Enhanced rebuild complete` });
        } catch (error) {
          console.error('❌ Parallel processing error:', error);
        }
        
        this.building = false;
      }
    } catch (error) {
      console.error('❌ Enhanced auto-refresh error:', error);
      this.building = false;
    }
  }
  
  private async runBuildProcess(): Promise<void> {
    // Run build in background - don't block refresh
    try {
      await execAsync('npm run build');
    } catch (error) {
      console.error('❌ Build process failed:', error);
    }
  }
  
  private async coordinateRefresh(): Promise<void> {
    // PRODUCTION FIX: Immediate and reliable refresh coordination
    console.log('🔄 COORDINATING REFRESH: Sending refresh-now to all clients');
    let refreshCount = 0;
    this.connections.forEach(ws => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ 
          type: 'refresh-now',
          message: 'File changes detected - refreshing now',
          timestamp: Date.now()
        }));
        refreshCount++;
      }
    });
    console.log(`📡 Sent refresh signal to ${refreshCount} connected clients`);
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
        }, 11000);
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
      // Log transcription received
      broadcastToClients({ type: 'log', message: `Transcription received: "${transcript}"` });
      console.log(`Transcription received: "${transcript}"`);
      broadcastToClients({ 
        type: 'transcription', 
        step: 'received',
        message: transcript,
        sessionId
      });

      // Start AI-output polling
      broadcastToClients({ type: 'log', message: 'AI-output polling started', sessionId });
      console.log('AI-output polling started');
      startConversationPolling(sessionId);

      await sleep(600);
      
      // Step 4: Sending to Cursor
      broadcastToClients({ 
        type: 'voice-status', 
        step: 'cursor-sending',
        message: '🎯 Sending command to Cursor AI',
        status: 'cursor-processing',
        sessionId
      });
      
      const success = await cursorAutomator.injectText(transcript, true);
      
      if (success) {
        await sleep(300);
        
        // Step 5: AI Processing
        broadcastToClients({ 
          type: 'voice-status', 
          step: 'ai-processing',
          message: '🤖 Cursor AI is analyzing and executing your request',
          status: 'ai-working',
          sessionId
        });
        
        await sleep(800);
        
        // Step 6: Waiting for changes
        broadcastToClients({ 
          type: 'voice-status', 
          step: 'waiting-changes',
          message: '⏳ Waiting for code changes to be applied',
          status: 'waiting',
          sessionId
        });

        // Begin periodic polling for AI output in Cursor
        startConversationPolling(sessionId);

        // Bring Cursor to front briefly so Vision screenshots capture its UI
        await cursorAutomator.activateCursor();

        // Wait up to 8s for first AI reply before going back to browser
        const firstAI = await waitForFirstAIOutput(sessionId, 8000);

        // After waiting, return to browser (if we were originally in browser)
        broadcastToClients({ type: 'log', message: firstAI !== null ? '📋 First AI reply captured.' : '⌛ No AI reply yet (timeout).' });
        
        // After code changes, flush any pending status and create final summary
        await flushStatusSummary(sessionId);
        // Create session-scoped diff summary and speak it
        const summaryText = await generateFriendlySummary(transcript);
        const audioFileName = await generateSpeechAudio(summaryText);
        
        // If audio generation failed, queue via fallback
        if (!audioFileName) {
          await queueStatusSpeech(summaryText, sessionId);
        }
        
        broadcastToClients({
          type: 'summary',
          summary: summaryText,
          audioUrl: audioFileName ? `/speech/${audioFileName}` : undefined,
          fallbackText: summaryText,
          sessionId
        });
        console.log(`Summary: ${summaryText}`);
        
        // Mark session as completed and stop all intervals
        if (sessionState[sessionId]) {
          sessionState[sessionId].isCompleted = true;
          if (sessionState[sessionId].timeout) {
            clearTimeout(sessionState[sessionId].timeout);
            sessionState[sessionId].timeout = undefined;
          }
        }
        
        // Clear session interval to stop further status summaries
        if (sessionIntervals[sessionId]) {
          clearInterval(sessionIntervals[sessionId]);
          delete sessionIntervals[sessionId];
        }
        
        // Stop conversation polling for this session
        stopConversationPolling(sessionId);
        
        // PRODUCTION FIX: DO NOT auto-restart - wait for user to manually start next command
        // The assistant should remain silent until user initiates the next voice command
        console.log('🔇 Session completed - assistant will remain silent until next manual start');
        isRecording = false;
        
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
  conversationPollIntervals[sessionId] = setInterval(async () => {
    const aiOut = await extractLatestAIOutput();
    if (!aiOut) return;
    if (lastAIOutputs[sessionId] === aiOut) return; // duplicate
    lastAIOutputs[sessionId] = aiOut;
    console.log(`AI-output: ${aiOut}`);
    // Log only new AI outputs
    broadcastToClients({ type: 'ai-output', message: aiOut, sessionId });
  }, 11000); // every 2 seconds
}

function stopConversationPolling(sessionId: string) {
  if (conversationPollIntervals[sessionId]) {
    clearInterval(conversationPollIntervals[sessionId]);
    delete conversationPollIntervals[sessionId];
  }
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
  if (!turn) return null;
  if (turn.AI_output) return turn.AI_output.trim();
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

    // 🔊 Enhanced audio queue with autoplay handling and fallbacks
    var audioQueue = [];
    var isPlayingAudio = false;
    var hasUserInteracted = false;
    var audioContext = null;
    var pendingRefresh = false;
    var allowAudioDelay = false;
    var audioDelayTimeout = null;
    var fallbackToSpeechSynthesis = false;
    var currentFallbackText = null;
    var preloadedAudio = new Map(); // Cache for preloaded audio
    var maxPreloadCache = 5; // Maximum number of audio files to preload

    // Initialize audio system after user interaction
    function initializeAudio() {
      if (!hasUserInteracted) {
        hasUserInteracted = true;
        logAudio('User interaction detected - audio system enabled');
        
        // Check autoplay policy using the new API if available
        if (navigator.getAutoplayPolicy) {
          try {
            var policy = navigator.getAutoplayPolicy('mediaelement');
            logAudio('Autoplay policy for media elements: ' + policy);
          } catch (e) {
            logAudio('Error checking autoplay policy: ' + e.message);
          }
        }
        
        // Try to initialize Web Audio API
        try {
          audioContext = new (window.AudioContext || window.webkitAudioContext)();
          if (audioContext.state === 'suspended') {
            audioContext.resume();
          }
        } catch (e) {
          logAudio('Web Audio API not supported');
        }
        
        // Process any queued audio
        if (audioQueue.length > 0) {
          playNextAudio();
        }
      }
    }

    // DEBUG helpers – log all audio events
    function logAudio(msg) {
      console.log('[VibeTalk-Audio]', msg);
    }

    // Audio preloading helpers
    function preloadAudio(url) {
      if (preloadedAudio.has(url)) {
        return Promise.resolve(preloadedAudio.get(url));
      }
      
      return new Promise(function(resolve, reject) {
        var audio = new Audio(url);
        audio.preload = 'auto';
        
        var loadTimeout = setTimeout(function() {
          logAudio('Preload timeout for: ' + url);
          reject(new Error('Preload timeout'));
        }, 8000);
        
        audio.oncanplaythrough = function() {
          clearTimeout(loadTimeout);
          logAudio('Preloaded: ' + url);
          
          // Manage cache size
          if (preloadedAudio.size >= maxPreloadCache) {
            var oldestKey = preloadedAudio.keys().next().value;
            preloadedAudio.delete(oldestKey);
            logAudio('Removed from cache: ' + oldestKey);
          }
          
          preloadedAudio.set(url, audio);
          resolve(audio);
        };
        
        audio.onerror = function(err) {
          clearTimeout(loadTimeout);
          logAudio('Preload failed: ' + url);
          reject(err);
        };
        
        audio.load();
      });
    }

    // Audio queue helpers ---------------------------------------------------
    function enqueueAudio(url, fallbackText) {
      if (!url) return;
      
      // Keep queue from growing indefinitely
      if (audioQueue.length > 8) {
        logAudio('Queue full – dropping oldest');
        audioQueue.shift();
      }
      
      logAudio('Enqueueing: ' + url + (fallbackText ? ' (with fallback)' : ''));
      audioQueue.push({ url: url, fallbackText: fallbackText });
      
      // Preload this audio file
      if (hasUserInteracted) {
        preloadAudio(url).catch(function(err) {
          logAudio('Preload failed for ' + url + ': ' + err.message);
        });
      }
      
      // Only start playing if user has interacted
      if (hasUserInteracted) {
        playNextAudio();
      } else {
        logAudio('Waiting for user interaction to play audio');
      }
    }

    function maybeReload() {
      if (pendingRefresh && !isPlayingAudio && audioQueue.length === 0 && !document.hidden) {
        logAudio('Queue empty – performing full reload');
        location.reload();
      }
    }

    function scheduleRefreshWithAudioDelay() {
      if (audioDelayTimeout) {
        clearTimeout(audioDelayTimeout);
      }
      
      logAudio('Scheduling delayed refresh (4s) to allow audio completion');
      audioDelayTimeout = setTimeout(() => {
        logAudio('Audio delay timeout – performing refresh');
        location.reload();
      }, 4000); // 4 second delay to allow audio to complete
    }

    function playNextAudio() {
      if (isPlayingAudio || audioQueue.length === 0) return;
      
      // Check if user has interacted first
      if (!hasUserInteracted) {
        logAudio('Cannot play audio without user interaction');
        return;
      }
      
      // If tab is hidden, wait until visible
      if (document.hidden) {
        logAudio('Tab hidden – waiting for visibilitychange');
        document.addEventListener('visibilitychange', function() {
          if (!document.hidden) {
            playNextAudio();
          }
        }, { once: true });
        return;
      }
      
              var audioItem = audioQueue.shift();
        var url = audioItem.url;
        currentFallbackText = audioItem.fallbackText;
        logAudio('Attempting to play: ' + url);
        
        // Check if audio file exists first
        checkAudioAvailability(url).then(function(isAvailable) {
          if (isAvailable) {
            tryMp3Playback(url);
          } else {
            logAudio('Audio file not available - using fallback immediately');
            tryFallbackPlayback(url, currentFallbackText);
          }
        }).catch(function(err) {
          logAudio('Error checking audio availability: ' + err.message);
          // Try MP3 playback anyway
          tryMp3Playback(url);
        });
    }

    function tryMp3Playback(url, retryCount) {
      retryCount = retryCount || 0;
      isPlayingAudio = true;
      
      // Use preloaded audio if available
      if (preloadedAudio.has(url)) {
        var audio = preloadedAudio.get(url);
        logAudio('Using preloaded audio: ' + url);
        // Remove from cache since we're using it
        preloadedAudio.delete(url);
      } else {
        var audio = new Audio(url);
        // Preload the audio
        audio.preload = 'auto';
        audio.load();
        logAudio('Loading fresh audio: ' + url);
      }

      var playbackTimeout = setTimeout(function() {
        logAudio('Playback timeout for ' + url + ' (attempt ' + (retryCount + 1) + ')');
        audio.pause();
        isPlayingAudio = false;
        
        // Retry once before falling back
        if (retryCount < 1) {
          logAudio('Retrying MP3 playback...');
          setTimeout(function() {
            tryMp3Playback(url, retryCount + 1);
          }, 1000);
        } else {
          logAudio('MP3 playback failed after retries - trying fallback');
          tryFallbackPlayback(url, currentFallbackText);
        }
      }, 8000); // 8 second timeout

      audio.oncanplaythrough = function() {
        clearTimeout(playbackTimeout);
        logAudio('Ready to play: ' + url);
        
        audio.play().then(function() {
          logAudio('Playing: ' + url);
                 }).catch(function(err) {
           clearTimeout(playbackTimeout);
           logAudio('MP3 playback failed: ' + err.message + ' - trying fallback');
           isPlayingAudio = false;
           tryFallbackPlayback(url, currentFallbackText);
         });
      };

              audio.onended = function() {
          clearTimeout(playbackTimeout);
          logAudio('Ended: ' + url);
          isPlayingAudio = false;
          
          // Brief pause between audio clips
          setTimeout(function() {
            playNextAudio();
          }, 200);
          
          // Handle refresh logic
          if (pendingRefresh && allowAudioDelay && audioQueue.length === 0) {
            logAudio('Audio completed – performing delayed refresh');
            setTimeout(function() { location.reload(); }, 500);
          } else {
            maybeReload();
          }
        };

        // Preload next audio in queue while current is playing
        if (audioQueue.length > 0) {
          var nextAudioItem = audioQueue[0];
          preloadAudio(nextAudioItem.url).catch(function(err) {
            logAudio('Failed to preload next audio: ' + err.message);
          });
        }

      audio.onerror = function(err) {
        clearTimeout(playbackTimeout);
        logAudio('MP3 error: ' + (err.message || 'Unknown error') + ' - trying fallback');
        isPlayingAudio = false;
        tryFallbackPlayback(url, currentFallbackText);
      };

      audio.onloadstart = function() {
        logAudio('Loading: ' + url);
      };
    }

    function tryFallbackPlayback(url, fallbackText) {
      // Use provided fallback text or generic fallback
      fallbackText = fallbackText || 'Audio message ready';
      
      // Try to get text from server or use Speech Synthesis as fallback
      if (window.speechSynthesis) {
        logAudio('Using Speech Synthesis fallback');
        
        // Initialize speech synthesis with best available voice
        initializeSpeechSynthesis().then(function(voice) {
          var utterance = new SpeechSynthesisUtterance(fallbackText);
          utterance.rate = 1.1;
          utterance.volume = 0.9;
          utterance.pitch = 1.0;
          
          if (voice) {
            utterance.voice = voice;
            logAudio('Using voice: ' + voice.name);
          }
          
          utterance.onstart = function() {
            logAudio('Speech synthesis started: "' + fallbackText.substring(0, 50) + '..."');
            isPlayingAudio = true;
          };
          
          utterance.onend = function() {
            logAudio('Speech synthesis ended');
            isPlayingAudio = false;
            setTimeout(function() {
              playNextAudio();
            }, 200);
            
            if (pendingRefresh && allowAudioDelay && audioQueue.length === 0) {
              logAudio('Fallback audio completed – performing delayed refresh');
              setTimeout(function() { location.reload(); }, 500);
            } else {
              maybeReload();
            }
          };
          
          utterance.onerror = function(err) {
            logAudio('Speech synthesis error: ' + err.error);
            isPlayingAudio = false;
            playNextAudio();
          };
          
          // Clear any existing utterances and speak
          window.speechSynthesis.cancel();
          // Small delay to ensure cancel is processed
          setTimeout(function() {
            window.speechSynthesis.speak(utterance);
          }, 100);
        }).catch(function(err) {
          logAudio('Speech synthesis initialization failed: ' + err.message);
          isPlayingAudio = false;
          playNextAudio();
        });
      } else {
        logAudio('No fallback audio available - skipping');
        isPlayingAudio = false;
        playNextAudio();
      }
    }

    function clearAudioQueue() {
      audioQueue.length = 0;
      if (audioDelayTimeout) {
        clearTimeout(audioDelayTimeout);
        audioDelayTimeout = null;
      }
      if (isPlayingAudio && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      isPlayingAudio = false;
    }

    // Check if audio file is available before trying to play
    function checkAudioAvailability(url) {
      return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('HEAD', url, true);
        xhr.timeout = 5000; // 5 second timeout
        
        xhr.onload = function() {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(true);
          } else {
            resolve(false);
          }
        };
        
        xhr.onerror = function() {
          resolve(false);
        };
        
        xhr.ontimeout = function() {
          resolve(false);
        };
        
        xhr.send();
      });
    }

    // Initialize speech synthesis with best available voice
    var speechSynthesisReady = false;
    var preferredVoice = null;
    
    function initializeSpeechSynthesis() {
      return new Promise(function(resolve, reject) {
        if (!window.speechSynthesis) {
          reject(new Error('Speech synthesis not supported'));
          return;
        }
        
        if (speechSynthesisReady && preferredVoice) {
          resolve(preferredVoice);
          return;
        }
        
        function loadVoices() {
          var voices = window.speechSynthesis.getVoices();
          
          if (voices.length === 0) {
            // Voices not loaded yet, wait a bit
            setTimeout(loadVoices, 100);
            return;
          }
          
          // Preference order: English voices, then any neural/premium voices
          var preferredVoiceNames = [
            'Samantha', // macOS Samantha (high quality)
            'Alex', // macOS Alex
            'Google US English', // Chrome
            'Microsoft Zira - English (United States)', // Edge
            'Karen', // macOS Karen (Australian)
            'Veena' // macOS Veena (Indian)
          ];
          
          // First try preferred voices
          for (var i = 0; i < preferredVoiceNames.length; i++) {
            var voice = voices.find(function(v) {
              return v.name === preferredVoiceNames[i];
            });
            if (voice) {
              preferredVoice = voice;
              speechSynthesisReady = true;
              logAudio('Selected preferred voice: ' + voice.name);
              resolve(voice);
              return;
            }
          }
          
          // Fallback: find any English voice
          var englishVoice = voices.find(function(v) {
            return v.lang.startsWith('en');
          });
          
          if (englishVoice) {
            preferredVoice = englishVoice;
            speechSynthesisReady = true;
            logAudio('Selected English voice: ' + englishVoice.name);
            resolve(englishVoice);
          } else {
            // Use default voice
            preferredVoice = voices[0] || null;
            speechSynthesisReady = true;
            logAudio('Using default voice: ' + (voices[0] ? voices[0].name : 'none'));
            resolve(preferredVoice);
          }
        }
        
        // Load voices immediately or wait for the event
        if (window.speechSynthesis.getVoices().length > 0) {
          loadVoices();
        } else {
          window.speechSynthesis.onvoiceschanged = loadVoices;
          // Fallback timeout
          setTimeout(function() {
            if (!speechSynthesisReady) {
              logAudio('Voice loading timeout - using default');
              speechSynthesisReady = true;
              resolve(null);
            }
          }, 2000);
        }
      });
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

    // WebSocket connection
    function connectWebSocket() {
      ws = new WebSocket('ws://' + location.hostname + ':${WS_PORT}');
      
      ws.onopen = function() {
        console.log('[VibeTalk] WebSocket connected');
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
        setTimeout(connectWebSocket, 5000);
      };
      
      ws.onerror = function(error) {
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
          pendingRefresh = true; // once summary spoken we can refresh
          handleSummary(message);
          break;
        case 'status-audio':
          if (message.audioUrl) {
            enqueueAudio(message.audioUrl, message.fallbackText);
          }
          break;
        case 'assistant':
          handleAssistant(message);
          break;
        case 'refresh-now':
          // PRODUCTION FIX: Always refresh immediately when requested
          logAudio('REFRESH TRIGGERED: File changes detected, refreshing now');
          showRefreshAnimation();
          // Force immediate refresh - no conditions, no delays
          setTimeout(() => {
            location.reload();
          }, 100); // Brief delay to show animation
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
        enqueueAudio(message.audioUrl, message.fallbackText || message.summary);
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
        enqueueAudio(message.audioUrl, message.fallbackText || message.text);
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
      updateStatus('Preparing page refresh...', '✨', '#10b981');
      actionBtn.innerHTML = '✨';
      progressBar.style.width = '100%';

      // We don't actually reload here; we set pendingRefresh and let maybeReload() handle it
      maybeReload();
    }
    
    // Click handler for the entire bar
    mainBar.onclick = function() {
      // Initialize audio system on first user interaction
      initializeAudio();
      
      if (!recording) {
        recording = true;
        currentSessionId = 'session_' + Date.now();
        ws.send(JSON.stringify({action:'start',sessionId:currentSessionId}));
        mainBar.style.transform = 'scale(1.02)';
        summaryDiv.textContent = '';
      } else {
        recording = false;
        ws.send(JSON.stringify({action:'stop',sessionId:currentSessionId}));
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
  broadcastToClients({ type: 'log', message: '🔗 New enhanced WebSocket connection' });
  currentConnections.add(ws);
  autoRefresh.addConnection(ws);
  
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
  });
  
  ws.on('error', (error) => {
    console.error('❌ Enhanced WebSocket error:', error);
    currentConnections.delete(ws);
  });
});

// Helper: summarize diff + transcript into friendly summary
async function generateFriendlySummary(transcript: string): Promise<string> {
  // Determine baseline for this session
  const baseline = latestSessionId ? sessionBaseline[latestSessionId] || null : null;
  
  // Enhanced file change detection with better error handling
  let filesChanged: string[] = [];
  let diff = '';
  
  try {
    // First, check if we're in a git repository
    await execAsync('git status');
    
    // Capture changed file list (max 20 for brevity).
    if (baseline) {
      console.log(`🔍 Checking git diff from baseline: ${baseline}`);
      const listResult = await execAsync(`git diff --name-only ${baseline}`);
      const diffResult = await execAsync(`git diff --unified=0 ${baseline}`);
      filesChanged = listResult.stdout.split('\n').filter(Boolean).slice(0, 20);
      diff = diffResult.stdout.slice(0, 6000);
    } else {
      console.log('🔍 Checking git diff for unstaged changes');
      const listResult = await execAsync('git diff --name-only');
      const diffResult = await execAsync('git diff --unified=0');
      filesChanged = listResult.stdout.split('\n').filter(Boolean).slice(0, 20);
      diff = diffResult.stdout.slice(0, 6000);
    }
    
    console.log(`📁 Files changed: ${filesChanged.length}`, filesChanged);
    console.log(`📝 Diff length: ${diff.length} characters`);
    
  } catch (err) {
    console.error('❌ Git diff failed:', err);
    // Fallback: check for modified files using git status
    try {
      const statusResult = await execAsync('git status --porcelain');
      const modifiedFiles = statusResult.stdout
        .split('\n')
        .filter(line => line.trim())
        .map(line => line.split(' ').pop())
        .filter((f): f is string => Boolean(f))
        .slice(0, 20);
      
      filesChanged = modifiedFiles;
      console.log(`📁 Modified files (fallback): ${filesChanged.length}`, filesChanged);
    } catch (statusErr) {
      console.error('❌ Git status also failed:', statusErr);
    }
  }

  // Fallback when no API key – keep it deterministic and grounded.
  if (!openaiClient) {
    if (filesChanged.length === 0) {
      return `I processed your request: "${transcript}". No file changes were detected.`;
    }
    const fileList = filesChanged.slice(0, 3).join(', ');
    const moreFiles = filesChanged.length > 3 ? ` and ${filesChanged.length - 3} more` : '';
    return `I processed your request: "${transcript}". Updated ${filesChanged.length} file${filesChanged.length > 1 ? 's' : ''}: ${fileList}${moreFiles}.`;
  }

  // When API key is present, craft a grounded, file-aware summary.
  const systemPrompt = `You are a concise, voice-friendly change summary generator. After any code or configuration update, briefly describe what the user requested and what the agent did, using plain, everyday language without jargon or filler. Keep it short so a text-to-speech system reads smoothly. If no changes were made, say \"I processed your request but no changes were made.\" Only describe the actual request and its outcome—do not invent or add extra details.`;

  const userPrompt = `User voice request: "${transcript}"\n\nChanged files detected: ${filesChanged.join(', ') || '[none]'}\n\nGit diff:\n${diff || '[no diff detected]'}`;

  try {
    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 180
    });
    const aiContent = completion.choices[0]?.message?.content ?? '';
    return aiContent.trim();
  } catch (err) {
    console.error('❌ Failed to generate diff summary:', err);
    if (filesChanged.length === 0) {
      return `I processed your request: "${transcript}". No file changes were detected.`;
    }
    const fileList = filesChanged.slice(0, 3).join(', ');
    const moreFiles = filesChanged.length > 3 ? ` and ${filesChanged.length - 3} more` : '';
    return `I processed your request: "${transcript}". Updated ${filesChanged.length} file${filesChanged.length > 1 ? 's' : ''}: ${fileList}${moreFiles}.`;
  }
}

// Helper: convert text to speech using OpenAI TTS. Returns filename (within temp/) or null.
async function generateSpeechAudio(text: string): Promise<string | null> {
  if (!openaiClient) {
    console.log('🔈 Skipping TTS (no OpenAI client) – text:', text);
    return null;
  }
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

    // ✨ DEBUG: log file size
    console.log(`🔊 Speech audio generated (${(buffer.length/1024).toFixed(1)} KB): ${fileName}`);
    return fileName;
  } catch (err) {
    console.error('❌ Failed to generate speech audio:', err, '\nText:', text);
    return null;
  }
}

// Robust capture: try to grab the first Cursor window (even when not focused). Fallback to full-screen if anything fails.
async function captureCursorWindowImage(): Promise<Buffer> {
  // Try Python-based capture leveraging Quartz for Cursor IDE window
  try {
    const buf: Buffer = execSync(`python3 - << 'END_PY'
import sys, os
sys.path.insert(0, os.getcwd())
from test import capture_cursor_window
buf = capture_cursor_window()
sys.stdout.buffer.write(buf)
END_PY`, { encoding: 'buffer' });
    return buf;
  } catch (err) {
    console.error('⚠️ Python-based capture failed, falling back to full-screen:', err);
  }

  // Fallback: full-screen capture (cross-platform)
  try {
    return await screenshot({ format: 'png' });
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

    const completion = await openaiClient.responses.create({
      model: 'gpt-4.1-mini',
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: 'This is a screenshot of a development IDE. Somewhere on the screen you will find ONLY the AI agent\'s latest reply text. Extract it and RETURN EXACTLY valid JSON in the form:\n{\n  "AI_output": "<ai reply text>"\n}\nIf no AI reply visible, set "AI_output" to an empty string. Do not include code fences or extra text.'
            },
            {
              type: 'input_image',
              image_url: `data:image/png;base64,${base64Image}`
            }
          ]
        }
      ]
    } as any);

    const content: string = (completion as any).output_text?.trim() || (completion as any).choices?.[0]?.message?.content?.trim() || '';
    if (!content) return null;

    try {
      const parsed = JSON.parse(content);
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