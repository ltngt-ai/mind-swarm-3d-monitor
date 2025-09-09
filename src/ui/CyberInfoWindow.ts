import { WebSocketClient } from '../WebSocketClient';
import { AgentManager } from '../AgentManager';
import { CameraController, CameraMode } from '../camera/CameraController';
import { config } from '../config';

export interface CycleData {
  cycle_number: number;
  metadata?: {
    start_time?: string;
    end_time?: string;
    duration_ms?: number;
    stages_completed?: string[];
    status?: string;
  };
  observation?: any;
  decision?: any;
  execution?: any;
  reflection?: any;
  cleanup?: any;
}

export class CyberInfoWindow {
  private container: HTMLDivElement;
  private wsClient: WebSocketClient;
  private agentManager: AgentManager;
  private cameraController: CameraController | null = null;
  
  private selectedCyber: string | null = null;
  private currentCycle: number = 0;  // Will be set when we get actual data
  private selectedCycle: number = 999;  // Start high to indicate not yet set
  private selectedStage: string = 'reflection';
  private cycleData: Map<number, CycleData> = new Map();
  
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private windowX = window.innerWidth - 420;
  private windowY = 80;
  
  private isResizing = false;
  private resizeStart = { x: 0, y: 0, width: 0, height: 0 };
  private textZoom = 1.0;  // Default zoom level
  
  private isFollowing = false;
  // TTS state
  private isSpeaking = false;
  private isAutoSpeak: boolean = true;
  private lastSpokenText: string | null = null;
  private userGestureEnabled: boolean = false;
  private voicesReady: boolean = false;
  private pendingSpeakText: string | null = null;
  private ttsAudio: HTMLAudioElement | null = null; // fallback audio element for external TTS
  private audioUnlocked: boolean = false;
  private readonly silentWavDataUri =
    'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA='; // very short silent wav
  // Burst handling / queueing
  private speakQueue: string[] = [];
  private autoSpeakTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly autoSpeakDelayMs = 1200;
  
  constructor(wsClient: WebSocketClient, agentManager: AgentManager, cameraController?: CameraController) {
    this.wsClient = wsClient;
    this.agentManager = agentManager;
    this.cameraController = cameraController || null;
    
    // Create the window container
    this.container = document.createElement('div');
    this.container.className = 'cyber-info-window';
    this.container.style.cssText = `
      position: fixed;
      right: 20px;
      top: 80px;
      width: 676px;
      height: 642px;
      background: rgba(0, 20, 40, 0.98);
      border: 1px solid #0080ff;
      border-radius: 12px;
      font-family: 'Courier New', monospace;
      font-size: 18px;
      color: #00ffff;
      z-index: 1000;
      display: none;
      backdrop-filter: blur(10px);
      box-shadow: 0 0 20px rgba(0, 255, 255, 0.3), 0 4px 8px rgba(0,0,0,0.5);
      overflow: hidden;
      display: none;
      flex-direction: column;
    `;
    
    this.setupWindow();
    document.body.appendChild(this.container);
    this.setupAudioEnablers();
    
    // Listen for WebSocket events
    this.setupEventListeners();
  }

  // Dock the window to a screen corner with default offsets
  public setDock(position: 'bottom-left' | 'top-right') {
    if (position === 'bottom-left') {
      this.container.style.left = '20px';
      this.container.style.bottom = '0px';
      this.container.style.right = 'auto';
      this.container.style.top = 'auto';
    } else {
      this.container.style.right = '20px';
      this.container.style.top = '80px';
      this.container.style.left = 'auto';
      this.container.style.bottom = 'auto';
    }
  }

  // Show/hide the Follow button (used by Automatic mode)
  public setFollowButtonVisible(visible: boolean) {
    const btnFollow = this.container.querySelector('#btn-follow') as HTMLButtonElement | null;
    if (btnFollow) {
      btnFollow.style.display = visible ? '' : 'none';
    }
  }

  // Show/hide the entire action bar (Follow/Message/Refresh)
  public setActionBarVisible(visible: boolean) {
    const actionBar = this.container.querySelector('.action-buttons') as HTMLElement | null;
    if (actionBar) {
      actionBar.style.display = visible ? 'flex' : 'none';
    }
  }
  
