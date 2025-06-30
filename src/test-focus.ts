#!/usr/bin/env node
import { CursorAutomator } from './cursor/automator';

async function testFocusManagement() {
  console.log('🧪 Testing Focus Management...\n');
  
  const cursorAutomator = new CursorAutomator();
  
  // Test 1: Get current focused window
  console.log('1️⃣ Getting current focused window...');
  const currentWindow = await cursorAutomator.getCurrentFocusedWindow();
  if (currentWindow) {
    console.log(`✅ Current focus: ${currentWindow.app} - "${currentWindow.title}"`);
  } else {
    console.log('❌ Could not detect current window');
    return;
  }
  
  // Test 2: Check if Cursor is running
  console.log('\n2️⃣ Checking Cursor availability...');
  const cursorRunning = await cursorAutomator.isCursorRunning();
  if (!cursorRunning) {
    console.log('❌ Cursor is not running. Please start Cursor and try again.');
    return;
  }
  console.log('✅ Cursor is running');
  
  // Test 3: Test text injection with focus return
  console.log('\n3️⃣ Testing text injection with focus return...');
  const testText = "This is a focus management test - checking if we return to the original window";
  
  console.log(`📝 Injecting: "${testText}"`);
  console.log(`🎯 Should return focus to: ${currentWindow.app}`);
  
  const success = await cursorAutomator.injectText(testText, false); // Don't auto-submit for testing
  
  if (success) {
    console.log('✅ Text injection completed');
    
    // Check if focus was returned
    await sleep(1000);
    const newWindow = await cursorAutomator.getCurrentFocusedWindow();
    
    if (newWindow && newWindow.app === currentWindow.app) {
      console.log(`✅ SUCCESS: Focus correctly returned to ${newWindow.app}`);
    } else if (newWindow) {
      console.log(`⚠️  Focus went to: ${newWindow.app} (expected: ${currentWindow.app})`);
    } else {
      console.log('⚠️  Could not detect new focus');
    }
  } else {
    console.log('❌ Text injection failed');
  }
  
  console.log('\n🏁 Focus management test complete!');
  console.log('💡 Check Cursor to see if the test text appeared');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

testFocusManagement().catch(console.error); 