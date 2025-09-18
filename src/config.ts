// Configuration for Mind Swarm 3D Monitor

export interface Config {
  apiUrl: string;
  wsUrl: string;
  autoReconnect: boolean;
  reconnectInterval: number;
  ttsUrl?: string; // optional external TTS endpoint
  twitch?: {
    enabled: boolean;
    channel?: string;
    mockMode?: boolean;
    commandPrefix?: string;
    position?: 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left';
  };
}

// Get server configuration from environment or URL parameters
function getServerConfig(): { host: string; port: string } {
  // Check URL parameters first
  const urlParams = new URLSearchParams(window.location.search);
  const serverParam = urlParams.get('server');

  if (serverParam) {
    // Support formats:
    //   - hostname:port
    //   - hostname (defaults to 8888)
    //   - full URLs: http[s]://host[:port][/base], ws[s]://host[:port][/path]
    try {
      if (/^https?:\/\//i.test(serverParam) || /^wss?:\/\//i.test(serverParam)) {
        const u = new URL(serverParam);
        const port = u.port || (u.protocol === 'https:' || u.protocol === 'wss:' ? '443' : '80');
        return { host: u.hostname, port };
      }
    } catch {}
    const [host, port = '8888'] = serverParam.split(':');
    return { host, port };
  }

  // Check localStorage for saved server
  const savedServer = localStorage.getItem('mindswarm-server');
  if (savedServer) {
    try {
      const { host, port } = JSON.parse(savedServer);
      return { host: host || '192.168.1.129', port: port || '8888' };
    } catch (e) {
      console.warn('Invalid saved server config:', e);
    }
  }
  
  // Default to localhost
  return { host: '192.168.1.129', port: '8888' };
}

// Build configuration
export function getConfig(): Config {
  const { host, port } = getServerConfig();

  // URL overrides allow advanced setups
  const urlParams = new URLSearchParams(window.location.search);
  const apiOverride = urlParams.get('api'); // e.g. https://server:443/base
  const wsOverride = urlParams.get('ws');   // e.g. wss://server:443/path
  const basePath = urlParams.get('base') || ''; // prefix like /mind-swarm
  const ttsUrl = urlParams.get('tts') || urlParams.get('ttsUrl') || undefined; // external TTS endpoint
  
  // Twitch configuration from URL params
  const twitchChannel = urlParams.get('twitch');
  const twitchMode = urlParams.get('twitch_mode') === '1' || urlParams.get('twitchMode') === '1';
  const twitchMockParam = urlParams.get('twitch_mock') || urlParams.get('twitchMock');
  const twitchMock = twitchMockParam === null ? null : twitchMockParam === '1';
  const twitchPosition = urlParams.get('twitch_pos') || urlParams.get('twitchPos');

  // Helper to normalize path joining
  const join = (a: string, b: string) => {
    if (!b) return a;
    const as = a.endsWith('/') ? a.slice(0, -1) : a;
    const bs = b.startsWith('/') ? b : `/${b}`;
    return `${as}${bs}`;
  };

  // Determine protocol defaults based on PAGE protocol, but allow explicit overrides
  const pageSecure = window.location.protocol === 'https:';
  const defaultHttp = pageSecure ? 'https' : 'http';
  const defaultWs = pageSecure ? 'wss' : 'ws';

  // Build base URLs
  const apiUrl = apiOverride || `${defaultHttp}://${host}:${port}${basePath}`;
  let wsUrl = wsOverride || `${defaultWs}://${host}:${port}${join(basePath, 'ws')}`;

  // If apiOverride is https/http and wsOverride is not set, try to infer matching ws scheme
  if (!wsOverride && apiOverride) {
    try {
      const au = new URL(apiOverride);
      const wsScheme = au.protocol === 'https:' ? 'wss' : 'ws';
      wsUrl = `${wsScheme}://${au.host}${join(au.pathname, 'ws')}`;
    } catch {
      // ignore
    }
  }

  const twitchConfig = (twitchChannel || twitchMode) ? {
    enabled: true,
    channel: twitchChannel || undefined,
    mockMode: twitchMock === null ? true : twitchMock, // Default to mock if not specified
    commandPrefix: urlParams.get('twitch_prefix') || '!',
    position: (twitchPosition as any) || 'top-right'
  } : undefined;

  return {
    apiUrl,
    wsUrl,
    autoReconnect: true,
    reconnectInterval: 5000,
    ttsUrl,
    twitch: twitchConfig
  };
}

