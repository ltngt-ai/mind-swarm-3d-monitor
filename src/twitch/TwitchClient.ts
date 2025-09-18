import { EventEmitter } from '../utils/EventEmitter';
import logger from '../utils/logger';

export interface TwitchMessage {
  id: string;
  username: string;
  displayName: string;
  message: string;
  timestamp: number;
  isCommand: boolean;
  isMod: boolean;
  isVip: boolean;
  isSubscriber: boolean;
  badges?: string[];
  color?: string;
}

export interface TwitchCommand {
  command: string;
  args: string[];
  message: TwitchMessage;
}

export interface TwitchConfig {
  channel?: string;
  mockMode?: boolean;
  commandPrefix?: string;
  apiUrl?: string;
}

export class TwitchClient extends EventEmitter {
  private config: TwitchConfig;
  private isConnected: boolean = false;
  private reconnectTimeout?: number;
  private mockInterval?: number;
  private messageHistory: TwitchMessage[] = [];
  private maxHistorySize = 100;
  
  constructor(config: TwitchConfig = {}) {
    super();
    this.config = {
      commandPrefix: '!',
      mockMode: true,
      apiUrl: 'http://localhost:8765',
      ...config
    };
  }
  
  async connect(channel?: string): Promise<void> {
    if (channel) {
      this.config.channel = channel;
    }
    
    if (!this.config.channel) {
      logger.warn('TwitchClient: No channel specified');
      return;
    }
    
    logger.info(`TwitchClient: Connecting to channel ${this.config.channel}`);
    
    if (this.config.mockMode) {
      this.startMockMode();
    } else {
      await this.connectToBackend();
    }
  }
  
  disconnect(): void {
    this.isConnected = false;
    
    if (this.mockInterval) {
      clearInterval(this.mockInterval);
      this.mockInterval = undefined;
    }
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }
    
