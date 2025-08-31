import * as THREE from 'three';
import { Mode, ModeContext } from './Mode';
import { CameraMode } from '../camera/CameraController';
import { eventBus, Events } from '../utils/EventBus';

interface CameraShot {
  type: 'cyber-focus';
  duration: number;
  target?: string; // Cyber name
  position?: THREE.Vector3;
  lookAt?: THREE.Vector3;
}

export class AutomaticMode extends Mode {
  private currentShot: CameraShot | null = null;
  private shotQueue: CameraShot[] = [];
  private lastShotChange: number = Date.now();
  private minShotDuration: number = 5000; // 5 seconds minimum
  private maxShotDuration: number = 15000; // 15 seconds maximum
  
  // Activity tracking
  private cyberActivity: Map<string, number> = new Map();
  private recentEvents: Array<{ type: string; cyber?: string; timestamp: number }> = [];
  private lastActivityCheck: number = Date.now();
  
  // Cinematic settings
  private cinematicPaths: THREE.Vector3[][] = [];
  private currentPathIndex: number = 0;
  
  // UI elements
  private streamOverlay?: HTMLDivElement;
  private activityFeed?: HTMLDivElement;

  constructor(context: ModeContext) {
    super('Automatic', context);
    this.initializeCinematicPaths();
  }

  protected setupUI(): void {
    // Create streaming overlay
    this.createStreamOverlay();
    // Stats panel disabled for a cleaner view
    
    // Add GUI controls
    if (this.guiFolder) {
      this.guiFolder.add({ minDuration: this.minShotDuration / 1000 }, 'minDuration', 3, 30)
        .name('Min Shot Duration (s)')
        .onChange((value: number) => {
          this.minShotDuration = value * 1000;
        });
        
      this.guiFolder.add({ maxDuration: this.maxShotDuration / 1000 }, 'maxDuration', 5, 60)
        .name('Max Shot Duration (s)')
        .onChange((value: number) => {
          this.maxShotDuration = value * 1000;
        });
        
      this.guiFolder.add({ switchNow: () => this.switchShot() }, 'switchNow')
        .name('Switch Camera Now');
    }
  }

  protected setupEventHandlers(): void {
    // Listen for cyber activity
    eventBus.on(Events.CYBER_ACTIVITY, this.onCyberActivity.bind(this));
    
    // Listen for interesting events from WebSocket
    this.context.wsClient.on('agent_thinking', this.onAgentThinking.bind(this));
    this.context.wsClient.on('message_sent', this.onMessageSent.bind(this));
    this.context.wsClient.on('file_activity', this.onFileActivity.bind(this));
    // Biofeedback signal integration
    this.context.wsClient.on('biofeedback', this.onBiofeedback.bind(this));
  }

  protected cleanupEventHandlers(): void {
    eventBus.off(Events.CYBER_ACTIVITY, this.onCyberActivity.bind(this));
  }

  protected async onActivate(): Promise<void> {
    // Disable manual camera controls and follow cybers
    this.context.cameraController.enableControls(false);
    this.context.cameraController.setMode(CameraMode.FOLLOW);
    this.context.cameraController.setAutoRotate(false);

    // Start with a cyber-focus shot if available
    const firstTarget = this.pickTargetCyber();
    if (firstTarget) {
      this.queueShot({ type: 'cyber-focus', duration: 8000, target: firstTarget });
    }
    
    // Execute the first shot immediately
    this.switchShot();
    
    // Start the director AI
    this.startDirector();
    
    // Show streaming UI
    if (this.streamOverlay) this.streamOverlay.style.display = 'block';
    if (this.activityFeed) this.activityFeed.style.display = 'block';
    
    this.showNotification('Automatic mode activated - Following cybers', 'info');
  }

  protected async onDeactivate(): Promise<void> {
    // Re-enable manual camera controls
    this.context.cameraController.enableControls(true);
    this.context.cameraController.setMode(CameraMode.ORBIT);
    this.context.cameraController.setAutoRotate(false);
    
    // Hide streaming UI
    if (this.streamOverlay) this.streamOverlay.style.display = 'none';
    if (this.activityFeed) this.activityFeed.style.display = 'none';
    
    // Clear shot queue
    this.shotQueue = [];
    this.currentShot = null;
  }

