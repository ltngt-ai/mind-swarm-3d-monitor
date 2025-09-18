import { TwitchClient, TwitchMessage, TwitchCommand } from './TwitchClient';
import logger from '../utils/logger';

export interface TwitchChatOverlayConfig {
  position?: 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left';
  maxMessages?: number;
  fadeOutDelay?: number;
  showCommands?: boolean;
  compactMode?: boolean;
}

export class TwitchChatOverlay {
  private client: TwitchClient;
  private config: TwitchChatOverlayConfig;
  private container?: HTMLDivElement;
  private messagesContainer?: HTMLDivElement;
  private statusBar?: HTMLDivElement;
  private commandQueue?: HTMLDivElement;
  private messages: TwitchMessage[] = [];
  private isVisible: boolean = false;
  
  constructor(client: TwitchClient, config: TwitchChatOverlayConfig = {}) {
    this.client = client;
    this.config = {
      position: 'top-right',
      maxMessages: 8,
      fadeOutDelay: 30000,
      showCommands: true,
      compactMode: false,
      ...config
    };
    
    this.setupEventListeners();
  }
  
  private setupEventListeners(): void {
    this.client.on('connected', (data) => this.onConnected(data));
    this.client.on('disconnected', () => this.onDisconnected());
    this.client.on('message', (msg) => this.onMessage(msg));
    this.client.on('command', (cmd) => this.onCommand(cmd));
    this.client.on('command_response', (data) => this.onCommandResponse(data));
  }
  
  show(): void {
    if (this.isVisible) return;
    
    this.createUI();
    this.isVisible = true;
    
    if (this.container) {
      this.container.style.display = 'block';
      setTimeout(() => {
        if (this.container) {
          this.container.style.opacity = '1';
          this.container.style.transform = 'translateX(0)';
        }
      }, 10);
    }
  }
  
  hide(): void {
    if (!this.isVisible) return;
    
    this.isVisible = false;
    
    if (this.container) {
      this.container.style.opacity = '0';
      this.container.style.transform = 'translateX(20px)';
      setTimeout(() => {
        if (this.container) {
          this.container.style.display = 'none';
        }
      }, 300);
    }
  }
  
  destroy(): void {
    this.hide();
    if (this.container) {
      this.container.remove();
      this.container = undefined;
    }
  }
  
  private createUI(): void {
    if (this.container) return;
    
    this.ensureStyles();
    
    this.container = document.createElement('div');
    this.container.className = 'twitch-chat-overlay';
    this.container.style.cssText = this.getContainerStyles();
    
    this.statusBar = document.createElement('div');
    this.statusBar.className = 'twitch-status-bar';
    this.statusBar.innerHTML = `
      <div class="twitch-status-content">
        <span class="twitch-icon">📺</span>
        <span class="twitch-channel">Connecting...</span>
        <span class="twitch-viewers"></span>
      </div>
    `;
    
    this.messagesContainer = document.createElement('div');
    this.messagesContainer.className = 'twitch-messages';
    
    this.commandQueue = document.createElement('div');
    this.commandQueue.className = 'twitch-command-queue';
    this.commandQueue.style.cssText = `
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid rgba(0, 255, 255, 0.3);
      max-height: 100px;
      overflow-y: auto;
    `;
    
    this.container.appendChild(this.statusBar);
    this.container.appendChild(this.messagesContainer);
    
    if (this.config.showCommands) {
      this.container.appendChild(this.commandQueue);
    }
    
    document.body.appendChild(this.container);
  }
  
  private getContainerStyles(): string {
    const positions = {
      'top-right': 'top: 20px; right: 20px;',
      'bottom-right': 'bottom: 20px; right: 20px;',
      'top-left': 'top: 20px; left: 20px;',
      'bottom-left': 'bottom: 20px; left: 20px;'
    };
    
    const baseStyles = `
      position: fixed;
      ${positions[this.config.position!]}
      width: ${this.config.compactMode ? '280px' : '360px'};
      max-height: ${this.config.compactMode ? '300px' : '400px'};
      background: linear-gradient(135deg, rgba(0, 20, 40, 0.95) 0%, rgba(0, 40, 80, 0.9) 100%);
      border: 1px solid #00ffff;
      border-radius: 12px;
      padding: 12px;
      color: #ffffff;
      font-family: 'Courier New', monospace;
      font-size: ${this.config.compactMode ? '12px' : '14px'};
      z-index: 1100;
      display: none;
      opacity: 0;
      transform: translateX(20px);
      transition: all 0.3s ease;
      box-shadow: 0 0 30px rgba(0, 255, 255, 0.5);
      backdrop-filter: blur(10px);
    `;
    
    return baseStyles;
  }
  
