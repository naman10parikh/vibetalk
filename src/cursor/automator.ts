import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class CursorAutomator {
  private hasInjectedBefore: boolean = false;
  private composerIsOpen: boolean = false; // Track if Composer is likely open
  
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
    let originalLocalhostUrl: string | null = null;
    
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
          // Extract the specific localhost URL from the window title
          originalLocalhostUrl = this.extractLocalhostUrl(originalWindow.title);
          if (originalLocalhostUrl) {
            console.log(`🎯 Specific localhost URL detected: ${originalLocalhostUrl}`);
          }
        }
      }

      // Add helpful prefix to make the context clear for Cursor's AI
      const prefixedText = this.addVoiceCommandPrefix(text);

      let success = false;

      if (shouldReturnToBrowser) {
        console.log(`🚀 LOCALHOST MODE: Minimal interruption—quick Cursor interaction`);
        
        // Quick activation of Cursor
        await this.activateCursor();
        await this.sleep(50); // Reduced from 100ms
        
        // Smart injection with escalating fallbacks - pass localhost mode flag and return info
        success = await this.smartInjectWithFallbacks(
          prefixedText, 
          autoSubmit, 
          true, // localhost mode
          originalWindow, // window info for return
          originalLocalhostUrl // specific URL
        );
        
        // Return handled inside smartInjectWithFallbacks for localhost mode
        
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

        // Smart injection with escalating fallbacks
        success = await this.smartInjectWithFallbacks(prefixedText, autoSubmit, false, null, null); // false = not localhost mode

        // Standard focus return logic
        if (originalWindow && originalWindow.app !== 'Cursor') {
          await this.sleep(800);
          console.log(`🔄 Returning focus to ${originalWindow.app}...`);
          await this.returnFocusToApp(originalWindow.app);
          await this.sleep(300);
        }
      }

      // Update state tracking
      if (success) {
        this.hasInjectedBefore = true;
        // Note: composerIsOpen will be set by background monitoring in localhost mode
        if (!shouldReturnToBrowser) {
          this.composerIsOpen = true;
        }
      }
      return success;
      
    } catch (error) {
      console.error('Error injecting text:', error);
      
      // Emergency focus return for localhost users
      if (shouldReturnToBrowser) {
        try {
          console.log(`🚨 Emergency localhost focus return...`);
          await this.returnFocusToBrowserWithLocalhost(originalLocalhostUrl || undefined);
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
   * Simplified injection with retries until first successful change
   * Assumes Composer is open and just injects text
   * First transcription: Cmd+I + Cmd+N
   * Subsequent transcriptions: Only Cmd+I
   * Retries until first file change is detected, then stops and waits for next command
   */
  private async simplifiedInjectWithRetries(text: string, autoSubmit: boolean, isFirstTranscription: boolean): Promise<boolean> {
    let attemptCount = 0;
    const maxRetryMinutes = 5; // Maximum retry time before giving up
    const startTime = Date.now();
    
    while (true) { // Retry until first successful change or timeout
      attemptCount++;
      console.log(`🔄 Simplified injection attempt ${attemptCount} ${isFirstTranscription && attemptCount === 1 ? '(FIRST TRANSCRIPTION)' : ''}`);
      
      // Safety timeout - don't retry forever
      if (Date.now() - startTime > maxRetryMinutes * 60 * 1000) {
        console.log(`⏰ Retry timeout reached (${maxRetryMinutes} minutes). Stopping retries for this command.`);
        return false;
      }
      
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
          
          // Wait for changes with enhanced detection
          console.log('⏳ Waiting for file changes (60 second timeout)...');
          const changeDetected = await this.waitForFileChanges(60000);
          
          if (changeDetected) {
            console.log('✅ FILE CHANGES DETECTED! Command processed successfully.');
            console.log('🎯 Stopping retries - waiting for next voice command...');
            return true; // SUCCESS: Stop retrying this command
          } else {
            console.log('❌ No file changes detected after 60 seconds');
            console.log(`🔄 Retry ${attemptCount + 1}: Will re-open Composer and try again...`);
            await this.sleep(1000); // Brief pause before retry
            // Continue to next iteration (retry same command)
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
   * Smart injection with escalating fallback strategies
   * Intelligently handles Composer state and uses appropriate fallbacks
   * 
   * Strategy:
   * 1. First time: Cmd+I + Cmd+N (new chat)
   * 2. Once successful: Just inject text (Composer should be open)
   * 3. If injection fails: Try Cmd+I (reopen Composer)
   * 4. If still fails: Try Cmd+I + Cmd+N (new chat)
   */
  private async smartInjectWithFallbacks(
    text: string, 
    autoSubmit: boolean, 
    isLocalhostMode: boolean = false,
    originalWindow?: {app: string, title: string} | null,
    originalLocalhostUrl?: string | null
  ): Promise<boolean> {
    const maxRetryMinutes = 5;
    const startTime = Date.now();
    let attemptCount = 0;
    
    console.log(`🧠 SMART INJECTION MODE`);
    console.log(`📊 State: composerIsOpen=${this.composerIsOpen}, hasInjectedBefore=${this.hasInjectedBefore}`);
    
    while (true) {
      attemptCount++;
      
      // Safety timeout
      if (Date.now() - startTime > maxRetryMinutes * 60 * 1000) {
        console.log(`⏰ Smart injection timeout reached (${maxRetryMinutes} minutes). Giving up.`);
        return false;
      }
      
      let strategy = '';
      
      try {
        // STRATEGY SELECTION based on state and attempt count
        if (!this.hasInjectedBefore) { // Absolute first transcription for this session
            strategy = 'NEW_CHAT'; // Always start with a new chat to be safe
            console.log(`🎯 Strategy ${attemptCount}: NEW_CHAT (first transcription ever)`);
            await this.ensureCursorFocus();
            await this.sendCmdI();
            await this.sleep(200);
            await this.ensureCursorFocus();
            await this.sendCmdN();
            await this.sleep(400);
        } else if (this.composerIsOpen || attemptCount === 1) { // If composer is known open, or it's the first attempt of a subsequent command
            strategy = 'DIRECT_INJECT'; // Try direct inject first
            console.log(`🎯 Strategy ${attemptCount}: DIRECT_INJECT (Composer assumed open or first retry attempt)`);
            // No keyboard shortcuts, just inject
        } else if (attemptCount <= 3) { // If direct inject failed, try reopening Composer
            strategy = 'REOPEN_COMPOSER';
            console.log(`🎯 Strategy ${attemptCount}: REOPEN_COMPOSER (Cmd+I)`);
            await this.ensureCursorFocus();
            await this.sendCmdI();
            await this.sleep(400);
        } else { // If reopening failed, force a new chat
            strategy = 'FORCE_NEW_CHAT';
            console.log(`🎯 Strategy ${attemptCount}: FORCE_NEW_CHAT (Cmd+I + Cmd+N)`);
            await this.ensureCursorFocus();
            await this.sendCmdI();
            await this.sleep(200);
            await this.ensureCursorFocus();
            await this.sendCmdN();
            await this.sleep(400);
        }
        
        // INJECTION PHASE
        console.log('💉 Injecting text...');
        let injectionSuccess = await this.injectViaClipboard(text);
        
        if (!injectionSuccess) {
          injectionSuccess = await this.injectViaKeystroke(text);
        }
        
        if (injectionSuccess) {
          console.log('✅ Text injection successful');
          
          // Submit if requested
          if (autoSubmit) {
            console.log('📤 Submitting to Composer');
            await this.submitToComposer();
          }
          
          // For localhost mode: Return to browser immediately after injection
          if (isLocalhostMode && originalWindow) {
            console.log('🚀 LOCALHOST MODE: Returning to browser immediately...');
            await this.sleep(50);
            
            // Use specific localhost URL return
            if (this.isBrowserApp(originalWindow.app) && originalLocalhostUrl) {
              await this.returnFocusToBrowserWithLocalhost(originalLocalhostUrl);
            } else {
              await this.returnFocusToApp(originalWindow.app);
            }
          }
          
          // Monitor for file changes (same for both modes)
          console.log('⏳ Waiting for file changes (60 second timeout)...');
          const changeDetected = await this.waitForFileChanges(60000);
          
          if (changeDetected) {
            console.log('✅ FILE CHANGES DETECTED! Command processed successfully.');
            console.log('🎯 Marking Composer as open and stopping retries...');
            this.composerIsOpen = true; // Mark Composer as successfully open
            this.hasInjectedBefore = true; // Mark that we've successfully injected at least once
            return true; // SUCCESS: Stop retrying this command
            
          } else {
            console.log(`❌ No file changes detected after 60 seconds using strategy: ${strategy}`);
            console.log(`🔄 Will try different strategy on attempt ${attemptCount + 1}...`);
            
            // If direct injection failed, mark Composer as possibly closed
            if (strategy === 'DIRECT_INJECT') {
              console.log('🚪 Marking Composer as possibly closed');
              this.composerIsOpen = false;
            }
            
            // For localhost mode: need to switch back to Cursor for retry
            if (isLocalhostMode) {
              console.log('🔄 Switching back to Cursor for retry...');
              await this.activateCursor();
              await this.sleep(300);
            }
            
            await this.sleep(1000); // Brief pause before retry
            // Continue to next iteration with different strategy
          }
          
        } else {
          console.log(`❌ Text injection failed with strategy: ${strategy}`);
          console.log('🔄 Will try different approach...');
          await this.sleep(2000);
          // Continue to next iteration
        }
        
      } catch (error) {
        console.error(`❌ Error in smart injection attempt ${attemptCount} (${strategy}):`, error);
        await this.sleep(2000);
        // Continue to next iteration
      }
    }
  }

  /**
   * Ensure Cursor is properly focused before sending keyboard shortcuts
   * This prevents Cmd+N from creating random email windows in Mail.app
   */
  private async ensureCursorFocus(): Promise<void> {
    try {
      console.log('🎯 Ensuring Cursor is focused...');
      
      // First activate Cursor
      await this.activateCursor();
      await this.sleep(100);
      
      // Verify focus by checking frontmost app
      const focusedApp = await this.getCurrentFocusedApp();
      
      if (focusedApp !== 'Cursor') {
        console.log(`⚠️  Focus check failed. Currently focused: ${focusedApp}. Retrying...`);
        await this.activateCursor();
        await this.sleep(200);
        
        // Second verification
        const secondCheck = await this.getCurrentFocusedApp();
        if (secondCheck !== 'Cursor') {
          console.log(`❌ Focus verification failed twice. Focused app: ${secondCheck}`);
        } else {
          console.log('✅ Cursor focus verified on second attempt');
        }
      } else {
        console.log('✅ Cursor focus verified');
      }
      
    } catch (error) {
      console.error('❌ Error ensuring Cursor focus:', error);
      // Fallback: try one more activation
      try {
        await this.activateCursor();
        await this.sleep(100);
      } catch (fallbackError) {
        console.error('❌ Fallback focus attempt failed:', fallbackError);
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
   * Enhanced file change detection for better reliability
   * Monitors actual file system changes and git status
   */
  private async waitForFileChanges(timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    const checkInterval = 2000; // Check every 2 seconds
    
    // Get initial state with multiple detection methods
    let initialGitStatus = '';
    let initialFileCount = 0;
    let initialIndexHtmlMtime = 0;
    
    try {
      const { stdout } = await execAsync('git status --porcelain');
      initialGitStatus = stdout.trim();
      
      // Count files in src directory
      const { stdout: fileList } = await execAsync('find src -type f | wc -l');
      initialFileCount = parseInt(fileList.trim());
      
      // Get index.html modification time as primary indicator
      const { stdout: statOutput } = await execAsync('stat -f "%m" src/web/index.html');
      initialIndexHtmlMtime = parseInt(statOutput.trim());
    } catch (error) {
      console.log('⚠️  Initial file state check failed, using simplified detection');
    }
    
    console.log(`🔍 Monitoring for file changes... (initial git status: ${initialGitStatus.length > 0 ? 'changes pending' : 'clean'})`);
    
    while (Date.now() - startTime < timeoutMs) {
      await this.sleep(checkInterval);
      
      try {
        // PRIMARY: Check index.html modification time (most reliable)
        const { stdout: statOutput } = await execAsync('stat -f "%m" src/web/index.html');
        const currentIndexHtmlMtime = parseInt(statOutput.trim());
        
        if (currentIndexHtmlMtime > initialIndexHtmlMtime) {
          console.log('📁 File modification time change detected!');
          console.log(`🔄 index.html modified: ${new Date(currentIndexHtmlMtime * 1000).toLocaleTimeString()}`);
          return true;
        }
        
        // SECONDARY: Check git status for NEW changes (improved detection)
        const { stdout: currentGitStatus } = await execAsync('git status --porcelain');
        const currentStatus = currentGitStatus.trim();
        
        // Count number of changed files rather than comparing strings
        const initialChangedFiles = initialGitStatus ? initialGitStatus.split('\n').length : 0;
        const currentChangedFiles = currentStatus ? currentStatus.split('\n').length : 0;
        
        if (currentChangedFiles > initialChangedFiles) {
          console.log('📁 New git changes detected!');
          console.log(`🔄 Changed files: ${initialChangedFiles} → ${currentChangedFiles}`);
          return true;
        }
        
        // TERTIARY: Check file count changes
        const { stdout: fileList } = await execAsync('find src -type f | wc -l');
        const currentFileCount = parseInt(fileList.trim());
        
        if (currentFileCount !== initialFileCount) {
          console.log(`📂 File count changed: ${initialFileCount} → ${currentFileCount}`);
          return true;
        }
        
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`⏳ Monitoring file changes... ${elapsed}s elapsed`);
        
      } catch (error) {
        // Fallback to simplified detection if git commands fail
        console.log('⚠️  File monitoring failed, using clipboard fallback');
        try {
          const { stdout } = await execAsync('pbpaste');
          // If clipboard has cursor-related content, consider it activity
          if (stdout.includes('cursor') || stdout.includes('edit') || stdout.includes('file')) {
            console.log('📋 Development activity detected via clipboard');
            return true;
          }
        } catch (clipError) {
          // Ignore clipboard errors
        }
      }
    }
    
    console.log('⏰ File change detection timeout reached');
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
  private async returnFocusToBrowserWithLocalhost(specificUrl?: string): Promise<boolean> {
    try {
      console.log(`🔍 Enhanced localhost browser return...`);
      if (specificUrl) {
        console.log(`🎯 Looking for specific URL: ${specificUrl}`);
      }
      
      // Try to find and activate a browser with localhost content
      const browsers = ['Google Chrome', 'Safari', 'Arc', 'Firefox', 'Brave Browser', 'Microsoft Edge'];
      
      for (const browser of browsers) {
        const success = await this.activateBrowserWithLocalhostEnhanced(browser, specificUrl);
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
  private async activateBrowserWithLocalhostEnhanced(browserName: string, specificUrl?: string): Promise<boolean> {
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
        let chromeScript = '';
        
        if (specificUrl) {
          // If specific URL provided, look for exact match first
          const port = specificUrl.split(':')[1] || '3000';
          chromeScript = `
            tell application "${browserName}"
              activate
              set foundTab to false
              -- First try exact match
              repeat with w in windows
                repeat with t in tabs of w
                  set tabUrl to URL of t
                  if tabUrl contains "${specificUrl}" or tabUrl contains ":${port}" then
                    set active tab index of w to index of t
                    set index of w to 1
                    set foundTab to true
                    exit repeat
                  end if
                end repeat
                if foundTab then exit repeat
              end repeat
              
              -- If not found, try generic localhost match
              if not foundTab then
                repeat with w in windows
                  repeat with t in tabs of w
                    set tabUrl to URL of t
                    set tabTitle to title of t
                    if tabUrl contains "localhost" or tabUrl contains "127.0.0.1" then
                      set active tab index of w to index of t
                      set index of w to 1
                      set foundTab to true
                      exit repeat
                    end if
                  end repeat
                  if foundTab then exit repeat
                end repeat
              end if
              
              return foundTab
            end tell
          `;
        } else {
          // Original generic localhost detection
          chromeScript = `
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
        }
        
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
        let safariScript = '';
        
        if (specificUrl) {
          // If specific URL provided, look for exact match first
          const port = specificUrl.split(':')[1] || '3000';
          safariScript = `
            tell application "${browserName}"
              activate
              set foundTab to false
              -- First try exact match
              repeat with w in windows
                repeat with t in tabs of w
                  set tabUrl to URL of t
                  if tabUrl contains "${specificUrl}" or tabUrl contains ":${port}" then
                    set current tab of w to t
                    set index of w to 1
                    set foundTab to true
                    exit repeat
                  end if
                end repeat
                if foundTab then exit repeat
              end repeat
              
              -- If not found, try generic localhost match
              if not foundTab then
                repeat with w in windows
                  repeat with t in tabs of w
                    set tabUrl to URL of t
                    set tabTitle to name of t
                    if tabUrl contains "localhost" or tabUrl contains "127.0.0.1" then
                      set current tab of w to t
                      set index of w to 1
                      set foundTab to true
                      exit repeat
                    end if
                  end repeat
                  if foundTab then exit repeat
                end repeat
              end if
              
              return foundTab
            end tell
          `;
        } else {
          // Original generic localhost detection
          safariScript = `
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
        }
        
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
   * Extract localhost URL from window title
   */
  private extractLocalhostUrl(title: string): string | null {
    // Try to extract localhost URL with port
    const patterns = [
      /localhost:(\d+)/i,
      /127\.0\.0\.1:(\d+)/i,
      /:(\d+).*localhost/i,
      /:(\d+).*VibeTalk/i
    ];
    
    for (const pattern of patterns) {
      const match = title.match(pattern);
      if (match && match[1]) {
        return `localhost:${match[1]}`;
      }
    }
    
    // If no port found but localhost is mentioned, assume 3000
    if (title.toLowerCase().includes('localhost') || title.toLowerCase().includes('vibetalk')) {
      return 'localhost:3000';
    }
    
    return null;
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