// Save server configuration
export function saveServerConfig(host: string, port: string = '8888'): void {
  localStorage.setItem('mindswarm-server', JSON.stringify({ host, port }));
}

// Get current server info for display
export function getServerInfo(): string {
  const { host, port } = getServerConfig();
  return `${host}:${port}`;
}

// Create a server selector UI element
export function createServerSelector(): HTMLDivElement {
  const container = document.createElement('div');
  container.id = 'server-selector';
  container.style.cssText = `
    position: fixed;
    bottom: 10px;
    left: 10px;
    background: rgba(0, 20, 40, 0.9);
    border: 1px solid #0080ff;
    border-radius: 5px;
    padding: 10px;
    color: #00ffff;
    font-family: 'Courier New', monospace;
    font-size: 12px;
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: 10px;
  `;
  
  const { host, port } = getServerConfig();
  
  container.innerHTML = `
    <label>Server:</label>
    <input type="text" id="server-host" value="${host}" placeholder="hostname" style="
      background: rgba(0, 40, 80, 0.5);
      border: 1px solid #00ffff;
      color: #00ffff;
      padding: 3px 5px;
      width: 120px;
      font-family: inherit;
      font-size: inherit;
    ">
    <input type="text" id="server-port" value="${port}" placeholder="8888" style="
      background: rgba(0, 40, 80, 0.5);
      border: 1px solid #00ffff;
      color: #00ffff;
      padding: 3px 5px;
      width: 50px;
      font-family: inherit;
      font-size: inherit;
    ">
    <button id="connect-btn" style="
      background: rgba(0, 80, 160, 0.7);
      border: 1px solid #00ffff;
      color: #00ffff;
      padding: 3px 10px;
      cursor: pointer;
      font-family: inherit;
      font-size: inherit;
    ">Connect</button>
    <button id="toggle-selector" style="
      background: rgba(80, 80, 80, 0.5);
      border: 1px solid #666;
      color: #999;
      padding: 3px 8px;
      cursor: pointer;
      font-family: inherit;
      font-size: 10px;
      margin-left: 10px;
    ">Hide</button>
  `;
  
  // Add event listeners
  container.querySelector('#connect-btn')?.addEventListener('click', () => {
    const hostInput = container.querySelector('#server-host') as HTMLInputElement;
    const portInput = container.querySelector('#server-port') as HTMLInputElement;
    
    if (hostInput && portInput) {
      const newHost = hostInput.value || 'localhost';
      const newPort = portInput.value || '8888';
      
      saveServerConfig(newHost, newPort);
      
      // Reload with new server
      window.location.reload();
    }
  });
  
  container.querySelector('#toggle-selector')?.addEventListener('click', () => {
    const inputs = container.querySelectorAll('input, button:not(#toggle-selector)');
    const toggleBtn = container.querySelector('#toggle-selector') as HTMLButtonElement;
    const label = container.querySelector('label') as HTMLLabelElement;
    
    if (toggleBtn.textContent === 'Hide') {
      inputs.forEach(el => (el as HTMLElement).style.display = 'none');
      if (label) label.style.display = 'none';
      toggleBtn.textContent = '🔗';
      toggleBtn.title = `Server: ${getServerInfo()}`;
      container.style.padding = '5px';
    } else {
      inputs.forEach(el => (el as HTMLElement).style.display = '');
      if (label) label.style.display = '';
      toggleBtn.textContent = 'Hide';
      toggleBtn.title = '';
      container.style.padding = '10px';
    }
  });
  
  return container;
}

// Export singleton config
export const config = getConfig();