  private ensureStyles(): void {
    const styleId = 'twitch-chat-styles';
    if (document.getElementById(styleId)) return;
    
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .twitch-chat-overlay {
        scrollbar-width: thin;
        scrollbar-color: #00ffff rgba(0, 255, 255, 0.1);
      }
      
      .twitch-chat-overlay::-webkit-scrollbar {
        width: 6px;
      }
      
      .twitch-chat-overlay::-webkit-scrollbar-track {
        background: rgba(0, 255, 255, 0.1);
        border-radius: 3px;
      }
      
      .twitch-chat-overlay::-webkit-scrollbar-thumb {
        background: #00ffff;
        border-radius: 3px;
      }
      
      .twitch-status-bar {
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(0, 255, 255, 0.3);
      }
      
      .twitch-status-content {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: bold;
        color: #00ffff;
      }
      
      .twitch-icon {
        animation: pulse 2s infinite;
      }
      
      .twitch-channel {
        flex: 1;
      }
      
      .twitch-viewers {
        font-size: 12px;
        opacity: 0.8;
      }
      
      .twitch-messages {
        max-height: 250px;
        overflow-y: auto;
        padding-right: 4px;
      }
      
      .twitch-message {
        margin-bottom: 8px;
        padding: 6px 8px;
        background: rgba(0, 0, 0, 0.3);
        border-radius: 6px;
        animation: slideIn 0.3s ease;
        border-left: 2px solid transparent;
        transition: all 0.3s ease;
      }
      
      .twitch-message:hover {
        background: rgba(0, 0, 0, 0.5);
        border-left-color: #00ffff;
      }
      
      .twitch-message.command {
        background: rgba(0, 100, 200, 0.2);
        border-left-color: #00ff88;
      }
      
      .twitch-message.response {
        background: rgba(0, 255, 255, 0.1);
        border-left-color: #00ffff;
        margin-left: 20px;
      }
      
      .twitch-message.mod {
        background: rgba(0, 200, 0, 0.2);
      }
      
      .twitch-message.vip {
        background: rgba(255, 0, 255, 0.2);
      }
      
      .twitch-username {
        font-weight: bold;
        margin-right: 6px;
      }
      
      .twitch-badges {
        display: inline-block;
        margin-right: 4px;
        font-size: 10px;
        vertical-align: middle;
      }
      
      .twitch-text {
        color: #ffffff;
        word-wrap: break-word;
      }
      
      .twitch-timestamp {
        font-size: 10px;
        opacity: 0.5;
        float: right;
      }
      
      .twitch-command-indicator {
        display: inline-block;
        width: 8px;
        height: 8px;
        background: #00ff88;
        border-radius: 50%;
        margin-right: 6px;
        animation: pulse 1s infinite;
      }
      
      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateX(-20px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
      
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      
      .twitch-command-queue {
        font-size: 12px;
      }
      
      .twitch-command-item {
        padding: 4px;
        margin-bottom: 4px;
        background: rgba(0, 255, 136, 0.1);
        border-radius: 4px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .twitch-command-item.processing {
        background: rgba(255, 200, 0, 0.2);
      }
      
      .twitch-command-item.complete {
        background: rgba(0, 255, 0, 0.2);
      }
    `;
    
    document.head.appendChild(style);
  }
  
  private onConnected(data: any): void {
    logger.info('TwitchChatOverlay: Connected to channel', data.channel);
    
    if (this.statusBar) {
      const channelEl = this.statusBar.querySelector('.twitch-channel');
      if (channelEl) {
        const channelName = data.channel ? `#${data.channel}` : 'Connected';
        channelEl.textContent = channelName;
        channelEl.style.color = '#00ff88';  // Restore normal color after reconnection
      }
    }
    
    // Don't add a system message here - the backend already sends one
  }
  
