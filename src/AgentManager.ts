import * as THREE from 'three';
import { ThoughtBubble } from './ThoughtBubble';

interface ThoughtHistoryEntry {
  thought: string;
  timestamp: Date;
}

interface AgentData {
  name: string;
  type: string;
  state: string;
  premium: boolean;
  currentLocation?: string;
  mesh: THREE.Group;
  position: THREE.Vector3;
  targetPosition: THREE.Vector3;
  stateLight: THREE.PointLight;
  namePlate: THREE.Sprite;
  thoughtBubble?: ThoughtBubble;
  thoughtHistory: ThoughtHistoryEntry[];
  connectionLine?: THREE.Line;
}

export class AgentManager {
  private agents: Map<string, AgentData> = new Map();
  private scene: THREE.Scene;
  private selectedAgent: string | null = null;
  private agentGeometry: THREE.IcosahedronGeometry;
  private clock: THREE.Clock = new THREE.Clock();
  private filesystemVisualizer?: any; // Will be set from main.ts
  private locationAgents: Map<string, Set<string>> = new Map(); // Track agents at each location
  private orbitTime: number = 0; // For orbit animation

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.agentGeometry = new THREE.IcosahedronGeometry(2, 1);
  }

  // Set filesystem visualizer reference for location-based positioning
  setFilesystemVisualizer(filesystemViz: any) {
    this.filesystemVisualizer = filesystemViz;
  }

  addAgent(name: string, data: { type: string; state: string; premium: boolean; current_location?: string }) {
    if (this.agents.has(name)) return;

    const agent = this.createAgent(name, data);
    this.agents.set(name, agent);
    this.scene.add(agent.mesh);
    
    // Position agents based on location or fallback to circle
    this.updateAgentPositions();
  }

  private createAgent(name: string, data: { type: string; state: string; premium: boolean; current_location?: string }): AgentData {
    const group = new THREE.Group();

    // Agent core - glowing icosahedron
    const coreMaterial = new THREE.MeshPhongMaterial({
      color: this.getAgentColor(data.state),
      emissive: this.getAgentColor(data.state),
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.8
    });

    const core = new THREE.Mesh(this.agentGeometry, coreMaterial);
    group.add(core);

    // Wireframe overlay
    const wireframeMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      wireframe: true,
      transparent: true,
      opacity: 0.3
    });
    const wireframe = new THREE.Mesh(this.agentGeometry, wireframeMaterial);
    wireframe.scale.multiplyScalar(1.1);
    group.add(wireframe);

    // State light
    const light = new THREE.PointLight(this.getAgentColor(data.state), 1, 20);
    light.position.y = 5;
    group.add(light);

    // Name plate
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.fillStyle = 'rgba(0, 255, 255, 0.8)';
    context.font = '24px Courier New';
    context.textAlign = 'center';
    context.fillText(name + (data.premium ? ' ✨' : ''), 128, 40);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ 
      map: texture,
      transparent: true
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(8, 2, 1);
    sprite.position.y = 5;
    group.add(sprite);

    const position = new THREE.Vector3();
    const targetPosition = new THREE.Vector3();

    return {
      name,
      type: data.type,
      state: data.state,
      premium: data.premium,
      currentLocation: data.current_location,
      mesh: group,
      position,
      targetPosition,
      stateLight: light,
      namePlate: sprite,
      thoughtHistory: []
    };
  }

  private getAgentColor(state: string): number {
    const colors: Record<string, number> = {
      thinking: 0x00ffff,
      communicating: 0x00ff00,
      sleeping: 0x666666,
      writing: 0xff9f00,
      searching: 0x0080ff,
      idle: 0xcccccc,
      unknown: 0x999999
    };
    return colors[state] || 0x999999;
  }

  private updateAgentPositions() {
    const agents = Array.from(this.agents.values());
    
    agents.forEach((agent, index) => {
      if (agent.currentLocation && this.filesystemVisualizer) {
        // Position agent at filesystem location
        const locationPosition = this.getFilesystemLocationPosition(agent.currentLocation);
        if (locationPosition) {
          agent.targetPosition.copy(locationPosition);
          agent.targetPosition.y += 8; // Float above the filesystem tower
          
          // Update connection line
          this.updateConnectionLine(agent, locationPosition);
        } else {
          // Fallback to circle positioning if location not found
          this.setCirclePosition(agent, index, agents.length);
        }
      } else {
        // Default circle positioning for agents without location
        this.setCirclePosition(agent, index, agents.length);
      }
    });
  }
  
  private setCirclePosition(agent: AgentData, index: number, totalCount: number) {
    const radius = Math.max(20, totalCount * 5);
    const angle = (index / totalCount) * Math.PI * 2;
    agent.targetPosition.set(
      Math.cos(angle) * radius,
      3,
      Math.sin(angle) * radius
    );
    
    // Remove connection line for non-located agents
    if (agent.connectionLine) {
      this.scene.remove(agent.connectionLine);
      agent.connectionLine.geometry.dispose();
      (agent.connectionLine.material as THREE.Material).dispose();
      agent.connectionLine = undefined;
    }
  }
  
  // Get 3D position for a filesystem path
  private getFilesystemLocationPosition(location: string): THREE.Vector3 | null {
    if (!this.filesystemVisualizer) return null;
    
    // Get tower position from filesystem visualizer
    const towerPosition = this.filesystemVisualizer.getTowerPosition(location);
    return towerPosition;
  }
  
  // Update connection line between agent and its current location
  private updateConnectionLine(agent: AgentData, locationPosition: THREE.Vector3) {
    // Remove existing line if any
    if (agent.connectionLine) {
      this.scene.remove(agent.connectionLine);
      agent.connectionLine.geometry.dispose();
      (agent.connectionLine.material as THREE.Material).dispose();
    }
    
    // Create new connection line
    const points = [
      new THREE.Vector3(locationPosition.x, locationPosition.y + 5, locationPosition.z),
      new THREE.Vector3(agent.targetPosition.x, agent.targetPosition.y, agent.targetPosition.z)
    ];
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: this.getAgentColor(agent.state),
      transparent: true,
      opacity: 0.6,
      linewidth: 2
    });
    
    agent.connectionLine = new THREE.Line(geometry, material);
    this.scene.add(agent.connectionLine);
  }

  removeAgent(name: string) {
    const agent = this.agents.get(name);
    if (agent) {
      this.scene.remove(agent.mesh);
      
      // Remove thought bubble if exists
      if (agent.thoughtBubble) {
        this.scene.remove(agent.thoughtBubble.getMesh());
        agent.thoughtBubble.dispose();
      }
      
      // Remove connection line if exists
      if (agent.connectionLine) {
        this.scene.remove(agent.connectionLine);
        agent.connectionLine.geometry.dispose();
        (agent.connectionLine.material as THREE.Material).dispose();
      }
      
      this.agents.delete(name);
      this.updateAgentPositions();
    }
  }

  updateAgentState(name: string, state: string) {
    const agent = this.agents.get(name);
    if (agent) {
      agent.state = state;
      
      // Update colors
      const color = this.getAgentColor(state);
      const core = agent.mesh.children[0] as THREE.Mesh;
      const material = core.material as THREE.MeshPhongMaterial;
      material.color.setHex(color);
      material.emissive.setHex(color);
      
      agent.stateLight.color.setHex(color);
      
      // Update connection line color if it exists
      if (agent.connectionLine) {
        (agent.connectionLine.material as THREE.LineBasicMaterial).color.setHex(color);
      }
      
      // Add a pulse effect for state changes
      this.pulseAgent(agent);
    }
  }
  
  // Update agent location
  updateAgentLocation(name: string, location: string) {
    const agent = this.agents.get(name);
    if (agent) {
      agent.currentLocation = location;
      
      // Reposition the agent
      if (location && this.filesystemVisualizer) {
        const locationPosition = this.getFilesystemLocationPosition(location);
        if (locationPosition) {
          // Calculate orbit position for this agent at this location
          const orbitPosition = this.calculateOrbitPosition(location, name, locationPosition);
          agent.targetPosition.copy(orbitPosition);
          
          // Update connection line to tower base
          this.updateConnectionLine(agent, locationPosition);
          
          // Highlight the tower at this location
          this.filesystemVisualizer.highlightTower(location);
        }
      } else {
        // Remove connection line if no location
        if (agent.connectionLine) {
          this.scene.remove(agent.connectionLine);
          agent.connectionLine.geometry.dispose();
          (agent.connectionLine.material as THREE.Material).dispose();
          agent.connectionLine = undefined;
        }
        
        // Reset to circle position
        this.updateAgentPositions();
      }
    }
  }

  private pulseAgent(agent: AgentData) {
    // Simple scale pulse
    const startScale = agent.mesh.scale.x;
    const targetScale = startScale * 1.3;
    
    const pulse = { scale: startScale };
    const duration = 300;
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      if (progress < 0.5) {
        pulse.scale = startScale + (targetScale - startScale) * (progress * 2);
      } else {
        pulse.scale = targetScale - (targetScale - startScale) * ((progress - 0.5) * 2);
      }
      
      agent.mesh.scale.setScalar(pulse.scale);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    animate();
  }

  selectAgent(name: string | null) {
    // Deselect previous
    if (this.selectedAgent) {
      const prevAgent = this.agents.get(this.selectedAgent);
      if (prevAgent) {
        const wireframe = prevAgent.mesh.children[1] as THREE.Mesh;
        (wireframe.material as THREE.MeshBasicMaterial).opacity = 0.3;
      }
    }

    this.selectedAgent = name;

    // Select new
    if (name) {
      const agent = this.agents.get(name);
      if (agent) {
        const wireframe = agent.mesh.children[1] as THREE.Mesh;
        (wireframe.material as THREE.MeshBasicMaterial).opacity = 1;
      }
    }
  }

  getAgentAtPosition(raycaster: THREE.Raycaster): AgentData | null {
    const meshes = Array.from(this.agents.values()).map(a => a.mesh);
    const intersects = raycaster.intersectObjects(meshes, true);
    
    console.log(`Raycasting: found ${intersects.length} intersections, checking ${meshes.length} agent meshes`);
    
    if (intersects.length > 0) {
      // Try to find the agent by checking the hit object and its parents
      const hitObject = intersects[0].object;
      console.log('Hit object type:', hitObject.type, 'Name:', hitObject.name);
      
      for (const [_name, agent] of this.agents) {
        // Check if the hit object is the agent mesh itself
        if (agent.mesh === hitObject) {
          console.log('Found agent by direct mesh match:', agent.name);
          return agent;
        }
        
        // Check if the hit object is a child of the agent mesh
        let parent = hitObject.parent;
        while (parent) {
          if (agent.mesh === parent) {
            console.log('Found agent by parent match:', agent.name);
            return agent;
          }
          parent = parent.parent;
        }
      }
      console.log('Hit object found but no agent matched');
    }
    
    return null;
  }

  getAgentCount(): number {
    return this.agents.size;
  }

  getSelectedAgent(): string | null {
    return this.selectedAgent;
  }

  getAgentData(name: string): AgentData | null {
    return this.agents.get(name) || null;
  }

  showThought(agentName: string, thought: string) {
    const agent = this.agents.get(agentName);
    if (!agent) return;
    
    // Add to thought history (keep last 20 thoughts)
    agent.thoughtHistory.unshift({
      thought,
      timestamp: new Date()
    });
    if (agent.thoughtHistory.length > 20) {
      agent.thoughtHistory.pop();
    }
    
    if (agent.thoughtBubble) {
      // Update existing bubble
      agent.thoughtBubble.updateText(thought);
      agent.thoughtBubble.updatePosition(agent.mesh.position);
    } else {
      // Create new bubble
      agent.thoughtBubble = new ThoughtBubble(thought, agent.mesh.position);
      this.scene.add(agent.thoughtBubble.getMesh());
    }
    
    // Also pulse the agent to show activity
    this.pulseAgent(agent);
  }
  
  getAgentThoughtHistory(agentName: string): ThoughtHistoryEntry[] {
    const agent = this.agents.get(agentName);
    return agent ? agent.thoughtHistory : [];
  }
  
  // Calculate orbit position for an agent at a location
  private calculateOrbitPosition(location: string, agentName: string, towerPosition: THREE.Vector3): THREE.Vector3 {
    // Update location tracking
    if (!this.locationAgents.has(location)) {
      this.locationAgents.set(location, new Set());
    }
    const agentsAtLocation = this.locationAgents.get(location)!;
    
    // Remove agent from previous location if any
    for (const [loc, agents] of this.locationAgents.entries()) {
      if (loc !== location) {
        agents.delete(agentName);
      }
    }
    
    // Add to current location
    agentsAtLocation.add(agentName);
    
    // Calculate orbit parameters
    const orbitRadius = 8; // Distance from tower center
    const orbitHeight = 10; // Height above tower
    const agentCount = agentsAtLocation.size;
    
    // Debug: Log when multiple agents are at same location
    if (agentCount > 1) {
      console.log(`Multiple agents at ${location}:`, Array.from(agentsAtLocation));
    }
    
    // Find this agent's index in the set
    let agentIndex = 0;
    let currentIndex = 0;
    for (const name of agentsAtLocation) {
      if (name === agentName) {
        agentIndex = currentIndex;
        break;
      }
      currentIndex++;
    }
    
    // Calculate angle for this agent (distribute evenly around circle)
    // For multiple agents, space them evenly around the circle
    const angleOffset = agentCount > 1 
      ? (agentIndex * (Math.PI * 2) / agentCount)  // Distribute evenly
      : 0; // Single agent starts at 0
    const timeOffset = this.orbitTime * 0.5; // Slow orbit speed
    const angle = angleOffset + timeOffset;
    
    // Debug orbit positions
    if (agentCount > 1) {
      console.log(`Agent ${agentName} at index ${agentIndex}/${agentCount}, angle offset: ${angleOffset}, total angle: ${angle}`);
    }
    
    // Calculate position
    const position = new THREE.Vector3(
      towerPosition.x + Math.cos(angle) * orbitRadius,
      towerPosition.y + orbitHeight,
      towerPosition.z + Math.sin(angle) * orbitRadius
    );
    
    return position;
  }

  update() {
    const deltaTime = this.clock.getDelta();
    this.orbitTime += deltaTime; // Increment orbit time
    
    // Update orbit positions for agents at locations
    for (const agent of this.agents.values()) {
      // If agent has a location, continuously update its orbit position
      if (agent.currentLocation && this.filesystemVisualizer) {
        const locationPosition = this.getFilesystemLocationPosition(agent.currentLocation);
        if (locationPosition) {
          const orbitPosition = this.calculateOrbitPosition(agent.currentLocation, agent.name, locationPosition);
          agent.targetPosition.copy(orbitPosition);
        }
      }
      
      // Smooth movement to target position
      agent.position.lerp(agent.targetPosition, deltaTime * 2);
      agent.mesh.position.copy(agent.position);
      
      // Rotation based on state
      if (agent.state === 'thinking') {
        agent.mesh.rotation.y += deltaTime * 2;
      } else if (agent.state === 'searching') {
        agent.mesh.rotation.y += deltaTime * 0.5;
        agent.mesh.rotation.x = Math.sin(Date.now() * 0.001) * 0.1;
      } else {
        agent.mesh.rotation.y += deltaTime * 0.1;
      }
      
      // Bob up and down slightly
      const bobAmount = agent.state === 'sleeping' ? 0.1 : 0.3;
      agent.mesh.position.y = agent.position.y + Math.sin(Date.now() * 0.001 + agent.position.x) * bobAmount;
      
      // Update connection line if it exists
      if (agent.connectionLine && agent.currentLocation && this.filesystemVisualizer) {
        const locationPosition = this.getFilesystemLocationPosition(agent.currentLocation);
        if (locationPosition) {
          // Update the line geometry to follow the agent's current position
          const points = [
            new THREE.Vector3(locationPosition.x, locationPosition.y + 5, locationPosition.z),
            new THREE.Vector3(agent.mesh.position.x, agent.mesh.position.y, agent.mesh.position.z)
          ];
          agent.connectionLine.geometry.setFromPoints(points);
        }
      }
      
      // Update thought bubble position to follow agent
      if (agent.thoughtBubble) {
        agent.thoughtBubble.updatePosition(agent.mesh.position);
      }
    }
  }
}