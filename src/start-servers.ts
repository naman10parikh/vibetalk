#!/usr/bin/env node

import { spawn } from 'child_process';
import * as path from 'path';

console.log('🚀 Starting VibeTalk Decoupled Architecture...');
console.log('='.repeat(50));

// Function to start a server
function startServer(name: string, scriptPath: string, env: NodeJS.ProcessEnv = {}) {
  console.log(`📡 Starting ${name}...`);
  
  const child = spawn('node', [scriptPath], {
    stdio: 'inherit',
    env: { ...process.env, ...env },
    cwd: path.join(__dirname, '..') // Set working directory to project root
  });
  
  child.on('error', (error) => {
    console.error(`❌ Failed to start ${name}:`, error);
  });
  
  child.on('exit', (code) => {
    if (code !== 0) {
      console.error(`❌ ${name} exited with code ${code}`);
    }
  });
  
  return child;
}

// Start all servers
async function startAllServers() {
  try {
    // 1. Start Audio Server (WebSocket: 3002, HTTP: 3003)
    console.log('\n🔊 Starting Audio Server...');
    const audioServer = startServer('Audio Server', path.join(__dirname, 'audio', 'audio-server.js'));
    
    // Wait a moment for audio server to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 2. Start Refresh Server (WebSocket: 3001, HTTP: 3000)
    console.log('\n🔄 Starting Refresh Server...');
    const refreshServer = startServer('Refresh Server', path.join(__dirname, 'web', 'refresh-server.js'));
    
    // Wait a moment for refresh server to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 3. Start Coordinator Server (WebSocket: 3004, HTTP: 3005)
    console.log('\n🎯 Starting Coordinator Server...');
    const coordinatorServer = startServer('Coordinator Server', path.join(__dirname, 'web', 'coordinator-server.js'), {
      COORDINATOR_PORT: '3004'
    });
    
    console.log('\n✅ All servers started successfully!');
    console.log('\n📋 Server Information:');
    console.log('   🔊 Audio Server:     http://localhost:3003 (WebSocket: ws://localhost:3002)');
    console.log('   🔄 Refresh Server:   http://localhost:3000 (WebSocket: ws://localhost:3001)');
    console.log('   🎯 Coordinator:      http://localhost:3005 (WebSocket: ws://localhost:3004)');
    console.log('\n🌐 Open your browser to: http://localhost:3000');
    console.log('\n💡 The audio assistant is now independent of page refreshes!');
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down servers...');
      audioServer.kill();
      refreshServer.kill();
      coordinatorServer.kill();
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      console.log('\n🛑 Shutting down servers...');
      audioServer.kill();
      refreshServer.kill();
      coordinatorServer.kill();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Failed to start servers:', error);
    process.exit(1);
  }
}

// Start the servers
startAllServers(); 