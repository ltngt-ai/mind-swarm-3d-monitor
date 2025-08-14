import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import GUI from 'lil-gui';
import { AgentManager } from './AgentManager';
import { GridSystem } from './GridSystem';
import { FilesystemVisualizer } from './FilesystemVisualizer';
import { WebSocketClient } from './WebSocketClient';
import { Mailbox } from './Mailbox';
import { 
  StatusResponse, 
  SendCommandRequest, 
  SendMessageRequest,
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

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 20;
controls.maxDistance = 200;

// WASD movement
let moveSpeed = 0.5;
const keys: Record<string, boolean> = {};

window.addEventListener('keydown', (e) => {
  // Ignore key events when typing in input fields
  if (e.target instanceof HTMLInputElement || 
      e.target instanceof HTMLTextAreaElement || 
      e.target instanceof HTMLSelectElement) {
    return;
  }
  keys[e.key.toLowerCase()] = true;
});

window.addEventListener('keyup', (e) => {
  // Ignore key events when typing in input fields
  if (e.target instanceof HTMLInputElement || 
      e.target instanceof HTMLTextAreaElement || 
      e.target instanceof HTMLSelectElement) {
    return;
  }
  keys[e.key.toLowerCase()] = false;
});

// GUI Setup
const gui = new GUI();
const guiParams = {
  // Camera
  moveSpeed: 0.5,
  autoRotate: false,
  
  // Visual effects
  bloomStrength: 0.5,
  bloomRadius: 0.4,
  gridOpacity: 0.6,
  showTowers: true,
  refreshFilesystem: () => {
    console.log('Manually refreshing filesystem structure...');
    filesystemViz.refresh();
  },
  
  // Agent controls
  selectedAgent: 'None',
  sendThinkCommand: () => {
    const selectedAgent = agentManager.getSelectedAgent();
    if (selectedAgent) {
      const thought = prompt('Enter thought for agent:');
      if (thought) {
        sendAgentCommand(selectedAgent, 'think', { message: thought });
      }
    }
  },
  sendMessage: () => {
    const selectedAgent = agentManager.getSelectedAgent();
    if (selectedAgent) {
      const message = prompt('Enter message for agent:');
      if (message) {
        sendAgentMessage(selectedAgent, message);
      }
    }
  },
  
  // Debug
  showStats: false,
  logWebSocket: false,
  
  // Mailbox
  openMailbox: () => {
    mailbox.toggle();
  },
  
  // Manual refresh
  refreshStatus: () => {
    console.log('Manually refreshing status...');
    fetchInitialStatus();
  }
};

// Camera folder
const cameraFolder = gui.addFolder('Camera');
cameraFolder.add(guiParams, 'moveSpeed', 0.1, 2.0).onChange((value: number) => {
  moveSpeed = value;
});
cameraFolder.add(guiParams, 'autoRotate').onChange((value: boolean) => {
  controls.autoRotate = value;
});
cameraFolder.add(controls, 'autoRotateSpeed', 0.5, 5.0);

// Visual folder
const visualFolder = gui.addFolder('Visual Effects');
visualFolder.add(guiParams, 'bloomStrength', 0, 2).onChange((value: number) => {
  bloomPass.strength = value;
});
visualFolder.add(guiParams, 'bloomRadius', 0, 1).onChange((value: number) => {
  bloomPass.radius = value;
});
visualFolder.add(guiParams, 'gridOpacity', 0, 1).onChange((value: number) => {
  const gridChild = gridSystem.mesh.children[0] as THREE.Line;
  const gridMaterial = gridChild.material as THREE.LineBasicMaterial;
  gridMaterial.opacity = value;
});
visualFolder.add(guiParams, 'showTowers').onChange((value: boolean) => {
  filesystemViz.setVisible(value);
});
visualFolder.add(guiParams, 'refreshFilesystem').name('🔄 Refresh Filesystem');

// Agent folder
const agentFolder = gui.addFolder('Agents');
agentFolder.add(guiParams, 'selectedAgent').listen().disable();
agentFolder.add(guiParams, 'sendThinkCommand').name('Send Think Command');
agentFolder.add(guiParams, 'sendMessage').name('Send Message');

// Debug folder
const debugFolder = gui.addFolder('Debug');
debugFolder.add(guiParams, 'showStats');
debugFolder.add(guiParams, 'logWebSocket').onChange((_value: boolean) => {
  // Will be used to toggle WebSocket logging
});

// Developer folder
const devFolder = gui.addFolder('Developer');
devFolder.add(guiParams, 'openMailbox').name('📧 Mailbox');
devFolder.add(guiParams, 'refreshStatus').name('🔄 Refresh Status');

// Send command to cyber helper
async function sendAgentCommand(agentName: string, command: string, params: any) {
  try {
    const requestBody: SendCommandRequest = { command, params };
    const response = await fetch(`http://localhost:8888/Cybers/${agentName}/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      console.error('Failed to send command:', response.statusText);
    }
  } catch (error) {
    console.error('Error sending command:', error);
  }
}

// Send message to cyber helper
async function sendAgentMessage(agentName: string, content: string) {
  try {
    const requestBody: SendMessageRequest = { content, message_type: 'text' };
    const response = await fetch(`http://localhost:8888/Cybers/${agentName}/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      console.error('Failed to send message:', response.statusText);
    } else {
      console.log(`Message sent to ${agentName}: ${content}`);
    }
  } catch (error) {
    console.error('Error sending message:', error);
  }
}

// Lighting
const ambientLight = new THREE.AmbientLight(0x0080ff, 0.1);
scene.add(ambientLight);

// Grid system (the Tron floor) - infinite LOD grid
const gridSystem = new GridSystem();
gridSystem.setCamera(camera);
scene.add(gridSystem.mesh);

// Filesystem visualization
const filesystemViz = new FilesystemVisualizer(scene);

// Agent manager
const agentManager = new AgentManager(scene);

// Set filesystem visualizer reference for location-based positioning
agentManager.setFilesystemVisualizer(filesystemViz);

// Mailbox
const mailbox = new Mailbox();

// WebSocket connection
const wsClient = new WebSocketClient('ws://localhost:8888/ws');

// Handle WebSocket events
wsClient.on('agent_created', (data: AgentCreatedEvent) => {
  agentManager.addAgent(data.name, {
    type: data.cyber_type || 'general',
    state: 'idle',
    premium: (data.config as any)?.use_premium || false,
    current_location: (data as any).current_location
  });
  updateAgentCount();
});

wsClient.on('agent_terminated', (data: any) => {
  agentManager.removeAgent(data.name);
  updateAgentCount();
});

wsClient.on('agent_state_changed', (data: AgentStateChangedEvent) => {
  agentManager.updateAgentState(data.name, data.new_state);
});

wsClient.on('file_activity', (data: FileActivityEvent) => {
  // Pulse the directory tower when files are accessed - now with better path handling
  if (data.path) {
    console.log('File activity detected:', data.path);
    filesystemViz.pulseDirectory(data.path);
    
    // If activity level is provided, update it
    if (data.activity_level !== undefined) {
      filesystemViz.updateDirectoryActivity(data.path, data.activity_level);
    }
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
    
    // Update thought history if this agent is selected
    if (agentManager.getSelectedAgent() === data.name) {
      const agent = agentManager.getAgentData(data.name);
      if (agent) {
        showAgentInfo(agent);
      }
    }
  }
});

// Handle agent location changes
wsClient.on('agent_location_changed', (data: any) => {
  if (data.name && data.new_location) {
    console.log(`Agent ${data.name} moved to: ${data.new_location}`);
    agentManager.updateAgentLocation(data.name, data.new_location);
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

// Listen for mailbox updates
window.addEventListener('mailbox-unread-count', (event: any) => {
  const unreadEl = document.getElementById('unread-count');
  if (unreadEl) {
    unreadEl.textContent = event.detail.count.toString();
    unreadEl.style.color = event.detail.count > 0 ? '#ffff00' : '#666666';
  }
});

// Check mailbox on startup and periodically
setTimeout(() => {
  mailbox.refreshMessages();
  // Refresh mailbox every 10 seconds
  setInterval(() => {
    mailbox.refreshMessages();
  }, 10000);
  
  // Also periodically check for status updates (including location changes)
  setInterval(() => {
    fetchStatusUpdate();
  }, 5000); // Check every 5 seconds
}, 2000);

// Raycaster for mouse interaction
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function onMouseClick(event: MouseEvent) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  
  const agent = agentManager.getAgentAtPosition(raycaster);
  if (agent) {
    // Only update selection if clicking a different agent
    if (agentManager.getSelectedAgent() !== agent.name) {
      agentManager.selectAgent(agent.name);
      showAgentInfo(agent);
      guiParams.selectedAgent = agent.name;
    }
  }
  // Don't deselect when clicking empty space - keep current selection
}

window.addEventListener('click', onMouseClick);

// UI updates
function updateConnectionStatus(status: string) {
  const statusEl = document.getElementById('connection-status');
  const indicatorEl = document.querySelector('.status-indicator');
  if (statusEl) statusEl.textContent = status;
  if (indicatorEl) {
    indicatorEl.className = `status-indicator status-${status}`;
  }
}

function updateAgentCount() {
  const countEl = document.getElementById('agent-count');
  if (countEl) countEl.textContent = agentManager.getAgentCount().toString();
}

function showAgentInfo(agent: any) {
  const infoEl = document.getElementById('agent-info');
  const nameEl = document.getElementById('agent-name');
  const stateEl = document.getElementById('agent-state');
  const typeEl = document.getElementById('agent-type');
  const thoughtHistoryEl = document.getElementById('thought-history');
  
  if (infoEl && nameEl && stateEl && typeEl && thoughtHistoryEl) {
    nameEl.textContent = agent.name;
    stateEl.textContent = agent.state;
    typeEl.textContent = agent.type + (agent.premium ? ' ✨' : '');
    
    // Get and display thought history
    const thoughts = agentManager.getAgentThoughtHistory(agent.name);
    thoughtHistoryEl.innerHTML = '';
    
    if (thoughts.length === 0) {
      thoughtHistoryEl.innerHTML = '<div style="opacity: 0.6;">No thoughts yet...</div>';
    } else {
      thoughts.forEach((entry, index) => {
        const thoughtDiv = document.createElement('div');
        thoughtDiv.style.marginBottom = '10px';
        thoughtDiv.style.borderBottom = '1px solid rgba(0, 255, 255, 0.2)';
        thoughtDiv.style.paddingBottom = '8px';
        
        // Highlight current thought
        if (index === 0) {
          thoughtDiv.style.borderLeft = '2px solid #00ffff';
          thoughtDiv.style.paddingLeft = '8px';
          thoughtDiv.style.background = 'rgba(0, 255, 255, 0.05)';
        }
        
        const timeDiv = document.createElement('div');
        timeDiv.style.fontSize = '10px';
        timeDiv.style.opacity = '0.6';
        timeDiv.style.marginBottom = '4px';
        timeDiv.textContent = (index === 0 ? 'Current - ' : '') + formatTime(entry.timestamp);
        
        const thoughtText = document.createElement('div');
        thoughtText.style.wordWrap = 'break-word';
        thoughtText.style.wordBreak = 'break-word';
        thoughtText.style.whiteSpace = 'pre-wrap';
        thoughtText.style.overflowWrap = 'anywhere';
        thoughtText.textContent = entry.thought;
        
        thoughtDiv.appendChild(timeDiv);
        thoughtDiv.appendChild(thoughtText);
        thoughtHistoryEl.appendChild(thoughtDiv);
      });
    }
    
    infoEl.style.display = 'block';
  }
}

function formatTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  
  return date.toLocaleTimeString();
}

// Commented out unused function - can be re-enabled if needed
// function hideAgentInfo() {
//   const infoEl = document.getElementById('agent-info');
//   if (infoEl) infoEl.style.display = 'none';
// }

// Handle window resize
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', onWindowResize);

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  
  // WASD movement
  const moveVector = new THREE.Vector3();
  
  if (keys['w']) moveVector.z -= moveSpeed;
  if (keys['s']) moveVector.z += moveSpeed;
  if (keys['a']) moveVector.x -= moveSpeed;
  if (keys['d']) moveVector.x += moveSpeed;
  
  if (moveVector.length() > 0) {
    // Apply movement relative to camera orientation
    moveVector.applyQuaternion(camera.quaternion);
    moveVector.y = 0; // Keep movement horizontal
    controls.target.add(moveVector);
    camera.position.add(moveVector);
  }
  
  // Update controls
  controls.update();
  
  // Update agents
  agentManager.update();
  
  // Update grid animation
  gridSystem.update();
  
  // Update filesystem animation
  filesystemViz.update();
  
  // Render with post-processing
  composer.render();
}

animate();