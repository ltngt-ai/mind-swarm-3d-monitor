import * as THREE from 'three';
import { Mode, ModeContext } from './Mode';
import { CameraMode } from '../camera/CameraController';
import { Mailbox } from '../Mailbox';
import { eventBus, Events } from '../utils/EventBus';
import { config } from '../config';

export class UserMode extends Mode {
  // private cameraController?: CameraController;
  private mailbox?: Mailbox;
  private selectedCyber: string | null = null;
  private followingCyber: boolean = false;
  
  // Movement controls
  private moveSpeed: number = 0.5;
  private keys: Record<string, boolean> = {};
  
  // UI elements
  private cyberInfo?: HTMLDivElement;
  private controlsHelp?: HTMLDivElement;
  
  // Raycasting for selection
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;

  constructor(context: ModeContext) {
    super('User', context);
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    
    // Initialize UI elements on construction
    this.createCyberInfoPanel();
    this.createControlsHelp();
  }

  protected setupUI(): void {
    // UI elements already created in constructor
    
    // GUI controls
    if (this.guiFolder) {
      this.guiFolder.add({ moveSpeed: this.moveSpeed }, 'moveSpeed', 0.1, 2.0)
        .name('Move Speed')
        .onChange((value: number) => {
          this.moveSpeed = value;
        });
        
      this.guiFolder.add({ followCyber: this.followingCyber }, 'followCyber')
        .name('Follow Selected Cyber')
        .onChange((value: boolean) => {
          this.setFollowMode(value);
        });
        
      this.guiFolder.add({ 
        sendMessage: () => this.openMessageDialog() 
      }, 'sendMessage').name('Send Message');
      
      this.guiFolder.add({
        openMailbox: () => this.toggleMailbox()
      }, 'openMailbox').name('📧 Open Mailbox');
    }
  }

  protected setupEventHandlers(): void {
    // Keyboard events
    window.addEventListener('keydown', this.onKeyDown.bind(this));
    window.addEventListener('keyup', this.onKeyUp.bind(this));
    
    // Mouse events
    // Mouse events are handled through handleMouseClick and handleMouseMove
    
    // Cyber selection events
    eventBus.on(Events.CYBER_SELECTED, this.onCyberSelected.bind(this));
    eventBus.on(Events.CYBER_DESELECTED, this.onCyberDeselected.bind(this));
  }

  protected cleanupEventHandlers(): void {
    window.removeEventListener('keydown', this.onKeyDown.bind(this));
    window.removeEventListener('keyup', this.onKeyUp.bind(this));
    // Mouse events cleanup
    
    eventBus.off(Events.CYBER_SELECTED, this.onCyberSelected.bind(this));
    eventBus.off(Events.CYBER_DESELECTED, this.onCyberDeselected.bind(this));
  }

  protected async onActivate(): Promise<void> {
    // Initialize mailbox if not already done
    if (!this.mailbox) {
      this.mailbox = new Mailbox();
    }
    
    // Show user UI
    if (this.cyberInfo) this.cyberInfo.style.display = 'block';
    if (this.controlsHelp) this.controlsHelp.style.display = 'block';
    
    // Set camera to orbit mode with manual controls
    this.context.cameraController.setMode(CameraMode.ORBIT);
    this.context.cameraController.enableControls(true);
    this.context.cameraController.setAutoRotate(false);
    
    this.showNotification('User mode activated - Click on Cybers to select them', 'info');
    
    // Start refreshing mailbox
    this.startMailboxRefresh();
  }

  protected async onDeactivate(): Promise<void> {
    // Hide user UI
    if (this.cyberInfo) this.cyberInfo.style.display = 'none';
    if (this.controlsHelp) this.controlsHelp.style.display = 'none';
    
    // Stop following if active
    this.setFollowMode(false);
    
    // Clear selection
    this.deselectCyber();
  }

  update(deltaTime: number): void {
    // Handle WASD movement
    this.handleMovement(deltaTime);
    
    // Update follow mode if active
    if (this.followingCyber && this.selectedCyber) {
      this.updateFollowMode();
    }
    
    // Update cyber info panel
    this.updateCyberInfo();
  }

  handleKeyPress(key: string): boolean {
    switch (key) {
      case 'f': // Toggle follow mode
        this.setFollowMode(!this.followingCyber);
        return true;
      case 'm': // Open mailbox
        this.toggleMailbox();
        return true;
      case 'escape': // Deselect
        this.deselectCyber();
        return true;
      case 'tab': // Cycle through cybers
        this.cycleSelection();
        return true;
      case 'enter': // Send message to selected
        if (this.selectedCyber) {
          this.openMessageDialog();
        }
        return true;
      case 'h': // Toggle help
        this.toggleHelp();
        return true;
      default:
        return false;
    }
  }

