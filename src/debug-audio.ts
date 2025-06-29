#!/usr/bin/env node
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';

const execAsync = promisify(exec);

async function debugAudio() {
  console.log('🔍 Debugging Audio Recording Issues...\n');

  // Test 1: Check if sox is available
  console.log('1️⃣ Testing sox availability...');
  try {
    const { stdout } = await execAsync('sox --version');
    console.log('✅ Sox version:', stdout.trim());
  } catch (error) {
    console.log('❌ Sox not found:', error);
    return;
  }

  // Test 2: List available audio devices
  console.log('\n2️⃣ Checking macOS audio devices...');
  try {
    const { stdout } = await execAsync('system_profiler SPAudioDataType');
    console.log('📱 Audio devices found');
    // Don't print the full output as it's verbose
  } catch (error) {
    console.log('⚠️  Could not list audio devices:', error);
  }

  // Test 3: Test different sox recording methods
  console.log('\n3️⃣ Testing sox recording methods...');

  const testFile = '/tmp/vibe-test-recording.wav';
  
  // Method 1: Try default coreaudio
  console.log('\nTesting: sox -t coreaudio default');
  try {
    const command = `timeout 2 sox -t coreaudio default -r 16000 -c 1 -b 16 ${testFile}`;
    await execAsync(command);
    
    if (fs.existsSync(testFile)) {
      const stats = fs.statSync(testFile);
      console.log(`✅ Method 1 success: ${stats.size} bytes`);
      fs.unlinkSync(testFile);
    } else {
      console.log('❌ Method 1: File not created');
    }
  } catch (error) {
    console.log('❌ Method 1 failed:', error instanceof Error ? error.message : String(error));
  }

  // Method 2: Try with specific device
  console.log('\nTesting: sox -t coreaudio :0');
  try {
    const command = `timeout 2 sox -t coreaudio :0 -r 16000 -c 1 -b 16 ${testFile}`;
    await execAsync(command);
    
    if (fs.existsSync(testFile)) {
      const stats = fs.statSync(testFile);
      console.log(`✅ Method 2 success: ${stats.size} bytes`);
      fs.unlinkSync(testFile);
    } else {
      console.log('❌ Method 2: File not created');
    }
  } catch (error) {
    console.log('❌ Method 2 failed:', error instanceof Error ? error.message : String(error));
  }

  // Method 3: Try rec command
  console.log('\nTesting: rec command');
  try {
    const command = `timeout 2 rec -r 16000 -c 1 -b 16 ${testFile}`;
    await execAsync(command);
    
    if (fs.existsSync(testFile)) {
      const stats = fs.statSync(testFile);
      console.log(`✅ Method 3 success: ${stats.size} bytes`);
      fs.unlinkSync(testFile);
    } else {
      console.log('❌ Method 3: File not created');
    }
  } catch (error) {
    console.log('❌ Method 3 failed:', error instanceof Error ? error.message : String(error));
  }

  // Test 4: Check microphone permissions
  console.log('\n4️⃣ Checking microphone permissions...');
  console.log('💡 If recording fails, you may need to:');
  console.log('   1. Grant microphone access to Terminal in System Preferences');
  console.log('   2. Go to System Preferences > Security & Privacy > Privacy > Microphone');
  console.log('   3. Add Terminal (or your terminal app) to the allowed apps');
  console.log('   4. Try running this script again');

  // Test 5: Manual test suggestion
  console.log('\n5️⃣ Manual test suggestion:');
  console.log('Try running this manually in your terminal:');
  console.log('   sox -t coreaudio default test.wav trim 0 3');
  console.log('Then check if test.wav has content with: ls -la test.wav');
}

debugAudio().catch(console.error); 