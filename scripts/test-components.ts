#!/usr/bin/env node
import { AudioRecorder } from '../src/audio/recorder';
import { WhisperClient } from '../src/whisper/client';
import { CursorAutomator } from '../src/cursor/automator';
import { Config } from '../src/config/config';

async function testComponents() {
  console.log('🧪 Testing Vibe Talk Components...\n');

  // Test 1: Configuration
  console.log('1️⃣ Testing Configuration...');
  const config = new Config();
  console.log(`   API Key configured: ${config.isValid() ? '✅' : '❌'}`);
  console.log(`   Temp directory: ${config.tempDir}`);
  console.log(`   Hotkey: ${config.hotkey}`);
  console.log();

  // Test 2: Cursor Automation
  console.log('2️⃣ Testing Cursor Automation...');
  const cursorAutomator = new CursorAutomator();
  const cursorTest = await cursorAutomator.testAutomation();
  console.log(`   Cursor automation: ${cursorTest ? '✅' : '❌'}`);
  console.log();

  // Test 3: Audio Recording
  console.log('3️⃣ Testing Audio Recording...');
  const audioRecorder = new AudioRecorder();
  const audioTest = await audioRecorder.testRecording();
  console.log(`   Audio recording: ${audioTest ? '✅' : '❌'}`);
  console.log();

  // Test 4: Whisper Client (only if API key is available)
  if (config.isValid()) {
    console.log('4️⃣ Testing Whisper Client...');
    const whisperClient = new WhisperClient(config.openaiApiKey);
    const whisperTest = await whisperClient.testConnection();
    console.log(`   Whisper client: ${whisperTest ? '✅' : '❌'}`);
  } else {
    console.log('4️⃣ Skipping Whisper Client (no API key)');
  }
  console.log();

  // Summary
  console.log('📋 Test Summary:');
  console.log(`   Configuration: ${config.isValid() ? '✅' : '❌'}`);
  console.log(`   Cursor Automation: ${cursorTest ? '✅' : '❌'}`);
  console.log(`   Audio Recording: ${audioTest ? '✅' : '❌'}`);
  console.log(`   API Key: ${config.isValid() ? '✅' : '❌'}`);
  console.log();

  if (config.isValid() && cursorTest && audioTest) {
    console.log('🎉 All tests passed! Vibe Talk is ready to use.');
  } else {
    console.log('⚠️  Some tests failed. Please check the issues above.');
    
    if (!config.isValid()) {
      console.log('💡 Set your OpenAI API key: export OPENAI_API_KEY="your-key-here"');
    }
    if (!audioTest) {
      console.log('💡 Install audio tools: brew install sox');
    }
    if (!cursorTest) {
      console.log('💡 Make sure Cursor is running and accessibility permissions are granted.');
    }
  }
}

// Run tests
testComponents().catch(console.error); 