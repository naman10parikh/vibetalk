#!/usr/bin/env node
import { CursorAutomator } from './cursor/automator';

async function testBrowserFocusScenario() {
  console.log('🌐 Testing Browser → Cursor → Browser Focus Flow...\n');
  
  const cursorAutomator = new CursorAutomator();
  
  // Instructions for manual testing
  console.log('📋 MANUAL TEST INSTRUCTIONS:');
  console.log('1. Open your browser to http://localhost:3000');
  console.log('2. Make sure Cursor is also open');
  console.log('3. Click on the browser window to focus it');
  console.log('4. Then run this test');
  console.log('5. The test will inject text into Cursor and should return focus to browser');
  console.log('\nPress any key when ready to continue...');
  
  // Wait for user input
  process.stdin.setRawMode(true);
  process.stdin.resume();
  await new Promise((resolve) => {
    process.stdin.once('data', () => {
      process.stdin.setRawMode(false);
      resolve(null);
    });
  });
  
  console.log('\n🚀 Starting test...\n');
  
  // Get current focused window (should be browser)
  console.log('1️⃣ Detecting current focused window...');
  const currentWindow = await cursorAutomator.getCurrentFocusedWindow();
  
  if (!currentWindow) {
    console.log('❌ Could not detect current window');
    return;
  }
  
  console.log(`✅ Current focus: ${currentWindow.app} - "${currentWindow.title}"`);
  
  // Check if it's a browser
  const isBrowser = ['Chrome', 'Safari', 'Firefox', 'Arc', 'Edge'].some(browser => 
    currentWindow.app.includes(browser)
  );
  
  if (!isBrowser) {
    console.log('⚠️  Warning: Current window is not a browser. This test is meant for browser → Cursor → browser flow.');
    console.log('💡 Switch to your browser window and try again.');
  }
  
  // Check Cursor
  console.log('\n2️⃣ Checking Cursor availability...');
  const cursorRunning = await cursorAutomator.isCursorRunning();
  if (!cursorRunning) {
    console.log('❌ Cursor is not running. Please start Cursor and try again.');
    return;
  }
  console.log('✅ Cursor is running');
  
  // Test the full workflow
  console.log('\n3️⃣ Testing full workflow: Browser → Cursor → Browser');
  const testText = "Test from browser: Change the main heading to say 'Voice Control Works!'";
  
  console.log(`📝 Injecting: "${testText}"`);
  console.log(`🎯 Expected: Should return focus to ${currentWindow.app}`);
  console.log('⏳ Processing...');
  
  const startTime = Date.now();
  const success = await cursorAutomator.injectText(testText, true); // Auto-submit like real usage
  const endTime = Date.now();
  
  if (success) {
    console.log(`✅ Text injection completed in ${endTime - startTime}ms`);
    
    // Wait a moment for focus to settle
    await sleep(1000);
    
    // Check final focus
    const finalWindow = await cursorAutomator.getCurrentFocusedWindow();
    
    if (finalWindow) {
      console.log(`📱 Final focus: ${finalWindow.app} - "${finalWindow.title}"`);
      
      if (finalWindow.app === currentWindow.app) {
        console.log('🎉 SUCCESS: Focus correctly returned to browser!');
        
        if (isBrowser && finalWindow.title.includes('localhost')) {
          console.log('🎯 PERFECT: Browser is focused on localhost page!');
        }
      } else {
        console.log(`❌ FAILED: Focus went to ${finalWindow.app}, expected ${currentWindow.app}`);
      }
    } else {
      console.log('⚠️  Could not detect final focus state');
    }
  } else {
    console.log('❌ Text injection failed');
  }
  
  console.log('\n📊 Test Summary:');
  console.log(`   Original focus: ${currentWindow.app}`);
  console.log(`   Text injection: ${success ? 'SUCCESS' : 'FAILED'}`);
  if (success) {
    const finalWindow = await cursorAutomator.getCurrentFocusedWindow();
    console.log(`   Final focus: ${finalWindow?.app || 'Unknown'}`);
    console.log(`   Focus returned: ${finalWindow?.app === currentWindow.app ? 'YES' : 'NO'}`);
  }
  
  console.log('\n💡 Next steps:');
  console.log('1. Check Cursor Composer for the injected text');
  console.log('2. If focus returned to browser, the fix is working!');
  console.log('3. If not, there may still be browser-specific issues to address');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

testBrowserFocusScenario().catch(console.error); 