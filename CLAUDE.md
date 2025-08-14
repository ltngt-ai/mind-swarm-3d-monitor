# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Mind Swarm 3D Monitor** - A real-time 3D visualization tool for monitoring Mind Swarm AI agents, their mailboxes, and filesystem activity. Built with TypeScript, Three.js, and Vite.

### Key Features
- Real-time WebSocket connection to Mind Swarm backend
- 3D visualization of agents with color-coded states
- Interactive mailbox system for agent communication
- Filesystem activity visualization
- Agent thought bubbles and status indicators

## Development Commands

### Package Management
- `npm install` - Install dependencies
- `npm ci` - Install dependencies for CI/CD (clean install)
- `npm update` - Update dependencies

### Build & Development
- `npm run dev` - Start development server on port 5175
- `npm run build` - Build the project for production (TypeScript + Vite)
- `npm run preview` - Preview production build locally

### Code Quality (TO BE ADDED)
- TypeScript strict mode is enabled in tsconfig.json
- Consider adding: ESLint, Prettier, Husky for pre-commit hooks

## Technology Stack

### Core Technologies
- **TypeScript** - Strongly typed JavaScript (strict mode enabled)
- **Three.js** - 3D graphics library for WebGL
- **Vite** - Fast build tool and development server
- **Node.js** - Runtime environment (for build tools)

### Key Dependencies
- **three** (^0.160.0) - 3D graphics and visualization
- **lil-gui** (^0.19.0) - Lightweight GUI for debugging and controls
- **@types/three** - TypeScript definitions for Three.js

### Build Configuration
- **TypeScript** (^5.0.0) - Type checking and compilation
- **Vite** (^5.0.0) - Module bundling and dev server
- **ES Modules** - Modern module system (`"type": "module"`)

## Project Structure

### Current File Organization
```
src/
├── AgentManager.ts       # Manages agent entities and state
├── FilesystemVisualizer.ts # Visualizes filesystem activity
├── GridSystem.ts         # 3D grid layout system
├── Mailbox.ts           # Agent mailbox UI and functionality
├── ThoughtBubble.ts     # Agent thought visualization
├── WebSocketClient.ts   # WebSocket connection to backend
└── main.ts             # Application entry point
```

### Architecture Patterns
- **Class-based architecture** - Each major component is a TypeScript class
- **Three.js scene management** - Central scene with managed 3D objects
- **Event-driven updates** - WebSocket messages trigger UI updates
- **Singleton patterns** - Single instances for managers and clients

### Naming Conventions
- **Files**: PascalCase for classes (`AgentManager.ts`)
- **Classes**: PascalCase (`AgentManager`, `WebSocketClient`)
- **Methods**: camelCase (`updateAgent`, `connectToServer`)
- **Properties**: camelCase (`agentMeshes`, `isConnected`)
- **Constants**: UPPER_SNAKE_CASE (`WS_URL`, `GRID_SIZE`)

## TypeScript Configuration

### Current Settings (tsconfig.json)
- **Target**: ES2020 with DOM libraries
- **Module**: ESNext with bundler resolution
- **Strict Mode**: Enabled (all strict checks active)
- **No Unused**: Locals and parameters flagged
- **Isolated Modules**: Required for Vite

### Type Safety Guidelines
- Strict mode is already enabled ✅
- Define interfaces for WebSocket message types
- Use proper Three.js types from @types/three
- Avoid `any` - current code needs type improvements
- Add proper return types to all methods

## WebSocket Integration

### Connection Details
- **Backend**: Mind Swarm Core on ws://localhost:8765
- **Message Format**: JSON with type-based routing
- **Reconnection**: Automatic with exponential backoff
- **Event Types**: agent_update, mailbox_update, filesystem_activity

### Message Types to Handle
```typescript
interface AgentUpdate {
  type: 'agent_update';
  agent_id: string;
  state: 'thinking' | 'idle' | 'working' | 'error';
  position?: { x: number; y: number; z: number };
}

interface MailboxUpdate {
  type: 'mailbox_update';
  agent_id: string;
  messages: Message[];
}
```

## Three.js Specifics

### Scene Management
- Single main scene with ambient + directional lighting
- OrbitControls for camera manipulation
- Grid helper for spatial reference
- Render loop at 60 FPS

### Performance Considerations
- Reuse geometries and materials
- Dispose of unused Three.js objects
- Use instanced meshes for many similar objects
- Implement frustum culling for large scenes

## Development Workflow

### Quick Start
```bash
# Install dependencies
npm install

# Start Mind Swarm backend first
cd ../mind-swarm
./manage_server.sh start

# Start 3D monitor
npm run dev
# Opens at http://localhost:5175
```

### Common Tasks
- **Add new agent visualization**: Update AgentManager.ts
- **Modify WebSocket handling**: Edit WebSocketClient.ts
- **Change 3D appearance**: Modify relevant mesh creation code
- **Add UI elements**: Consider using lil-gui or HTML overlay

### Debugging
- Browser DevTools for TypeScript debugging
- Three.js Inspector browser extension
- Console logging for WebSocket messages
- lil-gui for runtime parameter tweaking