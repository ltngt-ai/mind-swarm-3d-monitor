// import * as THREE from 'three';
// import { Mode } from './Mode';
import { ModeContext } from './Mode';
import { UserMode } from './UserMode';
import { eventBus, Events } from '../utils/EventBus';
import { config } from '../config';

interface LogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warning' | 'error';
  source: string;
  message: string;
}

interface CyberMetrics {
  name: string;
  tokenUsage: number;
  messagesProcessed: number;
  filesAccessed: number;
  errorCount: number;
  uptime: number;
  memoryUsage?: number;
}

export class DeveloperMode extends UserMode {
  // Developer-specific UI elements
  private logViewer?: HTMLDivElement;
  private metricsPanel?: HTMLDivElement;
  private consolePanel?: HTMLDivElement;
  private debugOverlay?: HTMLDivElement;
  
  // Log management
  private logs: LogEntry[] = [];
  private maxLogs: number = 1000;
  private logFilter: string = '';
  private logLevel: 'all' | 'debug' | 'info' | 'warning' | 'error' = 'all';
  
  // Metrics tracking
  private cyberMetrics: Map<string, CyberMetrics> = new Map();
  private systemMetrics: any = {}; // Used in fetchMetrics and updateMetricsDisplay
  
  // Console command history
  private commandHistory: string[] = [];
  private historyIndex: number = -1;
  
  // WebSocket for logs
  private logWebSocket?: WebSocket;
  
  // Debug visualization
  private showDebugInfo: boolean = true;
  // private showNetworkTraffic: boolean = false;
  private showPerformanceMetrics: boolean = true;

  constructor(context: ModeContext) {
    super(context);
    this.name = 'Developer'; // Override name
  }

  protected setupUI(): void {
    // Call parent setup first
    super.setupUI();
    
    // Create developer-specific UI
    this.createLogViewer();
    this.createMetricsPanel();
    this.createConsolePanel();
    this.createDebugOverlay();
    
    // Add developer GUI controls
    if (this.guiFolder) {
      const debugFolder = this.guiFolder.addFolder('Debug Settings');
      
      debugFolder.add({ showLogs: true }, 'showLogs')
        .name('Show Logs')
        .onChange((value: boolean) => {
          if (this.logViewer) {
            this.logViewer.style.display = value ? 'block' : 'none';
          }
        });
        
      debugFolder.add({ showMetrics: true }, 'showMetrics')
        .name('Show Metrics')
        .onChange((value: boolean) => {
          if (this.metricsPanel) {
            this.metricsPanel.style.display = value ? 'block' : 'none';
          }
        });
        
      debugFolder.add({ showConsole: false }, 'showConsole')
        .name('Show Console')
        .onChange((value: boolean) => {
          if (this.consolePanel) {
            this.consolePanel.style.display = value ? 'block' : 'none';
          }
        });
        
      debugFolder.add({ logLevel: this.logLevel }, 'logLevel', ['all', 'debug', 'info', 'warning', 'error'])
        .name('Log Level')
        .onChange((value: string) => {
          this.logLevel = value as any;
          this.filterLogs();
        });
        
      debugFolder.add({ clearLogs: () => this.clearLogs() }, 'clearLogs')
        .name('Clear Logs');
        
      const commandFolder = this.guiFolder.addFolder('Commands');
      
      commandFolder.add({ 
        restartCyber: () => this.promptRestartCyber() 
      }, 'restartCyber').name('Restart Cyber');
      
      commandFolder.add({ 
        pauseCyber: () => this.promptPauseCyber() 
      }, 'pauseCyber').name('Pause Cyber');
      
      commandFolder.add({ 
        inspectCyber: () => this.inspectSelectedCyber() 
      }, 'inspectCyber').name('Inspect Selected');
      
      commandFolder.add({ 
        exportLogs: () => this.exportLogs() 
      }, 'exportLogs').name('Export Logs');
    }
  }

