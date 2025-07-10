#!/usr/bin/env node

import { WebSocketServer } from 'ws';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { Config } from '../config/config';
import OpenAI from 'openai';

// Initialize components
const config = new Config();
const openaiClient = config.isValid() ? new OpenAI({ apiKey: config.openaiApiKey }) : null;
fs.mkdirSync(path.join(process.cwd(), 'temp'), { recursive: true });

// Audio server configuration
const AUDIO_PORT = process.env.AUDIO_PORT ? parseInt(process.env.AUDIO_PORT) : 3002;

// Audio session management
interface AudioSession {
  id: string;
  queue: string[];
  isPlaying: boolean;
  currentAudio: string | null;
  createdAt: number;
}

class AudioWebSocketServer {
  private wss: WebSocketServer | null = null;
  private sessions = new Map<string, AudioSession>();
  private connections = new Set<any>();

  constructor() {
    // Don't start WebSocket server automatically
  }

  public start(): void {
    if (!this.wss) {
      this.wss = new WebSocketServer({ port: AUDIO_PORT });
      this.setupWebSocket();
      console.log(`🔊 Audio WebSocket server started on port ${AUDIO_PORT}`);
    }
  }

  private setupWebSocket() {
    if (!this.wss) return;
    
    this.wss.on('connection', (ws) => {
      console.log('🔊 New audio connection established');
      this.connections.add(ws);

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          await this.handleMessage(ws, message);
        } catch (error) {
          console.error('❌ Audio server message error:', error);
        }
      });

      ws.on('close', () => {
        console.log('🔌 Audio connection closed');
        this.connections.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('❌ Audio WebSocket error:', error);
        this.connections.delete(ws);
      });
    });
  }

  private async handleMessage(ws: any, message: any) {
    const { type, sessionId, text, audioUrl } = message;

    switch (type) {
      case 'speak':
        await this.handleSpeak(sessionId, text, audioUrl);
        break;
      case 'clear-queue':
        this.clearQueue(sessionId);
        break;
      case 'get-status':
        this.sendStatus(ws, sessionId);
        break;
      default:
        console.log('🔊 Unknown audio message type:', type);
    }
  }

  public async handleSpeak(sessionId: string, text?: string, audioUrl?: string) {
    // Get or create session
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        id: sessionId,
        queue: [],
        isPlaying: false,
        currentAudio: null,
        createdAt: Date.now()
      };
      this.sessions.set(sessionId, session);
    }

    // Add to queue
    if (audioUrl) {
      session.queue.push(audioUrl);
    } else if (text) {
      // Generate audio from text
      const fileName = await this.generateSpeechAudio(text);
      if (fileName) {
        session.queue.push(`/speech/${fileName}`);
      }
    }

    // Start playing if not already playing
    if (!session.isPlaying) {
      this.playNextAudio(sessionId);
    }

    // Broadcast status to all connections
    this.broadcastStatus(sessionId);
  }

  private async generateSpeechAudio(text: string): Promise<string | null> {
    if (!openaiClient) {
      console.log('🔈 Skipping TTS (no OpenAI client) – text:', text);
      return null;
    }
    try {
      const mp3 = await openaiClient.audio.speech.create({
        model: 'tts-1',
        voice: 'alloy',
        input: text,
        speed: 1.11
      });
      const buffer = Buffer.from(await mp3.arrayBuffer());
      const fileName = `speech_${Date.now()}.mp3`;
      const filePath = path.join(process.cwd(), 'temp', fileName);
      await fs.promises.writeFile(filePath, buffer);

      console.log(`🔊 Speech audio generated (${(buffer.length/1024).toFixed(1)} KB): ${fileName}`);
      return fileName;
    } catch (err) {
      console.error('❌ Failed to generate speech audio:', err, '\nText:', text);
      return null;
    }
  }

  private playNextAudio(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session || session.queue.length === 0) {
      if (session) {
        session.isPlaying = false;
        session.currentAudio = null;
      }
      this.broadcastStatus(sessionId);
      return;
    }

    const audioUrl = session.queue.shift()!;
    session.isPlaying = true;
    session.currentAudio = audioUrl;

    // Send play command to client
    this.broadcastToClients({
      type: 'play-audio',
      sessionId,
      audioUrl,
      queueLength: session.queue.length
    });

    this.broadcastStatus(sessionId);
  }

  private clearQueue(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.queue = [];
      session.isPlaying = false;
      session.currentAudio = null;
      this.broadcastStatus(sessionId);
    }
  }

  private sendStatus(ws: any, sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (session) {
      ws.send(JSON.stringify({
        type: 'audio-status',
        sessionId,
        isPlaying: session.isPlaying,
        currentAudio: session.currentAudio,
        queueLength: session.queue.length
      }));
    }
  }

  private broadcastStatus(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.broadcastToClients({
        type: 'audio-status',
        sessionId,
        isPlaying: session.isPlaying,
        currentAudio: session.currentAudio,
        queueLength: session.queue.length
      });
    }
  }

  private broadcastToClients(message: any) {
    if (!this.wss) return;
    
    const messageStr = JSON.stringify(message);
    this.connections.forEach(ws => {
      if (ws.readyState === ws.OPEN) {
        ws.send(messageStr);
      }
    });
  }

  // Public method to handle audio completion
  public onAudioComplete(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isPlaying = false;
      session.currentAudio = null;
      this.broadcastStatus(sessionId);
      
      // Play next audio in queue
      setTimeout(() => {
        this.playNextAudio(sessionId);
      }, 100);
    }
  }

  // Public method to check if audio is playing
  public isAudioPlaying(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session ? session.isPlaying : false;
  }

  // Public method to get queue length
  public getQueueLength(sessionId: string): number {
    const session = this.sessions.get(sessionId);
    return session ? session.queue.length : 0;
  }

  // Public method to cleanup old sessions
  public cleanupOldSessions() {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session && now - session.createdAt > maxAge) {
        this.sessions.delete(sessionId);
        console.log(`🧹 Cleaned up old audio session: ${sessionId}`);
      }
    }
  }
}

// Create and export the audio server instance
export const audioServer = new AudioWebSocketServer();

// Only start servers if this file is run directly
if (require.main === module) {
  // Start the WebSocket server
  audioServer.start();
  
  // HTTP server for serving audio files and handling speak requests
  const httpServer = http.createServer(async (req, res) => {
    const url = req.url || '/';

    if (url === '/speak' && req.method === 'POST') {
      // Handle speak requests from coordinator
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        try {
          const { sessionId, text } = JSON.parse(body);
          if (sessionId && text) {
            await audioServer.handleSpeak(sessionId, text);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing sessionId or text' }));
          }
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
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

  httpServer.listen(AUDIO_PORT + 1, () => {
    console.log(`🌐 Audio HTTP server started on port ${AUDIO_PORT + 1}`);
  });

  // Cleanup old sessions periodically
  setInterval(() => {
    audioServer.cleanupOldSessions();
  }, 5 * 60 * 1000); // Check every 5 minutes
} 