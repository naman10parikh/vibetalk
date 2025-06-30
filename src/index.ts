#!/usr/bin/env node

import { AudioRecorder } from './audio/recorder';
import { WhisperClient } from './whisper/client';
import { CursorAutomator } from './cursor/automator';
import { Config } from './config/config';
import * as readline from 'readline';

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
      console.log('\n⏹️  STOPPING RECORDING...');
      await this.stopAndProcess();
    } else {
      console.log('\n🎤 STARTING RECORDING...');
      await this.startRecording();
    }
  }

  private async startRecording(): Promise<void> {
    this.isRecording = true;
    await this.audioRecorder.startRecording();
    console.log('🔴 RECORDING NOW! Speak clearly into your microphone...');
    console.log('🔄 Press Cmd+Shift+V again when you\'re done speaking');
  }

  private async stopAndProcess(): Promise<void> {
    this.isRecording = false;
    
    console.log('⏸️  PROCESSING AUDIO...');
    const audioPath = await this.audioRecorder.stopRecording();
    
    if (!audioPath) {
      console.error('❌ Failed to save audio recording');
      console.log('💡 Make sure you have microphone permissions enabled');
      return;
    }

    console.log('🧠 TRANSCRIBING WITH WHISPER...');
    console.log('⏳ Please wait, this may take a few seconds...');
    const transcript = await this.whisperClient.transcribe(audioPath);
    
    if (!transcript) {
      console.error('❌ Failed to transcribe audio - check your API key and internet connection');
      return;
    }

    console.log(`\n📝 TRANSCRIPT: "${transcript}"`);
    console.log('💬 INJECTING INTO CURSOR AND SUBMITTING...');
    
    // First ensure Cursor is open and activate Composer
    await this.cursorAutomator.openComposer();
    
    // Inject text and auto-submit
    const success = await this.cursorAutomator.injectText(transcript, true);
    
    if (success) {
      console.log('✅ SUCCESS! Text injected and submitted to Cursor Composer!');
      console.log('🎉 Ready for your next voice command!\n');
    } else {
      console.error('❌ Failed to inject text into Cursor');
      console.log('💡 Make sure Cursor is open and you have accessibility permissions enabled\n');
    }

    // Cleanup audio file
    this.audioRecorder.cleanup(audioPath);
  }

  async setupTerminalInterface(): Promise<void> {
    console.log('⌨️  Setting up terminal interface...');
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log('✅ Terminal interface ready!');
    console.log('🎙️  Press ENTER to start recording, speak, then press ENTER again to stop and transcribe.');
    
    rl.on('line', () => {
      this.startVoiceRecording().catch(console.error);
    });

    // Keep stdin open
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', (key) => {
      // Press 'q' or Ctrl+C to quit
      if (key.toString() === 'q' || key.toString() === '\u0003') {
        console.log('\n👋 Shutting down Vibe Talk...');
        process.exit(0);
      }
      // Press Enter or Space to toggle recording
      if (key.toString() === '\r' || key.toString() === '\n' || key.toString() === ' ') {
        this.startVoiceRecording().catch(console.error);
      }
    });
  }
}

// Main execution
async function main() {
  const vibeTalk = new VibeTalk();
  
  try {
    await vibeTalk.initialize();
    await vibeTalk.setupTerminalInterface();
    
    // Keep the process alive and provide ongoing feedback
    console.log('\n🚀 Vibe Talk is now running!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎙️  HOW TO USE:');
    console.log('   1. Press ENTER (or SPACE) to START recording');
    console.log('   2. Speak your prompt clearly');
    console.log('   3. Press ENTER (or SPACE) again to STOP and transcribe');
    console.log('   4. Watch the text appear in Cursor Composer automatically!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💡 Make sure Cursor is open and ready to receive your voice commands!');
    console.log('🛑 Press "q" or Ctrl+C to quit Vibe Talk\n');
    
    // Keep the process alive
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