  protected setupEventHandlers(): void {
    // Call parent handlers
    super.setupEventHandlers();
    
    // Developer-specific handlers
    this.context.wsClient.on('log_entry', this.onLogEntry.bind(this));
    this.context.wsClient.on('metric_update', this.onMetricUpdate.bind(this));
    this.context.wsClient.on('error_occurred', this.onErrorOccurred.bind(this));
    
    // System events
    eventBus.on(Events.SYSTEM_ERROR, this.onSystemError.bind(this));
    eventBus.on(Events.SYSTEM_WARNING, this.onSystemWarning.bind(this));
  }

  protected cleanupEventHandlers(): void {
    super.cleanupEventHandlers();
    // Additional cleanup if needed
  }

  protected async onActivate(): Promise<void> {
    await super.onActivate();
    
    // Developer mode uses same camera settings as User mode (already set in parent)
    
    // Show developer UI
    if (this.logViewer) this.logViewer.style.display = 'block';
    if (this.metricsPanel) this.metricsPanel.style.display = 'block';
    if (this.debugOverlay) this.debugOverlay.style.display = 'block';
    
    // Connect to log stream
    this.connectLogStream();
    
    // Start metrics collection
    this.startMetricsCollection();
    
    this.showNotification('Developer mode activated - Full system access enabled', 'info');
    this.addLog('info', 'System', 'Developer mode activated');
  }

  protected async onDeactivate(): Promise<void> {
    await super.onDeactivate();
    
    // Hide developer UI
    if (this.logViewer) this.logViewer.style.display = 'none';
    if (this.metricsPanel) this.metricsPanel.style.display = 'none';
    if (this.consolePanel) this.consolePanel.style.display = 'none';
    if (this.debugOverlay) this.debugOverlay.style.display = 'none';
    
    // Disconnect log stream
    this.disconnectLogStream();
  }

  update(deltaTime: number): void {
    super.update(deltaTime);
    
    // Update debug overlay
    if (this.showDebugInfo) {
      this.updateDebugOverlay();
    }
    
    // Update metrics
    if (this.showPerformanceMetrics) {
      this.updateMetricsDisplay();
    }
  }

  handleKeyPress(key: string): boolean {
    // Check developer-specific keys first
    switch (key) {
      case '`': // Toggle console
      case '~':
        this.toggleConsole();
        return true;
      case 'l': // Toggle logs
        this.toggleLogViewer();
        return true;
      case 'p': // Toggle performance metrics
        this.showPerformanceMetrics = !this.showPerformanceMetrics;
        return true;
      case 'i': // Inspect selected
        this.inspectSelectedCyber();
        return true;
      case 'r': // Reload/refresh
        if (event && (event as KeyboardEvent).ctrlKey) {
          this.refreshAllData();
          return true;
        }
        break;
    }
    
    // Fall back to parent handler
    return super.handleKeyPress(key);
  }

