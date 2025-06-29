# 🚀 Vibe Talk Setup Guide

Follow these steps to get Vibe Talk working on your macOS system.

## ✅ Current Status

After following the setup, you'll have:
- ✅ **Cursor Automation**: Working perfectly
- ✅ **Audio Recording**: Working perfectly (sox installed)  
- ⏳ **Permissions**: Need to configure macOS permissions
- ⏳ **API Key**: Need to set up OpenAI API key

## 📋 Prerequisites

1. **Cursor IDE** - Make sure Cursor is installed and running
2. **OpenAI API Key** - Get one from [OpenAI Platform](https://platform.openai.com/api-keys)
3. **macOS permissions** - We'll configure these below

## 🔧 Step 1: Install Dependencies

The dependencies are already installed if you've cloned this repo:

```bash
npm install
```

## 🔑 Step 2: Set up OpenAI API Key

Set your OpenAI API key as an environment variable:

```bash
export OPENAI_API_KEY="your_openai_api_key_here"
```

To make this permanent, add it to your shell profile:

```bash
echo 'export OPENAI_API_KEY="your_openai_api_key_here"' >> ~/.zshrc
source ~/.zshrc
```

## 🔒 Step 3: Configure macOS Permissions

### Enable Accessibility Access

1. Open **System Preferences** → **Security & Privacy** → **Privacy**
2. Click **Accessibility** in the left sidebar
3. Click the lock icon and enter your password
4. Add **Terminal** (or your terminal app) to the list
5. Make sure the checkbox next to Terminal is checked

### Enable Input Monitoring (if needed)

1. In the same **Security & Privacy** window
2. Click **Input Monitoring** in the left sidebar  
3. Add **Terminal** to the list and check the box

### Enable Microphone Access

1. Click **Microphone** in the left sidebar
2. Add **Terminal** to the list and check the box

## 🧪 Step 4: Test the Components

Run our test suite to verify everything works:

```bash
npm test
```

You should see:
- ✅ Configuration (if API key is set)
- ✅ Cursor Automation  
- ✅ Audio Recording
- ✅ API Key (if configured)

## 🎬 Step 5: Test the Demo

With Cursor open, run the demo to test text injection:

```bash
npm run demo
```

This will:
1. Check if Cursor is running
2. Activate Cursor
3. Try to open Composer (Cmd+I)
4. Inject test text into Composer

## 🚀 Step 6: Run Vibe Talk

Once everything is configured:

```bash
npm start
```

## ⌨️ Usage

1. **Start Vibe Talk**: `npm start`
2. **Voice Recording**: Press Cmd+Shift+V (or your configured hotkey)
3. **Speak**: Say your prompt clearly
4. **Stop**: Press Cmd+Shift+V again to stop and transcribe
5. **Magic**: Watch your speech appear in Cursor Composer!

## 🔧 Troubleshooting

### "osascript is not allowed to send keystrokes"
- Grant Terminal accessibility access in System Preferences

### "No recording tools found"
- Install sox: `brew install sox`

### "API key not found"
- Set your OpenAI API key: `export OPENAI_API_KEY="your-key"`

### Recording is silent/empty
- Grant microphone access to Terminal in System Preferences
- Check your system's default audio input device

### Text not appearing in Cursor
- Make sure Cursor is active and Composer is open
- Try clicking in the Composer text area first
- Check that accessibility permissions are granted

## 🎯 Success Criteria

When everything is working, you should be able to:

1. ✅ Run `npm test` with all green checkmarks
2. ✅ Run `npm run demo` and see text appear in Cursor
3. ✅ Record voice for 5+ seconds and get a transcript
4. ✅ Have that transcript automatically appear in Cursor Composer

## 💡 Tips

- **Speak clearly** for better transcription accuracy
- **Use a good microphone** if available
- **Test with short phrases** first
- **Keep Cursor's Composer open** for best results

## 🆘 Need Help?

If you're still having issues:

1. Check the error messages carefully
2. Verify all permissions are granted
3. Try the manual test: `sox -t coreaudio default test.wav trim 0 3`
4. Open an issue on GitHub with error details

---

**Built with ❤️ for the Cursor community** 