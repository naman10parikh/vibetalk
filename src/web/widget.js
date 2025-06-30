/**
 * VibeTalk Universal Widget
 * 
 * Embed this script on any localhost project to add voice control functionality.
 * 
 * Usage:
 * <script src="http://localhost:3000/widget.js"></script>
 * 
 * Or include this script directly in your HTML.
 */

(function() {
    'use strict';
    
    // Configuration
    const WEBSOCKET_URL = 'ws://localhost:3001';
    const WIDGET_ID = 'vibetalk-widget';
    
    // Check if widget already exists
    if (document.getElementById(WIDGET_ID)) {
        console.log('VibeTalk widget already loaded');
        return;
    }
    
    class VibeTalkWidget {
        constructor() {
            this.ws = null;
            this.mediaRecorder = null;
            this.audioChunks = [];
            this.isRecording = false;
            this.isProcessing = false;
            this.isReconnecting = false;
            this.connectionAttempts = 0;
            this.heartbeatInterval = null;
            this.widget = null;
            this.statusEl = null;
            this.micBtn = null;
            
            this.createWidget();
            this.connectWebSocket();
            this.setupEventListeners();
            this.setupCleanup();
        }
        
        createWidget() {
            // Create floating widget container
            this.widget = document.createElement('div');
            this.widget.id = WIDGET_ID;
            this.widget.innerHTML = `
                <div class="vibetalk-container">
                    <div class="vibetalk-status" id="vibetalk-status">Ready</div>
                    <button class="vibetalk-mic-btn" id="vibetalk-mic-btn">
                        <svg class="vibetalk-mic-icon" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 1c-1.66 0-3 1.34-3 3v6c0 1.66 1.34 3 3 3s3-1.34 3-3V4c0-1.66-1.34-3-3-3z"/>
                            <path d="M19 10v2c0 3.87-3.13 7-7 7s-7-3.13-7-7v-2c0-.55-.45-1-1-1s-1 .45-1 1v2c0 4.72 3.61 8.6 8.23 8.96v2.79c0 .55.45 1 1 1s1-.45 1-1v-2.79C18.39 20.6 22 16.72 22 12v-2c0-.55-.45-1-1-1s-1 .45-1 1z"/>
                        </svg>
                    </button>
                </div>
            `;
            
            // Add CSS styles
            const styles = document.createElement('style');
            styles.textContent = `
                #vibetalk-widget {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    z-index: 10000;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }
                
                .vibetalk-container {
                    background: rgba(0, 0, 0, 0.8);
                    backdrop-filter: blur(10px);
                    border-radius: 15px;
                    padding: 15px;
                    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    min-width: 250px;
                    max-width: 300px;
                    text-align: center;
                }
                
                .vibetalk-status {
                    color: white;
                    font-size: 13px;
                    margin-bottom: 10px;
                    opacity: 0.9;
                    font-weight: 500;
                    line-height: 1.4;
                    min-height: 18px;
                    word-wrap: break-word;
                    transition: all 0.3s ease;
                }
                
                .vibetalk-mic-btn {
                    background: linear-gradient(135deg, #10b981, #059669);
                    border: none;
                    border-radius: 50%;
                    width: 60px;
                    height: 60px;
                    color: white;
                    font-size: 1.5rem;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto;
                }
                
                .vibetalk-mic-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4);
                }
                
                .vibetalk-mic-btn:hover .vibetalk-mic-icon {
                    transform: scale(1.1);
                }
                
                .vibetalk-mic-btn.recording {
                    background: linear-gradient(135deg, #ef4444, #dc2626);
                    box-shadow: 0 4px 15px rgba(239, 68, 68, 0.3);
                    animation: vibetalk-pulse 1.5s infinite;
                }
                
                .vibetalk-mic-btn.processing {
                    background: linear-gradient(135deg, #f59e0b, #d97706);
                    box-shadow: 0 4px 15px rgba(245, 158, 11, 0.3);
                    cursor: not-allowed;
                }
                
                .vibetalk-status.connected {
                    color: #22c55e;
                }
                
                .vibetalk-status.disconnected {
                    color: #ef4444;
                }
                
                .vibetalk-status.recording {
                    color: #ef4444;
                    animation: vibetalk-pulse-text 1.5s infinite;
                }
                
                .vibetalk-status.processing {
                    color: #f59e0b;
                }
                
                .vibetalk-status.success {
                    color: #22c55e;
                    font-weight: 600;
                }
                
                .vibetalk-status.refresh {
                    color: #3b82f6;
                    font-weight: 600;
                    animation: vibetalk-pulse-text 1s infinite;
                }
                
                .vibetalk-status.error {
                    color: #ef4444;
                    font-weight: 600;
                }
                
                .vibetalk-mic-icon {
                    width: 24px;
                    height: 24px;
                    transition: transform 0.2s ease;
                }
                
                @keyframes vibetalk-pulse {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                    100% { transform: scale(1); }
                }
                
                @keyframes vibetalk-pulse-text {
                    0% { opacity: 1; }
                    50% { opacity: 0.6; }
                    100% { opacity: 1; }
                }
            `;
            
            // Add styles to head
            document.head.appendChild(styles);
            
            // Add widget to body
            document.body.appendChild(this.widget);
            
            // Get element references
            this.statusEl = document.getElementById('vibetalk-status');
            this.micBtn = document.getElementById('vibetalk-mic-btn');
        }
        
        setupEventListeners() {
            this.micBtn.addEventListener('click', () => {
                if (this.isProcessing) return;
                
                if (this.isRecording) {
                    this.stopRecording();
                } else {
                    this.startRecording();
                }
            });
            
            // Add keyboard shortcut (Ctrl/Cmd + Shift + V)
            document.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'V') {
                    e.preventDefault();
                    if (!this.isProcessing) {
                        if (this.isRecording) {
                            this.stopRecording();
                        } else {
                            this.startRecording();
                        }
                    }
                }
            });
        }
        
        connectWebSocket() {
            try {
                this.ws = new WebSocket(WEBSOCKET_URL);
                this.isReconnecting = false;
                this.connectionAttempts = 0;
                
                this.ws.onopen = () => {
                    console.log('🔗 VibeTalk widget connected');
                    this.updateStatus('🎙️ Ready to record', 'connected');
                    this.connectionAttempts = 0;
                    this.setupHeartbeat();
                };
                
                this.ws.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    this.handleServerMessage(data);
                };
                
                this.ws.onclose = (event) => {
                    console.log('❌ VibeTalk widget disconnected:', event.code, event.reason);
                    this.updateStatus('❌ Disconnected', 'disconnected');
                    this.clearHeartbeat();
                    
                    // Only attempt reconnection if not processing and not a deliberate close
                    if (!this.isProcessing && !this.isRecording && event.code !== 1000) {
                        this.attemptReconnection();
                    }
                };
                
                this.ws.onerror = (error) => {
                    console.error('VibeTalk WebSocket error:', error);
                    this.updateStatus('❌ Connection Error', 'disconnected');
                };
            } catch (error) {
                console.error('Failed to connect to VibeTalk service:', error);
                this.updateStatus('❌ Service Unavailable', 'disconnected');
                this.attemptReconnection();
            }
        }
        
        setupHeartbeat() {
            // Clear any existing heartbeat
            this.clearHeartbeat();
            
            // Send ping every 25 seconds (before server's 30-second timeout)
            this.heartbeatInterval = setInterval(() => {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({ type: 'ping' }));
                }
            }, 25000);
        }
        
        clearHeartbeat() {
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
                this.heartbeatInterval = null;
            }
        }
        
        attemptReconnection() {
            if (this.isReconnecting) return;
            
            this.isReconnecting = true;
            this.connectionAttempts++;
            
            // Exponential backoff: 2s, 4s, 8s, 16s, then 30s max
            const delay = Math.min(2000 * Math.pow(2, this.connectionAttempts - 1), 30000);
            
            console.log(`🔄 Attempting reconnection in ${delay/1000}s (attempt ${this.connectionAttempts})`);
            this.updateStatus(`🔄 Reconnecting in ${Math.ceil(delay/1000)}s...`, 'disconnected');
            
            setTimeout(() => {
                if (!this.isProcessing && !this.isRecording) {
                    console.log(`🔄 Reconnection attempt ${this.connectionAttempts}`);
                    this.connectWebSocket();
                }
                this.isReconnecting = false;
            }, delay);
        }
        
        async startRecording() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    audio: {
                        sampleRate: 16000,
                        channelCount: 1,
                        echoCancellation: true,
                        noiseSuppression: true
                    } 
                });

                this.mediaRecorder = new MediaRecorder(stream, {
                    mimeType: 'audio/webm;codecs=opus'
                });
                
                this.audioChunks = [];
                
                this.mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        this.audioChunks.push(event.data);
                    }
                };

                this.mediaRecorder.onstop = () => {
                    const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                    this.sendAudioToServer(audioBlob);
                    stream.getTracks().forEach(track => track.stop());
                };

                this.mediaRecorder.start();
                this.setRecordingState(true);
                
                console.log('🎤 VibeTalk recording started...');
                
            } catch (error) {
                console.error('Error starting recording:', error);
                this.updateStatus('❌ Mic Access Denied', 'disconnected');
            }
        }
        
        stopRecording() {
            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                this.mediaRecorder.stop();
                this.setRecordingState(false);
                this.setProcessingState(true);
                console.log('⏹️ VibeTalk recording stopped, processing...');
            }
        }
        
        setupCleanup() {
            // Clean up resources when page is about to unload
            window.addEventListener('beforeunload', () => {
                this.clearHeartbeat();
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.close(1000, 'Page unload');
                }
            });
            
            // Handle visibility changes to manage connections
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    // Page is hidden - reduce activity but keep connection
                    console.log('📱 Page hidden - maintaining connection');
                } else {
                    // Page is visible - ensure connection is healthy
                    console.log('📱 Page visible - checking connection');
                    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                        if (!this.isReconnecting && !this.isProcessing && !this.isRecording) {
                            this.connectWebSocket();
                        }
                    }
                }
            });
        }
        
        isWebSocketReady() {
            return this.ws && this.ws.readyState === WebSocket.OPEN && !this.isReconnecting;
        }
        
        async sendAudioToServer(audioBlob) {
            // Validate connection before attempting to send
            if (!this.isWebSocketReady()) {
                console.error('❌ WebSocket not ready for audio transmission');
                this.updateStatus('❌ Connection not ready', 'error');
                this.setProcessingState(false);
                
                // Try to reconnect
                if (!this.isReconnecting) {
                    this.attemptReconnection();
                }
                return;
            }

            try {
                console.log('📤 Sending audio to server...');
                const arrayBuffer = await audioBlob.arrayBuffer();
                const audioData = new Uint8Array(arrayBuffer);
                
                // Double-check connection before sending
                if (!this.isWebSocketReady()) {
                    throw new Error('WebSocket connection lost during audio preparation');
                }
                
                this.ws.send(JSON.stringify({
                    type: 'audio',
                    data: Array.from(audioData),
                    mimeType: audioBlob.type,
                    timestamp: Date.now()
                }));
                
                console.log('✅ Audio data sent successfully');
                
            } catch (error) {
                console.error('❌ Error sending audio:', error);
                this.updateStatus('❌ Failed to send audio', 'error');
                this.setProcessingState(false);
                
                // Try to reconnect on send failure
                if (!this.isReconnecting) {
                    this.attemptReconnection();
                }
            }
        }
        
        handleServerMessage(data) {
            console.log('📨 Received message:', data.type, data.processId || '');
            
            switch (data.type) {
                case 'pong':
                    // Heartbeat response - connection is alive
                    break;
                case 'status':
                    this.updateStatus(data.message, 'processing');
                    break;
                case 'transcription':
                    // Show the transcription briefly, then show next step
                    this.updateStatus(data.message || `📝 "${data.text}"`, 'processing');
                    break;
                case 'injection':
                    this.updateStatus(data.message || '💬 Sending to Cursor...', 'processing');
                    break;
                case 'success':
                    this.updateStatus(data.message || '✅ Success!', 'success');
                    break;
                case 'processing':
                    this.updateStatus(data.message || '⚙️ Processing...', 'processing');
                    break;
                case 'refresh':
                    this.updateStatus(data.message || '🔄 Preparing to refresh...', 'refresh');
                    // Don't set processing to false yet - wait for refresh-now
                    break;
                case 'refresh-now':
                    this.updateStatus(data.message || '🔄 Refreshing now...', 'refresh');
                    this.setProcessingState(false);
                    // Close WebSocket gracefully before refresh
                    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                        this.ws.close(1000, 'Page refresh');
                    }
                    // Refresh the page after a short delay
                    setTimeout(() => {
                        window.location.reload();
                    }, 500);
                    break;
                case 'error':
                    this.updateStatus(data.message || '❌ Error occurred', 'error');
                    this.setProcessingState(false);
                    // Reset to ready state after showing error
                    setTimeout(() => {
                        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                            this.updateStatus('🎙️ Ready to record', 'connected');
                        }
                    }, 3000);
                    break;
            }
        }
        
        setRecordingState(recording) {
            this.isRecording = recording;
            
            if (recording) {
                this.micBtn.classList.add('recording');
                this.updateStatus('🔴 Recording... (click to stop)', 'recording');
            } else {
                this.micBtn.classList.remove('recording');
                // Don't update status here, let the server messages handle it
            }
        }
        
        setProcessingState(processing) {
            this.isProcessing = processing;
            
            if (processing) {
                this.micBtn.classList.add('processing');
                // Status will be updated by server messages
            } else {
                this.micBtn.classList.remove('processing');
                // Reset to ready state if not recording
                if (!this.isRecording) {
                    setTimeout(() => {
                        this.updateStatus('🎙️ Ready to record', 'connected');
                    }, 1000);
                }
            }
        }
        
        updateStatus(message, className) {
            if (this.statusEl) {
                this.statusEl.textContent = message;
                this.statusEl.className = `vibetalk-status ${className}`;
                console.log(`📊 Status: ${message} (${className})`);
            }
        }
    }
    
    // Initialize widget when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            new VibeTalkWidget();
        });
    } else {
        new VibeTalkWidget();
    }
    
    console.log('🎙️ VibeTalk Universal Widget loaded!');
    console.log('💡 Use Ctrl/Cmd + Shift + V or click the microphone button');
    
})(); 