  private createLogViewer(): void {
    this.logViewer = document.createElement('div');
    this.logViewer.id = 'log-viewer';
    this.logViewer.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 20px;
      width: 600px;
      height: 300px;
      background: rgba(0, 10, 20, 0.95);
      border: 1px solid #00ff00;
      border-radius: 5px;
      display: none;
      z-index: 600;
      font-family: 'Courier New', monospace;
      font-size: 11px;
    `;
    
    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      background: rgba(0, 30, 0, 0.8);
      border-bottom: 1px solid #00ff00;
      padding: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    
    header.innerHTML = `
      <span style="color: #00ff00;">📜 System Logs</span>
      <div>
        <input type="text" id="log-filter" placeholder="Filter..." style="
          background: rgba(0, 20, 0, 0.8);
          border: 1px solid #00ff00;
          color: #00ff00;
          padding: 2px 5px;
          font-size: 11px;
          margin-right: 10px;
        ">
        <select id="log-level-filter" style="
          background: rgba(0, 20, 0, 0.8);
          border: 1px solid #00ff00;
          color: #00ff00;
          padding: 2px 5px;
          font-size: 11px;
        ">
          <option value="all">All</option>
          <option value="debug">Debug</option>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="error">Error</option>
        </select>
      </div>
    `;
    
    // Log content area
    const content = document.createElement('div');
    content.id = 'log-content';
    content.style.cssText = `
      height: calc(100% - 40px);
      overflow-y: auto;
      padding: 5px;
      color: #00ff00;
      white-space: pre-wrap;
      word-wrap: break-word;
    `;
    
    this.logViewer.appendChild(header);
    this.logViewer.appendChild(content);
    document.body.appendChild(this.logViewer);
    
    // Setup filter handlers
    const filterInput = document.getElementById('log-filter') as HTMLInputElement;
    filterInput?.addEventListener('input', (e) => {
      this.logFilter = (e.target as HTMLInputElement).value;
      this.filterLogs();
    });
    
    const levelSelect = document.getElementById('log-level-filter') as HTMLSelectElement;
    levelSelect?.addEventListener('change', (e) => {
      this.logLevel = (e.target as HTMLSelectElement).value as any;
      this.filterLogs();
    });
  }

  private createMetricsPanel(): void {
    this.metricsPanel = document.createElement('div');
    this.metricsPanel.id = 'metrics-panel';
    this.metricsPanel.style.cssText = `
      position: fixed;
      top: 60px;
      right: 20px;
      width: 300px;
      background: rgba(0, 20, 40, 0.95);
      border: 1px solid #ffaa00;
      border-radius: 5px;
      padding: 10px;
      display: none;
      z-index: 600;
      font-family: 'Courier New', monospace;
      font-size: 11px;
      color: #ffaa00;
    `;
    
    this.metricsPanel.innerHTML = `
      <h4 style="margin: 0 0 10px 0; color: #ffaa00;">📊 System Metrics</h4>
      <div id="metrics-content">
        <div>Active Cybers: <span id="metric-cybers">0</span></div>
        <div>Total Tokens: <span id="metric-tokens">0</span></div>
        <div>Messages/min: <span id="metric-messages">0</span></div>
        <div>Errors: <span id="metric-errors">0</span></div>
        <div>Memory: <span id="metric-memory">0 MB</span></div>
        <div>CPU: <span id="metric-cpu">0%</span></div>
        <hr style="border-color: #ffaa00; opacity: 0.3;">
        <div id="cyber-metrics-list"></div>
      </div>
    `;
    
    document.body.appendChild(this.metricsPanel);
  }

  private createConsolePanel(): void {
    this.consolePanel = document.createElement('div');
    this.consolePanel.id = 'console-panel';
    this.consolePanel.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      width: 700px;
      background: rgba(0, 0, 0, 0.95);
      border: 1px solid #00ff00;
      border-radius: 5px;
      padding: 10px;
      display: none;
      z-index: 700;
      font-family: 'Courier New', monospace;
      font-size: 12px;
    `;
    
    this.consolePanel.innerHTML = `
      <div style="color: #00ff00; margin-bottom: 10px;">Developer Console</div>
      <div id="console-output" style="
        height: 200px;
        overflow-y: auto;
        background: rgba(0, 20, 0, 0.3);
        padding: 5px;
        margin-bottom: 10px;
        color: #00ff00;
        white-space: pre-wrap;
      "></div>
      <input type="text" id="console-input" style="
        width: 100%;
        background: rgba(0, 20, 0, 0.5);
        border: 1px solid #00ff00;
        color: #00ff00;
        padding: 5px;
        font-family: 'Courier New', monospace;
      " placeholder="Enter command...">
    `;
    
    document.body.appendChild(this.consolePanel);
    
    // Setup console input handler
    const input = document.getElementById('console-input') as HTMLInputElement;
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.executeCommand(input.value);
        this.commandHistory.push(input.value);
        this.historyIndex = this.commandHistory.length;
        input.value = '';
      } else if (e.key === 'ArrowUp') {
        if (this.historyIndex > 0) {
          this.historyIndex--;
          input.value = this.commandHistory[this.historyIndex];
        }
      } else if (e.key === 'ArrowDown') {
        if (this.historyIndex < this.commandHistory.length - 1) {
          this.historyIndex++;
          input.value = this.commandHistory[this.historyIndex];
        } else {
          this.historyIndex = this.commandHistory.length;
          input.value = '';
        }
      }
    });
  }

  private createDebugOverlay(): void {
    this.debugOverlay = document.createElement('div');
    this.debugOverlay.id = 'debug-overlay';
    this.debugOverlay.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      background: rgba(0, 0, 0, 0.7);
      border: 1px solid #00ff00;
      border-radius: 3px;
      padding: 8px;
      color: #00ff00;
      font-family: 'Courier New', monospace;
      font-size: 10px;
      display: none;
      z-index: 500;
      pointer-events: none;
    `;
    
    document.body.appendChild(this.debugOverlay);
  }

  private connectLogStream(): void {
    // Connect to WebSocket for real-time logs
    try {
      this.logWebSocket = new WebSocket(`${config.wsUrl.replace('/ws', '/logs/stream')}`);
      
      this.logWebSocket.onmessage = (event) => {
        const log = JSON.parse(event.data);
        this.onLogEntry(log);
      };
      
      this.logWebSocket.onerror = (error) => {
        console.error('Log WebSocket error:', error);
        this.addLog('error', 'LogStream', 'Failed to connect to log stream');
      };
    } catch (error) {
      console.error('Failed to connect log stream:', error);
    }
  }

  private disconnectLogStream(): void {
    if (this.logWebSocket) {
      this.logWebSocket.close();
      this.logWebSocket = undefined;
    }
  }

  private startMetricsCollection(): void {
    // Start collecting metrics
    setInterval(() => {
      this.fetchMetrics();
    }, 5000);
  }

  private async fetchMetrics(): Promise<void> {
    try {
      const response = await fetch(`${config.apiUrl}/metrics`);
      if (response.ok) {
        const metrics = await response.json();
        this.systemMetrics = metrics;
        this.updateMetricsDisplay();
      }
    } catch (error) {
      // Metrics endpoint might not exist yet
    }
  }

  private addLog(level: LogEntry['level'], source: string, message: string): void {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      source,
      message
    };
    
    this.logs.push(entry);
    
    // Limit log size
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    
    // Update display
    this.updateLogDisplay();
  }

  private onLogEntry(data: any): void {
    this.addLog(data.level || 'info', data.source || 'Unknown', data.message || '');
  }

  private onMetricUpdate(data: any): void {
    if (data.cyber) {
      this.cyberMetrics.set(data.cyber, data.metrics);
    }
  }

  private onErrorOccurred(data: any): void {
    this.addLog('error', data.source || 'System', data.message || 'Unknown error');
    this.showNotification(`Error: ${data.message}`, 'error');
  }

  private onSystemError(data: any): void {
    this.addLog('error', 'System', data.message || 'System error');
  }

  private onSystemWarning(data: any): void {
    this.addLog('warning', 'System', data.message || 'System warning');
  }

  private filterLogs(): void {
    this.updateLogDisplay();
  }

  private updateLogDisplay(): void {
    const content = document.getElementById('log-content');
    if (!content) return;
    
    const filteredLogs = this.logs.filter(log => {
      // Level filter
      if (this.logLevel !== 'all' && log.level !== this.logLevel) {
        return false;
      }
      
      // Text filter
      if (this.logFilter) {
        const searchText = this.logFilter.toLowerCase();
        return log.message.toLowerCase().includes(searchText) ||
               log.source.toLowerCase().includes(searchText);
      }
      
      return true;
    });
    
    // Display last 100 filtered logs
    const displayLogs = filteredLogs.slice(-100);
    
    content.innerHTML = displayLogs.map(log => {
      const color = this.getLogColor(log.level);
      const time = log.timestamp.toLocaleTimeString();
      return `<div style="color: ${color}; margin: 2px 0;">
        [${time}] [${log.level.toUpperCase()}] [${log.source}] ${log.message}
      </div>`;
    }).join('');
    
    // Auto-scroll to bottom
    content.scrollTop = content.scrollHeight;
  }

  private getLogColor(level: LogEntry['level']): string {
    const colors = {
      debug: '#888888',
      info: '#00ff00',
      warning: '#ffaa00',
      error: '#ff0000'
    };
    return colors[level];
  }

  private updateMetricsDisplay(): void {
    // Update system metrics
    const cyberCountEl = document.getElementById('metric-cybers');
    if (cyberCountEl) {
      cyberCountEl.textContent = this.context.agentManager.getAgentCount().toString();
    }
    
    // Update from systemMetrics if available
    if (this.systemMetrics && this.systemMetrics.token_usage) {
      const tokenEl = document.getElementById('metric-tokens');
      if (tokenEl) {
        tokenEl.textContent = String(this.systemMetrics.token_usage.total || 0);
      }
    }
    
    // Update cyber-specific metrics
    const cyberListEl = document.getElementById('cyber-metrics-list');
    if (cyberListEl) {
      const topCybers = Array.from(this.cyberMetrics.entries())
        .sort((a, b) => b[1].tokenUsage - a[1].tokenUsage)
        .slice(0, 5);
        
      cyberListEl.innerHTML = topCybers.map(([name, metrics]) => `
        <div style="margin: 5px 0; padding: 5px; background: rgba(255, 170, 0, 0.1); border-radius: 3px;">
          <b>${name}</b><br>
          Tokens: ${metrics.tokenUsage} | Msgs: ${metrics.messagesProcessed} | Errors: ${metrics.errorCount}
        </div>
      `).join('');
    }
  }

  private updateDebugOverlay(): void {
    if (!this.debugOverlay || !this.showDebugInfo) return;
    
    const fps = (1000 / 16.67).toFixed(0); // Approximate FPS
    const cyberCount = this.context.agentManager.getAgentCount();
    const cameraPos = this.context.camera.position;
    
    this.debugOverlay.innerHTML = `
      <div>FPS: ${fps}</div>
      <div>Cybers: ${cyberCount}</div>
      <div>Camera: ${cameraPos.x.toFixed(1)}, ${cameraPos.y.toFixed(1)}, ${cameraPos.z.toFixed(1)}</div>
      <div>Mode: Developer</div>
      <div>Logs: ${this.logs.length}</div>
    `;
  }

  private executeCommand(command: string): void {
    const output = document.getElementById('console-output');
    if (!output) return;
    
    // Add command to output
    output.innerHTML += `\n> ${command}\n`;
    
    // Parse and execute command
    const parts = command.split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    switch (cmd) {
      case 'help':
        output.innerHTML += 'Available commands: help, clear, restart, pause, inspect, logs, metrics\n';
        break;
      case 'clear':
        output.innerHTML = '';
        break;
      case 'restart':
        if (args[0]) {
          this.restartCyber(args[0]);
        } else {
          output.innerHTML += 'Usage: restart <cyber-name>\n';
        }
        break;
      case 'pause':
        if (args[0]) {
          this.pauseCyber(args[0]);
        } else {
          output.innerHTML += 'Usage: pause <cyber-name>\n';
        }
        break;
      case 'inspect':
        if (args[0]) {
          this.inspectCyber(args[0]);
        } else {
          output.innerHTML += 'Usage: inspect <cyber-name>\n';
        }
        break;
      case 'logs':
        this.toggleLogViewer();
        output.innerHTML += 'Log viewer toggled\n';
        break;
      case 'metrics':
        if (this.metricsPanel) {
          const isVisible = this.metricsPanel.style.display !== 'none';
          this.metricsPanel.style.display = isVisible ? 'none' : 'block';
          output.innerHTML += `Metrics panel ${isVisible ? 'hidden' : 'shown'}\n`;
        }
        break;
      default:
        output.innerHTML += `Unknown command: ${cmd}\n`;
    }
    
    // Auto-scroll
    output.scrollTop = output.scrollHeight;
  }

  private toggleConsole(): void {
    if (this.consolePanel) {
      const isVisible = this.consolePanel.style.display !== 'none';
      this.consolePanel.style.display = isVisible ? 'none' : 'block';
      
      if (!isVisible) {
        const input = document.getElementById('console-input') as HTMLInputElement;
        input?.focus();
      }
    }
  }

  private toggleLogViewer(): void {
    if (this.logViewer) {
      const isVisible = this.logViewer.style.display !== 'none';
      this.logViewer.style.display = isVisible ? 'none' : 'block';
    }
  }

  private clearLogs(): void {
    this.logs = [];
    this.updateLogDisplay();
    this.addLog('info', 'System', 'Logs cleared');
  }

  private async restartCyber(name: string): Promise<void> {
    try {
      const response = await fetch(`${config.apiUrl}/Cybers/${name}/restart`, {
        method: 'POST'
      });
      
      if (response.ok) {
        this.addLog('info', 'System', `Restarted Cyber: ${name}`);
        this.showNotification(`Cyber ${name} restarted`, 'info');
      } else {
        this.addLog('error', 'System', `Failed to restart Cyber: ${name}`);
      }
    } catch (error) {
      this.addLog('error', 'System', `Error restarting Cyber: ${error}`);
    }
  }

  private async pauseCyber(name: string): Promise<void> {
    try {
      const response = await fetch(`${config.apiUrl}/Cybers/${name}/pause`, {
        method: 'POST'
      });
      
      if (response.ok) {
        this.addLog('info', 'System', `Paused Cyber: ${name}`);
        this.showNotification(`Cyber ${name} paused`, 'info');
      } else {
        this.addLog('error', 'System', `Failed to pause Cyber: ${name}`);
      }
    } catch (error) {
      this.addLog('error', 'System', `Error pausing Cyber: ${error}`);
    }
  }

  private async inspectCyber(name: string): Promise<void> {
    try {
      const response = await fetch(`${config.apiUrl}/Cybers/${name}/inspect`);
      
      if (response.ok) {
        const data = await response.json();
        this.addLog('info', 'Inspector', `Cyber ${name}: ${JSON.stringify(data, null, 2)}`);
        
        // Show in console
        const output = document.getElementById('console-output');
        if (output) {
          output.innerHTML += `\nInspection of ${name}:\n${JSON.stringify(data, null, 2)}\n`;
          output.scrollTop = output.scrollHeight;
        }
      }
    } catch (error) {
      this.addLog('error', 'Inspector', `Failed to inspect Cyber: ${error}`);
    }
  }

  private inspectSelectedCyber(): void {
    const selected = this.context.agentManager.getSelectedAgent();
    if (selected) {
      this.inspectCyber(selected);
    } else {
      this.showNotification('No Cyber selected', 'warning');
    }
  }

  private promptRestartCyber(): void {
    const name = prompt('Enter Cyber name to restart:');
    if (name) {
      this.restartCyber(name);
    }
  }

  private promptPauseCyber(): void {
    const name = prompt('Enter Cyber name to pause:');
    if (name) {
      this.pauseCyber(name);
    }
  }

  private exportLogs(): void {
    const logText = this.logs.map(log => 
      `[${log.timestamp.toISOString()}] [${log.level.toUpperCase()}] [${log.source}] ${log.message}`
    ).join('\n');
    
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mindswarm-logs-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    this.showNotification('Logs exported', 'info');
  }

  private refreshAllData(): void {
    // Refresh all data sources
    this.context.filesystemViz.refresh();
    this.fetchMetrics();
    this.showNotification('Data refreshed', 'info');
  }
}