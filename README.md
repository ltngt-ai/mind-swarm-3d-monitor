# Mind-Swarm 3D Monitor

A Tron-inspired 3D visualization interface for monitoring Mind-Swarm agents in real-time. Watch agents think, communicate, and collaborate in a beautiful cyberpunk environment.

## Features

- **3D Agent Visualization**: Agents appear as glowing icosahedrons with dynamic colors based on their state
- **Real-time Thought Bubbles**: See what agents are thinking as they process tasks
- **Thought History**: Click on any agent to view their recent thoughts with timestamps
- **Filesystem Activity**: Visual towers representing subspace directories pulse when accessed
- **WebSocket Integration**: Live updates from the Mind-Swarm server
- **Interactive Camera**: WASD movement, mouse rotation, scroll to zoom

## Prerequisites

- Node.js 16+ and npm
- Mind-Swarm server running (default: 192.168.1.129:8888)
- Modern web browser with WebGL support

## Installation

```bash
# Clone the repository
git clone https://github.com/ltngt-ai/mind-swarm-3d-monitor.git
cd mind-swarm-3d-monitor

# Install dependencies
npm install

# Start the development server
npm run dev
```

The monitor will be available at http://localhost:5175

## Usage

1. Start your Mind-Swarm server first
2. Launch the 3D monitor with `npm run dev`
3. The interface will automatically connect to the WebSocket server

### Connecting to Remote Servers

The 3D monitor supports connecting to Mind-Swarm servers running on different machines:

#### Method 1: URL Parameter
Add the server address as a URL parameter:
```
http://localhost:5173/?server=192.168.1.100:8888
http://localhost:5173/?server=myserver.local:8888
http://localhost:5173/?server=myserver.local  (defaults to port 8888)
```

#### Method 2: Server Selector UI
Use the server selector at the bottom-left of the screen:
1. Enter the hostname/IP in the first field
2. Enter the port in the second field (default: 8888)
3. Click "Connect" to save and reconnect
4. The server preference is saved in localStorage for future sessions

#### Method 3: Build Configuration
For production deployments, you can configure the default server in the code.

### Controls

- **WASD**: Move camera position
- **Mouse**: Click and drag to rotate view
- **Scroll**: Zoom in/out
- **Click Agent**: Select to view details and thought history

### Visual Indicators

Agent colors indicate their current state:
- 🟦 **Cyan**: Thinking
- 🟢 **Green**: Communicating
- 🟡 **Orange**: Writing
- 🔵 **Blue**: Searching
- ⚪ **Gray**: Idle/Sleeping

Premium agents are marked with a ✨ sparkle.

## Architecture

Built with:
- **Three.js**: 3D graphics and WebGL rendering
- **TypeScript**: Type-safe development
- **Vite**: Fast build tooling
- **WebSocket**: Real-time server communication

The monitor connects to Mind-Swarm's WebSocket endpoint and visualizes:
- Agent creation/termination
- State changes
- Thought processes (via brain monitoring)
- Filesystem activity

## Development

```bash
# Type checking
npm run typecheck

# Build for production
npm run build

# Preview production build
npm run preview
```

## Quick Start

```bash
# Install deps and launch (with server check)
./start.sh

# Or run manually
npm install
npm run dev
```

## License

Part of the Mind-Swarm project by LTNGT AI.
