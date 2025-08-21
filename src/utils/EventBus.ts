type EventCallback = (...args: any[]) => void;

export class EventBus {
  private static instance: EventBus;
  private events: Map<string, Set<EventCallback>> = new Map();

  private constructor() {}

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  on(event: string, callback: EventCallback): void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(callback);
  }

  off(event: string, callback: EventCallback): void {
    const callbacks = this.events.get(event);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.events.delete(event);
      }
    }
  }

  emit(event: string, ...args: any[]): void {
    const callbacks = this.events.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(...args);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  once(event: string, callback: EventCallback): void {
    const onceWrapper = (...args: any[]) => {
      callback(...args);
      this.off(event, onceWrapper);
    };
    this.on(event, onceWrapper);
  }

  clear(event?: string): void {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
  }
}

// Export singleton instance
export const eventBus = EventBus.getInstance();

// Define event types for type safety
export const Events = {
  // Mode events
  MODE_CHANGED: 'mode:changed',
  MODE_BEFORE_CHANGE: 'mode:beforeChange',
  
  // Camera events
  CAMERA_TARGET_CHANGED: 'camera:targetChanged',
  CAMERA_MODE_CHANGED: 'camera:modeChanged',
  CAMERA_ANIMATION_COMPLETE: 'camera:animationComplete',
  
  // Cyber events
  CYBER_SELECTED: 'cyber:selected',
  CYBER_DESELECTED: 'cyber:deselected',
  CYBER_ACTIVITY: 'cyber:activity',
  
  // UI events
  UI_OVERLAY_SHOW: 'ui:overlayShow',
  UI_OVERLAY_HIDE: 'ui:overlayHide',
  UI_NOTIFICATION: 'ui:notification',
  
  // System events
  SYSTEM_ERROR: 'system:error',
  SYSTEM_WARNING: 'system:warning',
  SYSTEM_INFO: 'system:info',
  
  // Streaming events
  STREAM_START: 'stream:start',
  STREAM_STOP: 'stream:stop',
  STREAM_CAMERA_CHANGE: 'stream:cameraChange',
} as const;