    logger.info('TwitchClient: Disconnected');
    this.emit('disconnected');
  }
  
  private async connectToBackend(): Promise<void> {
    try {
      // Use proxy path when on dev server to avoid CORS
      const url = window.location.hostname === 'localhost' 
        ? '/api/twitch/connect' 
        : `${this.config.apiUrl}/api/twitch/connect`;
      const payload: any = { 
        channel: this.config.channel,
        mock: this.config.mockMode || false
      };
      
      // Only add prefix if it's not the default
      if (this.config.commandPrefix && this.config.commandPrefix !== '!') {
        payload.prefix = this.config.commandPrefix;
      }
      
      logger.info('TwitchClient: Connecting to backend', { url, payload });
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        const data = await response.json();
        this.isConnected = data.connected || false;
        
        if (this.isConnected) {
          this.emit('connected', { 
            channel: data.channel || this.config.channel,
            mock: data.mock || false
          });
          this.startPollingMessages();
        } else {
          throw new Error(data.last_error || 'Failed to connect');
        }
      } else {
        let errorText = '';
        try {
          errorText = await response.text();
        } catch (e) {
          errorText = 'Unable to read error response';
        }
        logger.error('TwitchClient: Connection failed with status', response.status, errorText);
        
        // Provide helpful error messages
        if (response.status === 500) {
          throw new Error('Backend server error. The Twitch integration may not be properly configured on the server. Please check server logs.');
        } else if (response.status === 422) {
          throw new Error('Invalid request format. Please check your Twitch channel name and settings.');
        }
        throw new Error(`Failed to connect: ${response.statusText} - ${errorText}`);
      }
    } catch (error) {
      logger.error('TwitchClient: Connection failed', error);
      this.scheduleReconnect();
    }
  }
  
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) return;
    
    this.reconnectTimeout = window.setTimeout(() => {
      this.reconnectTimeout = undefined;
      this.connect();
    }, 5000);
  }
  
  private startPollingMessages(): void {
    const poll = async () => {
      if (!this.isConnected) return;
      
      try {
        // Use proxy path when on dev server to avoid CORS
        const url = window.location.hostname === 'localhost'
          ? '/api/twitch/messages'
          : `${this.config.apiUrl}/api/twitch/messages`;
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          // Backend returns { messages: [], connected: bool, channel: str, ... }
          if (data.messages && Array.isArray(data.messages)) {
            data.messages.forEach((msg: any) => {
              // Map backend format to frontend format
              const message: TwitchMessage = {
                id: msg.id,
                username: (msg.user || msg.username || 'unknown').toLowerCase(),
                displayName: msg.user || msg.username || 'Unknown',
                message: msg.message,
                timestamp: new Date(msg.timestamp).getTime(),
                isCommand: msg.message?.startsWith(this.config.commandPrefix!) || false,
                isMod: msg.metadata?.mod || false,
                isVip: msg.metadata?.vip || false,
                isSubscriber: msg.metadata?.subscriber || false,
                badges: msg.badges,
                color: msg.color
              };
              this.handleMessage(message);
            });
          }
          
          // Update connection status from backend
          if (data.connected !== undefined) {
            this.isConnected = data.connected;
            if (!data.connected && data.last_error) {
              logger.warn('TwitchClient: Connection lost:', data.last_error);
              this.emit('disconnected');
            }
          }
        }
      } catch (error) {
        logger.error('TwitchClient: Failed to poll messages', error);
      }
      
      if (this.isConnected) {
        setTimeout(poll, 1000);
      }
    };
    
    poll();
  }
  
  private startMockMode(): void {
    this.isConnected = true;
    this.emit('connected', { channel: this.config.channel, mock: true });
    
    const mockMessages = [
      { username: 'CyberFan42', message: 'Wow, look at those agents go!', isMod: false },
      { username: 'TechEnthusiast', message: '!ask explorer What are you searching for?', isMod: false },
      { username: 'ModeratorX', message: '!status', isMod: true },
      { username: 'StreamViewer', message: 'This visualization is amazing', isMod: false },
      { username: 'AIWatcher', message: '!ask analyst Can you explain your last insight?', isMod: false },
      { username: 'VIPGuest', message: '!focus explorer', isMod: false, isVip: true },
      { username: 'CuriousOne', message: 'How many agents are running?', isMod: false },
      { username: 'CodeMaster', message: '!task Create a new analysis report', isMod: true },
      { username: 'Subscriber99', message: 'The grid effect is so cool!', isSubscriber: true },
      { username: 'QuestionBot', message: '!ask coordinator What is your current priority?', isMod: false },
    ];
    
    let messageIndex = 0;
    this.mockInterval = window.setInterval(() => {
      const mockData = mockMessages[messageIndex % mockMessages.length];
      const message: TwitchMessage = {
        id: `mock-${Date.now()}-${Math.random()}`,
        username: mockData.username.toLowerCase(),
        displayName: mockData.username,
        message: mockData.message,
        timestamp: Date.now(),
        isCommand: mockData.message.startsWith(this.config.commandPrefix!),
        isMod: mockData.isMod || false,
        isVip: (mockData as any).isVip || false,
        isSubscriber: (mockData as any).isSubscriber || false,
        color: this.getRandomColor()
      };
      
      this.handleMessage(message);
      messageIndex++;
    }, 3000 + Math.random() * 4000);
  }
  
  private handleMessage(message: TwitchMessage): void {
    this.messageHistory.push(message);
    if (this.messageHistory.length > this.maxHistorySize) {
      this.messageHistory.shift();
    }
    
    this.emit('message', message);
    
    if (message.isCommand) {
      const command = this.parseCommand(message);
      if (command) {
        this.emit('command', command);
        this.handleCommand(command);
      }
    }
  }
  
  private parseCommand(message: TwitchMessage): TwitchCommand | null {
    if (!message.message.startsWith(this.config.commandPrefix!)) {
      return null;
    }
    
    const parts = message.message.slice(this.config.commandPrefix!.length).split(' ');
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    return {
      command,
      args,
      message
    };
  }
  
  private async handleCommand(command: TwitchCommand): Promise<void> {
    logger.info(`TwitchClient: Command received - !${command.command}`, command.args);
    
    if (this.config.mockMode) {
      setTimeout(() => {
        const mockResponse = this.getMockCommandResponse(command);
        if (mockResponse) {
          this.emit('command_response', {
            command,
            response: mockResponse,
            success: true
          });
        }
      }, 1000 + Math.random() * 2000);
    } else {
      try {
        const url = window.location.hostname === 'localhost'
          ? '/api/twitch/command'
          : `${this.config.apiUrl}/api/twitch/command`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            command: command.command,
            args: command.args,
            user: command.message.username,
            badges: command.message.isMod ? ['mod'] : command.message.isVip ? ['vip'] : [],
            raw: `!${command.command} ${command.args ? command.args.join(' ') : ''}`,
            broadcast: true
          })
        });
        
        if (response.ok) {
          const result = await response.json();
          this.emit('command_response', {
            command,
            response: result.message || result.response,
            success: result.success !== false
          });
        } else {
          const errorText = await response.text();
          logger.error('TwitchClient: Command failed:', errorText);
          this.emit('command_response', {
            command,
            response: 'Command failed to execute',
            success: false
          });
        }
      } catch (error) {
        logger.error('TwitchClient: Command execution failed', error);
        this.emit('command_response', {
          command,
          response: 'Command failed to execute',
          success: false
        });
      }
    }
  }
  
  private getMockCommandResponse(command: TwitchCommand): string | null {
    switch (command.command) {
      case 'ask':
        const agent = command.args[0];
        const question = command.args.slice(1).join(' ');
        return `${agent} is thinking about: "${question}"`;
        
      case 'status':
        return '5 agents active | 12 tasks completed | System healthy';
        
      case 'focus':
        return `Camera focusing on ${command.args[0]}`;
        
      case 'task':
        return `New task queued: ${command.args.join(' ')}`;
        
      case 'help':
        return 'Commands: !ask [agent] [question] | !status | !focus [agent] | !task [description]';
        
      default:
        return null;
    }
  }
  
  private getRandomColor(): string {
    const colors = [
      '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF',
      '#00FFFF', '#FFA500', '#800080', '#FFC0CB', '#00FF7F'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }
  
  getRecentMessages(count: number = 10): TwitchMessage[] {
    return this.messageHistory.slice(-count);
  }
  
  isActive(): boolean {
    return this.isConnected;
  }
  
  getChannel(): string | undefined {
    return this.config.channel;
  }
  
  async sendResponse(agentName: string, message: string): Promise<void> {
    if (!this.isConnected) return;
    
    const responseMessage: TwitchMessage = {
      id: `response-${Date.now()}`,
      username: 'mind-swarm',
      displayName: `🤖 ${agentName}`,
      message: message,
      timestamp: Date.now(),
      isCommand: false,
      isMod: false,
      isVip: false,
      isSubscriber: false,
      color: '#00FFFF'
    };
    
    this.handleMessage(responseMessage);
    
    if (!this.config.mockMode) {
      try {
        const url = window.location.hostname === 'localhost'
          ? '/api/twitch/send'
          : `${this.config.apiUrl}/api/twitch/send`;
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent: agentName,
            message: message
          })
        });
      } catch (error) {
        logger.error('TwitchClient: Failed to send response', error);
      }
    }
  }
}