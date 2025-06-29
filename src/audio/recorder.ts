import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

export class AudioRecorder {
  private recordingProcess: ChildProcess | null = null;
  private currentRecordingPath: string | null = null;

  /**
   * Start recording audio using macOS native tools
   */
  async startRecording(): Promise<void> {
    if (this.recordingProcess) {
      console.log('⚠️  Recording already in progress');
      return;
    }

    // Generate unique filename
    const timestamp = Date.now();
    const tempDir = path.join(process.cwd(), 'temp');
    
    // Ensure temp directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    this.currentRecordingPath = path.join(tempDir, `recording_${timestamp}.wav`);

    try {
      console.log(`🎤 Starting audio recording to: ${this.currentRecordingPath}`);
      
      // Use macOS `sox` command to record audio
      // If sox is not available, fall back to `rec` or other methods
      const recordingMethod = await this.getBestRecordingMethod();
      
      if (recordingMethod === 'sox') {
        await this.startRecordingWithSox();
      } else if (recordingMethod === 'rec') {
        await this.startRecordingWithRec();
      } else if (recordingMethod === 'ffmpeg') {
        await this.startRecordingWithFFmpeg();
      } else {
        throw new Error('No suitable audio recording tool found');
      }
      
    } catch (error) {
      console.error('❌ Failed to start recording:', error);
      this.recordingProcess = null;
      this.currentRecordingPath = null;
      throw error;
    }
  }

  /**
   * Stop recording and return the path to the recorded file
   */
  async stopRecording(): Promise<string | null> {
    if (!this.recordingProcess || !this.currentRecordingPath) {
      console.log('⚠️  No recording in progress');
      return null;
    }

    try {
      console.log('⏹️  Stopping audio recording...');
      
      // Terminate the recording process
      this.recordingProcess.kill('SIGTERM');
      
      // Wait a moment for the file to be written
      await this.sleep(1000);
      
      // Check if file exists and has content
      if (fs.existsSync(this.currentRecordingPath)) {
        const stats = fs.statSync(this.currentRecordingPath);
        if (stats.size > 0) {
          console.log(`✅ Recording saved: ${this.currentRecordingPath} (${stats.size} bytes)`);
          const result = this.currentRecordingPath;
          this.recordingProcess = null;
          this.currentRecordingPath = null;
          return result;
        }
      }
      
      console.error('❌ Recording file is empty or does not exist');
      return null;
      
    } catch (error) {
      console.error('❌ Error stopping recording:', error);
      return null;
    } finally {
      this.recordingProcess = null;
      this.currentRecordingPath = null;
    }
  }

  /**
   * Clean up temporary audio files
   */
  cleanup(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🗑️  Cleaned up audio file: ${filePath}`);
      }
    } catch (error) {
      console.log(`⚠️  Could not clean up file ${filePath}:`, error);
    }
  }

  /**
   * Check what audio recording tools are available
   */
  private async getBestRecordingMethod(): Promise<string> {
    const methods = ['sox', 'rec', 'ffmpeg'];
    
    for (const method of methods) {
      try {
        await execAsync(`which ${method}`);
        console.log(`✅ Found recording tool: ${method}`);
        return method;
      } catch (error) {
        // Tool not found, try next one
      }
    }
    
    console.log('❌ No suitable recording tools found. Please install sox, rec, or ffmpeg.');
    console.log('💡 Install with: brew install sox');
    return '';
  }

  /**
   * Record using Sox
   */
  private async startRecordingWithSox(): Promise<void> {
    this.recordingProcess = spawn('sox', [
      '-t', 'coreaudio', 'default',  // Input from default audio device
      this.currentRecordingPath!     // Output file
    ]);

    this.recordingProcess.on('error', (error) => {
      console.error('Sox recording error:', error);
    });
    
    this.recordingProcess.on('exit', (code) => {
      console.log(`Sox recording process exited with code: ${code}`);
    });
  }

  /**
   * Record using Rec (part of Sox)
   */
  private async startRecordingWithRec(): Promise<void> {
    this.recordingProcess = spawn('rec', [
      '-r', '16000',
      '-c', '1',
      '-b', '16',
      this.currentRecordingPath!
    ]);

    this.recordingProcess.on('error', (error) => {
      console.error('Rec recording error:', error);
    });
  }

  /**
   * Record using FFmpeg
   */
  private async startRecordingWithFFmpeg(): Promise<void> {
    this.recordingProcess = spawn('ffmpeg', [
      '-f', 'avfoundation',
      '-i', ':0',                    // Default audio input
      '-ar', '16000',                // Sample rate
      '-ac', '1',                    // Mono
      '-y',                          // Overwrite output file
      this.currentRecordingPath!
    ]);

    this.recordingProcess.on('error', (error) => {
      console.error('FFmpeg recording error:', error);
    });
  }

  /**
   * Test if audio recording is working
   */
  async testRecording(): Promise<boolean> {
    try {
      console.log('🧪 Testing audio recording...');
      
      const method = await this.getBestRecordingMethod();
      if (!method) {
        console.log('❌ No recording tools available');
        return false;
      }
      
      // Test a very short recording (1 second)
      await this.startRecording();
      await this.sleep(1000);
      const testFile = await this.stopRecording();
      
      if (testFile) {
        console.log('✅ Audio recording test successful!');
        this.cleanup(testFile);
        return true;
      } else {
        console.log('❌ Audio recording test failed');
        return false;
      }
      
    } catch (error) {
      console.error('❌ Audio recording test error:', error);
      return false;
    }
  }

  /**
   * Utility function to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return this.recordingProcess !== null;
  }
} 