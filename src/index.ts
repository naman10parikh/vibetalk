#!/usr/bin/env node

import { AudioRecorder } from './audio/recorder';
import { WhisperClient } from './whisper/client';
import { CursorAutomator } from './cursor/automator';
import { Config } from './config/config';

class VibeTalk {
  private audioRecorder: AudioRecorder;
  private whisperClient: WhisperClient;
  private cursorAutomator: CursorAutomator;
  private config: Config;
  private isRecording = false;

  constructor() {
    this.config = new Config();
    this.audioRecorder = new AudioRecorder();
    this.whisperClient = new WhisperClient(this.config.openaiApiKey);
    this.cursorAutomator = new CursorAutomator();
  }

  async initialize(): Promise<void> {
    console.log('🎙️ Initializing Vibe Talk...');
    
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

    console.log('✅ Vibe Talk initialized successfully!');
    console.log('📖 Usage: Press Cmd+Shift+V to start recording, speak, then press again to stop and transcribe.');
  }

  async startVoiceRecording(): Promise<void> {
    if (this.isRecording) {
      console.log('⏹️  Stopping recording...');
      await this.stopAndProcess();
    } else {
      console.log('🎤 Starting recording...');
      await this.startRecording();
    }
  }

  private async startRecording(): Promise<void> {
    this.isRecording = true;
    await this.audioRecorder.startRecording();
    console.log('🔴 Recording started! Press Cmd+Shift+V again to stop and transcribe.');
  }

  private async stopAndProcess(): Promise<void> {
    this.isRecording = false;
    
    console.log('⏸️  Processing audio...');
    const audioPath = await this.audioRecorder.stopRecording();
    
    if (!audioPath) {
      console.error('❌ Failed to save audio recording');
      return;
    }

    console.log('🧠 Transcribing with Whisper...');
    const transcript = await this.whisperClient.transcribe(audioPath);
    
    if (!transcript) {
      console.error('❌ Failed to transcribe audio');
      return;
    }

    console.log(`📝 Transcript: "${transcript}"`);
    
    console.log('💬 Injecting into Cursor Composer...');
    const success = await this.cursorAutomator.injectText(transcript);
    
    if (success) {
      console.log('✅ Text successfully injected into Cursor!');
    } else {
      console.error('❌ Failed to inject text into Cursor');
    }

    // Cleanup audio file
    this.audioRecorder.cleanup(audioPath);
  }

  async setupGlobalHotkey(): Promise<void> {
    // TODO: Implement global hotkey (Cmd+Shift+V)
    console.log('🔥 Global hotkey setup not implemented yet');
    console.log('🔧 For now, call startVoiceRecording() manually or use a simple menu interface');
  }
}

// Main execution
async function main() {
  const vibeTalk = new VibeTalk();
  
  try {
    await vibeTalk.initialize();
    await vibeTalk.setupGlobalHotkey();
    
    // Keep the process alive
    console.log('🚀 Vibe Talk is running! Waiting for voice commands...');
    process.stdin.resume();
    
  } catch (error) {
    console.error('❌ Failed to start Vibe Talk:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down Vibe Talk...');
  process.exit(0);
});

if (require.main === module) {
  main();
}

export { VibeTalk }; 