  handleMouseClick(event: MouseEvent): boolean {
    if (!event) return false;
    // Update mouse position
    const mouseEvent = event as MouseEvent;
    this.mouse.x = (mouseEvent.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(mouseEvent.clientY / window.innerHeight) * 2 + 1;
    
    console.log('Mouse click at:', this.mouse.x, this.mouse.y);
    
    // Raycast to find clicked cyber
    this.raycaster.setFromCamera(this.mouse, this.context.camera);
    
    const agent = this.context.agentManager.getAgentAtPosition(this.raycaster);
    if (agent) {
      console.log('Selected cyber:', agent.name);
      this.selectCyber(agent.name);
      this.updateCyberInfo(); // Update info immediately
      return true;
    } else {
      console.log('No cyber found at click position');
    }
    
    return false;
  }

  handleMouseMove(_event: MouseEvent): void {
    // Update mouse position for hover effects - not needed in current implementation
    // this.mouse.x = (_event.clientX / window.innerWidth) * 2 - 1;
    // this.mouse.y = -(_event.clientY / window.innerHeight) * 2 + 1;
  }

  private onKeyDown(event: KeyboardEvent): void {
    // Ignore if typing in input field
    if (event.target instanceof HTMLInputElement || 
        event.target instanceof HTMLTextAreaElement || 
        event.target instanceof HTMLSelectElement) {
      return;
    }
    
    this.keys[event.key.toLowerCase()] = true;
  }

  private onKeyUp(event: KeyboardEvent): void {
    this.keys[event.key.toLowerCase()] = false;
  }

  private handleMovement(_deltaTime: number): void {
    const moveVector = new THREE.Vector3();
    
    if (this.keys['w']) moveVector.z -= this.moveSpeed;
    if (this.keys['s']) moveVector.z += this.moveSpeed;
    if (this.keys['a']) moveVector.x -= this.moveSpeed;
    if (this.keys['d']) moveVector.x += this.moveSpeed;
    
    if (moveVector.length() > 0) {
      // Apply movement relative to camera orientation
      moveVector.applyQuaternion(this.context.camera.quaternion);
      moveVector.y = 0; // Keep movement horizontal
      
      // Move camera and its target together
      this.context.cameraController.moveCamera(moveVector);
    }
  }

  private setFollowMode(enabled: boolean): void {
    this.followingCyber = enabled;
    
    if (enabled && this.selectedCyber) {
      // Start following selected cyber
      const agent = this.context.agentManager.getAgentData(this.selectedCyber);
      if (agent) {
        this.context.cameraController.setMode(CameraMode.FOLLOW);
        this.context.cameraController.setTarget(agent.mesh);
        this.showNotification(`Following ${this.selectedCyber}`, 'info');
      }
    } else {
      // Stop following
      this.context.cameraController.setMode(CameraMode.ORBIT);
      this.context.cameraController.setTarget(null);
      if (this.followingCyber) {
        this.showNotification('Follow mode disabled', 'info');
      }
    }
  }

  private updateFollowMode(): void {
    if (!this.selectedCyber) return;
    
    const agent = this.context.agentManager.getAgentData(this.selectedCyber);
    if (!agent) {
      // Cyber disappeared, stop following
      this.setFollowMode(false);
      this.deselectCyber();
    }
  }

  private cycleSelection(): void {
    // Get all cyber names
    const cybers: string[] = [];
    for (let i = 0; i < this.context.agentManager.getAgentCount(); i++) {
      // This would need a method to get all cyber names
      // For now, just a placeholder
    }
    
    if (cybers.length === 0) return;
    
    if (!this.selectedCyber) {
      // Select first
      this.selectCyber(cybers[0]);
    } else {
      // Find current index and select next
      const currentIndex = cybers.indexOf(this.selectedCyber);
      const nextIndex = (currentIndex + 1) % cybers.length;
      this.selectCyber(cybers[nextIndex]);
    }
  }

  private onCyberSelected(cyberName: string): void {
    this.selectedCyber = cyberName;
    this.updateCyberInfo();
  }

  private onCyberDeselected(): void {
    this.selectedCyber = null;
    this.setFollowMode(false);
    this.updateCyberInfo();
  }

  private toggleMailbox(): void {
    if (this.mailbox) {
      this.mailbox.toggle();
    }
  }

  private openMessageDialog(): void {
    if (!this.selectedCyber) {
      this.showNotification('No Cyber selected', 'warning');
      return;
    }
    
    const message = prompt(`Send message to ${this.selectedCyber}:`);
    if (message) {
      this.sendMessageToCyber(this.selectedCyber, message);
    }
  }

  private async sendMessageToCyber(cyberName: string, content: string): Promise<void> {
    try {
      const response = await fetch(`${config.apiUrl}/Cybers/${cyberName}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content, message_type: 'text' }),
      });
      
      if (response.ok) {
        this.showNotification(`Message sent to ${cyberName}`, 'info');
      } else {
        this.showNotification('Failed to send message', 'error');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      this.showNotification('Failed to send message', 'error');
    }
  }

  private toggleHelp(): void {
    if (this.controlsHelp) {
      const isVisible = this.controlsHelp.style.display !== 'none';
      this.controlsHelp.style.display = isVisible ? 'none' : 'block';
    }
  }

  private createCyberInfoPanel(): void {
    this.cyberInfo = document.createElement('div');
    this.cyberInfo.id = 'cyber-info-panel';
    this.cyberInfo.style.cssText = `
      position: fixed;
      bottom: 80px;
      left: 20px;
      background: rgba(0, 20, 40, 0.9);
      border: 1px solid #00ffff;
      border-radius: 10px;
      padding: 15px;
      color: #00ffff;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      min-width: 250px;
      display: none;
      z-index: 500;
    `;
    
    document.body.appendChild(this.cyberInfo);
  }

  private createControlsHelp(): void {
    this.controlsHelp = document.createElement('div');
    this.controlsHelp.id = 'controls-help';
    this.controlsHelp.style.cssText = `
      position: fixed;
      top: 60px;
      right: 20px;
      background: rgba(0, 20, 40, 0.9);
      border: 1px solid #0080ff;
      border-radius: 10px;
      padding: 15px;
      color: #00ffff;
      font-family: 'Courier New', monospace;
      font-size: 11px;
      display: none;
      z-index: 500;
    `;
    
    this.controlsHelp.innerHTML = `
      <h4 style="margin: 0 0 10px 0;">Controls</h4>
      <div><b>WASD</b> - Move camera</div>
      <div><b>Click</b> - Select Cyber</div>
      <div><b>F</b> - Follow selected</div>
      <div><b>M</b> - Open mailbox</div>
      <div><b>Enter</b> - Message selected</div>
      <div><b>Tab</b> - Cycle selection</div>
      <div><b>ESC</b> - Deselect</div>
      <div><b>H</b> - Toggle this help</div>
      <div style="margin-top: 10px; opacity: 0.7;">
        <b>Mouse</b> - Orbit camera<br>
        <b>Scroll</b> - Zoom
      </div>
    `;
    
    document.body.appendChild(this.controlsHelp);
  }

  private updateCyberInfo(): void {
    if (!this.cyberInfo) return;
    
    if (!this.selectedCyber) {
      this.cyberInfo.innerHTML = `
        <h4 style="margin: 0 0 10px 0;">No Cyber Selected</h4>
        <div style="opacity: 0.7;">Click on a Cyber to select</div>
      `;
      return;
    }
    
    const agent = this.context.agentManager.getAgentData(this.selectedCyber);
    if (!agent) return;
    
    // Get thought history
    const thoughts = this.context.agentManager.getAgentThoughtHistory(this.selectedCyber);
    const recentThought = thoughts.length > 0 ? thoughts[0].thought : 'No thoughts yet...';
    
    this.cyberInfo.innerHTML = `
      <h4 style="margin: 0 0 10px 0;">${agent.name}</h4>
      <div>Type: ${agent.type}${agent.premium ? ' ✨' : ''}</div>
      <div>State: <span style="color: ${this.getStateColor(agent.state)}">${agent.state}</span></div>
      <div>Location: ${agent.currentLocation || 'None'}</div>
      <div style="margin-top: 10px;">
        <b>Recent Thought:</b>
        <div style="opacity: 0.8; font-size: 11px; margin-top: 5px;">
          ${recentThought.substring(0, 100)}${recentThought.length > 100 ? '...' : ''}
        </div>
      </div>
      <div style="margin-top: 10px; opacity: 0.7;">
        Press <b>F</b> to follow | <b>Enter</b> to message
      </div>
    `;
  }

  private getStateColor(state: string): string {
    const colors: Record<string, string> = {
      thinking: '#00ffff',
      communicating: '#00ff00',
      sleeping: '#666666',
      writing: '#ff9f00',
      searching: '#0080ff',
      idle: '#cccccc',
      unknown: '#999999'
    };
    return colors[state] || '#999999';
  }

  private startMailboxRefresh(): void {
    // Refresh mailbox periodically
    if (this.mailbox) {
      this.mailbox.refreshMessages();
      setInterval(() => {
        if (this.isActive && this.mailbox) {
          this.mailbox.refreshMessages();
        }
      }, 10000);
    }
  }
}