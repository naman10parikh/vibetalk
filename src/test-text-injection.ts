#!/usr/bin/env node
import { CursorAutomator } from './cursor/automator';

async function testTextInjection() {
  console.log('📝 Testing Text Injection for AAA Prefix Issue...\n');
  
  const cursorAutomator = new CursorAutomator();
  
  // Check Cursor
  console.log('1️⃣ Checking Cursor availability...');
  const cursorRunning = await cursorAutomator.isCursorRunning();
  if (!cursorRunning) {
    console.log('❌ Cursor is not running. Please start Cursor and try again.');
    return;
  }
  console.log('✅ Cursor is running');
  
  // Test different types of text that might cause issues
  const testCases = [
    {
      name: "Simple text",
      text: "Change the background color to blue"
    },
    {
      name: "Text with quotes", 
      text: 'Add a button that says "Hello World" when clicked'
    },
    {
      name: "Text with special characters",
      text: "Create a form with email & password fields (required!)"
    },
    {
      name: "Text with emojis (should be cleaned)",
      text: "Add a success message with 🎉 emoji and ✅ checkmark"
    },
    {
      name: "Complex transcription-like text",
      text: "Yeah so can you like um change the mic icon from what it is to something better"
    }
  ];
  
  console.log('\n2️⃣ Testing various text injection scenarios...\n');
  
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    console.log(`Test ${i + 1}: ${testCase.name}`);
    console.log(`Input: "${testCase.text}"`);
    
    // Test the prefix addition
    const automator = new (CursorAutomator as any)();
    const prefixedText = automator.addVoiceCommandPrefix(testCase.text);
    
    console.log(`Prefixed: "${prefixedText}"`);
    
    // Test text sanitization
    const sanitizedText = automator.sanitizeTextForAppleScript(prefixedText);
    console.log(`Sanitized: "${sanitizedText}"`);
    
    // Check for issues
    if (sanitizedText.startsWith('AAA') || sanitizedText.includes('AAA')) {
      console.log('❌ FOUND AAA PREFIX ISSUE!');
    } else {
      console.log('✅ No AAA prefix detected');
    }
    
    if (sanitizedText.length > 0 && sanitizedText.trim().length > 0) {
      console.log('✅ Text is not empty after sanitization');
    } else {
      console.log('❌ Text became empty after sanitization');
    }
    
    console.log('');
  }
  
  // Real injection test
  console.log('3️⃣ Performing real injection test...');
  console.log('⚠️  This will actually inject text into Cursor Composer!');
  
  const realTestText = "Test injection - verify no AAA prefix appears";
  console.log(`Injecting: "${realTestText}"`);
  
  const success = await cursorAutomator.injectText(realTestText, false); // Don't auto-submit
  
  if (success) {
    console.log('✅ Real injection test successful');
    console.log('💡 Check Cursor Composer - the text should start with "Voice Command:" and NOT have "AAA" at the beginning');
  } else {
    console.log('❌ Real injection test failed');
  }
  
  console.log('\n📋 Summary:');
  console.log('- If you see "AAA" at the start of any text in Cursor, the issue persists');
  console.log('- If the text starts with "Voice Command:", the fix is working');
  console.log('- Check Cursor Composer now to verify the actual injected text');
}

testTextInjection().catch(console.error); 