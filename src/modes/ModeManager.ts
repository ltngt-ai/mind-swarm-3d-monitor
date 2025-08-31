import { Mode, ModeContext } from './Mode';
import { eventBus, Events } from '../utils/EventBus';

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
    console.log(`Registered mode: ${type}`);
  }

  async switchMode(type: AppMode): Promise<void> {
    if (this.transitioning) {
      console.warn('Mode transition already in progress');
      return;
    }

    if (this.currentModeType === type) {
      console.log(`Already in ${type} mode`);
      return;
    }

    const newMode = this.modes.get(type);
    if (!newMode) {
      console.error(`Mode ${type} not registered`);
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
      console.log(`Deactivating ${this.currentModeType} mode`);
      await this.currentMode.deactivate();
    }

    // Switch to new mode
    this.currentMode = newMode;
    this.currentModeType = type;
    
    // Activate new mode
    console.log(`Activating ${type} mode`);
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

  private createModeSelectorUI(): void {
    const selector = document.createElement('div');
    selector.id = 'mode-selector';
    selector.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 20, 40, 0.9);
      border: 1px solid #0080ff;
      border-radius: 25px;
      padding: 10px;
      display: flex;
      gap: 10px;
      z-index: 999;
    `;
    
    const meta: Record<AppMode, { label: string; icon: string; key: string }> = {
      [AppMode.AUTOMATIC]: { label: 'Automatic', icon: '🎬', key: '1' },
      [AppMode.USER]: { label: 'User', icon: '👤', key: '2' },
      [AppMode.DEVELOPER]: { label: 'Developer', icon: '⚙️', key: '3' }
    };
    // Only show buttons for registered modes
    const modes: { type: AppMode; label: string; icon: string; key: string }[] = Array.from(this.modes.keys()).map(type => ({ type, ...meta[type] }));
    
    modes.forEach(mode => {
      const button = document.createElement('button');
      button.style.cssText = `
        background: rgba(0, 40, 80, 0.8);
        border: 1px solid #0080ff;
        border-radius: 20px;
        color: #00ffff;
        padding: 8px 16px;
        cursor: pointer;
        font-family: 'Courier New', monospace;
        font-size: 12px;
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        gap: 5px;
      `;
      
      button.innerHTML = `${mode.icon} ${mode.label} <small>[${mode.key}]</small>`;
      button.title = `Switch to ${mode.label} Mode (Press ${mode.key})`;
      
      button.addEventListener('click', () => {
        this.switchMode(mode.type);
      });
      
      button.addEventListener('mouseenter', () => {
        button.style.background = 'rgba(0, 60, 120, 1)';
        button.style.transform = 'scale(1.05)';
      });
      
      button.addEventListener('mouseleave', () => {
        button.style.background = this.currentModeType === mode.type 
          ? 'rgba(0, 100, 200, 1)' 
          : 'rgba(0, 40, 80, 0.8)';
        button.style.transform = 'scale(1)';
      });
      
      selector.appendChild(button);
    });
    
    document.body.appendChild(selector);
    
    // Update button states when mode changes
    eventBus.on(Events.MODE_CHANGED, () => {
      const buttons = selector.querySelectorAll('button');
      buttons.forEach((button, index) => {
        const mode = modes[index];
        if (this.currentModeType === mode.type) {
          (button as HTMLElement).style.background = 'rgba(0, 100, 200, 1)';
          (button as HTMLElement).style.borderColor = '#00ffff';
        } else {
          (button as HTMLElement).style.background = 'rgba(0, 40, 80, 0.8)';
          (button as HTMLElement).style.borderColor = '#0080ff';
        }
      });
    });
  }

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
