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
  bio?: {
    boredom?: number;
    tiredness?: number;
    duty?: number;
    restlessness?: number;
    memory_pressure?: number;
  };
  mesh: THREE.Group;
  position: THREE.Vector3;
  targetPosition: THREE.Vector3;
  stateLight: THREE.PointLight;
  namePlate: THREE.Sprite;
  thoughtBubble?: ThoughtBubble;
  thoughtHistory: ThoughtHistoryEntry[];
  connectionLine?: THREE.Object3D;
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
        const locationPosition = this.getFilesystemLocationPosition(agent.currentLocation, agent.name);
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
      // Safely dispose any meshes within the connection object
      (agent.connectionLine as THREE.Object3D).traverse(obj => {
        const mesh = obj as unknown as THREE.Mesh;
        if (mesh && mesh.geometry) {
          (mesh.geometry as THREE.BufferGeometry).dispose?.();
        }
        const mat: any = (mesh as any).material;
        if (mat) {
          if (Array.isArray(mat)) mat.forEach(m => m.dispose?.());
          else mat.dispose?.();
        }
      });
      agent.connectionLine = undefined;
    }
  }

  // Smoothly orbit agents without a filesystem location on a default circle
  private updateDefaultCircleOrbit(agent: AgentData, index: number, totalCount: number) {
    const radius = Math.max(20, totalCount * 5);
    const baseAngle = (index / Math.max(1, totalCount)) * Math.PI * 2;
    const angle = baseAngle + this.orbitTime * 0.3; // rotate slowly
    agent.targetPosition.set(
      Math.cos(angle) * radius,
      3,
      Math.sin(angle) * radius
    );
  }
  
  // Get 3D position for a filesystem path, with special handling for personal paths
  private getFilesystemLocationPosition(location: string, agentName?: string): THREE.Vector3 | null {
    if (!this.filesystemVisualizer) return null;
    const norm = (location || '').replace(/\\/g, '/');
    if (norm.startsWith('/personal') || norm.startsWith('personal')) {
      const candidates = [
        agentName ? `cybers/${agentName}` : '',
        agentName || '',
        agentName ? `cybers/${(agentName || '').toLowerCase()}` : '',
        (agentName || '').toLowerCase(),
      ].filter(Boolean);
      for (const key of candidates) {
        const pos = this.filesystemVisualizer.getTowerPosition(key);
        if (pos) return pos;
      }
    }
    // Fallback direct lookup
    return this.filesystemVisualizer.getTowerPosition(location);
  }
  
  // Update connection line between agent and its current location
  private updateConnectionLine(agent: AgentData, locationPosition: THREE.Vector3) {
    // Anchor to the tower's top to avoid visual offset
    const topY = this.filesystemVisualizer?.getTowerHeight?.(agent.currentLocation || '') ?? (locationPosition.y + 5);
    const start = new THREE.Vector3(locationPosition.x, topY, locationPosition.z);
    const end = new THREE.Vector3(agent.targetPosition.x, agent.targetPosition.y, agent.targetPosition.z);
    const color = this.getAgentColor(agent.state);

    if (!agent.connectionLine) {
      const group = new THREE.Group();
      // Core tube
      const coreRadius = 0.28;
      const coreGeom = new THREE.CylinderGeometry(coreRadius, coreRadius, 1, 4, 1, true);
      const coreMat = new THREE.MeshStandardMaterial({
        color,
        emissive: new THREE.Color(color),
        emissiveIntensity: 1.9,
        transparent: true,
        opacity: 0.95
      });
      const core = new THREE.Mesh(coreGeom, coreMat);
      // Halo tube (additive fresnel)
      const haloRadius = coreRadius * 1.4;
      const haloGeom = new THREE.CylinderGeometry(haloRadius, haloRadius, 1, 4, 1, true);
      const haloMat = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(color) },
          uIntensity: { value: 1.3 }
        },
        vertexShader: `
          varying vec3 vWorldPos;
          varying vec3 vWorldNormal;
          void main() {
            vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
            vWorldNormal = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPos, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uColor;
          uniform float uIntensity;
          varying vec3 vWorldPos;
          varying vec3 vWorldNormal;
          void main() {
            vec3 V = normalize(cameraPosition - vWorldPos);
            float fres = pow(1.0 - max(dot(normalize(vWorldNormal), V), 0.0), 2.0);
            vec3 col = uColor * (0.8 + 1.4 * fres) * uIntensity;
            float alpha = clamp(fres * 0.8, 0.0, 0.85);
            gl_FragColor = vec4(col, alpha);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const halo = new THREE.Mesh(haloGeom, haloMat);

      group.add(core);
      group.add(halo);
      this.scene.add(group);
      agent.connectionLine = group;
    } else {
      // Update colors on existing materials
      (agent.connectionLine as THREE.Object3D).traverse(obj => {
        const anyMat = (obj as any).material as any;
        if (!anyMat) return;
        if (anyMat.color) anyMat.color.setHex(color);
        if (anyMat.emissive) anyMat.emissive.setHex(color);
        if (typeof anyMat.emissiveIntensity === 'number') anyMat.emissiveIntensity = 1.9;
        if (anyMat.uniforms && anyMat.uniforms.uColor) anyMat.uniforms.uColor.value.setHex(color);
      });
    }

    // Position group between start and end
    const obj = agent.connectionLine as THREE.Object3D;
    const dir = new THREE.Vector3().subVectors(end, start);
    const length = dir.length();
    if (length > 0.0001) {
      const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
      obj.position.copy(mid);
      const yAxis = new THREE.Vector3(0, 1, 0);
      obj.quaternion.setFromUnitVectors(yAxis, dir.clone().normalize());
      obj.scale.set(1, length, 1);
    }
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
        (agent.connectionLine as THREE.Object3D).traverse(obj => {
          const mesh = obj as unknown as THREE.Mesh;
          if (mesh && mesh.geometry) {
            (mesh.geometry as THREE.BufferGeometry).dispose?.();
          }
          const mat: any = (mesh as any).material;
          if (mat) {
            if (Array.isArray(mat)) mat.forEach(m => m.dispose?.());
            else mat.dispose?.();
          }
        });
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
        const anyMat = (agent.connectionLine as any).material as any;
        if (anyMat && anyMat.color && typeof anyMat.color.setHex === 'function') anyMat.color.setHex(color);
        if (anyMat && anyMat.emissive && typeof anyMat.emissive.setHex === 'function') anyMat.emissive.setHex(color);
        if (anyMat && typeof anyMat.emissiveIntensity === 'number') anyMat.emissiveIntensity = 1.5;
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
        const locationPosition = this.getFilesystemLocationPosition(location, name);
        if (locationPosition) {
          // Calculate orbit position for this agent at this location
          const orbitPosition = this.calculateOrbitPosition(location, name, locationPosition);
          agent.targetPosition.copy(orbitPosition);
          
          // Update connection line to tower base
          this.updateConnectionLine(agent, locationPosition);
          
          // Highlight the tower at this location
          this.filesystemVisualizer.highlightTower(location);
        } else {
          // Unknown location currently not in visualization -> fallback orbit (keep location for later resolution)
          if (agent.connectionLine) {
            this.scene.remove(agent.connectionLine);
            (agent.connectionLine as THREE.Object3D).traverse(obj => {
              const mesh = obj as unknown as THREE.Mesh;
              if (mesh && mesh.geometry) {
                (mesh.geometry as THREE.BufferGeometry).dispose?.();
              }
              const mat: any = (mesh as any).material;
              if (mat) {
                if (Array.isArray(mat)) mat.forEach(m => m.dispose?.());
                else mat.dispose?.();
              }
            });
            agent.connectionLine = undefined;
          }
          this.updateAgentPositions();
        }
      } else {
        // Remove connection line if no location
        if (agent.connectionLine) {
          this.scene.remove(agent.connectionLine);
          (agent.connectionLine as THREE.Object3D).traverse(obj => {
            const mesh = obj as unknown as THREE.Mesh;
            if (mesh && mesh.geometry) {
              (mesh.geometry as THREE.BufferGeometry).dispose?.();
            }
            const mat: any = (mesh as any).material;
            if (mat) {
              if (Array.isArray(mat)) mat.forEach(m => m.dispose?.());
              else mat.dispose?.();
            }
          });
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

  getAgentNames(): string[] {
    return Array.from(this.agents.keys());
  }

  getAgentBio(name: string): AgentData['bio'] | null {
    const a = this.agents.get(name);
    return a?.bio || null;
  }

  updateAgentBiofeedback(name: string, bio: Partial<NonNullable<AgentData['bio']>>) {
    const agent = this.agents.get(name);
    if (!agent) return;
    agent.bio = { ...(agent.bio || {}), ...bio };
    // If a bubble is visible, refresh it with current thought + stats
    if (agent.thoughtBubble) {
      const bubbleText = this.composeBubbleText(agent);
      agent.thoughtBubble.updateText(bubbleText);
    }
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
    
    const bubbleText = this.composeBubbleText(agent, thought);

    if (agent.thoughtBubble) {
      // Update existing bubble
      agent.thoughtBubble.updateText(bubbleText);
      agent.thoughtBubble.updatePosition(agent.mesh.position);
    } else {
      // Create new bubble
      agent.thoughtBubble = new ThoughtBubble(bubbleText, agent.mesh.position);
      this.scene.add(agent.thoughtBubble.getMesh());
    }
    
    // Also pulse the agent to show activity
    this.pulseAgent(agent);
  }

  private composeBubbleText(agent: AgentData, newThought?: string): string {
    const latestThought = newThought ?? agent.thoughtHistory[0]?.thought ?? '';
    const b = agent.bio || {};
    const fmt = (n?: number) => (typeof n === 'number' ? Math.round(Math.max(0, Math.min(100, n))) : 0);
    const stats = `B${fmt(b.boredom)} T${fmt(b.tiredness)} D${fmt(b.duty)}\nR${fmt(b.restlessness)} M${fmt(b.memory_pressure)}`;
    if (latestThought) {
      return `${latestThought}\n${stats}`;
    }
    return stats;
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
    
    // Update orbit positions for agents
    const agentList = Array.from(this.agents.values());
    const total = agentList.length || 1;
    agentList.forEach((agent, idx) => {
      // If agent has a location, continuously update its orbit position
      if (agent.currentLocation && this.filesystemVisualizer) {
        const locationPosition = this.getFilesystemLocationPosition(agent.currentLocation, agent.name);
        if (locationPosition) {
          const orbitPosition = this.calculateOrbitPosition(agent.currentLocation, agent.name, locationPosition);
          agent.targetPosition.copy(orbitPosition);
          // Ensure connection line exists or is updated once location resolves
          this.updateConnectionLine(agent, locationPosition);
        } else {
          // Fallback if tower not found for claimed location (keep location for later resolution)
          this.updateDefaultCircleOrbit(agent, idx, total);
        }
      } else {
        // Default circular orbit for agents without a known location
        this.updateDefaultCircleOrbit(agent, idx, total);
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
      
      // Connection line is created/updated above when locationPosition is available
      
      // Update thought bubble position to follow agent
      if (agent.thoughtBubble) {
        agent.thoughtBubble.updatePosition(agent.mesh.position);
      }
    });
  }
}
