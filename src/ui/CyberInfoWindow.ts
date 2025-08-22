import { WebSocketClient } from '../WebSocketClient';
import { AgentManager } from '../AgentManager';

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
  
  private selectedCyber: string | null = null;
  private currentCycle: number = 1;  // Start at 1 since cycle 0 usually doesn't exist
  private selectedCycle: number = 1;  // Start at 1
  private selectedStage: string = 'observation';
  private cycleData: Map<number, CycleData> = new Map();
  
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private windowX = window.innerWidth - 420;
  private windowY = 80;
  
  private isFollowing = false;
  private isMinimized = false;
  
  constructor(wsClient: WebSocketClient, _agentManager: AgentManager) {
    this.wsClient = wsClient;
    // agentManager may be used in future for agent-specific operations
    
    // Create the window container
    this.container = document.createElement('div');
    this.container.className = 'cyber-info-window';
    this.container.style.cssText = `
      position: fixed;
      right: 20px;
      top: 80px;
      width: 400px;
      background: rgba(0, 20, 40, 0.95);
      border: 2px solid #00ffff;
      border-radius: 8px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      color: #00ffff;
      z-index: 1000;
      display: none;
      backdrop-filter: blur(10px);
      box-shadow: 0 0 20px rgba(0, 255, 255, 0.3);
    `;
    
    this.setupWindow();
    document.body.appendChild(this.container);
    
    // Listen for WebSocket events
    this.setupEventListeners();
  }
  
  private setupWindow() {
    this.container.innerHTML = `
      <!-- Title Bar -->
      <div class="window-titlebar" style="
        background: linear-gradient(90deg, #0080ff, #00ffff);
        padding: 8px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: move;
        border-radius: 6px 6px 0 0;
      ">
        <span style="color: #001133; font-weight: bold;" id="cyber-name">No Cyber Selected</span>
        <div class="window-controls" style="display: flex; gap: 8px;">
          <button class="win-btn" id="btn-minimize" style="
            background: #ffff00;
            border: none;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            cursor: pointer;
          ">−</button>
          <button class="win-btn" id="btn-maximize" style="
            background: #00ff00;
            border: none;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            cursor: pointer;
          ">□</button>
          <button class="win-btn" id="btn-close" style="
            background: #ff0080;
            border: none;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            cursor: pointer;
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
          <input type="number" id="cycle-number" value="0" style="
            background: rgba(0, 255, 255, 0.1);
            border: 1px solid #00ffff;
            color: #00ffff;
            width: 60px;
            padding: 2px 5px;
            border-radius: 4px;
            text-align: center;
          ">
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
        display: flex;
        gap: 5px;
        flex-wrap: wrap;
        border-bottom: 1px solid #0080ff;
      ">
        <button class="stage-btn active" data-stage="observation" style="
          background: rgba(0, 255, 255, 0.3);
          border: 1px solid #00ffff;
          color: #00ffff;
          padding: 5px 10px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
        ">Observation</button>
        <button class="stage-btn" data-stage="decision" style="
          background: rgba(0, 128, 255, 0.2);
          border: 1px solid #0080ff;
          color: #0080ff;
          padding: 5px 10px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
        ">Decision</button>
        <button class="stage-btn" data-stage="execution" style="
          background: rgba(0, 128, 255, 0.2);
          border: 1px solid #0080ff;
          color: #0080ff;
          padding: 5px 10px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
        ">Execution</button>
        <button class="stage-btn" data-stage="reflection" style="
          background: rgba(0, 128, 255, 0.2);
          border: 1px solid #0080ff;
          color: #0080ff;
          padding: 5px 10px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
        ">Reflection</button>
        <button class="stage-btn" data-stage="cleanup" style="
          background: rgba(0, 128, 255, 0.2);
          border: 1px solid #0080ff;
          color: #0080ff;
          padding: 5px 10px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
        ">Cleanup</button>
      </div>
      
      <!-- Content Area -->
      <div id="info-content" style="
        padding: 15px;
        max-height: 400px;
        overflow-y: auto;
        font-size: 11px;
        line-height: 1.4;
      ">
        <div style="color: #666; text-align: center; padding: 20px;">
          Select a cyber to view information
        </div>
      </div>
      
      <!-- Status Bar -->
      <div class="status-bar" style="
        padding: 5px 10px;
        background: rgba(0, 128, 255, 0.1);
        border-top: 1px solid #0080ff;
        font-size: 10px;
        color: #0080ff;
        display: flex;
        justify-content: space-between;
      ">
        <span id="status-text">Ready</span>
        <span id="last-update">--:--:--</span>
      </div>
    `;
    
    this.setupControls();
  }
  
  private setupControls() {
    const titleBar = this.container.querySelector('.window-titlebar') as HTMLElement;
    const btnClose = this.container.querySelector('#btn-close') as HTMLButtonElement;
    const btnMinimize = this.container.querySelector('#btn-minimize') as HTMLButtonElement;
    const btnFollow = this.container.querySelector('#btn-follow') as HTMLButtonElement;
    const btnMessage = this.container.querySelector('#btn-message') as HTMLButtonElement;
    const btnRefresh = this.container.querySelector('#btn-refresh') as HTMLButtonElement;
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
      if (this.isDragging) {
        this.windowX = e.clientX - this.dragStartX;
        this.windowY = e.clientY - this.dragStartY;
        this.container.style.left = `${this.windowX}px`;
        this.container.style.top = `${this.windowY}px`;
        this.container.style.right = 'auto';
      }
    });
    
    document.addEventListener('mouseup', () => {
      this.isDragging = false;
    });
    
    // Window controls
    btnClose.addEventListener('click', () => this.hide());
    btnMinimize.addEventListener('click', () => this.toggleMinimize());
    
    // Action buttons
    btnFollow.addEventListener('click', () => this.toggleFollow());
    btnMessage.addEventListener('click', () => this.openMessageDialog());
    btnRefresh.addEventListener('click', () => this.refreshData());
    
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
      } else if (newCycle > this.currentCycle) {
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
  
  private setupEventListeners() {
    // Listen for cycle data responses
    this.wsClient.on('cycle_data', (data: any) => {
      console.log('Received cycle_data:', data);
      if (data.cyber === this.selectedCyber && data.cycle_number !== undefined) {
        this.cycleData.set(data.cycle_number, data.data);
        if (data.cycle_number === this.selectedCycle) {
          this.displayStageData();
        }
      }
    });
    
    // Listen for cycles list response
    this.wsClient.on('cycles_list', (data: any) => {
      console.log('Received cycles_list:', data);
      if (data.cyber === this.selectedCyber && data.cycles) {
        // Get the latest valid cycle number from the list (filter out cycle 0)
        if (data.cycles.length > 0) {
          const validCycles = data.cycles
            .map((c: any) => typeof c === 'number' ? c : c.cycle_number || 0)
            .filter((n: number) => n > 0);  // Skip cycle 0 as it's usually incomplete
          
          if (validCycles.length > 0) {
            this.currentCycle = Math.max(...validCycles);
            this.selectedCycle = this.currentCycle;
          } else {
            // Fallback to 1 if no valid cycles
            this.currentCycle = 1;
            this.selectedCycle = 1;
          }
          
          const cycleInput = this.container.querySelector('#cycle-number') as HTMLInputElement;
          if (cycleInput) {
            cycleInput.value = this.selectedCycle.toString();
          }
          this.updateCycleStatus();
          // Fetch the current cycle data
          this.fetchCycleData(this.selectedCycle);
        }
      }
    });
    
    // Listen for current reflection response (contains cycle info)
    this.wsClient.on('current_reflection', (data: any) => {
      console.log('Received current_reflection:', data);
      if (data.cyber === this.selectedCyber && data.cycle_number) {
        this.currentCycle = data.cycle_number;
        this.selectedCycle = data.cycle_number;
        const cycleInput = this.container.querySelector('#cycle-number') as HTMLInputElement;
        if (cycleInput) {
          cycleInput.value = this.selectedCycle.toString();
        }
        this.updateCycleStatus();
        // Fetch the full cycle data
        this.fetchCycleData(this.currentCycle);
      }
    });
    
    // Listen for cycle started events
    this.wsClient.on('cycle_started', (data: any) => {
      if (data.cyber === this.selectedCyber) {
        this.currentCycle = data.cycle_number;
        this.updateCycleStatus();
        if (this.isFollowing) {
          this.goToCurrentCycle();
        }
      }
    });
  }
  
  public selectCyber(cyberName: string) {
    this.selectedCyber = cyberName;
    this.cycleData.clear();
    this.show();
    
    // Update title
    const nameEl = this.container.querySelector('#cyber-name') as HTMLElement;
    nameEl.textContent = `Cyber: ${cyberName}`;
    
    // Request cycles list to get the latest valid cycle
    this.wsClient.send({
      type: 'get_cycles',
      cyber: cyberName,
      limit: 100,  // Get more cycles to find valid ones
      request_id: `cycles_select_${Date.now()}`
    });
    
    // Also request current reflection which will give us the actual current cycle
    this.wsClient.send({
      type: 'get_current_reflection',
      cyber: cyberName,
      request_id: `reflection_select_${Date.now()}`
    });
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
      contentEl.innerHTML = `
        <div style="color: #666; text-align: center; padding: 20px;">
          Loading cycle ${this.selectedCycle} data...
        </div>
      `;
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
  }
  
  private formatStageData(data: any): string {
    if (typeof data === 'string') {
      return `<pre style="white-space: pre-wrap; word-wrap: break-word;">${this.escapeHtml(data)}</pre>`;
    }
    
    // Format different stage data types
    let html = '<div>';
    
    // Add stage name and timestamp if available
    if (data.stage) {
      html += `<h3 style="color: #00ff80; margin: 0 0 10px 0;">Stage: ${data.stage}</h3>`;
    }
    if (data.timestamp) {
      html += `<div style="color: #888; font-size: 10px; margin-bottom: 10px;">Time: ${new Date(data.timestamp).toLocaleString()}</div>`;
    }
    
    if (data.stage_output) {
      html += '<h4 style="color: #00ffff; margin: 0 0 10px 0;">Stage Output:</h4>';
      html += this.formatValue(data.stage_output);
    }
    
    if (data.working_memory && this.selectedStage === 'observation') {
      html += '<h4 style="color: #00ffff; margin: 15px 0 10px 0;">Working Memory Summary:</h4>';
      const mem = data.working_memory;
      html += `<div style="color: #00ff80; margin-left: 10px;">`;
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
      html += `<div style="color: #888; margin-top: 10px; font-size: 10px;">Duration: ${data.duration_ms}ms</div>`;
    }
    
    html += '</div>';
    return html;
  }
  
  private formatValue(value: any): string {
    if (typeof value === 'string') {
      return `<div style="color: #00ff80; margin-left: 10px;">${this.escapeHtml(value)}</div>`;
    }
    
    if (typeof value === 'object' && value !== null) {
      return `<pre style="color: #00ff80; margin-left: 10px; white-space: pre-wrap; word-wrap: break-word;">${this.escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
    }
    
    return `<div style="color: #00ff80; margin-left: 10px;">${value}</div>`;
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
    } else if (this.selectedCycle > this.currentCycle) {
      this.selectedCycle = this.currentCycle;
    }
    
    const cycleInput = this.container.querySelector('#cycle-number') as HTMLInputElement;
    cycleInput.value = this.selectedCycle.toString();
    
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
  
  private fetchCycleData(cycleNumber: number) {
    if (!this.selectedCyber) return;
    
    // Check cache first
    if (this.cycleData.has(cycleNumber)) {
      console.log(`Using cached data for cycle ${cycleNumber}`);
      this.displayStageData();
      return;
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
    
    this.updateStatus(`Loading cycle ${cycleNumber}...`);
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
    } else {
      btnFollow.style.background = 'rgba(0, 128, 255, 0.2)';
      btnFollow.style.borderColor = '#0080ff';
      btnFollow.style.color = '#00ffff';
      btnFollow.textContent = '👁 Follow';
      this.updateStatus('Follow mode disabled');
    }
  }
  
  private toggleMinimize() {
    this.isMinimized = !this.isMinimized;
    const content = this.container.querySelector('#info-content') as HTMLElement;
    const controls = this.container.querySelectorAll('.action-buttons, .cycle-nav, .stage-selector') as NodeListOf<HTMLElement>;
    
    if (this.isMinimized) {
      content.style.display = 'none';
      controls.forEach(el => el.style.display = 'none');
      this.container.style.height = 'auto';
    } else {
      content.style.display = 'block';
      controls.forEach(el => el.style.display = 'flex');
      this.container.style.height = 'auto';
    }
  }
  
  private openMessageDialog() {
    // TODO: Implement message dialog
    console.log('Opening message dialog for', this.selectedCyber);
    this.updateStatus('Message dialog not yet implemented');
  }
  
  private refreshData() {
    if (this.selectedCyber) {
      this.fetchCycleData(this.selectedCycle);
      this.updateStatus('Refreshing data...');
    }
  }
  
  private updateCycleStatus() {
    const statusEl = this.container.querySelector('#cycle-status') as HTMLElement;
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
    this.container.style.display = 'block';
  }
  
  public hide() {
    this.container.style.display = 'none';
    this.selectedCyber = null;
  }
  
  public isVisible(): boolean {
    return this.container.style.display !== 'none';
  }
}