  private setupWindow() {
    this.container.innerHTML = `
      <!-- Title Bar -->
      <div class="window-titlebar" style="
        background: linear-gradient(180deg, #1a5f7a 0%, #0a3a4a 100%);
        border: 1px solid #00ffff;
        border-bottom: 2px solid #0080ff;
        padding: 6px 10px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: move;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 4px rgba(0,0,0,0.3);
      ">
        <span style="color: #00ffff; font-weight: bold; text-shadow: 0 0 5px rgba(0,255,255,0.5); font-size: 22px;" id="cyber-name">No Cyber Selected</span>
        <div class="window-controls" style="display: flex; gap: 8px; align-items: center;">
          <button class="win-btn" id="btn-zoom-out" style="
            background: rgba(0, 255, 255, 0.2);
            border: 1px solid #00ffff;
            color: #00ffff;
            width: 24px;
            height: 24px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            line-height: 1;
          " title="Zoom Out">−</button>
          <span id="zoom-level" style="color: #00ffff; font-size: 14px; min-width: 40px; text-align: center;">100%</span>
          <button class="win-btn" id="btn-zoom-in" style="
            background: rgba(0, 255, 255, 0.2);
            border: 1px solid #00ffff;
            color: #00ffff;
            width: 24px;
            height: 24px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            line-height: 1;
          " title="Zoom In">+</button>
          <button class="win-btn" id="btn-close" style="
            background: #ff0080;
            border: none;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            cursor: pointer;
            margin-left: 8px;
          ">×</button>
        </div>
      </div>
      
      <!-- Action Buttons -->
      <div class="action-buttons" style="
        padding: 10px;
        display: flex;
        gap: 10px;
        border-bottom: 1px solid #0080ff;
      ">
        <button id="btn-follow" style="
          background: rgba(0, 128, 255, 0.2);
          border: 1px solid #0080ff;
          color: #00ffff;
          padding: 5px 10px;
          border-radius: 4px;
          cursor: pointer;
          flex: 1;
        ">👁 Follow</button>
        <button id="btn-message" style="
          background: rgba(0, 255, 128, 0.2);
          border: 1px solid #00ff80;
          color: #00ff80;
          padding: 5px 10px;
          border-radius: 4px;
          cursor: pointer;
          flex: 1;
        ">💬 Message</button>
        <button id="btn-refresh" style="
          background: rgba(255, 255, 0, 0.2);
          border: 1px solid #ffff00;
          color: #ffff00;
          padding: 5px 10px;
          border-radius: 4px;
          cursor: pointer;
          flex: 1;
        ">🔄 Refresh</button>
        <button id="btn-tts" style="
          background: rgba(255, 128, 0, 0.2);
          border: 1px solid #ff8000;
          color: #ffb366;
          padding: 5px 10px;
          border-radius: 4px;
          cursor: pointer;
          flex: 1;
        ">🔊 Read</button>
        <button id="btn-tts-test" style="
          background: rgba(0, 255, 128, 0.2);
          border: 1px solid #00ff80;
          color: #00ff80;
          padding: 5px 10px;
          border-radius: 4px;
          cursor: pointer;
          flex: 1;
        ">🔈 Test Audio</button>
      </div>
      
      <!-- Cycle Navigation -->
      <div class="cycle-nav" style="
        padding: 10px;
        display: flex;
        align-items: center;
        gap: 10px;
        border-bottom: 1px solid #0080ff;
      ">
        <button id="btn-prev-cycle" style="
          background: rgba(0, 128, 255, 0.2);
          border: 1px solid #0080ff;
          color: #00ffff;
          padding: 3px 8px;
          border-radius: 4px;
          cursor: pointer;
        ">◀</button>
        <div style="flex: 1; text-align: center;">
          <span>Cycle </span>
          <input type="number" id="cycle-number" value="" placeholder="-" style="
            background: rgba(0, 255, 255, 0.1);
            border: 1px solid #00ffff;
            color: #00ffff;
            width: 60px;
            padding: 2px 5px;
            border-radius: 4px;
            text-align: center;
          ">
          <span id="cycle-range" style="color: #888; margin-left: 5px;"></span>
          <span id="cycle-status" style="color: #00ff00; margin-left: 10px;">●</span>
        </div>
        <button id="btn-next-cycle" style="
          background: rgba(0, 128, 255, 0.2);
          border: 1px solid #0080ff;
          color: #00ffff;
          padding: 3px 8px;
          border-radius: 4px;
          cursor: pointer;
        ">▶</button>
        <button id="btn-current-cycle" style="
          background: rgba(0, 255, 0, 0.2);
          border: 1px solid #00ff00;
          color: #00ff00;
          padding: 3px 8px;
          border-radius: 4px;
          cursor: pointer;
        ">⟲</button>
      </div>
      
      <!-- Stage Selector -->
      <div class="stage-selector" style="
        padding: 10px;
        display: none; /* hidden in automatic mode (show reflections only) */
        gap: 5px;
        flex-wrap: wrap;
        border-bottom: 1px solid #0080ff;
      ">
        <button class="stage-btn" data-stage="observation" style="
          background: rgba(0, 128, 255, 0.2);
          border: 1px solid #0080ff;
          color: #0080ff;
          padding: 5px 10px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 16px;
        ">Observation</button>
        <button class="stage-btn" data-stage="decision" style="
          background: rgba(0, 128, 255, 0.2);
          border: 1px solid #0080ff;
          color: #0080ff;
          padding: 5px 10px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 16px;
        ">Decision</button>
        <button class="stage-btn" data-stage="execution" style="
          background: rgba(0, 128, 255, 0.2);
          border: 1px solid #0080ff;
          color: #0080ff;
          padding: 5px 10px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 16px;
        ">Execution</button>
        <button class="stage-btn active" data-stage="reflection" style="
          background: rgba(0, 255, 255, 0.3);
          border: 1px solid #00ffff;
          color: #00ffff;
          padding: 5px 10px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 16px;
        ">Reflection</button>
      </div>
      
      <!-- Content Area -->
      <div id="info-content" style="
        padding: 15px;
        flex: 1;
        overflow-y: auto;
        font-size: 14px;
        line-height: 1.4;
        min-height: 0;
      ">
        
      </div>
      
      <!-- Status Bar -->
      <div class="status-bar" style="
        padding: 5px 10px;
        background: rgba(0, 128, 255, 0.1);
        border-top: 1px solid #0080ff;
        font-size: 14px;
        color: #0080ff;
        display: flex;
        justify-content: space-between;
        flex-shrink: 0;
      ">
        <span id="status-text">Ready</span>
        <span id="last-update">--:--:--</span>
      </div>
      
      <!-- Resize Handle -->
      <div id="resize-handle" style="
        position: absolute;
        bottom: 2px;
        right: 2px;
        width: 12px;
        height: 12px;
        cursor: nwse-resize;
        background: linear-gradient(135deg, transparent 60%, rgba(0,255,255,0.3) 60%);
        z-index: 10;
      "></div>
    `;
    
    this.setupControls();
  }
  