  update(_deltaTime: number): void {
    const now = Date.now();

    // If we don't yet have a target but agents exist, pick one now
    if ((!this.currentShot || !this.currentShot.target) && this.context.agentManager.getAgentCount() > 0) {
      const t = this.pickTargetCyber();
      if (t) {
        this.queueShot({ type: 'cyber-focus', duration: this.minShotDuration, target: t });
        this.switchShot();
      }
    }
    
    // Check if it's time to switch shots
    if (this.currentShot && now - this.lastShotChange > this.currentShot.duration) {
      this.switchShot();
    }
    
    // Update shot timer
    if (this.currentShot && this.streamOverlay) {
      const elapsed = (now - this.lastShotChange) / 1000;
      const remaining = (this.currentShot.duration / 1000) - elapsed;
      const timerEl = this.streamOverlay.querySelector('#shot-timer');
      if (timerEl) {
        timerEl.textContent = `Next in: ${Math.max(0, Math.floor(remaining))}s`;
      }
    }
    
    // Update activity tracking
    if (now - this.lastActivityCheck > 1000) {
      this.updateActivityMetrics();
      this.lastActivityCheck = now;
    }
    
    // Update UI (stats panel removed)
  }

  handleKeyPress(key: string): boolean {
    switch (key) {
      case ' ': // Space to force switch
        this.switchShot();
        return true;
      case 'o': // Overview
        this.queueShot({ type: 'overview', duration: 8000 });
        return true;
      case 'c': // Cinematic
        this.startCinematicSequence();
        return true;
      default:
        return false;
    }
  }

  handleMouseClick(_event: MouseEvent): boolean {
    // No mouse interaction in automatic mode
    return false;
  }

  handleMouseMove(_event: MouseEvent): void {
    // No mouse interaction in automatic mode
  }

