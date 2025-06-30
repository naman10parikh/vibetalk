#!/usr/bin/env node
import { CursorAutomator } from './cursor/automator';

async function testLocalhostFocusManagement() {
  console.log('🌐 Testing Enhanced Localhost Focus Management...\n');
  
  const cursorAutomator = new CursorAutomator();
  
  console.log('📋 SETUP INSTRUCTIONS:');
  console.log('1. Open your browser to http://localhost:3000 or any localhost page');
  console.log('2. Make sure Cursor is also open');
  console.log('3. Click on the browser window to focus it');
  console.log('4. This test will verify that you STAY on localhost after voice commands');
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
  
  console.log('\n⭐ Starting localhost focus test...\n');
  
  // Test 1: Detect current focused window
  console.log('1️⃣ Detecting current focused window...');
  const currentWindow = await cursorAutomator.getCurrentFocusedWindow();
  
  if (!currentWindow) {
    console.log('❌ Could not detect current window');
    return;
  }
  
  console.log(`✅ Current focus: ${currentWindow.app} - "${currentWindow.title}"`);
  
  // Test 2: Test enhanced localhost detection
  console.log('\n2️⃣ Testing enhanced localhost detection...');
  
  // Create test window objects with various localhost scenarios
  const testWindows = [
    { app: 'Google Chrome', title: 'localhost:3000 - Demo Project' },
    { app: 'Safari', title: 'VibeTalk Demo' },
    { app: 'Google Chrome', title: 'React App - localhost:3000' },
    { app: 'Firefox', title: 'Next.js App (localhost:3000)' },
    { app: 'Arc', title: 'Development Server - 127.0.0.1:8080' },
    { app: 'Google Chrome', title: 'My Project - development' },
    { app: 'Safari', title: 'Test Page' }, // Should NOT be detected as localhost
    { app: 'Code', title: 'main.js' }     // Should NOT be detected as localhost
  ];
  
  // Test localhost detection for each scenario
  const automator = cursorAutomator as any; // Access private method for testing
  for (const testWindow of testWindows) {
    const isLocalhost = automator.isWebInterfaceWindow(testWindow);
    const expected = testWindow.title.toLowerCase().includes('localhost') || 
                    testWindow.title.toLowerCase().includes('127.0.0.1') ||
                    testWindow.title.toLowerCase().includes('vibetalk') ||
                    testWindow.title.toLowerCase().includes('demo') ||
                    testWindow.title.toLowerCase().includes('development') ||
                    testWindow.title.toLowerCase().includes(':3000') ||
                    testWindow.title.toLowerCase().includes(':8080') ||
                    testWindow.title.toLowerCase().includes('react') ||
                    testWindow.title.toLowerCase().includes('next');
    
    const result = isLocalhost === expected ? '✅' : '❌';
    console.log(`   ${result} ${testWindow.app}: "${testWindow.title}" -> ${isLocalhost ? 'LOCALHOST' : 'NOT LOCALHOST'}`);
  }
  
  // Test 3: Check if current window is detected as localhost
  console.log('\n3️⃣ Testing current window localhost detection...');
  const isCurrentWindowLocalhost = automator.isWebInterfaceWindow(currentWindow);
  
  if (isCurrentWindowLocalhost) {
    console.log('✅ Current window DETECTED as localhost - will use enhanced focus management');
  } else {
    console.log('⚠️  Current window NOT detected as localhost - will use standard focus management');
    console.log('💡 To test localhost focus, open a page with "localhost", "demo", or a port number in the title');
  }
  
  // Test 4: Check Cursor availability
  console.log('\n4️⃣ Checking Cursor availability...');
  const cursorRunning = await cursorAutomator.isCursorRunning();
  if (!cursorRunning) {
    console.log('❌ Cursor is not running. Please start Cursor and try again.');
    return;
  }
  console.log('✅ Cursor is running');
  
  // Test 5: Test the actual focus management flow
  console.log('\n5️⃣ Testing the complete localhost focus flow...');
  const testText = `Test localhost focus: Add a button that says "Focus Test ${Date.now()}" with a click handler`;
  
  console.log(`📝 Injecting: "${testText}"`);
  console.log(`🎯 Expected behavior:`);
  
  if (isCurrentWindowLocalhost) {
    console.log('   - Brief flash to Cursor (minimal visibility)');
    console.log('   - IMMEDIATE return to this browser window');
    console.log('   - You should STAY on localhost throughout');
    console.log('   - Cursor works in background');
  } else {
    console.log('   - Standard behavior: may switch to Cursor normally');
  }
  
  console.log('⏳ Processing...');
  
  const startTime = Date.now();
  const success = await cursorAutomator.injectText(testText, true);
  const endTime = Date.now();
  
  if (success) {
    console.log(`✅ Text injection completed in ${endTime - startTime}ms`);
    
    // Wait a moment for focus to settle
    await sleep(1500);
    
    // Check final focus
    const finalWindow = await cursorAutomator.getCurrentFocusedWindow();
    
    if (finalWindow) {
      console.log(`📱 Final focus: ${finalWindow.app} - "${finalWindow.title}"`);
      
      if (finalWindow.app === currentWindow.app) {
        if (isCurrentWindowLocalhost) {
          console.log('🎉 SUCCESS: Localhost focus management working! User stayed on localhost!');
        } else {
          console.log('✅ SUCCESS: Focus correctly returned to original window');
        }
        
        // Check if still on localhost-like content
        if (finalWindow.title.toLowerCase().includes('localhost') || 
            finalWindow.title.toLowerCase().includes('demo') ||
            finalWindow.title.toLowerCase().includes('vibetalk')) {
          console.log('🌐 PERFECT: Still on localhost/demo content!');
        }
      } else {
        console.log(`❌ FOCUS ISSUE: Focus went to ${finalWindow.app}, expected ${currentWindow.app}`);
        if (isCurrentWindowLocalhost) {
          console.log('💥 This is a PROBLEM for localhost users - they were taken away from their dev environment!');
        }
      }
    } else {
      console.log('⚠️  Could not detect final focus state');
    }
  } else {
    console.log('❌ Text injection failed');
  }
  
  // Test 6: Summary and recommendations
  console.log('\n📊 TEST SUMMARY:');
  console.log(`   Original window: ${currentWindow.app} - "${currentWindow.title}"`);
  console.log(`   Localhost detected: ${isCurrentWindowLocalhost ? 'YES' : 'NO'}`);
  console.log(`   Text injection: ${success ? 'SUCCESS' : 'FAILED'}`);
  if (success) {
    const finalWindow = await cursorAutomator.getCurrentFocusedWindow();
    console.log(`   Final focus: ${finalWindow?.app || 'Unknown'}`);
    console.log(`   Focus maintained: ${finalWindow?.app === currentWindow.app ? 'YES' : 'NO'}`);
  }
  
  console.log('\n💡 NEXT STEPS:');
  console.log('1. Check Cursor Composer for the injected text');
  if (isCurrentWindowLocalhost && success) {
    console.log('2. If you stayed on this localhost page, the fix is working! 🎉');
    console.log('3. Monitor the page for auto-refresh with changes from Cursor');
  } else {
    console.log('2. If focus returned correctly, the system is working as expected');
  }
  
  console.log('\n🔧 TROUBLESHOOTING:');
  if (!isCurrentWindowLocalhost) {
    console.log('- Open a page with "localhost:3000" or similar in the URL to test localhost mode');
  }
  if (!success) {
    console.log('- Make sure Cursor is open and has accessibility permissions');
    console.log('- Try clicking in Cursor Composer first');
  }
  
  console.log('\n✨ The goal is seamless localhost development where you never leave your dev environment!');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

testLocalhostFocusManagement().catch(console.error); 