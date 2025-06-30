#!/usr/bin/env node
import { CursorAutomator } from './cursor/automator';

async function demo() {
  console.log('🎬 Vibe Talk Demo - Testing Cursor Integration\n');

  const cursorAutomator = new CursorAutomator();

  // Check if Cursor is running
  console.log('1️⃣ Checking if Cursor is running...');
  const isRunning = await cursorAutomator.isCursorRunning();
  
  if (!isRunning) {
    console.log('❌ Cursor is not running. Please start Cursor and try again.');
    console.log('💡 Open Cursor and create a new file or open the Composer');
    process.exit(1);
  }
  
  console.log('✅ Cursor is running!');

  // Test activation
  console.log('\n2️⃣ Activating Cursor...');
  const activated = await cursorAutomator.activateCursor();
  
  if (!activated) {
    console.log('❌ Could not activate Cursor');
    process.exit(1);
  }
  
  console.log('✅ Cursor activated!');

  // Try to open Composer
  console.log('\n3️⃣ Attempting to open Composer...');
  await cursorAutomator.openComposer();
  console.log('💬 Sent Cmd+I to open Composer');

  // Wait a moment for Composer to open
  await sleep(2000);

  // Test text injection
  console.log('\n4️⃣ Testing text injection...');
  const testMessage = "Hello! This is a test message from Vibe Talk. The voice-to-text integration is working! 🎙️✨";
  
  console.log(`📝 Injecting text: "${testMessage}"`);
  const success = await cursorAutomator.injectText(testMessage);
  
  if (success) {
    console.log('✅ Text injection successful!');
    console.log('🎉 If you see the message in Cursor Composer, Vibe Talk is working!');
  } else {
    console.log('❌ Text injection failed');
    console.log('💡 Try clicking in the Composer text area and run this demo again');
  }

  console.log('\n⭐ Demo complete! Next steps:');
  console.log('1. Set your OpenAI API key: export OPENAI_API_KEY="your-key"');
  console.log('2. Run: npm start');
  console.log('3. Use the voice recording functionality!');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

demo().catch(console.error); 