import * as THREE from 'three';
import { Mode, ModeContext } from './Mode';
import { CameraMode } from '../camera/CameraController';
import { eventBus, Events } from '../utils/EventBus';
import { TwitchClient, TwitchCommand } from '../twitch/TwitchClient';
import { TwitchChatOverlay } from '../twitch/TwitchChatOverlay';
import { config } from '../config';
import logger from '../utils/logger';

interface CameraShot {
  type: 'cyber-focus' | 'overview';
  duration: number;
  target?: string; // Cyber name
  position?: THREE.Vector3;
  lookAt?: THREE.Vector3;
}

export class AutomaticMode extends Mode {
  private currentShot: CameraShot | null = null;
  private shotQueue: CameraShot[] = [];
  private lastShotChange: number = Date.now();
  private minShotDuration: number = 60000; // 60 seconds minimum
  private maxShotDuration: number = 120000; // 120 seconds maximum
  // Round-robin index for simple cycling between cybers
  private roundRobinIndex: number = -1;
  
  // Activity tracking (recent events only; no per-cyber counters)
  private recentEvents: Array<{ type: string; cyber?: string; timestamp: number }> = [];
  private lastActivityCheck: number = Date.now();
  
  // Cinematic settings
  private cinematicPaths: THREE.Vector3[][] = [];
  private currentPathIndex: number = 0;
  
  // UI elements
  private streamOverlay?: HTMLDivElement;
  // Activity feed removed
  // Safety: force a camera switch at this interval even if a long shot was queued
  private forceSwitchInterval: number = 90000; // 90 seconds hard cap
  
  // Twitch integration
  private twitchClient?: TwitchClient;
  private twitchOverlay?: TwitchChatOverlay;
  private commandQueue: Array<{ command: TwitchCommand; timestamp: number }> = [];

  constructor(context: ModeContext) {
    super('Automatic', context);
    this.initializeCinematicPaths();
    this.initializeTwitch();
  }