  private onDisconnected(): void {
    logger.info('TwitchChatOverlay: Disconnected');
    
    if (this.statusBar) {
      const channelEl = this.statusBar.querySelector('.twitch-channel');
      if (channelEl) {
        channelEl.textContent = 'Reconnecting...';
        channelEl.style.color = '#ff6666';
      }
    }
    
    // Only show disconnection message if it's a real disconnect, not during initial connection
    if (this.messages.length > 0) {
      this.addSystemMessage('Connection lost. Reconnecting...', 'error');
    }
  }
  
  private onMessage(message: TwitchMessage): void {
    this.messages.push(message);
    if (this.messages.length > this.config.maxMessages!) {
      this.messages.shift();
    }
    
    this.renderMessage(message);
    
    if (this.config.fadeOutDelay && this.config.fadeOutDelay > 0) {
      setTimeout(() => {
        this.removeMessage(message.id);
      }, this.config.fadeOutDelay);
    }
  }
  
  private onCommand(command: TwitchCommand): void {
    if (!this.config.showCommands || !this.commandQueue) return;
    
    const commandEl = document.createElement('div');
    commandEl.className = 'twitch-command-item processing';
    commandEl.dataset.commandId = command.message.id;
    commandEl.innerHTML = `
      <span class="twitch-command-indicator"></span>
      <span><strong>${command.message.displayName}:</strong> !${command.command} ${command.args.join(' ')}</span>
    `;
    
    this.commandQueue.appendChild(commandEl);
    
    setTimeout(() => {
      commandEl.remove();
    }, 10000);
  }
  
  private onCommandResponse(data: any): void {
    const { command, response, success } = data;
    
    if (this.commandQueue) {
      const commandEl = this.commandQueue.querySelector(`[data-command-id="${command.message.id}"]`);
      if (commandEl) {
        commandEl.classList.remove('processing');
        commandEl.classList.add(success ? 'complete' : 'error');
      }
    }
    
    if (response) {
      this.addSystemMessage(response, success ? 'info' : 'error');
    }
  }
  
  private renderMessage(message: TwitchMessage): void {
    if (!this.messagesContainer) return;
    
    const messageEl = document.createElement('div');
    messageEl.className = 'twitch-message';
    messageEl.dataset.messageId = message.id;
    
    if (message.isCommand) messageEl.classList.add('command');
    if (message.isMod) messageEl.classList.add('mod');
    if (message.isVip) messageEl.classList.add('vip');
    if (message.username === 'mind-swarm') messageEl.classList.add('response');
    
    const badges = this.getBadges(message);
    const timestamp = new Date(message.timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    messageEl.innerHTML = `
      ${badges ? `<span class="twitch-badges">${badges}</span>` : ''}
      <span class="twitch-username" style="color: ${message.color || '#ffffff'}">
        ${message.displayName || message.username || 'Anonymous'}:
      </span>
      <span class="twitch-text">${this.escapeHtml(message.message)}</span>
      <span class="twitch-timestamp">${timestamp}</span>
    `;
    
    this.messagesContainer.appendChild(messageEl);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }
  
  private getBadges(message: TwitchMessage): string {
    const badges = [];
    if (message.isMod) badges.push('🛡️');
    if (message.isVip) badges.push('💎');
    if (message.isSubscriber) badges.push('⭐');
    return badges.join('');
  }
  
  private addSystemMessage(text: string, type: 'info' | 'success' | 'error'): void {
    const message: TwitchMessage = {
      id: `system-${Date.now()}`,
      username: 'system',
      displayName: '🤖 System',
      message: text,
      timestamp: Date.now(),
      isCommand: false,
      isMod: false,
      isVip: false,
      isSubscriber: false,
      color: type === 'error' ? '#ff0000' : type === 'success' ? '#00ff00' : '#00ffff'
    };
    
    this.onMessage(message);
  }
  
  private removeMessage(messageId: string): void {
    if (!this.messagesContainer) return;
    
    const messageEl = this.messagesContainer.querySelector(`[data-message-id="${messageId}"]`);
    if (messageEl) {
      messageEl.classList.add('fade-out');
      setTimeout(() => {
        messageEl.remove();
      }, 300);
    }
  }
  
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  updatePosition(position: TwitchChatOverlayConfig['position']): void {
    this.config.position = position;
    if (this.container) {
      this.container.style.cssText = this.getContainerStyles();
    }
  }
  
  setCompactMode(compact: boolean): void {
    this.config.compactMode = compact;
    if (this.container) {
      this.container.style.cssText = this.getContainerStyles();
    }
  }
}