  private initializeCinematicPaths(): void {
    // Define some cinematic camera paths
    const radius = 100;
    const height = 50;
    
    // Circular overview path
    const circlePath: THREE.Vector3[] = [];
    for (let i = 0; i <= 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      circlePath.push(new THREE.Vector3(
        Math.cos(angle) * radius,
        height,
        Math.sin(angle) * radius
      ));
    }
    this.cinematicPaths.push(circlePath);
    
    // Figure-8 path
    const figure8Path: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = (i / 40) * Math.PI * 2;
      const x = radius * Math.sin(t);
      const z = radius * Math.sin(2 * t) / 2;
      const y = height + Math.sin(t * 3) * 10;
      figure8Path.push(new THREE.Vector3(x, y, z));
    }
    this.cinematicPaths.push(figure8Path);
  }

  private startDirector(): void {
    // AI Director logic - determines what to show based on activity
    setInterval(() => {
      if (this.shotQueue.length < 3) {
        this.planNextShot();
      }
    }, 2000);
  }

  private planNextShot(): void {
    const target = this.pickTargetCyber();
    if (target) {
      this.queueShot({
        type: 'cyber-focus',
        duration: this.minShotDuration + Math.random() * 5000,
        target
      });
    }
  }

  private queueShot(shot: CameraShot): void {
    this.shotQueue.push(shot);
  }

  private switchShot(): void {
    // Get next shot from queue or generate one
    const shot = this.shotQueue.shift() || this.generateRandomShot();
    
    this.currentShot = shot;
    this.lastShotChange = Date.now();
    
    // Execute the shot
    this.executeShot(shot);
    
    // Update overlay
    this.updateStreamOverlay(shot);
  }

  private generateRandomShot(): CameraShot {
    const target = this.pickTargetCyber();
    return {
      type: 'cyber-focus',
      target: target || undefined,
      duration: this.minShotDuration + Math.random() * (this.maxShotDuration - this.minShotDuration)
    };
  }

  private executeShot(shot: CameraShot): void {
    if (shot.type === 'cyber-focus') {
      const target = shot.target || this.pickTargetCyber();
      if (target) this.executeCyberFocusShot(target);
    }
  }

  private executeOverviewShot(): void {
    // Slowly rotating overview
    const radius = 80 + Math.random() * 40;
    const height = 40 + Math.random() * 30;
    const angle = Math.random() * Math.PI * 2;
    
    const position = new THREE.Vector3(
      Math.cos(angle) * radius,
      height,
      Math.sin(angle) * radius
    );
    
    // Animate camera to overview position
    this.context.cameraController.animateTo({
      position,
      lookAt: new THREE.Vector3(0, 0, 0),
      duration: 2000
    });
    
    // Enable slow auto-rotate for overview
    this.context.cameraController.setAutoRotate(true, 0.3);
  }

  private executeCyberFocusShot(cyberName: string): void {
    const agent = this.context.agentManager.getAgentData(cyberName);
    if (!agent) {
      // Fall back to overview if cyber not found
      this.executeOverviewShot();
      return;
    }
    
    // Focus on specific cyber
    // Calculate good viewing angle
    const offset = new THREE.Vector3(15, 20, 15);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
    
    const targetPosition = agent.mesh.position.clone().add(offset);
    
    // Animate camera to focus on cyber
    this.context.cameraController.animateTo({
      position: targetPosition,
      lookAt: agent.mesh.position,
      duration: 1500
    });
    
    // Follow the cyber if it moves
    this.context.cameraController.setMode(CameraMode.FOLLOW);
    this.context.cameraController.setTarget(agent.mesh);
  }

  private executeFilesystemShot(): void {
    // Focus on filesystem visualization
    const position = new THREE.Vector3(0, 60, -30);
    const lookAt = new THREE.Vector3(0, 0, -50);
    
    // Animate camera to filesystem view
    this.context.cameraController.animateTo({
      position,
      lookAt,
      duration: 2000
    });
    
    // Disable auto-rotate for filesystem view
    this.context.cameraController.setAutoRotate(false);
    this.context.cameraController.setMode(CameraMode.ORBIT);
  }

  private executeActivityZoneShot(): void {
    // Find zone with most activity - for now, do a dramatic sweep
    const position = new THREE.Vector3(
      Math.random() * 100 - 50,
      30 + Math.random() * 30,
      Math.random() * 100 - 50
    );
    
    this.context.cameraController.animateTo({
      position,
      lookAt: new THREE.Vector3(0, 0, 0),
      duration: 2500
    });
    
    // Gentle auto-rotate
    this.context.cameraController.setAutoRotate(true, 0.2);
  }

  private startCinematicSequence(): void {
    // Start a cinematic camera path
    const path = this.cinematicPaths[this.currentPathIndex];
    this.currentPathIndex = (this.currentPathIndex + 1) % this.cinematicPaths.length;
    
    // Set the cinematic path and mode
    this.context.cameraController.setCinematicPath(path);
    this.context.cameraController.setMode(CameraMode.CINEMATIC);
    this.context.cameraController.setCinematicSpeed(0.002);
  }

  private onCyberActivity(data: any): void {
    const activity = this.cyberActivity.get(data.cyber) || 0;
    this.cyberActivity.set(data.cyber, activity + 1);
    // If not currently following a specific cyber, pivot to this one
    if (!this.currentShot || !this.currentShot.target) {
      this.queueShot({ type: 'cyber-focus', duration: this.minShotDuration, target: data.cyber });
      if (!this.currentShot) {
        this.switchShot();
      }
    }
    
    // Decay activity over time
    setTimeout(() => {
      const current = this.cyberActivity.get(data.cyber) || 0;
      this.cyberActivity.set(data.cyber, Math.max(0, current - 1));
    }, 10000);
  }

  private onAgentThinking(data: any): void {
    this.addActivityEvent('thinking', data.name);
    this.onCyberActivity({ cyber: data.name });
  }

  private onMessageSent(data: any): void {
    this.addActivityEvent('message', data.from);
  }

  private onFileActivity(data: any): void {
    this.addActivityEvent('file', data.cyber);
  }

  private onBiofeedback(data: any): void {
    // Weight camera interest using backend biofeedback metrics (0-100)
    const boredom = clamp0to100(data.boredom);
    const tired = clamp0to100(data.tiredness);
    const duty = clamp0to100(data.duty);
    const restless = clamp0to100(data.restlessness);
    const mem = clamp0to100(data.memory_pressure);

    // Heuristic: prefer high restlessness (movement), decent duty, lower boredom; slightly avoid very tired
    const score = (restless * 0.6) + (duty * 0.25) + ((100 - boredom) * 0.25) + (mem * 0.1) - (tired * 0.2);
    const boost = Math.max(0, score / 25); // normalize to a small additive boost
    const current = this.cyberActivity.get(data.cyber) || 0;
    this.cyberActivity.set(data.cyber, current + boost);
    this.addActivityEvent('bio', data.cyber);
    // If idle or unfocused, pivot to this cyber quickly
    if (!this.currentShot || !this.currentShot.target) {
      this.queueShot({ type: 'cyber-focus', duration: this.minShotDuration, target: data.cyber });
      if (!this.currentShot) this.switchShot();
    }
  }

  private addActivityEvent(type: string, cyber?: string): void {
    this.recentEvents.push({
      type,
      cyber,
      timestamp: Date.now()
    });
    
    // Keep only recent events
    const cutoff = Date.now() - 60000; // Last minute
    this.recentEvents = this.recentEvents.filter(e => e.timestamp > cutoff);
    
    // Update activity feed
    this.updateActivityFeed();
  }

  private updateActivityMetrics(): void {
    // Calculate various metrics for display
  }

  private createStreamOverlay(): void {
    this.streamOverlay = document.createElement('div');
    this.streamOverlay.id = 'stream-overlay';
    this.streamOverlay.style.cssText = `
      position: fixed;
      top: 40px;
      left: 24px;
      background: rgba(0, 20, 40, 0.8);
      border: 1px solid #00ffff;
      border-radius: 12px;
      padding: 24px;
      color: #00ffff;
      font-family: 'Courier New', monospace;
      font-size: 18px;
      max-width: 520px;
      display: none;
      z-index: 500;
    `;
    
    this.streamOverlay.innerHTML = `
      <h3 style="margin: 0 0 14px 0; font-size: 24px;">
        <span style="display: inline-block; animation: pulse 2s infinite;">🔴</span> LIVE STREAM
      </h3>
      <div id="current-shot" style="font-weight: bold; color: #00ff88; font-size: 22px;">Following: …</div>
      <style>
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
      </style>
    `;
    
    document.body.appendChild(this.streamOverlay);
  }

  private createActivityFeed(): void {
    this.activityFeed = document.createElement('div');
    this.activityFeed.id = 'activity-feed';
    this.activityFeed.style.cssText = `
      position: fixed;
      bottom: 80px;
      right: 20px;
      background: rgba(0, 20, 40, 0.7);
      border: 1px solid #0080ff;
      border-radius: 10px;
      padding: 15px;
      color: #00ffff;
      font-family: 'Courier New', monospace;
      font-size: 11px;
      max-width: 300px;
      max-height: 200px;
      overflow-y: auto;
      display: none;
      z-index: 500;
    `;
    
    this.activityFeed.innerHTML = `
      <h4 style="margin: 0 0 10px 0; font-size: 12px;">Activity Feed</h4>
      <div id="feed-content"></div>
    `;
    
    document.body.appendChild(this.activityFeed);
  }

  // createStatsPanel removed for simplified UI

  private updateStreamOverlay(shot: CameraShot): void {
    if (!this.streamOverlay) return;
    const shotEl = this.streamOverlay.querySelector('#current-shot');
    if (shotEl) {
      const name = shot.target || 'Cyber';
      (shotEl as HTMLElement).textContent = `Following: ${name}`;
    }
  }
  
  private getShotDisplayName(shot: CameraShot): string {
    return `👁️ ${shot.target || 'Cyber'}`;
  }

  private updateActivityFeed(): void {
    if (!this.activityFeed) return;
    
    const content = this.activityFeed.querySelector('#feed-content');
    if (!content) return;
    
    const recentEvents = this.recentEvents.slice(-5).reverse();
    content.innerHTML = recentEvents.map(event => {
      const time = new Date(event.timestamp).toLocaleTimeString();
      return `<div style="margin: 2px 0; opacity: 0.8;">
        [${time}] ${event.cyber || 'System'}: ${event.type}
      </div>`;
    }).join('');
  }

  // updateStatsPanel removed for simplified UI

  private pickTargetCyber(): string | null {
    // Prefer most active cyber first
    let best: string | null = null;
    let max = -1;
    for (const [cyber, score] of this.cyberActivity) {
      if (score > max) { max = score; best = cyber; }
    }
    if (best) return best;
    // Fallback to first known agent
    const names = this.context.agentManager.getAgentNames();
    return names.length > 0 ? names[0] : null;
  }
}

// Helper to clamp potential undefined/NaN to 0-100
function clamp0to100(v: any): number {
  const n = typeof v === 'number' ? v : 0;
  if (!isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}