  protected setupUI(): void {
    // Create streaming overlay
    this.createStreamOverlay();
    // Activity feed panel disabled/removed
    // Stats panel disabled for a cleaner view
    
    // Add GUI controls
    if (this.guiFolder) {
      this.guiFolder.add({ minDuration: this.minShotDuration / 1000 }, 'minDuration', 30, 180)
        .name('Min Shot Duration (s)')
        .onChange((value: number) => {
          this.minShotDuration = value * 1000;
        });
        
      this.guiFolder.add({ maxDuration: this.maxShotDuration / 1000 }, 'maxDuration', 60, 360)
        .name('Max Shot Duration (s)')
        .onChange((value: number) => {
          this.maxShotDuration = value * 1000;
        });
      // Safety cap for long shots
      this.guiFolder.add({ hardCap: this.forceSwitchInterval / 1000 }, 'hardCap', 30, 240)
        .name('Hard Cap (s)')
        .onChange((value: number) => {
          this.forceSwitchInterval = Math.max(30000, value * 1000);
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
      this.queueShot({ type: 'cyber-focus', duration: this.minShotDuration, target: firstTarget });
      if (this.context.autoInfoWindow) {
        this.context.autoInfoWindow.setDock('bottom-left');
        this.context.autoInfoWindow.selectCyber(firstTarget);
        this.context.autoInfoWindow.setFollowButtonVisible(false);
        // Hide action bar entirely for auto panel
        this.context.autoInfoWindow.setActionBarVisible(false);
      }
    }
    
    // Execute the first shot immediately
    this.switchShot();
    
    // Start the director AI
    this.startDirector();
    
    // Show streaming UI
    if (this.streamOverlay) this.streamOverlay.style.display = 'block';
    // Activity feed hidden (feature disabled)
    
    // Connect to Twitch if configured
    if (config.twitch?.enabled) {
      await this.connectTwitch();
    }
    
    this.showNotification('Automatic mode activated - Following cybers', 'info');
  }

  protected async onDeactivate(): Promise<void> {
    // Re-enable manual camera controls
    this.context.cameraController.enableControls(true);
    this.context.cameraController.setMode(CameraMode.ORBIT);
    this.context.cameraController.setAutoRotate(false);
    
    // Hide streaming UI
    if (this.streamOverlay) this.streamOverlay.style.display = 'none';
    // Activity feed already disabled
    if (this.context.autoInfoWindow) {
      this.context.autoInfoWindow.hide();
      this.context.autoInfoWindow.setFollowButtonVisible(true);
      this.context.autoInfoWindow.setActionBarVisible(true);
    }
    
    // Disconnect Twitch
    if (this.twitchClient) {
      this.twitchClient.disconnect();
    }
    if (this.twitchOverlay) {
      this.twitchOverlay.hide();
    }
    
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
    
    // Check if it's time to switch shots (natural duration)
    if (this.currentShot && now - this.lastShotChange > this.currentShot.duration) {
      this.switchShot();
    }
    // Safety: force switch if we've exceeded the hard cap
    if (this.currentShot && now - this.lastShotChange > this.forceSwitchInterval) {
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
        duration: this.minShotDuration + Math.random() * (this.maxShotDuration - this.minShotDuration),
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
      if (target) {
        // Record actual target so UI shows the correct name
        shot.target = target;
        if (this.currentShot) this.currentShot.target = target;
        if (this.context.autoInfoWindow) {
          this.context.autoInfoWindow.setDock('bottom-left');
          this.context.autoInfoWindow.selectCyber(target);
          // Keep action bar hidden in auto panel
          this.context.autoInfoWindow.setActionBarVisible(false);
        }
        this.executeCyberFocusShot(target);
      }
    } else if (shot.type === 'overview') {
      // Switch to an overview shot
      if (this.context.autoInfoWindow) {
        // Keep overlay docked; no specific cyber selected
        this.context.autoInfoWindow.setDock('bottom-left');
      }
      this.executeOverviewShot();
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

  // Removed unused shots: filesystem view and activity zone

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
    // In round-robin mode, we don't bias toward a specific cyber.
    // Still log activity and keep the feed updated for UX.
    this.addActivityEvent('activity', data.cyber);
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
    // Round-robin mode ignores biofeedback for selection, but still display metrics.
    this.addActivityEvent('bio', data.cyber);
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
    
    // Activity feed removed
  }

  private updateActivityMetrics(): void {
    // Calculate various metrics for display
  }

  private createStreamOverlay(): void {
    // Ensure global styles (keyframes) are present so animations run
    this.ensureGlobalStyles();

    this.streamOverlay = document.createElement('div');
    this.streamOverlay.id = 'stream-overlay';
    this.streamOverlay.style.cssText = `
      position: fixed;
      top: 16px;
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
    `;
    
    document.body.appendChild(this.streamOverlay);
    // Reduce overall size for stream overlay
    this.streamOverlay.style.transform = 'scale(0.75)';
    this.streamOverlay.style.transformOrigin = 'top left';
  }

  private ensureGlobalStyles(): void {
    const styleId = 'automatic-mode-global-styles';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.5; }
        100% { opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  // createActivityFeed removed

  // createStatsPanel removed for simplified UI

  private updateStreamOverlay(shot: CameraShot): void {
    if (!this.streamOverlay) return;
    const shotEl = this.streamOverlay.querySelector('#current-shot');
    if (shotEl) {
      const name = shot.target || 'Cyber';
      const names = this.context.agentManager.getAgentNames();
      const total = names.length;
      let counter = '';
      if (name && total > 0) {
        const idx = names.indexOf(name);
        if (idx !== -1) counter = ` (${idx + 1}/${total})`;
      }
      (shotEl as HTMLElement).textContent = `Following: ${name}${counter}`;
    }
    // Biofeedback bars removed from stream overlay (shown above Cyber instead)
  }
  
  // Removed unused helper (getShotDisplayName)

  // updateActivityFeed removed

  // updateStatsPanel removed for simplified UI

  private pickTargetCyber(): string | null {
    // Simple round-robin cycle through all known cybers
    const names = this.context.agentManager.getAgentNames();
    if (names.length === 0) return null;
    this.roundRobinIndex = (this.roundRobinIndex + 1) % names.length;
    return names[this.roundRobinIndex];
  }
  
  // Twitch integration methods
  private initializeTwitch(): void {
    if (!config.twitch?.enabled) return;
    
    this.twitchClient = new TwitchClient({
      channel: config.twitch.channel,
      mockMode: config.twitch.mockMode,
      commandPrefix: config.twitch.commandPrefix,
      apiUrl: config.apiUrl
    });
    
    this.twitchOverlay = new TwitchChatOverlay(this.twitchClient, {
      position: config.twitch.position,
      maxMessages: 10,
      fadeOutDelay: 30000,
      showCommands: true,
      compactMode: false
    });
    
    // Setup Twitch event handlers
    this.twitchClient.on('command', this.handleTwitchCommand.bind(this));
    this.twitchClient.on('command_response', this.handleTwitchResponse.bind(this));
  }
  
  private async connectTwitch(): Promise<void> {
    if (!this.twitchClient || !config.twitch?.channel) return;
    
    // Show overlay first so UI is ready for connection events
    if (this.twitchOverlay) {
      this.twitchOverlay.show();
    }
    
    logger.info('Connecting to Twitch channel:', config.twitch.channel);
    await this.twitchClient.connect(config.twitch.channel);
    
    // Update stream overlay to show Twitch status
    if (this.streamOverlay) {
      const twitchStatus = document.createElement('div');
      twitchStatus.id = 'twitch-status';
      twitchStatus.style.cssText = `
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid rgba(0, 255, 255, 0.3);
        color: #9146ff;
        font-size: 14px;
      `;
      twitchStatus.innerHTML = `
        <span style="display: inline-block; animation: pulse 2s infinite;">📺</span>
        Twitch: ${config.twitch.channel}
      `;
      this.streamOverlay.appendChild(twitchStatus);
    }
  }
  
  private handleTwitchCommand(command: TwitchCommand): void {
    logger.info('Twitch command received:', command.command, command.args);
    
    // Add to command queue
    this.commandQueue.push({
      command,
      timestamp: Date.now()
    });
    
    // Process command based on type
    switch (command.command) {
      case 'focus':
      case 'follow':
        this.handleFocusCommand(command);
        break;
        
      case 'ask':
        this.handleAskCommand(command);
        break;
        
      case 'status':
        this.handleStatusCommand(command);
        break;
        
      case 'task':
        this.handleTaskCommand(command);
        break;
        
      case 'overview':
        this.queueShot({ type: 'overview', duration: 15000 });
        this.switchShot();
        break;
        
      case 'help':
        this.sendTwitchHelp();
        break;
        
      default:
        logger.warn('Unknown Twitch command:', command.command);
    }
  }
  
  private handleFocusCommand(command: TwitchCommand): void {
    const agentName = command.args[0];
    if (!agentName) return;
    
    // Find matching agent (case insensitive)
    const names = this.context.agentManager.getAgentNames();
    const match = names.find(name => name.toLowerCase() === agentName.toLowerCase());
    
    if (match) {
      // Queue immediate focus on the requested cyber
      this.queueShot({ 
        type: 'cyber-focus', 
        duration: 30000, // 30 second focus for viewer requests
        target: match 
      });
      this.switchShot();
      
      // Send confirmation
      this.twitchClient?.sendResponse('System', `Focusing camera on ${match}`);
    } else {
      this.twitchClient?.sendResponse('System', `Agent "${agentName}" not found`);
    }
  }
  
  private async handleAskCommand(command: TwitchCommand): Promise<void> {
    const agentName = command.args[0];
    const question = command.args.slice(1).join(' ');
    
    if (!agentName || !question) {
      this.twitchClient?.sendResponse('System', 'Usage: !ask [agent] [question]');
      return;
    }
    
    // Find matching agent
    const names = this.context.agentManager.getAgentNames();
    const match = names.find(name => name.toLowerCase() === agentName.toLowerCase());
    
    if (!match) {
      this.twitchClient?.sendResponse('System', `Agent "${agentName}" not found`);
      return;
    }
    
    // Focus on the agent being asked
    this.queueShot({ 
      type: 'cyber-focus', 
      duration: 20000,
      target: match 
    });
    this.switchShot();
    
    // In mock mode, generate a response
    if (config.twitch?.mockMode) {
      setTimeout(() => {
        const mockResponses = [
          'Processing your request...',
          'Analyzing the data streams...',
          'Interesting question, let me think...',
          'Scanning the network for answers...',
          'Consulting with other agents...'
        ];
        const response = mockResponses[Math.floor(Math.random() * mockResponses.length)];
        
        // Show thought bubble on agent
        this.context.agentManager.showThought(match, `@${command.message.displayName}: ${question}`);
        
        // Send response to Twitch
        this.twitchClient?.sendResponse(match, response);
      }, 2000);
    } else {
      // Send to backend
      try {
        const response = await fetch(`${config.apiUrl}/api/twitch/ask`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent: match,
            question: question,
            user: command.message.displayName
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          this.twitchClient?.sendResponse(match, data.response);
        }
      } catch (error) {
        logger.error('Failed to process ask command:', error);
      }
    }
  }
  
  private handleStatusCommand(_command: TwitchCommand): void {
    const agentCount = this.context.agentManager.getAgentCount();
    const activeAgents = this.context.agentManager.getAgentNames().slice(0, 5).join(', ');
    const status = `${agentCount} agents active | Currently showing: ${activeAgents}`;
    
    this.twitchClient?.sendResponse('System', status);
  }
  
  private async handleTaskCommand(command: TwitchCommand): Promise<void> {
    const taskDescription = command.args.join(' ');
    
    if (!taskDescription) {
      this.twitchClient?.sendResponse('System', 'Usage: !task [description]');
      return;
    }
    
    // Only allow mods/VIPs to create tasks
    if (!command.message.isMod && !command.message.isVip) {
      this.twitchClient?.sendResponse('System', 'Only moderators can create tasks');
      return;
    }
    
    if (config.twitch?.mockMode) {
      this.twitchClient?.sendResponse('System', `Task queued: "${taskDescription}"`);
    } else {
      try {
        const response = await fetch(`${config.apiUrl}/api/twitch/task`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: taskDescription,
            user: command.message.displayName
          })
        });
        
        if (response.ok) {
          this.twitchClient?.sendResponse('System', 'Task created successfully');
        }
      } catch (error) {
        logger.error('Failed to create task:', error);
      }
    }
  }
  
  private handleTwitchResponse(data: any): void {
    const { command, response, success } = data;
    
    if (success && response) {
      // Visual feedback for successful commands
      if (command.command === 'focus' && this.currentShot?.target) {
        this.showNotification(`Camera focusing on ${this.currentShot.target}`, 'info');
      }
    }
  }
  
  private sendTwitchHelp(): void {
    const helpMessage = [
      'Available commands:',
      '!ask [agent] [question] - Ask an agent a question',
      '!focus [agent] - Focus camera on an agent',
      '!status - Show system status',
      '!overview - Switch to overview camera',
      '!task [description] - Create a new task (mods only)',
      '!help - Show this help message'
    ].join(' | ');
    
    this.twitchClient?.sendResponse('System', helpMessage);
  }
}
