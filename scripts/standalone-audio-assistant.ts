#!/usr/bin/env node

import { execSync } from 'child_process';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { Config } from '../src/config/config';

// Initialize OpenAI client
const config = new Config();
const openaiClient = config.isValid() ? new OpenAI({ apiKey: config.openaiApiKey }) : null;

if (!openaiClient) {
  console.error('❌ OpenAI API key not configured');
  console.error('💡 Set your API key: export OPENAI_API_KEY="your-key-here"');
  process.exit(1);
}

// Create temp directory for audio files
const tempDir = path.join(process.cwd(), 'temp');
fs.mkdirSync(tempDir, { recursive: true });

interface ConversationData {
  user_input: string;
  AI_output: string;
}

/**
 * Capture Cursor IDE window using Python's capture_cursor_window function
 */
async function captureCursorWindow(): Promise<Buffer> {
  try {
    // Invoke Python inline to use test.capture_cursor_window()
    return execSync(`python3 - << 'END_PY'
import test, sys
buf = test.capture_cursor_window()
sys.stdout.buffer.write(buf)
END_PY`, { encoding: 'buffer' });
  } catch (err) {
    console.error('❌ Failed capturing via Python:', err);
    throw err;
  }
}

/**
 * Extract conversation data from screenshot using OpenAI Vision API
 */
async function extractConversationData(imageBuffer: Buffer): Promise<ConversationData> {
  const base64Image = imageBuffer.toString('base64');
  
  try {
    const response = await openaiClient!.responses.create({
      model: 'gpt-4.1-mini',
      text: { format: { type: 'json_object' } },
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: 'This is a screenshot of Cursor IDE with an AI conversation pane. Locate the AI conversation area and extract EXACTLY two fields in strict JSON format:\n{ "user_input": "<most recent user question or input>", "AI_output": "<most recent AI response>" }\nIf no conversation is visible or the pane is not open, return both fields as empty strings. Only return the JSON object, no additional text or formatting.'
            },
            {
              type: 'input_image',
              image_url: `data:image/png;base64,${base64Image}`,
              detail: 'high'
            },
          ],
        },
      ],
    });

    const content = response.output_text || '';
    console.log('📝 Raw model response:');
    console.log(content);
    
    try {
      const parsed = JSON.parse(content);
      console.log('✅ Parsed JSON:', parsed);
      return parsed;
    } catch (parseError) {
      console.error('❌ Failed to parse JSON:', parseError);
      // Try to extract JSON from the text
      const jsonMatch = content.match(/\{.*\}/s);
      if (jsonMatch) {
        try {
          const extracted = JSON.parse(jsonMatch[0]);
          console.log('✅ Extracted JSON:', extracted);
          return extracted;
        } catch {
          // Fall through to default
        }
      }
      
      console.log('⚠️ Using default empty response');
      return { user_input: '', AI_output: '' };
    }
  } catch (error) {
    console.error('❌ Error calling OpenAI API:', error);
    return { user_input: '', AI_output: '' };
  }
}

/**
 * Generate a human-friendly summary of the AI's work
 */
async function generateFriendlySummary(aiOutput: string): Promise<string> {
  if (!aiOutput || aiOutput.trim().length === 0) {
    return '';
  }

  try {
    const completion = await openaiClient!.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a friendly developer assistant giving updates to your colleague. Convert the AI output into a casual, conversational summary (15-25 words) that sounds like you\'re telling a colleague what you just accomplished. Focus on the actual work done, not technical details. Be upbeat and natural. Examples: "Just finished updating the background colors - it looks much better now!" or "Added that new button you wanted, it\'s working perfectly!" or "Made those styling changes, the page looks great now!"'
        },
        {
          role: 'user',
          content: `AI output: "${aiOutput}"`
        }
      ],
      max_tokens: 80
    });

    const summary = completion.choices[0]?.message?.content?.trim() || '';
    return summary;
  } catch (error) {
    console.error('❌ Failed to generate summary:', error);
    return '';
  }
}

/**
 * Convert text to speech using OpenAI TTS
 */
async function generateSpeechAudio(text: string): Promise<string | null> {
  if (!text || text.trim().length === 0) {
    return null;
  }

  try {
    const mp3 = await openaiClient!.audio.speech.create({
      model: 'tts-1',
      voice: 'alloy',
      input: text,
      speed: 1.1
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    const fileName = `speech_${Date.now()}.mp3`;
    const filePath = path.join(tempDir, fileName);
    await fs.promises.writeFile(filePath, buffer);
    
    return filePath;
  } catch (error) {
    console.error('❌ Failed to generate speech audio:', error);
    return null;
  }
}

/**
 * Play audio file using system audio player
 */
async function playAudio(filePath: string): Promise<void> {
  try {
    // Use macOS 'afplay' command to play the audio
    execSync(`afplay "${filePath}"`, { stdio: 'ignore' });
  } catch (error) {
    console.error('❌ Failed to play audio:', error);
  }
}

/**
 * Main monitoring loop - runs independently of any web server
 */
async function monitorCursorAI(): Promise<void> {
  console.log('🎤 Starting Standalone Audio Assistant...');
  console.log('🔍 Monitoring Cursor IDE AI conversations...');
  console.log('📢 Will speak summaries of AI responses...');
  console.log('🛑 Press Ctrl+C to stop');
  console.log('');

  let lastConversation: ConversationData = { user_input: '', AI_output: '' };
  let lastSpokenOutput = '';

  while (true) {
    try {
      // Capture screenshot
      console.log('📸 Capturing Cursor IDE window...');
      const imageBuffer = await captureCursorWindow();
      
      // Extract conversation data
      const conversationData = await extractConversationData(imageBuffer);
      
      // Check if AI output has changed and is meaningful
      if (conversationData.AI_output && 
          conversationData.AI_output !== lastConversation.AI_output &&
          conversationData.AI_output !== lastSpokenOutput &&
          conversationData.AI_output.trim().length > 10) {
        
        console.log('\n' + '='.repeat(60));
        console.log(`📋 NEW AI RESPONSE - ${new Date().toLocaleTimeString()}`);
        console.log('='.repeat(60));
        console.log('🔍 Extracted AI output:', conversationData.AI_output);
        
        // Generate friendly summary
        const friendlySummary = await generateFriendlySummary(conversationData.AI_output);
        
        if (friendlySummary) {
          console.log('🎙️ Audio Assistant will say:', friendlySummary);
          
          // Generate and play speech
          const audioFile = await generateSpeechAudio(friendlySummary);
          if (audioFile) {
            console.log('🔊 Playing audio summary...');
            await playAudio(audioFile);
            
            // Clean up audio file after playing
            try {
              fs.unlinkSync(audioFile);
            } catch {
              // Ignore cleanup errors
            }
          }
          
          lastSpokenOutput = conversationData.AI_output;
        }
        
        console.log('='.repeat(60) + '\n');
      }
      
      lastConversation = conversationData;
      
      // Wait before next capture
      await new Promise(resolve => setTimeout(resolve, 4000)); // Check every 4 seconds
      
    } catch (error) {
      console.error('❌ Error in monitoring loop:', error);
      console.log('⏳ Retrying in 5 seconds...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Stopping Audio Assistant...');
  process.exit(0);
});

// Start monitoring
monitorCursorAI().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
}); 