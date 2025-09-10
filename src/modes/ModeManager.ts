import { Mode, ModeContext } from './Mode';
import { eventBus, Events } from '../utils/EventBus';
import logger from '../utils/logger';

export enum AppMode {
  AUTOMATIC = 'automatic',
  USER = 'user',
  DEVELOPER = 'developer'
}

export class ModeManager {
  private modes: Map<AppMode, Mode> = new Map();
  private currentMode: Mode | null = null;
  private currentModeType: AppMode | null = null;
  // private context: ModeContext;
  private transitioning: boolean = false;

  constructor(_context: ModeContext) {
    // this.context = context;
    this.setupKeyboardShortcuts();
  }

  registerMode(type: AppMode, mode: Mode): void {
    this.modes.set(type, mode);
    logger.debug(`Registered mode: ${type}`);
  }

  async switchMode(type: AppMode): Promise<void> {
    if (this.transitioning) {
      logger.warn('Mode transition already in progress');
      return;
    }

    if (this.currentModeType === type) {
      logger.debug(`Already in ${type} mode`);
      return;
    }

    const newMode = this.modes.get(type);
    if (!newMode) {
      logger.error(`Mode ${type} not registered`);
      return;
    }

    this.transitioning = true;
    
    // Emit before change event
    eventBus.emit(Events.MODE_BEFORE_CHANGE, {
      from: this.currentModeType,
      to: type
    });

    // Deactivate current mode
    if (this.currentMode) {
      logger.debug(`Deactivating ${this.currentModeType} mode`);
      await this.currentMode.deactivate();
    }

    // Switch to new mode
    this.currentMode = newMode;
    this.currentModeType = type;
    
    // Activate new mode
    logger.debug(`Activating ${type} mode`);
    await this.currentMode.activate();
    
    // Update UI to show current mode
    this.updateModeIndicator(type);
    
    this.transitioning = false;
    
    // Save mode preference
    localStorage.setItem('mindswarm-mode', type);
  }

  getCurrentMode(): Mode | null {
    return this.currentMode;
  }

  getCurrentModeType(): AppMode | null {
    return this.currentModeType;
  }

  update(deltaTime: number): void {
    if (this.currentMode && !this.transitioning) {
      this.currentMode.update(deltaTime);
    }
  }

  handleKeyPress(key: string): boolean {
    // Check for mode switching keys first
    if (key === '1' && !this.transitioning) {
      this.switchMode(AppMode.AUTOMATIC);
      return true;
    } else if (key === '2' && !this.transitioning) {
      this.switchMode(AppMode.USER);
      return true;
    } else if (key === '3' && !this.transitioning) {
      this.switchMode(AppMode.DEVELOPER);
      return true;
    }

    // Pass to current mode
    if (this.currentMode && !this.transitioning) {
      return this.currentMode.handleKeyPress(key);
    }
    
    return false;
  }

  handleMouseClick(event: MouseEvent): boolean {
    if (this.currentMode && !this.transitioning) {
      return this.currentMode.handleMouseClick(event);
    }
    return false;
  }

  handleMouseMove(event: MouseEvent): void {
    if (this.currentMode && !this.transitioning) {
      this.currentMode.handleMouseMove(event);
    }
  }

  private setupKeyboardShortcuts(): void {
    // Keyboard events
    window.addEventListener('keydown', (e) => {
      // Ignore if typing in input field
      if (e.target instanceof HTMLInputElement || 
          e.target instanceof HTMLTextAreaElement || 
          e.target instanceof HTMLSelectElement) {
        return;
      }
      
      this.handleKeyPress(e.key.toLowerCase());
    });
    
    // Mouse events
    window.addEventListener('click', (e) => {
      this.handleMouseClick(e);
    });
    
    window.addEventListener('mousemove', (e) => {
      this.handleMouseMove(e);
    });
  }

  private updateModeIndicator(_mode: AppMode): void {
    // Mode indicator disabled for simplified UI
    const indicator = document.getElementById('mode-indicator');
    if (indicator) indicator.remove();
  }

  async initialize(defaultMode?: AppMode): Promise<void> {
    // Determine desired mode from URL, default, or saved; only use if registered
    const urlParams = new URLSearchParams(window.location.search);
    const urlModeParam = (urlParams.get('mode') || '').toLowerCase() as AppMode;
    const isRegistered = (m?: AppMode | null) => !!m && this.modes.has(m);
    const pick = (...candidates: (AppMode | undefined)[]): AppMode => {
      for (const c of candidates) { if (isRegistered(c as AppMode)) return c as AppMode; }
      // Fallback to first registered mode
      return (this.modes.keys().next().value as AppMode) || AppMode.AUTOMATIC;
    };

    const savedMode = localStorage.getItem('mindswarm-mode') as AppMode;
    const modeToLoad = pick(urlModeParam, defaultMode, savedMode, AppMode.AUTOMATIC);
    if (savedMode && !isRegistered(savedMode)) {
      // Clean up stale preference
      localStorage.removeItem('mindswarm-mode');
    }
    
    // Mode selector UI removed for simplified presentation
    
    // Switch to initial mode
    await this.switchMode(modeToLoad);
  }

  // Mode selector UI removed (kept minimal)

  dispose(): void {
    // Clean up event listeners and UI elements
    const indicator = document.getElementById('mode-indicator');
    if (indicator) indicator.remove();
    
    const selector = document.getElementById('mode-selector');
    if (selector) selector.remove();
    
    // Deactivate current mode
    if (this.currentMode) {
      this.currentMode.deactivate();
    }
    
    this.modes.clear();
  }
}
