# 🎙️ VibeTalk Universal Widget

Add voice control to **ANY** localhost project with one line of code!

## 🚀 Quick Setup

1. **Start VibeTalk service:**
   ```bash
   export OPENAI_API_KEY="your_openai_api_key_here"
   npm run web
   ```

2. **Add widget to ANY localhost project:**
   
   Add this single line to your HTML:
   ```html
   <script src="http://localhost:3000/widget.js"></script>
   ```

3. **That's it!** 🎉

## ✨ What You Get

- **🎤 Floating microphone button** - Always accessible in bottom-right
- **⌨️  Global hotkey** - `Ctrl/Cmd + Shift + V` works anywhere
- **🔄 Auto-refresh** - Page refreshes automatically after changes
- **📱 Real-time status** - See transcription progress live
- **🎯 Focus preservation** - Stay on your localhost page

## 🎯 Perfect For

- **React localhost:3000** - "Add a red button component"
- **Vue localhost:8080** - "Change the navbar to blue"  
- **Next.js localhost:3000** - "Add error handling to this form"
- **Any web project** - Works with any localhost!

## 🔧 Example Usage

```html
<!DOCTYPE html>
<html>
<head>
    <title>My Awesome Project</title>
</head>
<body>
    <h1>My Project</h1>
    <!-- Your existing content -->
    
    <!-- Add VibeTalk with one line -->
    <script src="http://localhost:3000/widget.js"></script>
</body>
</html>
```

## 🎙️ How to Use

1. **Click the microphone** (or press `Ctrl/Cmd + Shift + V`)
2. **Speak your request**: *"Add a dark mode toggle to this page"*
3. **Click stop** (or press the hotkey again)
4. **Watch the magic**:
   - ✅ Audio transcribed with Whisper
   - ✅ Text sent to Cursor Composer
   - ✅ Cursor processes your request
   - ✅ Page automatically refreshes with changes!

## 🌟 Benefits

- **Never leave your localhost** - Stay focused on your project
- **Universal** - Works on ANY web project
- **Seamless** - No window switching or manual refreshing
- **Fast** - Voice to changes in seconds
- **Smart** - Preserves your focus and workflow

## 🔧 Advanced Configuration

The widget automatically connects to:
- **HTTP Server**: `localhost:3000` (web interface)
- **WebSocket**: `localhost:3001` (real-time communication)

## 🎯 Workflow Example

```
You're on: localhost:3000/my-react-app
↓
1. Click microphone 🎤
2. Say: "Add a loading spinner to the submit button"
3. Watch status updates in the widget
4. Page auto-refreshes with the new spinner!
↓
You're still on: localhost:3000/my-react-app (with changes applied)
```

## 🚀 Ready to Try?

```bash
# Terminal 1: Start VibeTalk
export OPENAI_API_KEY="your-key"
npm run web

# Terminal 2: Add to your project
echo '<script src="http://localhost:3000/widget.js"></script>' >> index.html

# Open your localhost and start speaking! 🎙️✨
```

---

**The future of coding is here - just speak and watch your ideas come to life!** 🎙️🚀 