import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import GUI from 'lil-gui';

// Core systems
import { AgentManager } from './AgentManager';
import { GridSystem } from './GridSystem';
import { FilesystemVisualizer } from './FilesystemVisualizer';
import { WebSocketClient } from './WebSocketClient';

// Mode system
import { ModeManager, AppMode } from './modes/ModeManager';
import { ModeContext } from './modes/Mode';
import { AutomaticMode } from './modes/AutomaticMode';
import { UserMode } from './modes/UserMode';
import { DeveloperMode } from './modes/DeveloperMode';

// Camera system
import { CameraController } from './camera/CameraController';

// Event system
import { eventBus, Events } from './utils/EventBus';

// Types
import { 
  StatusResponse,
  AgentCreatedEvent,
  AgentStateChangedEvent,
  AgentThinkingEvent,
  FileActivityEvent
} from './types';

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000511);
scene.fog = new THREE.Fog(0x000511, 100, 400);

// Camera
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(50, 50, 50);
camera.lookAt(0, 0, 0);

// Renderer
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

// Post-processing for glow effects
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.5, // strength
  0.4, // radius
  0.85 // threshold
);
composer.addPass(bloomPass);

// Initialize camera controller
const cameraController = new CameraController(camera, renderer);

// GUI Setup
const gui = new GUI();

// Lighting
const ambientLight = new THREE.AmbientLight(0x0080ff, 0.1);
scene.add(ambientLight);

// Grid system (the Tron floor) - infinite LOD grid
const gridSystem = new GridSystem();
gridSystem.setCamera(camera);
scene.add(gridSystem.mesh);

// Filesystem visualization
const filesystemViz = new FilesystemVisualizer(scene);

// Agent manager (using Cyber terminology)
const agentManager = new AgentManager(scene);

// Set filesystem visualizer reference for location-based positioning
agentManager.setFilesystemVisualizer(filesystemViz);

// WebSocket connection
const wsClient = new WebSocketClient('ws://localhost:8888/ws');

// Create mode context
const modeContext: ModeContext = {
  scene,
  camera,
  renderer,
  cameraController,
  agentManager,
  filesystemViz,
  gridSystem,
  wsClient,
  gui
};

// Initialize mode manager and register modes
const modeManager = new ModeManager(modeContext);
modeManager.registerMode(AppMode.AUTOMATIC, new AutomaticMode(modeContext));
modeManager.registerMode(AppMode.USER, new UserMode(modeContext));
modeManager.registerMode(AppMode.DEVELOPER, new DeveloperMode(modeContext));

// Handle WebSocket events
wsClient.on('agent_created', (data: AgentCreatedEvent) => {
  agentManager.addAgent(data.name, {
    type: data.cyber_type || 'general',
    state: 'idle',
    premium: (data.config as any)?.use_premium || false,
    current_location: (data as any).current_location
  });
  updateAgentCount();
  
  // Emit event for modes to handle
  eventBus.emit(Events.CYBER_ACTIVITY, { 
    cyber: data.name, 
    type: 'created' 
  });
});

wsClient.on('agent_terminated', (data: any) => {
  agentManager.removeAgent(data.name);
  updateAgentCount();
  
  eventBus.emit(Events.CYBER_ACTIVITY, { 
    cyber: data.name, 
    type: 'terminated' 
  });
});

wsClient.on('agent_state_changed', (data: AgentStateChangedEvent) => {
  agentManager.updateAgentState(data.name, data.new_state);
  
  eventBus.emit(Events.CYBER_ACTIVITY, { 
    cyber: data.name, 
    type: 'state_changed',
    state: data.new_state 
  });
});

wsClient.on('file_activity', (data: FileActivityEvent) => {
  // Pulse the directory tower when files are accessed
  if (data.path) {
    console.log('File activity detected:', data.path);
    filesystemViz.pulseDirectory(data.path);
    
    // If activity level is provided, update it
    if (data.activity_level !== undefined) {
      filesystemViz.updateDirectoryActivity(data.path, data.activity_level);
    }
    
    eventBus.emit(Events.CYBER_ACTIVITY, { 
      cyber: (data as any).cyber,
      type: 'file_activity',
      path: data.path 
    });
  }
});

wsClient.on('agent_thinking', (data: AgentThinkingEvent) => {
  // Show thought bubble above agent
  if (data.name && data.thought) {
    const thoughtText = data.token_count ? 
      `${data.thought} (${data.token_count} tokens)` : 
      data.thought;
    console.log(`Agent ${data.name} thinking: ${thoughtText}`);
    agentManager.showThought(data.name, thoughtText);
    
    eventBus.emit(Events.CYBER_ACTIVITY, { 
      cyber: data.name, 
      type: 'thinking',
      thought: thoughtText 
    });
  }
});

// Handle agent location changes
wsClient.on('agent_location_changed', (data: any) => {
  if (data.name && data.new_location) {
    console.log(`Agent ${data.name} moved to: ${data.new_location}`);
    agentManager.updateAgentLocation(data.name, data.new_location);
    
    eventBus.emit(Events.CYBER_ACTIVITY, { 
      cyber: data.name, 
      type: 'location_changed',
      location: data.new_location 
    });
  }
});

