import { config } from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables
config();

export class Config {
  public readonly openaiApiKey: string;
  public readonly hotkey: string;
  public readonly audioFormat: string;
  public readonly tempDir: string;

  constructor() {
    // Load from environment variables
    this.openaiApiKey = process.env.OPENAI_API_KEY || '';
    this.hotkey = process.env.VIBETALK_HOTKEY || 'cmd+shift+v';
    this.audioFormat = process.env.VIBETALK_AUDIO_FORMAT || 'wav';
    
    // Set up temp directory
    this.tempDir = path.join(process.cwd(), 'temp');
    this.ensureTempDir();
  }

  private ensureTempDir(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  public isValid(): boolean {
    return !!this.openaiApiKey;
  }

  public getAudioPath(timestamp: number): string {
    return path.join(this.tempDir, `recording_${timestamp}.${this.audioFormat}`);
  }
} 