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
import { config } from './config';

// Mode system
import { ModeManager, AppMode } from './modes/ModeManager';
import { ModeContext } from './modes/Mode';
import { AutomaticMode } from './modes/AutomaticMode';

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
// Ensure shader compile errors surface clearly
renderer.debug.checkShaderErrors = true;

// Post-processing for glow effects (allow low-perf fallback for OBS/embedded)
const urlParams = new URLSearchParams(window.location.search);
const lowPerf = urlParams.get('lowperf') === '1' || urlParams.get('lowPerf') === '1';

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

if (!lowPerf) {
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.0,
    0.6,
    0.7
  );
  composer.addPass(bloomPass);
}

// Initialize camera controller
const cameraController = new CameraController(camera, renderer);

// GUI Setup
const gui = new GUI();
// Hide debug GUI overlay for a cleaner presentation
(gui as any).domElement && ((gui as any).domElement.style.display = 'none');

// Lighting
const ambientLight = new THREE.AmbientLight(0x0080ff, 0.22);
scene.add(ambientLight);

// Directional light for solid flat shading on towers
const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
dirLight.position.set(40, 120, 10);
scene.add(dirLight);

// Low-intensity hemisphere fill to ensure lit faces at glancing angles
const hemi = new THREE.HemisphereLight(0x66ccff, 0x001122, 0.18);
scene.add(hemi);

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

// Biofeedback stats -> update agents and UI
wsClient.on('biofeedback', (data: any) => {
  console.log('Biofeedback event received:', JSON.stringify(data));
  if (data && data.cyber) {
    const bioData = {
      boredom: data.boredom,
      tiredness: data.tiredness,
      duty: data.duty,
      restlessness: data.restlessness,
      memory_pressure: data.memory_pressure
    };
    console.log('Updating agent bio with:', bioData);
    agentManager.updateAgentBiofeedback(data.cyber, bioData);
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
      // Update biofeedback if available
      agentManager.updateAgentBiofeedback(name, {
        boredom: cyberData.boredom,
        tiredness: cyberData.tiredness,
        duty: cyberData.duty,
        restlessness: cyberData.restlessness,
        memory_pressure: cyberData.memory_pressure
      });
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
          // Seed biofeedback if available
          agentManager.updateAgentBiofeedback(name, {
            boredom: (cyberData as any).boredom,
            tiredness: (cyberData as any).tiredness,
            duty: (cyberData as any).duty,
            restlessness: (cyberData as any).restlessness,
            memory_pressure: (cyberData as any).memory_pressure
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
let lastRafAt = performance.now();
let lastGlErrorCheck = 0;

function glErrorToString(gl: WebGLRenderingContext, code: number): string {
  switch (code) {
    case gl.NO_ERROR: return 'NO_ERROR';
    case gl.INVALID_ENUM: return 'INVALID_ENUM';
    case gl.INVALID_VALUE: return 'INVALID_VALUE';
    case gl.INVALID_OPERATION: return 'INVALID_OPERATION';
    case gl.OUT_OF_MEMORY: return 'OUT_OF_MEMORY';
    case (gl as any).CONTEXT_LOST_WEBGL: return 'CONTEXT_LOST_WEBGL';
    default: return `0x${code.toString(16)}`;
  }
}

function renderFrame() {
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

  // Sample WebGL error state at most once per second
  if (performance.now() - lastGlErrorCheck > 1000) {
    const gl = renderer.getContext();
    // Drain all pending errors
    let err = gl.getError();
    let logged = false;
    let guard = 0;
    while (err !== gl.NO_ERROR && guard++ < 8) {
      console.warn('WebGL error:', glErrorToString(gl, err));
      logged = true;
      err = gl.getError();
    }
    if (logged) {
      // Also log renderer stats to correlate
      console.info('Renderer info:', renderer.info);
    }
    lastGlErrorCheck = performance.now();
  }
}

// Animation loop
function animate() {
  // Always schedule the next frame first so errors below never stop the loop
  requestAnimationFrame(animate);
  try {
    renderFrame();
    lastRafAt = performance.now();
  } catch (err) {
    // Keep rendering even if one frame throws; log once per second max
    if ((window as any).__lastAnimErrTime__ === undefined || Date.now() - (window as any).__lastAnimErrTime__ > 1000) {
      console.error('Animation frame error:', err);
      (window as any).__lastAnimErrTime__ = Date.now();
    }
  }
}

// Ensure the animation loop starts even if initialization awaits or fails early
let animationStarted = false;
function startAnimation() {
  if (animationStarted) return;
  animationStarted = true;
  animate();
}

// Initialize everything
async function initialize() {
  // Server selector UI removed for streamlined display
  // Start animation loop immediately so the scene updates regardless of async init timing
  startAnimation();
  
  // Initialize CyberInfoWindow with camera controller
  cyberInfoWindow = new CyberInfoWindow(wsClient, agentManager, cameraController);
  // Expose to modes via context so Automatic mode can control it
  (modeContext as any).cyberInfoWindow = cyberInfoWindow;
  
  // Initialize mode manager with default mode
  await modeManager.initialize(AppMode.AUTOMATIC);
  
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
  
  // Animation already started above (startAnimation)
}

// Start the application
// Start animation defensively before any async work
startAnimation();
initialize();

// Fallback for environments that throttle requestAnimationFrame (e.g., OBS Browser Source)
const fallbackFps = Math.max(1, Math.min(60, parseInt(urlParams.get('fps') || '30', 10) || 30));
const fallbackInterval = Math.round(1000 / fallbackFps);
setInterval(() => {
  // If RAF hasn't advanced recently, drive the render manually
  if (performance.now() - lastRafAt > Math.max(500, fallbackInterval * 2)) {
    try {
      renderFrame();
      lastRafAt = performance.now();
    } catch (err) {
      // Log sparingly
      if ((window as any).__lastAnimErrTime__ === undefined || Date.now() - (window as any).__lastAnimErrTime__ > 1000) {
        console.error('Fallback frame error:', err);
        (window as any).__lastAnimErrTime__ = Date.now();
      }
    }
  }
}, fallbackInterval);