// Handle status updates that might include location changes
wsClient.on('status_update', (data: any) => {
  if (data.Cybers) {
    Object.entries(data.Cybers).forEach(([name, cyberData]: [string, any]) => {
      // Check if location has changed
      const agent = agentManager.getAgentData(name);
      if (agent && cyberData.current_location && agent.currentLocation !== cyberData.current_location) {
        console.log(`Agent ${name} location updated to: ${cyberData.current_location}`);
        agentManager.updateAgentLocation(name, cyberData.current_location);
      }
      
      // Update other properties
      if (cyberData.state && agent && agent.state !== cyberData.state.toLowerCase()) {
        agentManager.updateAgentState(name, cyberData.state.toLowerCase());
      }
    });
  }
});

wsClient.on('connected', () => {
  updateConnectionStatus('connected');
  // Fetch initial status
  fetchInitialStatus();
});

wsClient.on('disconnected', () => {
  updateConnectionStatus('disconnected');
});

// Fetch status update to check for changes
async function fetchStatusUpdate() {
  try {
    const response = await fetch('http://localhost:8888/status');
    if (response.ok) {
      const data: StatusResponse = await response.json();
      
      if (data.Cybers) {
        Object.entries(data.Cybers).forEach(([name, cyberData]) => {
          const agent = agentManager.getAgentData(name);
          if (agent) {
            // Check for location changes
            if (cyberData.current_location && agent.currentLocation !== cyberData.current_location) {
              console.log(`Agent ${name} location changed: ${agent.currentLocation} -> ${cyberData.current_location}`);
              agentManager.updateAgentLocation(name, cyberData.current_location);
            }
            
            // Check for state changes
            const newState = cyberData.state?.toLowerCase() || 'unknown';
            if (agent.state !== newState) {
              agentManager.updateAgentState(name, newState);
            }
          }
        });
      }
    }
  } catch (error) {
    // Silently fail - this is just a periodic check
  }
}

// Fetch initial cyber status
async function fetchInitialStatus() {
  console.log('Fetching initial status...');
  try {
    const response = await fetch('http://localhost:8888/status');
    console.log('Status response:', response.status);
    
    if (response.ok) {
      const data: StatusResponse = await response.json();
      console.log('Status data:', data);
      
      // Add all existing cybers
      if (data.Cybers) {
        console.log('Found cybers:', Object.keys(data.Cybers));
        Object.entries(data.Cybers).forEach(([name, cyberData]) => {
          console.log(`Adding cyber ${name}:`, cyberData);
          agentManager.addAgent(name, {
            type: cyberData.type || 'general',
            state: cyberData.state?.toLowerCase() || 'unknown',
            premium: cyberData.premium || false,
            current_location: cyberData.current_location
          });
        });
        updateAgentCount();
      } else {
        console.log('No cybers in status response');
      }
    } else if (response.status === 503) {
      console.log('Server initializing, will retry...');
      setTimeout(fetchInitialStatus, 2000);
    } else {
      console.error('Status response not OK:', response.status);
    }
  } catch (error) {
    console.error('Failed to fetch initial status:', error);
  }
}

// Connect WebSocket
wsClient.connect();

// UI Status Elements
function createStatusUI() {
  // Connection status
  const statusContainer = document.createElement('div');
  statusContainer.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: rgba(0, 20, 40, 0.8);
    border: 1px solid #0080ff;
    border-radius: 5px;
    padding: 8px 12px;
    color: #00ffff;
    font-family: 'Courier New', monospace;
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    z-index: 100;
  `;
  
  statusContainer.innerHTML = `
    <div class="status-indicator" style="
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #666;
    "></div>
    <span id="connection-status">disconnected</span>
    <span>|</span>
    <span>Cybers: <span id="agent-count">0</span></span>
  `;
  
  document.body.appendChild(statusContainer);
}

// UI updates
function updateConnectionStatus(status: string) {
  const statusEl = document.getElementById('connection-status');
  const indicatorEl = document.querySelector('.status-indicator');
  if (statusEl) statusEl.textContent = status;
  if (indicatorEl) {
    indicatorEl.className = `status-indicator`;
    (indicatorEl as HTMLElement).style.background = status === 'connected' ? '#00ff00' : '#ff0000';
  }
}

function updateAgentCount() {
  const countEl = document.getElementById('agent-count');
  if (countEl) countEl.textContent = agentManager.getAgentCount().toString();
}

// Handle window resize
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', onWindowResize);

// Clock for delta time
const clock = new THREE.Clock();

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  
  const deltaTime = clock.getDelta();
  
  // Update camera controller
  cameraController.update(deltaTime);
  
  // Update current mode
  modeManager.update(deltaTime);
  
  // Update core systems
  agentManager.update();
  gridSystem.update();
  filesystemViz.update();
  
  // Render with post-processing
  composer.render();
}

// Initialize everything
async function initialize() {
  // Create status UI
  createStatusUI();
  
  // Initialize mode manager with default mode
  await modeManager.initialize(AppMode.USER);
  
  // Start periodic status updates
  setInterval(() => {
    fetchStatusUpdate();
  }, 5000); // Check every 5 seconds
  
  // Start animation loop
  animate();
}

// Start the application
initialize();