  private setupControls() {
    const titleBar = this.container.querySelector('.window-titlebar') as HTMLElement;
    const btnClose = this.container.querySelector('#btn-close') as HTMLButtonElement;
    const btnZoomIn = this.container.querySelector('#btn-zoom-in') as HTMLButtonElement;
    const btnZoomOut = this.container.querySelector('#btn-zoom-out') as HTMLButtonElement;
    const resizeHandle = this.container.querySelector('#resize-handle') as HTMLElement;
    const btnFollow = this.container.querySelector('#btn-follow') as HTMLButtonElement;
    const btnMessage = this.container.querySelector('#btn-message') as HTMLButtonElement;
    const btnRefresh = this.container.querySelector('#btn-refresh') as HTMLButtonElement;
    const btnTts = this.container.querySelector('#btn-tts') as HTMLButtonElement;
    const btnTtsTest = this.container.querySelector('#btn-tts-test') as HTMLButtonElement;
    const btnPrevCycle = this.container.querySelector('#btn-prev-cycle') as HTMLButtonElement;
    const btnNextCycle = this.container.querySelector('#btn-next-cycle') as HTMLButtonElement;
    const btnCurrentCycle = this.container.querySelector('#btn-current-cycle') as HTMLButtonElement;
    const cycleInput = this.container.querySelector('#cycle-number') as HTMLInputElement;
    
    // Window dragging
    titleBar.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).classList.contains('win-btn')) return;
      this.isDragging = true;
      this.dragStartX = e.clientX - this.windowX;
      this.dragStartY = e.clientY - this.windowY;
    });
    
    document.addEventListener('mousemove', (e) => {
      if (this.isDragging && !this.isResizing) {
        this.windowX = e.clientX - this.dragStartX;
        this.windowY = e.clientY - this.dragStartY;
        this.container.style.left = `${this.windowX}px`;
        this.container.style.top = `${this.windowY}px`;
        this.container.style.right = 'auto';
      }
    });
    
    document.addEventListener('mouseup', () => {
      this.isDragging = false;
      this.isResizing = false;
    });
    
    // Window controls
    btnClose.addEventListener('click', () => this.hide());
    
    // Zoom controls
    btnZoomIn.addEventListener('click', () => this.adjustZoom(0.1));
    btnZoomOut.addEventListener('click', () => this.adjustZoom(-0.1));
    
    // Window resizing
    resizeHandle.addEventListener('mousedown', (e) => {
      this.isResizing = true;
      this.resizeStart = {
        x: e.clientX,
        y: e.clientY,
        width: this.container.offsetWidth,
        height: this.container.offsetHeight
      };
      e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
      if (this.isResizing) {
        const deltaX = e.clientX - this.resizeStart.x;
        const deltaY = e.clientY - this.resizeStart.y;
        const newWidth = Math.max(300, this.resizeStart.width + deltaX);
        const newHeight = Math.max(200, this.resizeStart.height + deltaY);
        this.container.style.width = `${newWidth}px`;
        this.container.style.height = `${newHeight}px`;
      }
    });
    
    // Action buttons
    btnFollow.addEventListener('click', () => this.toggleFollow());
    btnMessage.addEventListener('click', () => this.openMessageDialog());
    btnRefresh.addEventListener('click', () => this.refreshData());
    if (btnTts) btnTts.addEventListener('click', () => this.toggleTTS());
    if (btnTtsTest) btnTtsTest.addEventListener('click', () => this.testTTS());
    
    // Cycle navigation
    btnPrevCycle.addEventListener('click', () => this.navigateCycle(-1));
    btnNextCycle.addEventListener('click', () => this.navigateCycle(1));
    btnCurrentCycle.addEventListener('click', () => this.goToCurrentCycle());
    
    cycleInput.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      let newCycle = parseInt(target.value) || 1;
      
      // Clamp to valid range
      if (newCycle < 1) {
        newCycle = 1;
      } else if (this.currentCycle > 0 && newCycle > this.currentCycle) {
        // Only clamp upper bound if we know the actual current cycle
        newCycle = this.currentCycle;
      }
      
      this.selectedCycle = newCycle;
      target.value = this.selectedCycle.toString();  // Update input if clamped
      this.fetchCycleData(this.selectedCycle);
    });
    
    // Stage selector
    const stageBtns = this.container.querySelectorAll('.stage-btn');
    stageBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const stage = target.dataset.stage!;
        this.selectStage(stage);
      });
    });
  }

  // Prepare auto-play audio by waiting for a user gesture and voices load
  private setupAudioEnablers() {
    const onFirstGesture = () => {
      this.userGestureEnabled = true;
      // Create and unlock a persistent audio element (CEF/OBS needs a gesture)
      if (!this.ttsAudio) {
        this.ttsAudio = document.createElement('audio');
        this.ttsAudio.style.display = 'none';
        this.ttsAudio.preload = 'auto';
        this.ttsAudio.autoplay = true;
        this.ttsAudio.controls = false;
        this.ttsAudio.onplay = () => { this.audioUnlocked = true; };
        this.ttsAudio.onerror = () => { /* ignore unlock errors */ };
        this.container.appendChild(this.ttsAudio);
      }
      try {
        this.ttsAudio!.src = this.silentWavDataUri;
        const p = this.ttsAudio!.play();
        if (p && typeof p.then === 'function') {
          p.then(() => {
            this.audioUnlocked = true;
            this.updateStatus('Audio unlocked');
          }).catch(() => {
            // Some builds still unlock after any gesture even if play fails
            this.audioUnlocked = true;
            this.updateStatus('Audio unlocked (fallback)');
          });
        }
      } catch {}
      if (this.pendingSpeakText) {
        const text = this.pendingSpeakText;
        this.pendingSpeakText = null;
        this.startTTS(text);
      }
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
    };
    window.addEventListener('pointerdown', onFirstGesture, { once: true });
    window.addEventListener('keydown', onFirstGesture, { once: true });

    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.onvoiceschanged = () => {
          this.voicesReady = true;
          if (this.userGestureEnabled && this.pendingSpeakText) {
            const text = this.pendingSpeakText;
            this.pendingSpeakText = null;
            this.startTTS(text);
          }
        };
        const voices = window.speechSynthesis.getVoices();
        if (voices && voices.length > 0) this.voicesReady = true;
      } catch {}
    }
  }
  
  private setupEventListeners() {
    // Listen for fast current cycle response
    this.wsClient.on('current_cycle', (data: any) => {
      console.log('Received current_cycle (fast):', data);
      if (data.cyber === this.selectedCyber && data.cycle_number) {
        this.currentCycle = data.cycle_number;
        this.selectedCycle = data.cycle_number;
        
        // Update the input field
        const cycleInput = this.container.querySelector('#cycle-number') as HTMLInputElement;
        if (cycleInput) {
          cycleInput.value = this.selectedCycle.toString();
        }
        
        this.updateCycleStatus();
        this.updateStatus('');
        
        // Now fetch the actual cycle data
        this.fetchCycleData(this.selectedCycle);
      }
    });
    
    // Listen for cycle data responses
    this.wsClient.on('cycle_data', (data: any) => {
      console.log('Received cycle_data:', data);
      if (data.cyber === this.selectedCyber && data.cycle_number !== undefined) {
        // Check what stages are in the data
        const stages = data.data ? Object.keys(data.data) : [];
        console.log(`Cycle ${data.cycle_number} has stages:`, stages);
        
        // Check if cycle is complete by looking at metadata
        const metadata = data.data?.metadata;
        const isComplete = metadata?.status === 'completed';
        
        // Only cache if we have valid data with all main stages or if marked complete
        // We need all 4 main stages for a complete cycle
        const mainStages = ['observation', 'decision', 'execution', 'reflection'];
        const hasAllMainStages = mainStages.every(stage => stages.includes(stage));
        
        // Only cache if:
        // 1. Cycle is marked as complete in metadata, OR
        // 2. We have ALL 4 main stages (observation, decision, execution, reflection)
        if (data.data && (isComplete || hasAllMainStages)) {
          console.log(`Caching cycle ${data.cycle_number} (complete: ${isComplete}, hasAll: ${hasAllMainStages})`);
          this.cycleData.set(data.cycle_number, data.data);
        } else {
          console.warn(`Not caching incomplete cycle ${data.cycle_number}. Has: ${stages.join(', ')}, Complete: ${isComplete}`);
          // Don't cache incomplete data
          // If this is the current cycle and it's incomplete, schedule a retry
          if (data.cycle_number === this.selectedCycle) {
            console.log(`Cycle ${data.cycle_number} is incomplete, will retry in 1s...`);
            setTimeout(() => {
              // Only retry if still on the same cycle
              if (this.selectedCycle === data.cycle_number) {
                console.log(`Retrying cycle ${data.cycle_number}...`);
                this.fetchCycleData(data.cycle_number, true);
              }
            }, 1000);
          }
        }
        
        if (data.cycle_number === this.selectedCycle && this.cycleData.has(data.cycle_number)) {
          this.displayStageData();
        }
      }
    });
    
    // Listen for cycles list response
    this.wsClient.on('cycles_list', (data: any) => {
      console.log('Received cycles_list:', data);
      if (data.cyber === this.selectedCyber) {
        // If we have cycles data from index.json, use it
        if (data.cycles && data.cycles.length > 0) {
          const validCycles = data.cycles
            .map((c: any) => typeof c === 'number' ? c : c.cycle_number || 0)
            .filter((n: number) => n > 0);  // Skip cycle 0 as it's usually incomplete
          
          console.log('Valid cycles found:', validCycles);
          
          if (validCycles.length > 0) {
            this.currentCycle = Math.max(...validCycles);
            this.selectedCycle = this.currentCycle;
            console.log(`Set currentCycle to ${this.currentCycle}, selectedCycle to ${this.selectedCycle}`);
          }
        }
        // If no cycles from index.json, we'll rely on current_reflection to give us the current cycle
        // Don't default to 1 here - wait for actual data
        
        const cycleInput = this.container.querySelector('#cycle-number') as HTMLInputElement;
        if (cycleInput && this.selectedCycle > 0 && this.selectedCycle < 999) {
          cycleInput.value = this.selectedCycle.toString();
        }
        this.updateCycleStatus();
        // Fetch the current cycle data if we have a valid cycle
        if (this.selectedCycle > 0 && this.selectedCycle < 999) {
          this.fetchCycleData(this.selectedCycle);
        }
      }
    });
    
    // Listen for current reflection response (contains cycle info)
    this.wsClient.on('current_reflection', (data: any) => {
      console.log('Received current_reflection:', data);
      if (data.cyber === this.selectedCyber) {
        // Get the actual cycle number from the response
        const cycleNum = data.cycle_number;
        if (cycleNum && cycleNum > 0) {
          // This is the current/latest cycle
          this.currentCycle = cycleNum;
          
          // Always set selectedCycle on initial load (when it's 999)
          if (this.selectedCycle >= 999) {
            this.selectedCycle = cycleNum;
            console.log(`Setting selectedCycle to ${this.selectedCycle} from current_reflection`);
          } else if (this.selectedCycle <= 0) {
            // Also handle the case where it might be 0 or negative
            this.selectedCycle = cycleNum;
            console.log(`Setting selectedCycle to ${this.selectedCycle} from current_reflection (was <= 0)`);
          }
          
          // Update the input field
          const cycleInput = this.container.querySelector('#cycle-number') as HTMLInputElement;
          if (cycleInput && this.selectedCycle > 0) {
            cycleInput.value = this.selectedCycle.toString();
            console.log(`Updated cycle input to ${this.selectedCycle}`);
          }
          
          this.updateCycleStatus();
          
          // Fetch the full cycle data if we just set the selected cycle
          if (this.selectedCycle === cycleNum) {
            this.fetchCycleData(this.selectedCycle);
          }
        }

        // If we are viewing Reflection, show the latest reflection text immediately to avoid stale content
        if (this.selectedStage === 'reflection' && data.reflection) {
          const contentEl = this.container.querySelector('#info-content') as HTMLElement | null;
          if (contentEl) {
            const text = typeof data.reflection === 'string' ? data.reflection : JSON.stringify(data.reflection);
            contentEl.innerHTML = this.formatStageData(text);
            this.updateStatus(`Showing reflection for cycle ${this.selectedCycle}`);
            this.maybeAutoSpeakReflection(typeof data.reflection === 'string' ? data.reflection : undefined);
          }
        }
      }
    });
    
    // Listen for cycle started events
    this.wsClient.on('cycle_started', (message: any) => {
      console.log('Received cycle_started event:', message);
      const data = message.data || message;  // Handle both nested and flat structures
      if (data.cyber === this.selectedCyber) {
        console.log(`Cycle started for ${data.cyber}: ${data.cycle_number}, Following: ${this.isFollowing}`);
        this.currentCycle = data.cycle_number;
        this.updateCycleStatus();
        // In follow mode, do NOT switch to the new cycle immediately to avoid showing loading
        // We'll switch on cycle_completed when data is ready
      }
    });
    
    // Listen for cycle completed events (more reliable than cycle_started)
    this.wsClient.on('cycle_completed', (message: any) => {
      console.log('Received cycle_completed event:', message);
      const data = message.data || message;  // Handle both nested and flat structures
      if (data.cyber === this.selectedCyber) {
        console.log(`Cycle completed for ${data.cyber}: ${data.cycle_number}, Following: ${this.isFollowing}`);
        this.currentCycle = data.cycle_number;
        this.updateCycleStatus();
        if (this.isFollowing) {
          console.log(`Following mode active, showing completed cycle ${data.cycle_number}`);
          this.selectedCycle = data.cycle_number;
          this.fetchCycleData(this.selectedCycle, true);  // Force refresh to get complete data
          
          // Update the cycle input field
          const cycleInput = this.container.querySelector('#cycle-number') as HTMLInputElement;
          if (cycleInput) {
            cycleInput.value = this.selectedCycle.toString();
          }
        }
      }
    });

    // Update title with current location when an agent's location changes
    this.wsClient.on('agent_location_changed', (data: any) => {
      if (!this.selectedCyber) return;
      if (data.name === this.selectedCyber) {
        this.updateTitleWithLocation();
      }
    });

    // Also react to status updates that may include location
    this.wsClient.on('status_update', (data: any) => {
      if (!this.selectedCyber || !data?.Cybers) return;
      const info = (data.Cybers as Record<string, any>)[this.selectedCyber];
      if (info && (typeof info.current_location === 'string' || info.current_location === null)) {
        this.updateTitleWithLocation();
      }
    });
  }
  
  public selectCyber(cyberName: string) {
    this.selectedCyber = cyberName;
    this.cycleData.clear();
    this.show();
    // Clear previous agent's content immediately to avoid stale display
    const contentEl = this.container.querySelector('#info-content') as HTMLElement | null;
    if (contentEl) contentEl.innerHTML = '';
    
    // Update title (includes current location if available)
    this.updateTitleWithLocation();
    
    // Default to Reflection stage view
    this.selectStage('reflection');

    // Update status to show we're tracking this cyber without spamming 'Loading'
    this.updateStatus('Following cyber');
    
    // Use the fast endpoint to get just the current cycle number
    this.wsClient.send({
      type: 'get_current_cycle',
      cyber: cyberName,
      request_id: `current_cycle_${Date.now()}`
    });

    // Also request the latest reflection text immediately for quick display
    this.wsClient.send({
      type: 'get_current_reflection',
      cyber: cyberName,
      request_id: `current_reflection_${Date.now()}`
    });
  }

  // Update the title bar to include current location next to the cyber name
  private updateTitleWithLocation() {
    const nameEl = this.container.querySelector('#cyber-name') as HTMLElement | null;
    if (!nameEl) return;
    const cyberName = this.selectedCyber || 'No Cyber Selected';
    let locationText = '';
    if (this.selectedCyber) {
      const agent = this.agentManager.getAgentData(this.selectedCyber);
      const loc = agent?.currentLocation;
      if (loc && typeof loc === 'string') {
        locationText = ` — ${this.ellipsizePath(loc, 60)}`;
      }
    }
    nameEl.textContent = `Cyber: ${cyberName}${locationText}`;
  }

  // Ellipsize a path by keeping the start and end, collapsing the middle.
  // Example: a/b/c/d/e/f -> a/b/…/e/f (and also limit total length)
  private ellipsizePath(path: string, maxLen: number = 60): string {
    const norm = path.replace(/\\/g, '/');
    const parts = norm.split('/').filter(Boolean);
    if (parts.length <= 4) {
      return norm.length > maxLen ? `${norm.slice(0, Math.max(0, maxLen - 1))}…` : norm;
    }
    const start = parts.slice(0, 2).join('/');
    const end = parts.slice(-2).join('/');
    let out = `${start}/…/${end}`;
    if (out.length > maxLen) {
      // If still too long, trim start further
      const keep = Math.max(8, Math.floor((maxLen - 3) / 2));
      out = `${norm.slice(0, keep)}…${norm.slice(-keep)}`;
    }
    return out;
  }
  
  private selectStage(stage: string) {
    this.selectedStage = stage;
    
    // Update button states
    const stageBtns = this.container.querySelectorAll('.stage-btn');
    stageBtns.forEach(btn => {
      const btnEl = btn as HTMLElement;
      if (btnEl.dataset.stage === stage) {
        btnEl.style.background = 'rgba(0, 255, 255, 0.3)';
        btnEl.style.borderColor = '#00ffff';
        btnEl.style.color = '#00ffff';
      } else {
        btnEl.style.background = 'rgba(0, 128, 255, 0.2)';
        btnEl.style.borderColor = '#0080ff';
        btnEl.style.color = '#0080ff';
      }
    });
    
    this.displayStageData();
  }
  
  private displayStageData() {
    const contentEl = this.container.querySelector('#info-content') as HTMLElement;
    const cycleData = this.cycleData.get(this.selectedCycle);
    
    console.log(`Displaying stage ${this.selectedStage} for cycle ${this.selectedCycle}`, cycleData);
    
    if (!cycleData) {
      // Do not replace content with a loading message; keep last shown content
      // Especially when selectedCycle is the live cycle, avoid flicker
      this.updateStatus(this.selectedCycle === this.currentCycle ? 'Awaiting latest cycle...' : 'Waiting for data...');
      return;
    }
    
    const stageData = cycleData[this.selectedStage as keyof CycleData];
    if (!stageData) {
      contentEl.innerHTML = `
        <div style="color: #666; text-align: center; padding: 20px;">
          No data for ${this.selectedStage} stage in cycle ${this.selectedCycle}
        </div>
      `;
      return;
    }
    
    // Format and display the stage data
    contentEl.innerHTML = this.formatStageData(stageData);
    this.updateStatus(`Showing ${this.selectedStage} from cycle ${this.selectedCycle}`);
    // Auto-speak reflection when it changes
    if (this.selectedStage === 'reflection') {
      this.maybeAutoSpeakReflection();
    }
  }
  
  private formatStageData(data: any): string {
    // Reflection: show only the cycle summary, no metadata/JSON dumps
    if (this.selectedStage === 'reflection') {
      let summary: any = null;
      if (typeof data === 'string') {
        summary = data;
      } else if (data) {
        summary = (data as any).cycle_summary
          || (data.stage_output && ((data.stage_output as any).cycle_summary || (data.stage_output as any).summary))
          || (data as any).summary
          || null;
      }
      const text = typeof summary === 'string' ? summary : 'No summary available yet.';
      return `<div class="stage-output" style="font-size: 28px; line-height: 1.6;">
        <pre style="white-space: pre-wrap; word-wrap: break-word; line-height: 1.6;">${this.escapeHtml(text)}</pre>
      </div>`;
    }
    
    if (typeof data === 'string') {
      return `<div class="stage-output" style="font-size: 28px; line-height: 1.6;">
        <pre style="white-space: pre-wrap; word-wrap: break-word; line-height: 1.6;">${this.escapeHtml(data)}</pre>
      </div>`;
    }
    
    // Format different stage data types
    let html = '<div class="stage-output" style="font-size: 28px; line-height: 1.6;">';
    
    // Add stage name and timestamp if available
    if (data.stage) {
      html += `<h3 style="color: #00ff80; margin: 0 0 10px 0;">Stage: ${data.stage}</h3>`;
    }
    if (data.timestamp) {
      html += `<div style="color: #888; font-size: 0.6em; margin-bottom: 10px;">Time: ${new Date(data.timestamp).toLocaleString()}</div>`;
    }
    
    // Special handling for execution stage with scripts
    // Check both direct script field and stage_output.script
    const script = data.script || (data.stage_output && data.stage_output.script);
    if (script) {
      html += '<h4 style="color: #00ffff; margin: 15px 0 10px 0;">Python Script:</h4>';
      html += this.formatPythonScript(script);
    }
    
    // Show execution results if available
    // Check both direct results field and stage_output.results
    const results = data.results || (data.stage_output && data.stage_output.results);
    if (results && Array.isArray(results)) {
      html += '<h4 style="color: #00ffff; margin: 15px 0 10px 0;">Execution Results:</h4>';
      for (const result of results) {
        html += '<div style="border-left: 2px solid #00ff80; padding-left: 10px; margin: 10px 0;">';
        if (result.status) {
          const statusColor = result.status === 'completed' ? '#00ff80' : '#ff8080';
          html += `<div style="color: ${statusColor};">Status: ${result.status}</div>`;
        }
        if (result.output) {
          html += '<div style="margin-top: 5px;">Output:</div>';
          html += `<pre style="color: #00ff80; margin-left: 10px; white-space: pre-wrap; word-wrap: break-word;">${this.escapeHtml(result.output)}</pre>`;
        }
        if (result.execution_time) {
          html += `<div style="color: #888; font-size: 0.6em;">Time: ${result.execution_time}</div>`;
        }
        if (result.script_lines) {
          html += `<div style="color: #888; font-size: 0.6em;">Script lines: ${result.script_lines}</div>`;
        }
        if (result.attempt) {
          html += `<div style="color: #888; font-size: 0.6em;">Attempt: ${result.attempt}</div>`;
        }
        html += '</div>';
      }
    }
    
    if (data.stage_output) {
      html += '<h4 style="color: #00ffff; margin: 0 0 10px 0;">Stage Output:</h4>';
      // Check if stage_output is a string that contains stringified JSON
      let outputToFormat = data.stage_output;
      if (typeof outputToFormat === 'string' && outputToFormat.includes('\\n')) {
        // Replace escaped newlines with actual newlines
        outputToFormat = outputToFormat.replace(/\\n/g, '\n');
        // Replace escaped quotes
        outputToFormat = outputToFormat.replace(/\\"/g, '"');
        // Replace escaped backslashes
        outputToFormat = outputToFormat.replace(/\\\\/g, '\\');
      }
      html += this.formatValue(outputToFormat);
    }
    
    if (data.working_memory && this.selectedStage === 'observation') {
      html += '<h4 style="color: #00ffff; margin: 15px 0 10px 0;">Working Memory Summary:</h4>';
      const mem = data.working_memory;
      html += `<div style="color: #00ff80; margin-left: 10px; line-height: 1.6;">`;
      html += `<div>Max Tokens: ${mem.max_tokens || 'N/A'}</div>`;
      html += `<div>Current Task: ${mem.current_task_id || 'None'}</div>`;
      html += `<div>Memory Items: ${mem.memories ? mem.memories.length : 0}</div>`;
      html += `</div>`;
    }
    
    if (data.llm_input) {
      html += '<h4 style="color: #00ffff; margin: 15px 0 10px 0;">LLM Input:</h4>';
      html += '<details><summary style="cursor: pointer; color: #0080ff;">Click to expand</summary>';
      html += this.formatValue(data.llm_input);
      html += '</details>';
    }
    
    if (data.llm_output) {
      html += '<h4 style="color: #00ffff; margin: 15px 0 10px 0;">LLM Output:</h4>';
      html += '<details><summary style="cursor: pointer; color: #0080ff;">Click to expand</summary>';
      html += this.formatValue(data.llm_output);
      html += '</details>';
    }
    
    if (data.token_usage && Object.keys(data.token_usage).length > 0) {
      html += '<h4 style="color: #00ffff; margin: 15px 0 10px 0;">Token Usage:</h4>';
      html += this.formatValue(data.token_usage);
    }
    
    if (data.duration_ms) {
      html += `<div style="color: #888; margin-top: 10px; font-size: 0.6em;">Duration: ${data.duration_ms}ms</div>`;
    }
    
    html += '</div>';
    return html;
  }
  
  private formatValue(value: any): string {
    if (typeof value === 'string') {
      // Try to parse as JSON if it looks like JSON
      if ((value.startsWith('{') || value.startsWith('[')) && 
          (value.endsWith('}') || value.endsWith(']'))) {
        try {
          const parsed = JSON.parse(value);
          return `<pre style="color: #00ff80; margin-left: 10px; white-space: pre-wrap; word-wrap: break-word; line-height: 1.6;">${this.escapeHtml(JSON.stringify(parsed, null, 2))}</pre>`;
        } catch {
          // Not valid JSON, treat as regular string
        }
      }
      
      // For multiline strings, use pre tag to preserve formatting
      if (value.includes('\n')) {
        return `<pre style="color: #00ff80; margin-left: 10px; white-space: pre-wrap; word-wrap: break-word; line-height: 1.6;">${this.escapeHtml(value)}</pre>`;
      }
      
      // Single line string
      return `<div style="color: #00ff80; margin-left: 10px; line-height: 1.6;">${this.escapeHtml(value)}</div>`;
    }
    
    if (typeof value === 'object' && value !== null) {
      return `<pre style="color: #00ff80; margin-left: 10px; white-space: pre-wrap; word-wrap: break-word; line-height: 1.6;">${this.escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
    }
    
    return `<div style="color: #00ff80; margin-left: 10px; line-height: 1.6;">${value}</div>`;
  }
  
  private formatPythonScript(script: string): string {
    // First, handle the escaped newlines by replacing them with actual newlines
    // The script comes with literal \n characters, not actual newlines
    const unescapedScript = script.replace(/\\n/g, '\n')
                                  .replace(/\\"/g, '"')
                                  .replace(/\\'/g, "'")
                                  .replace(/\\\\/g, '\\');
    
    // Create a syntax-highlighted version (basic Python highlighting)
    const lines = unescapedScript.split('\n');
    const highlightedLines = lines.map((line, index) => {
      // Add line numbers
      const lineNum = (index + 1).toString().padStart(3, ' ');
      
      // First escape HTML characters to prevent XSS
      let highlightedLine = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      
      // Highlight strings FIRST (before keywords) to avoid highlighting keywords inside strings
      // Handle triple quotes, double quotes, and single quotes
      highlightedLine = highlightedLine.replace(/("""[^"]*"""|'''[^']*'''|"[^"]*"|'[^']*')/g, 
        '<span style="color: #80ff80;">$1</span>');
      
      // Highlight Python keywords (simple approach without lookbehind for browser compatibility)
      const keywords = ['import', 'from', 'def', 'class', 'if', 'else', 'elif', 'for', 'while', 
                       'return', 'try', 'except', 'finally', 'with', 'as', 'in', 'is', 'not',
                       'and', 'or', 'True', 'False', 'None', 'print', 'isinstance', 'json'];
      keywords.forEach(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'g');
        highlightedLine = highlightedLine.replace(regex, `<span style="color: #ff80ff;">${keyword}</span>`);
      });
      
      // Highlight common Mind-Swarm objects
      const mindSwarmObjects = ['memory', 'tasks', 'knowledge', 'cbr', 'environment'];
      mindSwarmObjects.forEach(obj => {
        const regex = new RegExp(`\\b${obj}\\b`, 'g');
        highlightedLine = highlightedLine.replace(regex, `<span style="color: #80ffff;">${obj}</span>`);
      });
      
      // Highlight comments (everything after # that's not in a string)
      const commentIndex = line.indexOf('#');
      if (commentIndex !== -1) {
        // Check if the # is inside a string by counting quotes before it
        const beforeComment = line.substring(0, commentIndex);
        const singleQuotes = (beforeComment.match(/'/g) || []).length;
        const doubleQuotes = (beforeComment.match(/"/g) || []).length;
        
        // If even number of quotes, the # is not in a string
        if (singleQuotes % 2 === 0 && doubleQuotes % 2 === 0) {
          const beforeCommentHighlighted = highlightedLine.substring(0, highlightedLine.lastIndexOf(line.substring(commentIndex)));
          const commentPart = line.substring(commentIndex)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          highlightedLine = beforeCommentHighlighted + `<span style="color: #808080;">${commentPart}</span>`;
        }
      }
      
      return `<span style="color: #666;">${lineNum}│</span> ${highlightedLine}`;
    });
    
    // Return the pre-formatted block with proper HTML (not escaped)
    return `<pre style="background: rgba(0, 0, 0, 0.3); padding: 10px; border-radius: 4px; overflow-x: auto; line-height: 1.5; font-family: 'Courier New', monospace;">${highlightedLines.join('\n')}</pre>`;
  }
  
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  private navigateCycle(direction: number) {
    this.selectedCycle += direction;
    
    // Clamp to valid range (1 to currentCycle)
    if (this.selectedCycle < 1) {
      this.selectedCycle = 1;
    } else if (this.currentCycle > 0 && this.selectedCycle > this.currentCycle) {
      // Only clamp upper bound if we know the actual current cycle
      this.selectedCycle = this.currentCycle;
    }
    
    const cycleInput = this.container.querySelector('#cycle-number') as HTMLInputElement;
    if (cycleInput && this.selectedCycle > 0 && this.selectedCycle < 999) {
      cycleInput.value = this.selectedCycle.toString();
    }
    
    this.updateCycleStatus();
    this.fetchCycleData(this.selectedCycle);
  }
  
  private goToCurrentCycle() {
    if (this.selectedCyber) {
      // First request cycles list to get the latest valid cycle
      this.wsClient.send({
        type: 'get_cycles',
        cyber: this.selectedCyber,
        limit: 10,
        request_id: `cycles_${Date.now()}`
      });
      
      // Also request current reflection
      this.wsClient.send({
        type: 'get_current_reflection',
        cyber: this.selectedCyber,
        request_id: `current_${Date.now()}`
      });
    }
  }
  
  private fetchCycleData(cycleNumber: number, forceRefresh: boolean = false) {
    if (!this.selectedCyber) return;
    
    // Don't fetch invalid cycle numbers
    if (cycleNumber <= 0 || cycleNumber >= 999) {
      console.warn(`Skipping fetch for invalid cycle number: ${cycleNumber}`);
      return;
    }
    
    // Check cache first (unless forcing refresh)
    if (!forceRefresh && this.cycleData.has(cycleNumber)) {
      const cachedData = this.cycleData.get(cycleNumber);
      // Check if cached data has ALL main stages or is marked complete
      const stages = Object.keys(cachedData || {});
      const mainStages = ['observation', 'decision', 'execution', 'reflection'];
      const hasAllMainStages = mainStages.every(stage => stages.includes(stage));
      const isComplete = cachedData?.metadata?.status === 'completed';
      
      if (isComplete || hasAllMainStages) {
        console.log(`Using cached data for cycle ${cycleNumber} (complete: ${isComplete}, stages: ${stages.join(', ')})`);
        this.displayStageData();
        return;
      } else {
        console.log(`Cached data for cycle ${cycleNumber} is incomplete, re-fetching... Has: ${stages.join(', ')}`);
        this.cycleData.delete(cycleNumber);  // Remove incomplete data
      }
    }
    
    // Request from server
    const request = {
      type: 'get_cycle_data',
      cyber: this.selectedCyber,
      cycle_number: cycleNumber,
      request_id: `cycle_${cycleNumber}_${Date.now()}`
    };
    console.log('Requesting cycle data:', request);
    this.wsClient.send(request);
    
    // Avoid heavy-handed 'Loading...' messaging; keep subtle
    this.updateStatus(`Fetching cycle ${cycleNumber}…`);
  }
  
  private toggleFollow() {
    this.isFollowing = !this.isFollowing;
    const btnFollow = this.container.querySelector('#btn-follow') as HTMLButtonElement;
    
    if (this.isFollowing) {
      btnFollow.style.background = 'rgba(0, 255, 0, 0.3)';
      btnFollow.style.borderColor = '#00ff00';
      btnFollow.style.color = '#00ff00';
      btnFollow.textContent = '👁 Following';
      this.updateStatus('Following cyber updates');
      
      // Also enable camera follow if we have a camera controller and selected cyber
      if (this.cameraController && this.selectedCyber) {
        const agent = this.agentManager.getAgentData(this.selectedCyber);
        if (agent) {
          this.cameraController.setMode(CameraMode.FOLLOW);
          this.cameraController.setTarget(agent.mesh);
        }
      }
    } else {
      btnFollow.style.background = 'rgba(0, 128, 255, 0.2)';
      btnFollow.style.borderColor = '#0080ff';
      btnFollow.style.color = '#00ffff';
      btnFollow.textContent = '👁 Follow';
      this.updateStatus('Follow mode disabled');
      
      // Disable camera follow
      if (this.cameraController) {
        this.cameraController.setMode(CameraMode.ORBIT);
        this.cameraController.setTarget(null);
      }
    }
  }
  
  private adjustZoom(delta: number) {
    this.textZoom = Math.max(0.5, Math.min(2.0, this.textZoom + delta));
    
    // Update zoom level display
    const zoomLevelEl = this.container.querySelector('#zoom-level') as HTMLElement;
    if (zoomLevelEl) {
      zoomLevelEl.textContent = `${Math.round(this.textZoom * 100)}%`;
    }
    
    // Apply zoom to content
    const content = this.container.querySelector('#info-content') as HTMLElement;
    if (content) {
      content.style.fontSize = `${14 * this.textZoom}px`;
    }
    // Scale stage output to be 2x content size
    const stageOutputs = this.container.querySelectorAll('.stage-output') as NodeListOf<HTMLElement>;
    stageOutputs.forEach(el => {
      el.style.fontSize = `${28 * this.textZoom}px`;
    });
    
    // Apply zoom to other text elements
    const statusBar = this.container.querySelector('.status-bar') as HTMLElement;
    if (statusBar) {
      statusBar.style.fontSize = `${14 * this.textZoom}px`;
    }
    
    const stageButtons = this.container.querySelectorAll('.stage-btn') as NodeListOf<HTMLElement>;
    stageButtons.forEach(btn => {
      btn.style.fontSize = `${16 * this.textZoom}px`;
    });
  }
  
  private openMessageDialog() {
    // TODO: Implement message dialog
    console.log('Opening message dialog for', this.selectedCyber);
    this.updateStatus('Message dialog not yet implemented');
  }

  // Toggle text-to-speech for the current reflection
  private toggleTTS() {
    if (this.isSpeaking) {
      this.stopTTS();
    } else {
      const text = this.getCurrentReflectionText();
      if (!text) {
        // Proactively request reflection, then auto-speak on response
        if (this.selectedCyber) {
          this.updateStatus('Requesting current reflection…');
          try {
            this.wsClient.send({ type: 'get_current_reflection', cyber: this.selectedCyber, request_id: `read_${Date.now()}` });
          } catch {}
        } else {
          this.updateStatus('No cyber selected');
        }
        return;
      }
      this.updateStatus(`Reading ${text.length} characters…`);
      this.speak(text);
    }
  }

  // Choose best TTS path (external endpoint if configured; else Web Speech API)
  private speak(text: string) {
    const trimmed = (text || '').trim();
    if (!trimmed) { this.updateStatus('Nothing to read'); return; }
    // Clamp to reasonable length for TTS
    const MAX_CHARS = 2000;
    const payload = trimmed.length > MAX_CHARS ? `${trimmed.slice(0, MAX_CHARS)}…` : trimmed;
    // If currently speaking, queue the latest payload and let current finish
    if (this.isSpeaking) {
      this.speakQueue = [payload]; // keep only the latest
      this.updateStatus('Queued next reflection');
      return;
    }
    if (config.ttsUrl) this.startExternalTTS(payload); else this.startTTS(payload);
  }

  private startTTS(text: string) {
    try {
      // Fallback to external TTS endpoint if speechSynthesis is unavailable
      if (!('speechSynthesis' in window)) {
        if (config.ttsUrl) {
          this.startExternalTTS(text);
        } else {
          this.updateStatus('TTS unsupported in this browser');
        }
        return;
      }
      // If we don't have interaction or voices yet, queue
      if (!this.userGestureEnabled) {
        this.pendingSpeakText = text;
        this.updateStatus('Tap to enable audio');
        return;
      }
      if (!this.voicesReady) {
        this.pendingSpeakText = text;
        this.updateStatus('Loading voices…');
        try { window.speechSynthesis.getVoices(); } catch {}
        return;
      }

      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      // Voice tuning (conservative defaults)
      utter.rate = this.getDesiredRate();
      utter.pitch = 1.0;
      utter.volume = 1.0;
      const v = this.pickVoiceForCyber(this.selectedCyber || '', window.speechSynthesis.getVoices());
      if (v) utter.voice = v;
      utter.onstart = () => {
        this.isSpeaking = true;
        this.lastSpokenText = text;
        this.updateTTSButton();
        this.updateStatus('Reading reflection…');
      };
      utter.onend = () => {
        this.isSpeaking = false;
        this.updateTTSButton();
        this.updateStatus('Finished reading reflection');
        this.processNextSpeak();
      };
      utter.onerror = () => {
        this.isSpeaking = false;
        this.updateTTSButton();
        this.updateStatus('TTS error');
        this.processNextSpeak();
      };
      window.speechSynthesis.speak(utter);
    } catch (e) {
      this.isSpeaking = false;
      this.updateTTSButton();
      this.updateStatus('Failed to start TTS');
    }
  }

  // External TTS: POST text to an endpoint, expect audio (audio/mpeg or audio/wav)
  private async startExternalTTS(text: string) {
    try {
      if (!config.ttsUrl) {
        this.updateStatus('No TTS endpoint configured');
        return;
      }
      // Ensure an <audio> element exists and is attached (helps some embeds)
      if (!this.ttsAudio) {
        this.ttsAudio = document.createElement('audio');
        this.ttsAudio.style.display = 'none';
        this.ttsAudio.preload = 'auto';
        this.ttsAudio.autoplay = true;
        this.ttsAudio.controls = false;
        (this.ttsAudio as any).crossOrigin = 'anonymous';
        (this.ttsAudio as any).playsInline = true;
        this.container.appendChild(this.ttsAudio);
      }
      // Stop previous playback
      try { this.ttsAudio.pause(); } catch {}
      if (!this.audioUnlocked && this.userGestureEnabled) {
        // Try to unlock quickly with a silent clip
        try {
          this.ttsAudio.src = this.silentWavDataUri;
          await this.ttsAudio.play().catch(() => {});
          this.audioUnlocked = true;
        } catch {}
      }
      // Prefer direct streaming via GET (simpler path for OBS/CEF)
      const streamUrl = `${config.ttsUrl}?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(this.getVoiceNameForCyber(this.selectedCyber || ''))}&rate=${encodeURIComponent(String(this.getDesiredSayRate()))}`;
      this.updateStatus('Requesting TTS (stream)…');
      this.ttsAudio.src = streamUrl;
      this.ttsAudio.onerror = () => {
        this.updateStatus('Audio element error');
      };
      this.ttsAudio.onended = () => {
        this.isSpeaking = false;
        this.updateTTSButton();
        this.processNextSpeak();
      };
      this.ttsAudio.onerror = () => {
        // Try next queued item if the current failed
        this.isSpeaking = false;
        this.updateTTSButton();
        this.processNextSpeak();
      };
      this.ttsAudio.onplay = () => {
        this.isSpeaking = true;
        this.lastSpokenText = text;
        this.updateTTSButton();
        this.updateStatus('Playing TTS audio…');
      };
      let played = false;
      await this.ttsAudio.play().then(() => { played = true; }).catch(() => {});
      if (!played) {
        // Fallback: fetch blob and play
        this.updateStatus('TTS stream blocked, fetching audio…');
        const res = await fetch(config.ttsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voice: this.getVoiceNameForCyber(this.selectedCyber || ''), rate: this.getDesiredSayRate() })
        });
        if (!res.ok) {
          this.updateStatus(`TTS request failed (${res.status})`);
          this.isSpeaking = false;
          this.updateTTSButton();
          return this.processNextSpeak();
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        this.ttsAudio.src = url;
        played = false;
        await this.ttsAudio.play().then(() => { played = true; }).catch((e) => {
          this.updateStatus('Audio playback blocked');
          console.warn('TTS blob play() failed', e);
        });
        if (!played) {
          // Give up cleanly and try next queued item
          this.isSpeaking = false;
          this.updateTTSButton();
          return this.processNextSpeak();
        }
      }
    } catch (e) {
      this.isSpeaking = false;
      this.updateTTSButton();
      this.updateStatus('External TTS failed');
    }
  }

  // Desired speaking rate for Web Speech (slightly faster than default)
  private getDesiredRate(): number { return 1.2; }
  // Desired say(1) rate (macOS default ~175); use a bit faster
  private getDesiredSayRate(): number { return 220; }

  // Map cyber name to a stable voice choice
  private getVoiceNameForCyber(name: string): string {
    // Common macOS voices; you can customize
    const candidates = ['Samantha', 'Alex', 'Victoria', 'Ava', 'Daniel', 'Karen', 'Moira'];
    if (!name) return candidates[0];
    const idx = this.hashString(name) % candidates.length;
    return candidates[idx];
  }

  private pickVoiceForCyber(name: string, voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
    const targetName = this.getVoiceNameForCyber(name);
    // Prefer exact match by name
    let v = voices.find(v => v.name === targetName) || null;
    if (v) return v;
    // Fallback: pick an English voice deterministically
    const en = voices.filter(v => (v.lang || '').toLowerCase().startsWith('en'));
    if (en.length > 0) {
      const idx = this.hashString(name || 'default') % en.length;
      return en[idx];
    }
    // Final fallback: any voice
    return voices[0] || null;
  }

  private hashString(s: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // Manual test button to validate OBS Browser Source audio routing
  private testTTS() {
    const phrase = 'Test audio. If you can hear this, OBS audio routing is working.';
    if ('speechSynthesis' in window && !config.ttsUrl) {
      // Use Web Speech API in regular browsers
      this.startTTS(phrase);
    } else {
      // Force external TTS if configured
      if (config.ttsUrl) {
        this.startExternalTTS(phrase);
      } else {
        this.updateStatus('No TTS available: set ?tts= endpoint or run START_TTS=1');
      }
    }
  }

  private stopTTS() {
    try { window.speechSynthesis.cancel(); } catch {}
    try { this.ttsAudio?.pause(); } catch {}
    this.isSpeaking = false;
    this.updateTTSButton();
    this.updateStatus('Stopped reading');
  }

  private updateTTSButton() {
    const btn = this.container.querySelector('#btn-tts') as HTMLButtonElement | null;
    if (!btn) return;
    if (this.isSpeaking) {
      btn.textContent = '⏹ Stop';
      btn.style.background = 'rgba(255, 64, 64, 0.25)';
      btn.style.borderColor = '#ff4040';
      btn.style.color = '#ffcccc';
    } else {
      btn.textContent = '🔊 Read';
      btn.style.background = 'rgba(255, 128, 0, 0.2)';
      btn.style.borderColor = '#ff8000';
      btn.style.color = '#ffb366';
    }
  }

  // Extract the current reflection text to be read aloud
  private getCurrentReflectionText(): string | null {
    // Prefer structured cycle data if available
    const data = this.cycleData.get(this.selectedCycle) as any;
    let reflection = data?.reflection;
    let text: string | null = null;
    if (typeof reflection === 'string') {
      text = reflection;
    } else if (reflection) {
      text = reflection.cycle_summary
        || reflection.summary
        || reflection.stage_output?.cycle_summary
        || reflection.stage_output?.summary
        || null;
    }
    // Fallback to currently displayed content text
    if (!text) {
      const contentEl = this.container.querySelector('#info-content') as HTMLElement | null;
      if (contentEl) {
        const raw = contentEl.innerText || contentEl.textContent || '';
        text = raw.trim().length > 0 ? raw.trim() : null;
      }
    }
    return text;
  }

  // Speak reflection automatically when it changes
  private maybeAutoSpeakReflection(providedText?: string) {
    if (!this.isAutoSpeak) return;
    const text = (providedText && typeof providedText === 'string')
      ? providedText
      : (this.getCurrentReflectionText() || '');
    const trimmed = text.trim();
    if (!trimmed) return;
    if (trimmed === (this.lastSpokenText || '').trim()) return; // avoid repeats
    // Debounce bursts of reflections; only speak the latest after a short settle
    if (this.autoSpeakTimer) clearTimeout(this.autoSpeakTimer);
    this.autoSpeakTimer = setTimeout(() => {
      this.autoSpeakTimer = null;
      // If currently speaking, queue latest; otherwise speak now
      if (this.isSpeaking) {
        this.speakQueue = [trimmed];
        this.updateStatus('Queued next reflection');
      } else {
        this.speak(trimmed);
      }
    }, this.autoSpeakDelayMs);
  }

  // Speak the next queued item if present (uses latest only)
  private processNextSpeak() {
    if (this.speakQueue.length > 0) {
      const next = this.speakQueue[this.speakQueue.length - 1];
      this.speakQueue = [];
      this.speak(next);
    }
  }
  
  private refreshData() {
    if (this.selectedCyber && this.selectedCycle > 0 && this.selectedCycle < 999) {
      // Force refresh bypasses cache
      this.fetchCycleData(this.selectedCycle, true);
      this.updateStatus('Refreshing data...');
    }
  }
  
  private updateCycleStatus() {
    const statusEl = this.container.querySelector('#cycle-status') as HTMLElement;
    const rangeEl = this.container.querySelector('#cycle-range') as HTMLElement;
    
    // Update range display
    if (rangeEl) {
      if (this.currentCycle > 0) {
        rangeEl.textContent = `/ ${this.currentCycle}`;
        rangeEl.style.color = '#00ffff';
      } else {
        rangeEl.textContent = '/ -';
        rangeEl.style.color = '#888';
      }
    }
    
    // Update status indicator
    if (this.selectedCycle === this.currentCycle) {
      statusEl.style.color = '#00ff00';
      statusEl.textContent = '● LIVE';
    } else {
      statusEl.style.color = '#666';
      statusEl.textContent = '○';
    }
  }
  
  private updateStatus(message: string) {
    const statusEl = this.container.querySelector('#status-text') as HTMLElement;
    const timeEl = this.container.querySelector('#last-update') as HTMLElement;
    
    statusEl.textContent = message;
    timeEl.textContent = new Date().toLocaleTimeString();
  }
  
  public show() {
    this.container.style.display = 'flex';
  }
  
  public hide() {
    this.container.style.display = 'none';
    this.selectedCyber = null;
  }
  
  public isVisible(): boolean {
    return this.container.style.display !== 'none';
  }
  
  public setCameraController(cameraController: CameraController) {
    this.cameraController = cameraController;
  }
}
