# 🎙️ Vibe Talk - Development Task List

## 🎯 Current Goal
Build a background service that lets you speak to localhost and auto-inject transcribed text into Cursor's Composer.

## 📋 Task Status
- ✅ Completed
- 🔄 In Progress  
- ⏳ Next Up
- 📝 Planned

---

## Phase 1: Research & Architecture ⏳

### 1.1 Research Cursor Integration
- ✅ Research how Cursor extensions work (VSCode-based?)
- ✅ Investigate Cursor Composer API/automation possibilities
- ✅ Test if Cursor can be automated via AppleScript/Accessibility APIs (macOS)
- ✅ Explore VS Code extension APIs that might work with Cursor

### 1.2 Architecture Decision
- ✅ Decide between: VSCode Extension vs Background Service vs Hybrid
- ✅ Choose text injection method (API vs system automation)
- ✅ Finalize tech stack based on research

**DECISION: Background Service + AppleScript Automation**
- Background Node.js service for audio recording and Whisper API
- AppleScript for text injection into Cursor Composer
- Global hotkeys for activation

---

## Phase 2: Core Infrastructure ✅

### 2.1 Project Setup
- ✅ Set up TypeScript configuration
- ✅ Create basic folder structure
- ✅ Install and configure dependencies
- ✅ Set up development scripts

### 2.2 Audio Recording System
- ✅ Implement basic audio recording (Node.js)
- ✅ Test microphone access and permissions 
- ✅ Create audio file handling (temp files)
- ✅ Add recording controls (start/stop)

### 2.3 Background Service
- ⏳ Create Node.js background service
- ⏳ Implement global hotkey detection
- ⏳ Add system tray/menu bar integration (macOS)
- ⏳ Test service startup and shutdown

---

## Phase 3: Speech-to-Text Integration 📝

### 3.1 OpenAI Whisper Setup
- ⏳ Set up OpenAI API integration
- ⏳ Implement audio file transcription
- ⏳ Add error handling for API calls
- ⏳ Test transcription accuracy

### 3.2 Audio Processing
- ⏳ Optimize audio format for Whisper
- ⏳ Add audio preprocessing (noise reduction?)
- ⏳ Implement chunking for long recordings
- ⏳ Add transcription caching

---

## Phase 4: Cursor Integration 📝

### 4.1 Text Injection Research
- ⏳ Test Cursor automation methods
- ⏳ Implement text injection mechanism
- ⏳ Add Cursor window detection
- ⏳ Test injection into Composer specifically

### 4.2 Workflow Integration
- ⏳ Implement complete voice → text → inject flow
- ⏳ Add status notifications
- ⏳ Test end-to-end workflow
- ⏳ Add error recovery

---

## Phase 5: User Experience 📝

### 5.1 Configuration
- ⏳ Create config file system
- ⏳ Add OpenAI API key management
- ⏳ Implement hotkey customization
- ⏳ Add settings UI (simple CLI or web interface)

### 5.2 Polish
- ⏳ Add loading indicators
- ⏳ Implement proper error messages
- ⏳ Add audio feedback (beeps, etc.)
- ⏳ Create simple documentation

---

## Phase 6: Testing & Deployment 📝

### 6.1 Testing
- ⏳ Create test scripts
- ⏳ Test on clean macOS environment
- ⏳ Performance testing (latency measurements)
- ⏳ Edge case testing (no internet, wrong API key, etc.)

### 6.2 Distribution
- ⏳ Create installation script
- ⏳ Package as macOS app/service
- ⏳ Write user documentation
- ⏳ Create demo video

---

## 🚀 MVP Definition

**Minimum Viable Product:**
1. Background service runs on macOS
2. Global hotkey (e.g., Cmd+Shift+V) starts recording
3. Audio gets transcribed via OpenAI Whisper
4. Transcribed text gets injected into active Cursor Composer
5. Simple configuration for API key

**Success Criteria:**
- ⏳ Record 10-second voice message
- ⏳ Transcribe with >90% accuracy
- ⏳ Inject into Cursor in <5 seconds total
- ⏳ Works without touching keyboard/mouse after hotkey

---

## 🔧 Technical Decisions Made

### Architecture: Background Service + System Automation
- **Why:** User wants global access, not just in-IDE interaction
- **How:** Node.js service + macOS Accessibility APIs or AppleScript

### Technology Stack:
- **Backend:** Node.js + TypeScript
- **Audio:** node-mic or similar for recording
- **Speech-to-Text:** OpenAI Whisper API
- **System Integration:** macOS Accessibility API or AppleScript
- **Hotkeys:** Global hotkey library (electron-globalshortcut or similar)

---

## 📝 Notes & Ideas

- Consider adding wake word support later
- Maybe add support for other editors (VS Code, etc.) in future
- Could add voice commands like "submit this", "clear composer"
- Potential for offline Whisper model for privacy

---

**Last Updated:** Initial creation
**Next Priority:** Research Cursor integration methods 