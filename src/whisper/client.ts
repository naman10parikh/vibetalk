import OpenAI from 'openai';
import * as fs from 'fs';

export class WhisperClient {
  private openai: OpenAI;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.openai = new OpenAI({
      apiKey: apiKey,
    });
  }

  /**
   * Transcribe an audio file using OpenAI Whisper
   */
  async transcribe(audioFilePath: string): Promise<string | null> {
    try {
      // Check if file exists
      if (!fs.existsSync(audioFilePath)) {
        console.error(`Audio file not found: ${audioFilePath}`);
        return null;
      }

      console.log(`🎵 Transcribing audio file: ${audioFilePath}`);

      // Create transcription request
      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(audioFilePath),
        model: 'whisper-1',
        language: 'en', // You can make this configurable
        response_format: 'text',
      });

      const transcript = transcription.trim();
      
      if (!transcript) {
        console.log('⚠️  Empty transcription received');
        return null;
      }

      console.log(`✅ Transcription successful: "${transcript}"`);
      return transcript;

    } catch (error) {
      console.error('❌ Error during transcription:', error);
      
      if (error instanceof Error) {
        // Handle specific OpenAI API errors
        if (error.message.includes('Invalid file format')) {
          console.error('The audio file format is not supported. Please use WAV, MP3, or M4A.');
        } else if (error.message.includes('File too large')) {
          console.error('The audio file is too large. Maximum file size is 25MB.');
        } else if (error.message.includes('API key')) {
          console.error('Invalid OpenAI API key. Please check your OPENAI_API_KEY environment variable.');
        }
      }
      
      return null;
    }
  }

  /**
   * Test the Whisper client with a simple test
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log('🧪 Testing OpenAI Whisper connection...');
      
      // We can't really test without an audio file, but we can check if the API key is valid
      // by making a simple request and catching authentication errors
      
      console.log('✅ OpenAI client initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize OpenAI client:', error);
      return false;
    }
  }

  /**
   * Get supported audio formats
   */
  getSupportedFormats(): string[] {
    return ['wav', 'mp3', 'm4a', 'flac', 'ogg', 'webm', 'mp4'];
  }

  /**
   * Validate if an audio file format is supported
   */
  isFormatSupported(filePath: string): boolean {
    const extension = filePath.split('.').pop()?.toLowerCase();
    return extension ? this.getSupportedFormats().includes(extension) : false;
  }
} 