import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class CursorAutomator {
  
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
   * Inject text into the active text field with improved focus management
   */
  async injectText(text: string, autoSubmit: boolean = true): Promise<boolean> {
    let originalWindow: {app: string, title: string} | null = null;
    let shouldReturnToBrowser = false;
    
    try {
      // Save the currently focused application and window
      originalWindow = await this.getCurrentFocusedWindow();
      console.log(`📱 Current window: ${originalWindow?.app} - "${originalWindow?.title}"`);
      
      // Determine if we should return to browser (web interface usage)
      if (originalWindow) {
        shouldReturnToBrowser = this.isWebInterfaceWindow(originalWindow);
        
        if (shouldReturnToBrowser) {
          console.log(`🌐 Detected web interface usage - will return to browser after Cursor processing`);
        }
      }
      
      // Only proceed if we're not already in Cursor
      if (originalWindow?.app !== 'Cursor') {
        console.log(`🔄 Switching to Cursor temporarily...`);
        
        // Activate Cursor
        await this.activateCursor();
        
        // Wait a moment for activation
        await this.sleep(500);
      }

      // Add helpful prefix to make the context clear for Cursor's AI
      const prefixedText = this.addVoiceCommandPrefix(text);
      console.log(`📝 Original text: "${text}"`);
      console.log(`🤖 Prefixed text: "${prefixedText}"`);

      let success = false;

      // Strategy 1: Try clipboard first (most reliable)
      if (!success) {
        success = await this.injectViaClipboard(prefixedText);
        if (success) console.log('✅ Clipboard injection succeeded');
      }

      // Strategy 2: Try keystroke simulation
      if (!success) {
        success = await this.injectViaKeystroke(prefixedText);
        if (success) console.log('✅ Keystroke injection succeeded');
      }

      // Strategy 3: Try UI element approach
      if (!success) {
        success = await this.injectViaUIElement(prefixedText);
        if (success) console.log('✅ UI element injection succeeded');
      }

      if (success && autoSubmit) {
        await this.submitToComposer();
      }

      // ENHANCED: Focus return logic
      if (success) {
        // Give Cursor time to process the request
        await this.sleep(800);
        
        if (shouldReturnToBrowser) {
          // Return to browser with localhost prioritization
          console.log(`🌐 Returning focus to browser for web interface...`);
          const browserReturned = await this.returnFocusToBrowserWithLocalhost();
          
          if (browserReturned) {
            console.log(`✅ Successfully returned focus to browser`);
          } else {
            console.log(`⚠️  Browser focus return may have failed - trying fallback`);
            // Fallback to original window
            if (originalWindow && originalWindow.app !== 'Cursor') {
              await this.returnFocusToApp(originalWindow.app);
            }
          }
        } else if (originalWindow && originalWindow.app !== 'Cursor') {
          // Return to original app (non-browser case)
          console.log(`🔄 Returning focus to ${originalWindow.app}...`);
          const focusReturned = await this.returnFocusToApp(originalWindow.app);
          
          if (focusReturned) {
            console.log(`✅ Successfully returned focus to ${originalWindow.app}`);
          } else {
            console.log(`⚠️  Focus return may have failed for ${originalWindow.app}`);
          }
        }
        
        // Extra delay to ensure focus is properly set
        await this.sleep(300);
      }

      return success;
    } catch (error) {
      console.error('Error injecting text:', error);
      
      // Emergency focus return
      if (shouldReturnToBrowser) {
        try {
          console.log(`🚨 Emergency browser focus return...`);
          await this.returnFocusToBrowserWithLocalhost();
        } catch (focusError) {
          console.error('Error in emergency browser focus return:', focusError);
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
   * Detect if the current window is likely a web interface (localhost usage)
   */
  private isWebInterfaceWindow(window: {app: string, title: string}): boolean {
    // Check if it's a browser
    if (!this.isBrowserApp(window.app)) {
      return false;
    }
    
    // Check if the title contains localhost indicators
    const localhostIndicators = ['localhost', '127.0.0.1', 'VibeTalk', 'demo', 'vibetalk'];
    const titleLower = window.title.toLowerCase();
    
    return localhostIndicators.some(indicator => titleLower.includes(indicator.toLowerCase()));
  }

  /**
   * Enhanced browser focus return with localhost prioritization
   */
  private async returnFocusToBrowserWithLocalhost(): Promise<boolean> {
    try {
      console.log(`🔍 Looking for browser with localhost/VibeTalk content...`);
      
      // Try to find and activate a browser with localhost content
      const browsers = ['Google Chrome', 'Safari', 'Arc', 'Firefox', 'Brave Browser'];
      
      for (const browser of browsers) {
        const success = await this.activateBrowserWithLocalhost(browser);
        if (success) {
          return true;
        }
      }
      
      // Fallback: activate any browser
      for (const browser of browsers) {
        try {
          await execAsync(`osascript -e 'tell application "${browser}" to activate'`);
          console.log(`✅ Activated ${browser} as fallback`);
          return true;
        } catch (error) {
          // Browser not running, continue to next
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
   * Try to activate a specific browser and find localhost content
   */
  private async activateBrowserWithLocalhost(browserName: string): Promise<boolean> {
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
      
      // Try Chrome-specific approach
      if (browserName.includes('Chrome')) {
        const chromeScript = `
          tell application "${browserName}"
            activate
            set foundTab to false
            repeat with w in windows
              repeat with t in tabs of w
                set tabUrl to URL of t
                set tabTitle to title of t
                if tabUrl contains "localhost" or tabUrl contains "127.0.0.1" or tabTitle contains "VibeTalk" or tabTitle contains "Demo" then
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
        
        const { stdout: chromeResult } = await execAsync(`osascript -e '${chromeScript}'`);
        if (chromeResult.trim() === 'true') {
          console.log('✅ Found and activated localhost tab in Chrome');
          return true;
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
                if tabUrl contains "localhost" or tabUrl contains "127.0.0.1" or tabTitle contains "VibeTalk" or tabTitle contains "Demo" then
                  set current tab of w to t
                  set index of w to 1
                  return true
                end if
              end repeat
            end repeat
            return false
          end tell
        `;
        
        const { stdout: safariResult } = await execAsync(`osascript -e '${safariScript}'`);
        if (safariResult.trim() === 'true') {
          console.log('✅ Found and activated localhost tab in Safari');
          return true;
        }
      }
      
      // Fallback: just activate the browser
      await execAsync(`osascript -e 'tell application "${browserName}" to activate'`);
      console.log(`📱 Activated ${browserName} (localhost detection may have failed)`);
      return true;
      
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
      // Remove emojis and special Unicode characters that cause AppleScript issues
      .replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
      // Escape quotes and backslashes
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/'/g, "\\'")
      // Clean up multiple spaces
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Strategy 3: Try to find and interact with Composer UI element
   */
  private async injectViaUIElement(text: string): Promise<boolean> {
    try {
      // This is more complex and might need adjustment based on Cursor's UI structure
      const script = `
        tell application "System Events"
          tell process "Cursor"
            -- Try to find a text field that might be the Composer
            set textFields to text field of window 1
            repeat with textField in textFields
              try
                set focused of textField to true
                set value of textField to "${text.replace(/"/g, '\\"')}"
                return true
              end try
            end repeat
            
            -- If no text field found, try text areas
            set textAreas to text area of window 1
            repeat with textArea in textAreas
              try
                set focused of textArea to true
                set value of textArea to "${text.replace(/"/g, '\\"')}"
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
   * Open Cursor's Composer (using keyboard shortcut)
   */
  async openComposer(): Promise<boolean> {
    try {
      await this.activateCursor();
      await this.sleep(300);
      
      // Try common shortcuts for opening Composer
      // Cursor might use Cmd+I or Cmd+K or another shortcut
      const script = `
        tell application "System Events"
          tell process "Cursor"
            keystroke "i" using command down
          end tell
        end tell
      `;
      
      await execAsync(`osascript -e '${script}'`);
      await this.sleep(500); // Wait for Composer to open
      
      return true;
    } catch (error) {
      console.error('Error opening Composer:', error);
      return false;
    }
  }

  /**
   * Submit the current text in Composer (press Enter)
   */
  async submitToComposer(): Promise<boolean> {
    try {
      await this.sleep(200); // Brief pause after text injection
      
      const script = `
        tell application "System Events"
          tell process "Cursor"
            keystroke return
          end tell
        end tell
      `;
      
      await execAsync(`osascript -e '${script}'`);
      console.log('📤 Submitted text to Cursor Composer');
      return true;
    } catch (error) {
      console.error('Error submitting to Composer:', error);
      return false;
    }
  }

  /**
   * Utility function to sleep for a specified number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Test function to validate AppleScript automation is working
   */
  async testAutomation(): Promise<boolean> {
    try {
      console.log('Testing Cursor automation...');
      
      const isRunning = await this.isCursorRunning();
      if (!isRunning) {
        console.log('❌ Cursor is not running');
        return false;
      }
      
      const activated = await this.activateCursor();
      if (!activated) {
        console.log('❌ Could not activate Cursor');
        return false;
      }
      
      console.log('✅ Cursor automation test passed!');
      return true;
    } catch (error) {
      console.error('❌ Cursor automation test failed:', error);
      return false;
    }
  }
} 