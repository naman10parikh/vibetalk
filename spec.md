# Vibe Talk - Voice-to-Cursor Extension

## Overview
Vibe Talk is a Cursor extension that enables seamless voice interaction with Cursor's Composer. Instead of typing prompts, users can simply speak their requests, which are automatically transcribed and injected into the Composer window.

## Core Concept
Transform the current workflow:
- **Current**: Think → Type in Composer → Submit
- **With Vibe Talk**: Think → Speak → Auto-submit (optional)

## Key Features

### MVP Features
1. **Voice Recording**: Click-to-record functionality within Cursor
2. **Speech-to-Text**: OpenAI Whisper integration for accurate transcription
3. **Auto-Injection**: Seamlessly inject transcribed text into Cursor Composer
4. **One-Click Activation**: Simple button/shortcut to start voice input

### Future Enhancements
- **Auto-Submit**: Option to automatically submit after transcription
- **Voice Commands**: Special commands like "cancel", "submit", "clear"
- **Multi-language Support**: Support for different languages via Whisper
- **Custom Wake Words**: Hands-free activation
- **Voice Feedback**: Text-to-speech responses

## Technical Architecture

### Extension Type
**Cursor Extension** (preferred over standalone app for better integration)

### Core Components
1. **Frontend (Extension UI)**
   - Recording button/indicator
   - Status display (recording, processing, etc.)
   - Settings panel

2. **Backend (Local Server)**
   - Audio capture and processing
   - Whisper API integration
   - Audio file management

3. **Integration Layer**
   - Cursor API interaction
   - Composer text injection
   - Extension lifecycle management

### Technology Stack
- **Extension Framework**: Cursor Extension API
- **Audio Processing**: Web Audio API / MediaRecorder
- **Speech-to-Text**: OpenAI Whisper API
- **Backend**: Node.js/TypeScript
- **UI**: HTML/CSS/JavaScript (Extension popup)

## Implementation Plan

### Phase 1: Basic Infrastructure
- [ ] Set up Cursor extension boilerplate
- [ ] Implement basic audio recording
- [ ] Create local development server
- [ ] Test audio capture and basic UI

### Phase 2: Whisper Integration
- [ ] Integrate OpenAI Whisper API
- [ ] Implement audio file handling
- [ ] Add transcription functionality
- [ ] Test end-to-end transcription

### Phase 3: Cursor Integration
- [ ] Research Cursor Composer API
- [ ] Implement text injection into Composer
- [ ] Add extension activation methods
- [ ] Test complete workflow

### Phase 4: Polish & UX
- [ ] Add loading states and error handling
- [ ] Implement settings/configuration
- [ ] Add keyboard shortcuts
- [ ] User testing and refinement

## User Experience Flow

1. **Activation**: User clicks Vibe Talk button in Cursor or uses keyboard shortcut
2. **Recording**: Extension shows recording indicator, starts capturing audio
3. **Processing**: Audio sent to Whisper, shows "transcribing..." status
4. **Injection**: Transcribed text appears in Cursor Composer
5. **Review**: User can edit before submitting (or auto-submit if enabled)

## Technical Requirements

### Dependencies
- OpenAI API access (for Whisper)
- Cursor Extension development environment
- Node.js for local server
- Audio recording permissions

### API Usage
- **OpenAI Whisper**: For speech-to-text transcription
- **Cursor Extension API**: For UI integration and text injection
- **Web Audio API**: For audio capture

### Security Considerations
- Audio data handling (temporary files, cleanup)
- API key management
- Local-only audio processing when possible

## Success Metrics
- **Primary**: Successful voice-to-text-to-Composer workflow
- **Secondary**: User adoption and positive feedback
- **Technical**: Low latency (<3 seconds transcription)
- **UX**: Intuitive, one-click operation

## Constraints & Limitations
- **Scope**: Keep initial version simple and focused
- **Platform**: macOS initially (user's current setup)
- **Network**: Requires internet for Whisper API
- **Performance**: Optimize for quick transcription

## Development Philosophy
- **Simplicity First**: Minimal viable product approach
- **User-Centric**: Solve the specific pain point efficiently
- **Iterative**: Build, test, refine based on usage
- **Open Source**: Consider making it available to the community

---

*This spec will evolve as we learn more about Cursor's extension capabilities and user needs.* 