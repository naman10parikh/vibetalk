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
   * Inject text into the active text field (assumed to be Composer)
   * This method tries multiple strategies for text injection
   */
  async injectText(text: string, autoSubmit: boolean = true): Promise<boolean> {
    try {
      // First, activate Cursor
      await this.activateCursor();
      
      // Wait a moment for activation
      await this.sleep(500);

      // Strategy 1: Try to use direct keystroke simulation
      const success1 = await this.injectViaKeystroke(text);
      if (success1) {
        if (autoSubmit) await this.submitToComposer();
        return true;
      }

      // Strategy 2: Try to use clipboard and paste
      const success2 = await this.injectViaClipboard(text);
      if (success2) {
        if (autoSubmit) await this.submitToComposer();
        return true;
      }

      // Strategy 3: Try to find Composer UI element specifically
      const success3 = await this.injectViaUIElement(text);
      if (success3) {
        if (autoSubmit) await this.submitToComposer();
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error injecting text:', error);
      return false;
    }
  }

  /**
   * Strategy 1: Direct keystroke simulation
   */
  private async injectViaKeystroke(text: string): Promise<boolean> {
    try {
      // Escape any special characters in the text
      const escapedText = text.replace(/'/g, "\\'").replace(/"/g, '\\"');
      
      const script = `
        tell application "System Events"
          tell process "Cursor"
            keystroke "${escapedText}"
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
   * Strategy 2: Clipboard-based injection
   */
  private async injectViaClipboard(text: string): Promise<boolean> {
    try {
      // Set clipboard content
      const setClipboardScript = `
        tell application "System Events"
          set the clipboard to "${text.replace(/"/g, '\\"')}"
        end tell
      `;
      
      await execAsync(`osascript -e '${setClipboardScript}'`);
      
      // Wait a moment
      await this.sleep(100);
      
      // Paste via Cmd+V
      const pasteScript = `
        tell application "System Events"
          tell process "Cursor"
            keystroke "v" using command down
          end tell
        end tell
      `;
      
      await execAsync(`osascript -e '${pasteScript}'`);
      return true;
    } catch (error) {
      console.log('Clipboard injection failed:', error);
      return false;
    }
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