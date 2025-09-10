import * as THREE from 'three';
import GUI from 'lil-gui';
import { AgentManager } from '../AgentManager';
import { FilesystemVisualizer } from '../FilesystemVisualizer';
import { GridSystem } from '../GridSystem';
import { WebSocketClient } from '../WebSocketClient';
import { CameraController } from '../camera/CameraController';
import { eventBus, Events } from '../utils/EventBus';
import { CyberInfoWindow } from '../ui/CyberInfoWindow';
import logger from '../utils/logger';

export interface ModeContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  cameraController: CameraController;
  agentManager: AgentManager;
  filesystemViz: FilesystemVisualizer;
  gridSystem: GridSystem;
  wsClient: WebSocketClient;
  gui: GUI;
  // Separate panels for automatic vs interactive modes
  autoInfoWindow?: CyberInfoWindow;
  userInfoWindow?: CyberInfoWindow;
}

export abstract class Mode {
  protected context: ModeContext;
  protected isActive: boolean = false;
  protected name: string;
  protected guiFolder?: GUI;

  constructor(name: string, context: ModeContext) {
    this.name = name;
    this.context = context;
  }

  getName(): string {
    return this.name;
  }

  isActiveMode(): boolean {
    return this.isActive;
  }

  async activate(): Promise<void> {
    logger.debug(`Activating ${this.name} mode`);
    this.isActive = true;
    
    // Create GUI folder for this mode
    this.guiFolder = this.context.gui.addFolder(this.name + ' Settings');
    
    // Setup mode-specific UI
    this.setupUI();
    
    // Setup mode-specific event handlers
    this.setupEventHandlers();
    
    // Perform mode-specific activation
    await this.onActivate();
    
    eventBus.emit(Events.MODE_CHANGED, this.name);
  }

  async deactivate(): Promise<void> {
    logger.debug(`Deactivating ${this.name} mode`);
    this.isActive = false;
    
    // Cleanup mode-specific stuff
    await this.onDeactivate();
    
    // Remove event handlers
    this.cleanupEventHandlers();
    
    // Remove GUI folder
    if (this.guiFolder) {
      // GUI doesn't have removeFolder, so we'll just hide it
      this.guiFolder.destroy();
      this.guiFolder = undefined;
    }
  }

  // Abstract methods that each mode must implement
  protected abstract setupUI(): void;
  protected abstract setupEventHandlers(): void;
  protected abstract cleanupEventHandlers(): void;
  protected abstract onActivate(): Promise<void>;
  protected abstract onDeactivate(): Promise<void>;
  
  // Update method called every frame
  abstract update(deltaTime: number): void;
  
  // Handle user input
  abstract handleKeyPress(key: string): boolean;
  abstract handleMouseClick(event: MouseEvent): boolean;
  abstract handleMouseMove(event: MouseEvent): void;
  
  // Common utility methods available to all modes
  protected showNotification(message: string, type: 'info' | 'warning' | 'error' = 'info'): void {
    eventBus.emit(Events.UI_NOTIFICATION, { message, type });
  }
  
  protected selectCyber(cyberName: string): void {
    this.context.agentManager.selectAgent(cyberName);
    eventBus.emit(Events.CYBER_SELECTED, cyberName);
  }
  
  protected deselectCyber(): void {
    this.context.agentManager.selectAgent(null);
    eventBus.emit(Events.CYBER_DESELECTED);
  }
}
