import { parseEvent, EventEnvelope } from './ws/events';

type EventHandler = (data: any) => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private eventHandlers: Map<string, EventHandler[]> = new Map();
  // Backoff + heartbeat
  private reconnectAttempts = 0;
  private baseDelay = 1000; // 1s
  private maxDelay = 30000; // 30s
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private watchdogInterval: NodeJS.Timeout | null = null;
  private lastSeen = Date.now();

  constructor(url: string) {
    this.url = url;
  }

  connect() {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.emit('connected', {});
        this.lastSeen = Date.now();
        
        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = null;
        }
        // Reset backoff
        this.reconnectAttempts = 0;
        // Start heartbeat
        this.startHeartbeat();
        // Default subscription to all cybers (can be overridden later)
        this.subscribe(['*']);
      };

      this.ws.onmessage = (event) => {
        try {
          // Prefer typed envelope parsing
          const env: EventEnvelope | null = parseEvent(event.data);
          if (env && env.type) {
            console.log('WebSocket message (typed):', env);
            this.lastSeen = Date.now();
            if (env.type === 'ping') {
              // Respond to server ping with client ping to trigger pong
              this.send({ type: 'ping' });
            }
            const eventData = env.data !== undefined ? env.data : env;
            this.emit(env.type, eventData);
            return;
          }

          // Fallback to raw JSON structure
          const message = JSON.parse(event.data);
          console.log('WebSocket message:', message);
          if (message && message.type) {
            this.lastSeen = Date.now();
            const eventData = message.data !== undefined ? message.data : message;
            this.emit(message.type, eventData);
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.emit('error', error);
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.emit('disconnected', {});
        this.ws = null;

        // Attempt to reconnect
        this.scheduleReconnect();
        // Stop heartbeat timers
        this.stopHeartbeat();
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.emit('error', error);
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.stopHeartbeat();
  }

  send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.error('WebSocket not connected');
    }
  }

  requestCurrentReflection(cyberName: string, requestId?: string) {
    const message = {
      type: 'get_current_reflection',
      cyber: cyberName,
      request_id: requestId || `ref_${Date.now()}`
    };
    console.log('Requesting reflection:', message);
    this.send(message);
  }

  subscribe(cybers: string[]) {
    this.send({ type: 'subscribe', cybers });
  }

  setFilters(filters: Record<string, any>) {
    this.send({ type: 'filter', filters });
  }

  on(event: string, handler: EventHandler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  off(event: string, handler: EventHandler) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: any) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }

  private scheduleReconnect() {
    const exp = Math.min(this.maxDelay, this.baseDelay * Math.pow(2, this.reconnectAttempts));
    const jitter = Math.random() * 0.3 * exp; // up to 30% jitter
    const delay = Math.floor(exp * 0.85 + jitter); // spread a bit
    this.reconnectAttempts += 1;
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private startHeartbeat() {
    // Send ping every 10s
    if (!this.heartbeatInterval) {
      this.heartbeatInterval = setInterval(() => {
        this.send({ type: 'ping' });
      }, 10000);
    }
    // Watchdog: if no message for 30s, force reconnect
    if (!this.watchdogInterval) {
      this.watchdogInterval = setInterval(() => {
        const silentFor = Date.now() - this.lastSeen;
        if (silentFor > 30000) {
          console.warn('WebSocket silent for >30s; restarting connection');
          try { this.ws?.close(); } catch {}
        }
      }, 5000);
    }
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }
  }
}
