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
import { config, createServerSelector } from './config';

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

// UI Components
import { CyberInfoWindow } from './ui/CyberInfoWindow';

// Types
import { 
  StatusResponse,
  AgentCreatedEvent,
  AgentStateChangedEvent,
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

// WebSocket connection using config
const wsClient = new WebSocketClient(config.wsUrl);

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
  // Status updates handled by CyberInfoWindow now
  
  // Fetch initial reflection for this cyber
  wsClient.requestCurrentReflection(data.name, `init_${data.name}_${Date.now()}`);
  
  // Emit event for modes to handle
  eventBus.emit(Events.CYBER_ACTIVITY, { 
    cyber: data.name, 
    type: 'created' 
  });
});

wsClient.on('agent_terminated', (data: any) => {
  agentManager.removeAgent(data.name);
  // Status updates handled by CyberInfoWindow now
  
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

// Disabled - we now show reflections instead of real-time thoughts
// wsClient.on('agent_thinking', (data: AgentThinkingEvent) => {
//   // Show thought bubble above agent
//   if (data.name && data.thought) {
//     const thoughtText = data.token_count ? 
//       `${data.thought} (${data.token_count} tokens)` : 
//       data.thought;
//     console.log(`Agent ${data.name} thinking: ${thoughtText}`);
//     agentManager.showThought(data.name, thoughtText);
//     
//     eventBus.emit(Events.CYBER_ACTIVITY, { 
//       cyber: data.name, 
//       type: 'thinking',
//       thought: thoughtText 
//     });
//   }
// });

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

// Handle cycle started events - fetch reflection for display
wsClient.on('cycle_started', (data: any) => {
  if (data.cyber && data.cycle_number) {
    console.log(`Cycle ${data.cycle_number} started for ${data.cyber}, fetching reflection...`);
    // Request the reflection from the previous cycle (cycle_number - 1)
    if (data.cycle_number > 1) {
      const requestId = `ref_${data.cyber}_${Date.now()}`;
      wsClient.requestCurrentReflection(data.cyber, requestId);
    }
  }
});

// Handle reflection responses
wsClient.on('current_reflection', (data: any) => {
  if (data.cyber && data.reflection) {
    // The server now sends the insights directly as a string
    let reflectionText = data.reflection;
    
    // If it's still an object for some reason, extract insights
    if (typeof reflectionText === 'object') {
      reflectionText = reflectionText.insights || JSON.stringify(reflectionText);
    }
    
    // Clean up multiline formatting
    if (typeof reflectionText === 'string') {
      // Remove leading "- " from bullet points for cleaner display
      reflectionText = reflectionText.replace(/^- /gm, '• ');
      // Truncate if too long
      if (reflectionText.length > 300) {
        reflectionText = reflectionText.substring(0, 297) + '...';
      }
    }
    
    console.log(`Showing reflection for ${data.cyber}:`, reflectionText);
    agentManager.showThought(data.cyber, reflectionText);
  } else if (data.cyber) {
    // No reflection available yet
    console.log(`No reflection available for ${data.cyber} yet`);
    agentManager.showThought(data.cyber, 'Awaiting first reflection...');
  }
});

wsClient.on('connected', () => {
  // Connection status handled by server selector now
  // Fetch initial status
  fetchInitialStatus();
});

wsClient.on('disconnected', () => {
  // Connection status handled by server selector now
});

// Fetch status update to check for changes
async function fetchStatusUpdate() {
  try {
    const response = await fetch(`${config.apiUrl}/status`);
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
  console.log(`Fetching initial status from ${config.apiUrl}...`);
  try {
    const response = await fetch(`${config.apiUrl}/status`);
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
          
          // Fetch initial reflection for each cyber
          wsClient.requestCurrentReflection(name, `init_${name}_${Date.now()}`);
        });
        // Status updates handled by CyberInfoWindow now
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

// Create info window instance
let cyberInfoWindow: CyberInfoWindow;

// Old UI status elements removed - using CyberInfoWindow instead

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
  // Create server selector UI
  document.body.appendChild(createServerSelector());
  
  // Initialize CyberInfoWindow with camera controller
  cyberInfoWindow = new CyberInfoWindow(wsClient, agentManager, cameraController);
  
  // Initialize mode manager with default mode
  await modeManager.initialize(AppMode.USER);
  
  // Add click handler for selecting cybers
  renderer.domElement.addEventListener('click', (event) => {
    const mouse = new THREE.Vector2(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );
    
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    
    const selectedAgent = agentManager.getAgentAtPosition(raycaster);
    if (selectedAgent) {
      agentManager.selectAgent(selectedAgent.name);
      cyberInfoWindow.selectCyber(selectedAgent.name);
      // Narrow WS subscription to the selected cyber to reduce noise
      wsClient.subscribe([selectedAgent.name]);
    } else {
      agentManager.selectAgent(null);
      cyberInfoWindow.hide();
      // Restore broad subscription
      wsClient.subscribe(['*']);
    }
  });
  
  // Start periodic status updates
  setInterval(() => {
    fetchStatusUpdate();
  }, 5000); // Check every 5 seconds
  
  // Start animation loop
  animate();
}

// Start the application
initialize();
