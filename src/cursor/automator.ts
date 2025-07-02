import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class CursorAutomator {
  private hasInjectedBefore: boolean = false;
  
  /**
   * Check if Cursor is currently running
   */
  async isCursorRunning(): Promise<boolean> {
    try {
      const script = `
        tell application "System Events"
          return (name of processes) contains "Cursor"
        end tell
      `;
      
      const { stdout } = await execAsync(`osascript -e '${script}'`);
      return stdout.trim() === 'true';
    } catch (error) {
      console.error('Error checking if Cursor is running:', error);
      return false;
    }
  }

  /**
   * Activate Cursor and bring it to front
   */
  async activateCursor(): Promise<boolean> {
    try {
      const script = `
        tell application "Cursor"
          activate
        end tell
      `;
      
      await execAsync(`osascript -e '${script}'`);
      return true;
    } catch (error) {
      console.error('Error activating Cursor:', error);
      return false;
    }
  }

  /**
   * Get the currently focused application before switching to Cursor
   */
  async getCurrentFocusedApp(): Promise<string | null> {
    try {
      const script = `
        tell application "System Events"
          return name of first application process whose frontmost is true
        end tell
      `;
      
      const { stdout } = await execAsync(`osascript -e '${script}'`);
      return stdout.trim();
    } catch (error) {
      console.error('Error getting focused app:', error);
      return null;
    }
  }

  /**
   * Get detailed information about the current focused window
   */
  async getCurrentFocusedWindow(): Promise<{app: string, title: string} | null> {
    try {
      const script = `
        tell application "System Events"
          set frontApp to first application process whose frontmost is true
          set appName to name of frontApp
          set windowTitle to ""
          try
            set windowTitle to title of window 1 of frontApp
          end try
          return appName & "|||" & windowTitle
        end tell
      `;
      
      const { stdout } = await execAsync(`osascript -e '${script}'`);
      const [app, title] = stdout.trim().split('|||');
      return { app, title: title || '' };
    } catch (error) {
      console.error('Error getting focused window:', error);
      return null;
    }
  }

  /**
   * Return focus to a specific application
   */
  async returnFocusToApp(appName: string): Promise<boolean> {
    try {
      // Special handling for browsers - try to activate the specific browser window
      if (this.isBrowserApp(appName)) {
        return await this.returnFocusToBrowser(appName);
      }
      
      const script = `
        tell application "${appName}"
          activate
        end tell
      `;
      
      await execAsync(`osascript -e '${script}'`);
      return true;
    } catch (error) {
      console.error(`Error returning focus to ${appName}:`, error);
      return false;
    }
  }

  /**
   * Check if an app is a browser
   */
  private isBrowserApp(appName: string): boolean {
    const browsers = ['Safari', 'Google Chrome', 'Firefox', 'Arc', 'Edge', 'Brave Browser', 'Opera'];
    return browsers.some(browser => appName.includes(browser));
  }

  /**
   * Special handling for returning focus to browser with localhost
   */
  private async returnFocusToBrowser(appName: string): Promise<boolean> {
    try {
      console.log(`🔍 Looking for localhost tab in ${appName}...`);
      
      // First, just activate the browser
      await execAsync(`osascript -e 'tell application "${appName}" to activate'`);
      await this.sleep(300);
      
      // For Chrome specifically (most common case)
      if (appName.includes('Chrome')) {
        const chromeScript = `
          tell application "Google Chrome"
            set foundTab to false
            repeat with w in windows
              repeat with t in tabs of w
                if URL of t contains "localhost" then
                  set active tab index of w to index of t
                  set index of w to 1
                  set foundTab to true
                  exit repeat
                end if
              end repeat
              if foundTab then exit repeat
            end repeat
            return foundTab
          end tell
        `;
        
        try {
          const { stdout } = await execAsync(`osascript -e '${chromeScript}'`);
          if (stdout.trim() === 'true') {
            console.log('✅ Found and activated localhost tab in Chrome');
            return true;
          }
        } catch (error) {
          console.log('Chrome-specific tab search failed, using fallback');
        }
      }
      
      // For Safari
      if (appName.includes('Safari')) {
        const safariScript = `
          tell application "Safari"
            repeat with w in windows
              repeat with t in tabs of w
                if URL of t contains "localhost" then
                  set current tab of w to t
                  set index of w to 1
                  return true
                end if
              end repeat
            end repeat
            return false
          end tell
        `;
        
        try {
          const { stdout } = await execAsync(`osascript -e '${safariScript}'`);
          if (stdout.trim() === 'true') {
            console.log('✅ Found and activated localhost tab in Safari');
            return true;
          }
        } catch (error) {
          console.log('Safari-specific tab search failed, using fallback');
        }
      }
      
      // Fallback: just activate the browser
      console.log(`📱 Browser activated: ${appName} (localhost tab detection may have failed)`);
      return true;
      
    } catch (error) {
      console.error(`❌ Error returning focus to browser ${appName}:`, error);
      return false;
    }
  }

  /**
   * SIMPLIFIED text injection method that assumes Composer is open
   * User should keep Composer open with agent mode and model selected
   */
  async injectText(text: string, autoSubmit: boolean = true): Promise<boolean> {
    let originalWindow: {app: string, title: string} | null = null;
    let shouldReturnToBrowser = false;
    
    try {
      console.log(`🎙️ SIMPLIFIED INJECTION MODE`);
      console.log(`📋 USER INSTRUCTION: Keep Composer open with agent mode and model selected`);
      console.log(`📝 Voice command: "${text}"`);

      // Save the currently focused application and window FIRST
      originalWindow = await this.getCurrentFocusedWindow();
      console.log(`📱 Current window: ${originalWindow?.app} - "${originalWindow?.title}"`);
      
      // Determine if we should return to browser (web interface usage)
      if (originalWindow) {
        shouldReturnToBrowser = this.isWebInterfaceWindow(originalWindow);
        
        if (shouldReturnToBrowser) {
          console.log(`🌐 Detected web interface usage - will keep user on localhost`);
        }
      }

      // Add helpful prefix to make the context clear for Cursor's AI
      const prefixedText = this.addVoiceCommandPrefix(text);

      let success = false;
      const isFirstTranscription = !this.hasInjectedBefore;

      if (shouldReturnToBrowser) {
        console.log(`🚀 LOCALHOST MODE: Minimal interruption—quick Cursor interaction`);
        
        // Quick activation of Cursor
        await this.activateCursor();
        await this.sleep(300);
        
        // Simplified injection with endless retries
        success = await this.simplifiedInjectWithRetries(prefixedText, autoSubmit, isFirstTranscription);
        
        // IMMEDIATE focus return to browser
        if (originalWindow) {
          console.log(`⚡ Immediate return to ${originalWindow.app}...`);
          await this.sleep(200);
          await this.returnFocusToApp(originalWindow.app);
          
          // Enhanced browser focus return for localhost
          if (this.isBrowserApp(originalWindow.app)) {
            await this.sleep(300);
            await this.returnFocusToBrowserWithLocalhost();
          }
        }
        
        return success;
      } else {
        // STANDARD MODE: For non-localhost usage
        console.log(`🔄 STANDARD MODE: Normal Cursor interaction`);
        
        // Only proceed if we're not already in Cursor
        if (originalWindow?.app !== 'Cursor') {
          console.log(`🔄 Switching to Cursor...`);
          await this.activateCursor();
          await this.sleep(500);
        }

        // Simplified injection with endless retries
        success = await this.simplifiedInjectWithRetries(prefixedText, autoSubmit, isFirstTranscription);

        // Standard focus return logic
        if (originalWindow && originalWindow.app !== 'Cursor') {
          await this.sleep(800);
          console.log(`🔄 Returning focus to ${originalWindow.app}...`);
          await this.returnFocusToApp(originalWindow.app);
          await this.sleep(300);
        }
      }

      this.hasInjectedBefore = true;
      return success;
      
    } catch (error) {
      console.error('Error injecting text:', error);
      
      // Emergency focus return for localhost users
      if (shouldReturnToBrowser) {
        try {
          console.log(`🚨 Emergency localhost focus return...`);
          await this.returnFocusToBrowserWithLocalhost();
        } catch (focusError) {
          console.error('Error in emergency browser focus return:', focusError);
          // Ultimate fallback - try original window
          if (originalWindow && originalWindow.app !== 'Cursor') {
            try {
              await this.returnFocusToApp(originalWindow.app);
            } catch (finalError) {
              console.error('Final fallback failed:', finalError);
            }
          }
        }
      } else if (originalWindow && originalWindow.app !== 'Cursor') {
        try {
          console.log(`🚨 Emergency focus return to ${originalWindow.app}...`);
          await this.returnFocusToApp(originalWindow.app);
        } catch (focusError) {
          console.error('Error in emergency focus return:', focusError);
        }
      }
      
      return false;
    }
  }

  /**
   * Simplified injection with endless retries
   * Assumes Composer is open and just injects text
   * First transcription: Cmd+I + Cmd+N
   * Subsequent transcriptions: Only Cmd+I
   * If no change detected after 30 seconds, press Cmd+I and retry
   */
  private async simplifiedInjectWithRetries(text: string, autoSubmit: boolean, isFirstTranscription: boolean): Promise<boolean> {
    let attemptCount = 0;
    
    while (true) { // Endless retries as requested
      attemptCount++;
      console.log(`🔄 Simplified injection attempt ${attemptCount} ${isFirstTranscription && attemptCount === 1 ? '(FIRST TRANSCRIPTION)' : ''}`);
      
      try {
        // For first transcription: Cmd+I + Cmd+N
        // For subsequent: Only Cmd+I
        if (isFirstTranscription && attemptCount === 1) {
          console.log('🎯 First transcription: Sending Cmd+I + Cmd+N for new chat');
          await this.sendCmdI();
          await this.sleep(200);
          await this.sendCmdN();
          await this.sleep(400);
        } else {
          console.log('🎯 Subsequent attempt: Sending Cmd+I only');
          await this.sendCmdI();
          await this.sleep(400);
        }
        
        // Inject text (assume Composer is now open)
        console.log('💉 Injecting text (assuming Composer is open)');
        let injectionSuccess = await this.injectViaClipboard(text);
        
        if (!injectionSuccess) {
          // Fallback to keystroke
          injectionSuccess = await this.injectViaKeystroke(text);
        }
        
        if (injectionSuccess) {
          console.log('✅ Text injection successful');
          
          // Submit if requested
          if (autoSubmit) {
            console.log('📤 Submitting to Composer');
            await this.submitToComposer();
          }
          
          // Wait 30 seconds to detect changes
          console.log('⏳ Waiting 30 seconds to detect changes...');
          const changeDetected = await this.waitForChanges(30000);
          
          if (changeDetected) {
            console.log('✅ Changes detected! Injection successful');
            return true;
          } else {
            console.log('❌ No changes detected after 30 seconds, assuming Composer was closed');
            console.log('🔄 Will retry with Cmd+I...');
            // Continue to next iteration (retry)
          }
        } else {
          console.log('❌ Text injection failed, retrying...');
          await this.sleep(2000); // Wait before retry
          // Continue to next iteration (retry)
        }
        
      } catch (error) {
        console.error(`❌ Error in attempt ${attemptCount}:`, error);
        await this.sleep(2000); // Wait before retry
        // Continue to next iteration (retry)
      }
    }
  }

  /**
   * Send Cmd+I to open Composer
   */
  private async sendCmdI(): Promise<void> {
    const script = `
      tell application "System Events"
        tell process "Cursor"
          keystroke "i" using command down
        end tell
      end tell
    `;
    await execAsync(`osascript -e '${script}'`);
  }

  /**
   * Send Cmd+N for new chat (only on first transcription)
   */
  private async sendCmdN(): Promise<void> {
    const script = `
      tell application "System Events"
        tell process "Cursor"
          keystroke "n" using command down
        end tell
      end tell
    `;
    await execAsync(`osascript -e '${script}'`);
  }

  /**
   * Wait for changes to be detected (simplified version)
   * Returns true if changes detected, false if timeout
   */
  private async waitForChanges(timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    const checkInterval = 2000; // Check every 2 seconds
    
    // Simple change detection - monitor clipboard content as a proxy
    // This is a simplified approach - in reality you might want to monitor file changes
    let initialState = '';
    try {
      const { stdout } = await execAsync('pbpaste');
      initialState = stdout;
    } catch (error) {
      // Ignore clipboard read errors
    }
    
    while (Date.now() - startTime < timeoutMs) {
      await this.sleep(checkInterval);
      
      try {
        // Check if clipboard content changed (as a simple proxy for activity)
        const { stdout } = await execAsync('pbpaste');
        if (stdout !== initialState) {
          console.log('📋 Clipboard change detected (possible activity indicator)');
          return true;
        }
      } catch (error) {
        // Ignore clipboard read errors
      }
      
      // For now, we'll use a simplified approach and assume changes occurred
      // In a real implementation, you might monitor file timestamps or other indicators
      console.log(`⏳ Still waiting for changes... ${Math.round((Date.now() - startTime) / 1000)}s elapsed`);
    }
    
    return false; // Timeout reached
  }

  /**
   * Detect if the current window is likely a web interface (localhost usage)
   * ENHANCED: More aggressive localhost detection
   */
  private isWebInterfaceWindow(window: {app: string, title: string}): boolean {
    // Check if it's a browser
    if (!this.isBrowserApp(window.app)) {
      return false;
    }
    
    // ENHANCED: More comprehensive localhost indicators
    const localhostIndicators = [
      'localhost', '127.0.0.1', 'VibeTalk', 'demo', 'vibetalk',
      // Common localhost ports
      ':3000', ':3001', ':8080', ':8000', ':5000', ':4200', ':3030',
      // Development terms
      'dev', 'development', 'local', 'test', 'staging',
      // Framework indicators that suggest localhost
      'react', 'vue', 'next', 'nuxt', 'angular', 'svelte'
    ];
    
    const titleLower = window.title.toLowerCase();
    const urlLikeIndicators = titleLower.includes('http://') || titleLower.includes('https://');
    
    // Check for explicit localhost indicators
    const hasLocalhostIndicator = localhostIndicators.some(indicator => 
      titleLower.includes(indicator.toLowerCase())
    );
    
    // Additional check: if title contains common port patterns
    const hasPortPattern = /:(3000|3001|8080|8000|5000|4200|3030|9000)/i.test(titleLower);
    
    // If it looks like a local URL or has localhost indicators, treat as localhost
    const isLocalhost = hasLocalhostIndicator || hasPortPattern;
    
    if (isLocalhost) {
      console.log(`🌐 LOCALHOST DETECTED: "${window.title}" in ${window.app}`);
    }
    
    return isLocalhost;
  }

  /**
   * Enhanced browser focus return with localhost prioritization
   * ENHANCED: Better localhost tab detection and fallback mechanisms
   */
  private async returnFocusToBrowserWithLocalhost(): Promise<boolean> {
    try {
      console.log(`🔍 Enhanced localhost browser return...`);
      
      // Try to find and activate a browser with localhost content
      const browsers = ['Google Chrome', 'Safari', 'Arc', 'Firefox', 'Brave Browser', 'Microsoft Edge'];
      
      for (const browser of browsers) {
        const success = await this.activateBrowserWithLocalhostEnhanced(browser);
        if (success) {
          return true;
        }
      }
      
      // Fallback: try to activate any browser that's running
      console.log(`🔄 Fallback: activating any available browser...`);
      for (const browser of browsers) {
        try {
          // Check if browser is running
          const checkScript = `
            tell application "System Events"
              return (name of processes) contains "${browser}"
            end tell
          `;
          const { stdout } = await execAsync(`osascript -e '${checkScript}'`);
          
          if (stdout.trim() === 'true') {
          await execAsync(`osascript -e 'tell application "${browser}" to activate'`);
          console.log(`✅ Activated ${browser} as fallback`);
          return true;
          }
        } catch (error) {
          // Browser not running or failed to activate, continue to next
        }
      }
      
      console.log('❌ No suitable browser found for focus return');
      return false;
      
    } catch (error) {
      console.error('❌ Error in browser focus return:', error);
      return false;
    }
  }

  /**
   * Enhanced browser activation with better localhost detection
   */
  private async activateBrowserWithLocalhostEnhanced(browserName: string): Promise<boolean> {
    try {
      // First check if browser is running
      const checkScript = `
        tell application "System Events"
          return (name of processes) contains "${browserName}"
        end tell
      `;
      
      const { stdout } = await execAsync(`osascript -e '${checkScript}'`);
      if (stdout.trim() !== 'true') {
        return false; // Browser not running
      }
      
      console.log(`🔍 Checking ${browserName} for localhost content...`);
      
      // Try Chrome-based browsers (Chrome, Arc, Brave, Edge)
      if (browserName.includes('Chrome') || browserName.includes('Arc') || browserName.includes('Brave') || browserName.includes('Edge')) {
        const chromeScript = `
          tell application "${browserName}"
            activate
            set foundTab to false
            repeat with w in windows
              repeat with t in tabs of w
                set tabUrl to URL of t
                set tabTitle to title of t
                -- Enhanced localhost detection
                if tabUrl contains "localhost" or tabUrl contains "127.0.0.1" or tabUrl contains ":3000" or tabUrl contains ":3001" or tabUrl contains ":8080" or tabUrl contains ":8000" or tabUrl contains ":5000" or tabUrl contains ":4200" or tabTitle contains "VibeTalk" or tabTitle contains "Demo" or tabTitle contains "localhost" or tabTitle contains "dev" then
                  set active tab index of w to index of t
                  set index of w to 1
                  set foundTab to true
                  exit repeat
                end if
              end repeat
              if foundTab then exit repeat
            end repeat
            return foundTab
          end tell
        `;
        
        try {
        const { stdout: chromeResult } = await execAsync(`osascript -e '${chromeScript}'`);
        if (chromeResult.trim() === 'true') {
            console.log(`✅ Found and activated localhost tab in ${browserName}`);
          return true;
          }
        } catch (error) {
          console.log(`⚠️  ${browserName} tab search failed:`, error instanceof Error ? error.message : String(error));
        }
      }
      
      // Try Safari-specific approach
      if (browserName.includes('Safari')) {
        const safariScript = `
          tell application "${browserName}"
            activate
            repeat with w in windows
              repeat with t in tabs of w
                set tabUrl to URL of t
                set tabTitle to name of t
                -- Enhanced localhost detection for Safari
                if tabUrl contains "localhost" or tabUrl contains "127.0.0.1" or tabUrl contains ":3000" or tabUrl contains ":3001" or tabUrl contains ":8080" or tabUrl contains ":8000" or tabUrl contains ":5000" or tabUrl contains ":4200" or tabTitle contains "VibeTalk" or tabTitle contains "Demo" or tabTitle contains "localhost" or tabTitle contains "dev" then
                  set current tab of w to t
                  set index of w to 1
                  return true
                end if
              end repeat
            end repeat
            return false
          end tell
        `;
        
        try {
        const { stdout: safariResult } = await execAsync(`osascript -e '${safariScript}'`);
        if (safariResult.trim() === 'true') {
          console.log('✅ Found and activated localhost tab in Safari');
          return true;
          }
        } catch (error) {
          console.log('⚠️  Safari tab search failed:', error instanceof Error ? error.message : String(error));
        }
      }
      
      // Fallback: just activate the browser (better than nothing)
      try {
      await execAsync(`osascript -e 'tell application "${browserName}" to activate'`);
        console.log(`📱 Activated ${browserName} (localhost detection may have failed, but browser is now active)`);
      return true;
      } catch (error) {
        console.log(`❌ Failed to activate ${browserName}:`, error instanceof Error ? error.message : String(error));
        return false;
      }
      
    } catch (error) {
      console.log(`⚠️  Failed to check/activate ${browserName}:`, error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  /**
   * Add a helpful prefix to voice transcriptions to provide context for Cursor's AI
   */
  private addVoiceCommandPrefix(transcription: string): string {
    // Use a simpler prefix without emojis to avoid AppleScript issues
    const prefix = `Voice Command: The user spoke this request (may contain natural speech patterns, verbal fillers, or conversational language): `;
    return prefix + `"${transcription}"`;
  }

  /**
   * Strategy 1: Direct keystroke simulation (improved)
   */
  private async injectViaKeystroke(text: string): Promise<boolean> {
    try {
      // More robust text escaping for AppleScript
      const cleanText = this.sanitizeTextForAppleScript(text);
      
      const script = `
        tell application "System Events"
          tell process "Cursor"
            keystroke "${cleanText}"
          end tell
        end tell
      `;
      
      await execAsync(`osascript -e '${script}'`);
      return true;
    } catch (error) {
      console.log('Keystroke injection failed:', error);
      return false;
    }
  }

  /**
   * Strategy 2: Clipboard-based injection (improved)  
   */
  private async injectViaClipboard(text: string): Promise<boolean> {
    try {
      // Use pbcopy for more reliable clipboard setting
      const { spawn } = require('child_process');
      
      return new Promise((resolve) => {
        const pbcopy = spawn('pbcopy');
        pbcopy.stdin.write(text);
        pbcopy.stdin.end();
        
        pbcopy.on('close', async () => {
          try {
            // Wait a moment for clipboard to be set
            await this.sleep(200);
            
            // Paste via Cmd+V
            const pasteScript = `
              tell application "System Events"
                tell process "Cursor"
                  keystroke "v" using command down
                end tell
              end tell
            `;
            await execAsync(`osascript -e '${pasteScript}'`);
            resolve(true);
          } catch (error) {
            console.log('Paste failed:', error);
            resolve(false);
          }
        });
      });
    } catch (error) {
      console.log('Clipboard injection failed:', error);
      return false;
    }
  }

  /**
   * Sanitize text for AppleScript to avoid special character issues
   */
  private sanitizeTextForAppleScript(text: string): string {
    return text
      // Remove emojis and problematic Unicode characters
      .replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
      // Escape characters that break AppleScript strings
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/'/g, "\\'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Strategy 3: Try to find and interact with Composer UI element
   */
  private async injectViaUIElement(text: string): Promise<boolean> {
    try {
      const script = `
        tell application "System Events"
          tell process "Cursor"
            set textFields to text field of window 1
            repeat with tField in textFields
              try
                set focused of tField to true
                set value of tField to "${text.replace(/"/g, '\\"')}"
                return true
              end try
            end repeat
          end tell
        end tell
      `;
      const { stdout } = await execAsync(`osascript -e '${script}'`);
      return stdout.trim() === 'true';
    } catch (error) {
      console.log('UI element injection failed:', error);
      return false;
    }
  }

  /**
   * Open Cursor's Composer (Cmd+I)
   */
  async openComposer(): Promise<boolean> {
    try {
      await this.activateCursor();
      await this.sleep(200);
      const script = `
        tell application "System Events"
          tell process "Cursor"
            keystroke "i" using command down
          end tell
        end tell
      `;
      await execAsync(`osascript -e '${script}'`);
      await this.sleep(400);
      return true;
    } catch (error) {
      console.error('Error opening Composer:', error);
      return false;
    }
  }

  /**
   * Press Return to submit in Composer
   */
  async submitToComposer(): Promise<boolean> {
    try {
      const script = `
        tell application "System Events"
          tell process "Cursor"
            keystroke return
          end tell
        end tell
      `;
      await execAsync(`osascript -e '${script}'`);
      return true;
    } catch (error) {
      console.error('Error submitting to Composer:', error);
      return false;
    }
  }

  /** Utility sleep */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** Simple automation self-test */
  async testAutomation(): Promise<boolean> {
    try {
      const running = await this.isCursorRunning();
      if (!running) return false;
      await this.activateCursor();
      return true;
    } catch {
      return false;
    }
  }
}