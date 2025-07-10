# VibeTalk Decoupled Architecture

## 🎯 Problem Solved

The original VibeTalk implementation had a critical issue: **the audio assistant was tightly coupled to the localhost refresh functionality**. This caused a frustrating user experience where:

- ✅ **If localhost refreshed successfully** → Voice assistant got interrupted
- ✅ **If voice assistant could speak** → Localhost didn't get updated
- ❌ **Users couldn't have both** → Independent audio and refresh functionality

## 🏗️ New Architecture: Three Independent Services

### 1. 🔊 Audio Server (Port 3002)
**Purpose**: Handles all speech synthesis and audio playback independently
- **WebSocket Server**: `ws://localhost:3002`
- **HTTP Server**: `http://localhost:3003` (for serving audio files)
- **Responsibilities**:
  - Text-to-speech generation
  - Audio queue management
  - Session-based audio tracking
  - Independent audio playback

### 2. 🔄 Refresh Server (Port 3001)
**Purpose**: Handles file change detection and page refresh coordination
- **WebSocket Server**: `ws://localhost:3001`
- **HTTP Server**: `http://localhost:3000` (main page)
- **Responsibilities**:
  - File change monitoring
  - Page refresh coordination
  - Minimal refresh signals
  - No audio interference

### 3. 🎯 Coordinator Server (Port 3003)
**Purpose**: Orchestrates voice commands and coordinates between services
- **WebSocket Server**: `ws://localhost:3003`
- **HTTP Server**: `http://localhost:3004` (status endpoint)
- **Responsibilities**:
  - Voice command processing
  - Audio recording and transcription
  - Cursor automation
  - Service coordination

## 🚀 How to Use

### Quick Start
```bash
# Start all three servers
npm run start-decoupled

# Or start individual servers
npm run audio-server
npm run refresh-server  
npm run coordinator-server
```

### Test the Architecture
```bash
# Run comprehensive tests
npm run test-decoupled
```

## 🎉 Key Benefits

### ✅ True Independence
- **Audio assistant works regardless of file changes**
- **Page refreshes don't interrupt speech**
- **Each service handles its own responsibilities**

### ✅ Better User Experience
- **Uninterrupted audio feedback**
- **Smooth page updates**
- **No more frustrating interruptions**

### ✅ Scalable Architecture
- **Can work on any website, not just localhost**
- **Easy to extend with new features**
- **Robust error handling per service**

### ✅ Future-Ready
- **Perfect foundation for Cursor extension**
- **Independent services can be deployed separately**
- **Easy to add new audio or refresh features**

## 🔧 Technical Implementation

### Frontend Widget
The widget now connects to **three separate WebSocket servers**:

```javascript
// Audio connection (port 3002)
audioWs = new WebSocket('ws://localhost:3002');

// Refresh connection (port 3001)  
refreshWs = new WebSocket('ws://localhost:3001');

// Coordinator connection (port 3003)
coordinatorWs = new WebSocket('ws://localhost:3003');
```

### Smart Refresh Coordination
The refresh server now **respects audio playback**:

```javascript
// Only refresh if no audio is playing
if (!isPlayingAudio && audioQueue.length === 0) {
  location.reload(); // Immediate refresh
} else {
  // Wait for audio to finish, then refresh
  setTimeout(() => {
    if (!isPlayingAudio && audioQueue.length === 0) {
      location.reload();
    }
  }, 3000);
}
```

### Audio Persistence
Audio sessions persist across page reloads:

```javascript
// Audio server maintains session state
const session = {
  id: sessionId,
  queue: [], // Audio queue
  isPlaying: false,
  currentAudio: null,
  createdAt: Date.now()
};
```

## 🧪 Testing

The architecture includes comprehensive tests:

```bash
npm run test-decoupled
```

Tests verify:
- ✅ All three servers connect successfully
- ✅ Audio works independently of refresh
- ✅ Refresh works independently of audio  
- ✅ Coordination between services works
- ✅ No interference between services

## 🎯 Perfect for Cursor Extension

This architecture is **perfectly suited** for a Cursor extension because:

1. **Independent Services**: Each service can be deployed separately
2. **WebSocket Communication**: Lightweight, real-time communication
3. **Session Management**: Robust audio session handling
4. **Error Isolation**: One service failure doesn't break others
5. **Scalable**: Easy to add new features or services

## 🔮 Future Enhancements

With this foundation, we can easily add:

- **Multiple audio voices**
- **Audio preferences per user**
- **Advanced file change detection**
- **Real-time collaboration features**
- **Plugin system for different editors**

## 📊 Performance Benefits

- **Reduced latency**: Each service optimized for its purpose
- **Better resource usage**: Services only load what they need
- **Improved reliability**: Service failures are isolated
- **Enhanced scalability**: Services can be scaled independently

---

**The decoupled architecture solves the core problem and provides a solid foundation for the future VibeTalk Cursor extension!** 🎉 