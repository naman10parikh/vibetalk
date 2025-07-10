import { config } from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables
config();

export class Config {
  public openaiApiKey: string;
  public readonly hotkey: string;
  public readonly audioFormat: string;
  public readonly tempDir: string;

  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY || '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';
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