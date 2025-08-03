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
- Mind-Swarm server running on port 8888
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

The monitor will be available at http://localhost:5173

## Usage

1. Start your Mind-Swarm server first
2. Launch the 3D monitor with `npm run dev`
3. The interface will automatically connect to the WebSocket server

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

## License

Part of the Mind-Swarm project by LTNGT AI.