/// <reference path="../src/types/screenshot-desktop.d.ts" />
import { execSync } from 'child_process';
import OpenAI from 'openai';
import fs from 'fs';

/**
 * Capture the Cursor IDE main window even if it is in the background.
 * Works on macOS using `osascript` + `screencapture -l <windowId>`.
 * Falls back to full-screen capture on other platforms or errors.
 */
// Use Python test.py's capture logic to grab the Cursor IDE window via Quartz
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
    process.exit(1);
  }
}

(async () => {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Please set OPENAI_API_KEY environment variable');
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  console.log('📸 Capturing Cursor IDE window via Python...');
  const imgBuffer = await captureCursorWindow();
  const tmpFile = `./temp/vision_test_${Date.now()}.png`;
  fs.mkdirSync('./temp', { recursive: true });
  fs.writeFileSync(tmpFile, imgBuffer);
  console.log(`✅ Screenshot saved to ${tmpFile}`);

  const base64Image = imgBuffer.toString('base64');
  console.log('🤖 Sending to OpenAI Vision...');

  const resp: any = await openai.responses.create({
    model: 'gpt-4.1',
    text: {
      format: { type: 'json_object' }
    },
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: 'This is a screenshot of a development IDE. Somewhere on the screen you will find ONLY the AI agent\'s latest reply text. Extract it and RETURN EXACTLY valid JSON in the form:\n{\n  "AI_output": "<ai reply text>"\n}\nIf no AI reply visible, set "AI_output" to an empty string. Do not include code fences or extra text.'
          },
          {
            type: 'input_image',
            image_url: `data:image/png;base64,${base64Image}`
          }
        ]
      }
    ]
  } as any);

  // The Responses API should now always give us resp.output_text thanks to response_format
  const content: string =
    resp.output_text?.toString().trim() ||
    (resp.output && resp.output[0]?.content?.[0]?.text?.trim()) ||
    JSON.stringify(resp, null, 2);
  console.log('\n📝 Raw model response:\n', content);

  try {
    const parsed = JSON.parse(content);
    console.log('\n✅ Parsed JSON:', parsed);
  } catch {
    console.log('\n⚠️ Could not parse JSON; content returned as above.');
  }
})(); 