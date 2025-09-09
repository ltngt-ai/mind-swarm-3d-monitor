import * as THREE from 'three';
import { FilesystemNode, FilesystemStructure } from './types';
import { config } from './config';

interface DirectoryColors {
  [key: string]: {
    primary: number;
    height: number;
    emissive: number;
  };
}

export class FilesystemVisualizer {
  private scene: THREE.Scene;
  private rootGroup: THREE.Group;
  private towers: Map<string, THREE.Group> = new Map();
  private towerPositions: Map<string, THREE.Vector3> = new Map();
  private towerGeometry: THREE.BoxGeometry;
  private subTowerGeometry: THREE.BoxGeometry;
  private fileGeometry: THREE.SphereGeometry;
  private time: number = 0;
  private filesystemStructure: FilesystemStructure | null = null;
  // Use browser-safe interval type
  private updateInterval: ReturnType<typeof setInterval> | null = null;
  private apiUrl: string = config.apiUrl;
  // Track visual heights per tower key to precisely anchor links
  private towerHeights: Map<string, number> = new Map();
  // Track occupied x/z positions to avoid overlapping towers
  private occupiedPositions: Array<THREE.Vector2> = [];
  
  // Instanced link meshes (filesystem tower connections)
  private linkCoreInst?: THREE.InstancedMesh;
  private linkHaloInst?: THREE.InstancedMesh;
  private linkDummy: THREE.Object3D = new THREE.Object3D();
  // Group to contain all link-related objects (instanced or fallback tubes)
  private linkGroup: THREE.Group = new THREE.Group();
  // City grid parameters
  private CITY_CELL_SIZE: number = 14; // size of a block footprint (footprint of towers)
  private CITY_STREET: number = 8;     // width of streets between blocks
  
  // Color scheme for different directory types
  private directoryColors: DirectoryColors = {
    'grid': { primary: 0x00ffff, height: 35, emissive: 0x003333 },
    'community': { primary: 0x00ccff, height: 20, emissive: 0x002244 },
    'library': { primary: 0x0066ff, height: 25, emissive: 0x001133 },
    'base_code': { primary: 0x0044cc, height: 15, emissive: 0x001122 },
    'knowledge': { primary: 0x0088ff, height: 15, emissive: 0x001144 },
    'workshop': { primary: 0x00aaff, height: 22, emissive: 0x001155 },
    'cyber_home': { primary: 0xff8800, height: 18, emissive: 0x332200 },
    'default': { primary: 0x666666, height: 12, emissive: 0x111111 }
  };

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.rootGroup = new THREE.Group();
    this.scene.add(this.rootGroup);
    // Contain all links in a dedicated group so we can clear them reliably
    this.rootGroup.add(this.linkGroup);
    
    // Base geometries for towers and files
    this.towerGeometry = new THREE.BoxGeometry(4, 1, 4);
    this.subTowerGeometry = new THREE.BoxGeometry(2, 1, 2);
    this.fileGeometry = new THREE.SphereGeometry(0.5, 8, 6);
    this.linkDummy.matrixAutoUpdate = false;
    
    // Start with "NOT CONNECTED" indicator
    this.showNotConnected();
    
    // Try to fetch filesystem structure from API
    this.fetchFilesystemStructure();
    
    // Set up periodic updates every 30 seconds
    this.updateInterval = setInterval(() => {
      this.fetchFilesystemStructure();
    }, 30000);
  }

  // Show "NOT CONNECTED" indicator
  private showNotConnected(): void {
    this.clearTowers();
    
    // Create "NOT CONNECTED" text as 3D object
    const group = new THREE.Group();
    
    // Create large wireframe box as background
    const boxGeometry = new THREE.BoxGeometry(40, 10, 2);
    const wireframeMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      wireframe: true,
      transparent: true,
      opacity: 0.3
    });
    const wireframeBox = new THREE.Mesh(boxGeometry, wireframeMaterial);
    group.add(wireframeBox);
    
    // Create "NOT CONNECTED" text using sprites
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const context = canvas.getContext('2d')!;
    
    // Draw text
    context.fillStyle = 'rgba(255, 0, 0, 0.8)';
    context.font = 'bold 48px Courier New';
    context.textAlign = 'center';
    context.fillText('FILESYSTEM', 256, 50);
    context.fillText('NOT CONNECTED', 256, 100);
    
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ 
      map: texture,
      transparent: true
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(40, 10, 1);
    group.add(sprite);
    
    // Position in the filesystem area
    group.position.set(0, 15, -50);
    
    // Add pulsing animation
    group.name = 'not-connected-indicator';
    
    this.rootGroup.add(group);
    this.towers.set('not-connected', group);
  }

  // Fetch filesystem structure from backend API
  private async fetchFilesystemStructure(): Promise<void> {
    console.log('Fetching filesystem structure from:', `${this.apiUrl}/filesystem/structure`);
    try {
      // Get the actual filesystem structure from the backend
      const response = await fetch(`${this.apiUrl}/filesystem/structure`);
      console.log('Filesystem response status:', response.status, response.statusText);
      
      if (!response.ok) {
        // Backend not connected or endpoint not available
        console.log('Backend not connected or filesystem endpoint unavailable. Status:', response.status);
        const errorText = await response.text();
        console.log('Error response:', errorText);
        this.filesystemStructure = null;
        this.showNotConnected();
        return;
      }
      
      // Parse the real filesystem structure
      this.filesystemStructure = await response.json();
      console.log('Fetched real filesystem structure:', this.filesystemStructure);
      
      // Update the visualization with the real grid structure
      this.updateVisualization();
      
    } catch (error) {
      // Connection failed - show NOT CONNECTED
      console.error('Failed to fetch filesystem structure:', error);
      this.filesystemStructure = null;
      this.showNotConnected();
    }
  }
  
  // Update the 3D visualization based on current filesystem structure
  private updateVisualization(): void {
    if (!this.filesystemStructure) return;
    
    // Clear existing towers
    this.clearTowers();
    // Instanced links disabled; using simple tubes
    
    // Create grid directory structure (main visualization)
    if (this.filesystemStructure.grid) {
      console.log('Creating towers for grid structure:', this.filesystemStructure.grid);
      this.createDirectoryTower(
        this.filesystemStructure.grid,
        new THREE.Vector3(0, 0, -50), // Center position
        true, // Show subdirectories
        0 // Starting depth
      );
      console.log('Tower positions created:', Array.from(this.towerPositions.keys()));
    }
    
    // Create minimal towers for each Cyber's personal root (backend provides list only)
    if (this.filesystemStructure.cyber_homes && this.filesystemStructure.cyber_homes.length > 0) {
      const cyberPositions = this.calculateCyberHomePositions(this.filesystemStructure.cyber_homes.length);
      this.filesystemStructure.cyber_homes.forEach((cyberHome, index) => {
        const towerName = cyberHome.name; // show raw name
        this.createCyberHomeTower(cyberHome, cyberPositions[index], towerName);
      });
    }

    // No instanced link finalization needed
  }
  
  // Calculate positions for cyber home directories in a circle behind the grid
  private calculateCyberHomePositions(cyberCount: number): THREE.Vector3[] {
    const positions: THREE.Vector3[] = [];
    const radius = 60;
    const centerZ = 40;
    
    for (let i = 0; i < cyberCount; i++) {
      const angle = (i / cyberCount) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius + centerZ;
      positions.push(new THREE.Vector3(x, 0, z));
    }
    
    return positions;
  }
  
  // Clear all existing towers
  private clearTowers(): void {
    this.towers.forEach((tower) => {
      this.rootGroup.remove(tower);
      // Dispose of geometries and materials
      tower.traverse((child) => {
        // Meshes (boxes, wires, etc.)
        if ((child as any).isMesh) {
          const mesh = child as THREE.Mesh;
          // Avoid disposing shared base geometries reused across towers
          const geom = mesh.geometry as any;
          if (
            geom &&
            geom !== this.towerGeometry &&
            geom !== this.subTowerGeometry &&
            geom !== this.fileGeometry
          ) {
            geom.dispose?.();
          }
          const mat = mesh.material as any;
          if (Array.isArray(mat)) mat.forEach((m: any) => { m.map?.dispose?.(); m.dispose?.(); });
          else { mat?.map?.dispose?.(); mat?.dispose?.(); }
        }
        // Sprites (labels, NOT CONNECTED text)
        else if ((child as any).isSprite) {
          const sprite = child as THREE.Sprite;
          const smat = sprite.material as any;
          smat?.map?.dispose?.();
          smat?.dispose?.();
        }
        // Lines and tube groups
        else if ((child as any).isLine) {
          const line = child as THREE.Line;
          (line.geometry as any)?.dispose?.();
          (line.material as any)?.dispose?.();
        }
      });
    });
    this.towers.clear();
    this.towerPositions.clear();
    this.towerHeights.clear();
    this.occupiedPositions = [];
    this.clearLinks();
  }

  // Register a tower footprint as occupied
  private registerOccupied(pos: THREE.Vector3): void {
    this.occupiedPositions.push(new THREE.Vector2(pos.x, pos.z));
  }

  // Check whether a desired position overlaps existing towers within minDist
  private isOverlappingPosition(pos: THREE.Vector3, minDist: number): boolean {
    const minDistSq = minDist * minDist;
    const px = pos.x, pz = pos.z;
    for (const v of this.occupiedPositions) {
      const dx = v.x - px;
      const dz = v.y - pz;
      if (dx * dx + dz * dz < minDistSq) return true;
    }
    return false;
  }

  // Find nearest free spot via spiral search starting from desired position
  private findNonOverlappingPosition(desired: THREE.Vector3, minDist: number, maxAttempts: number = 96): THREE.Vector3 {
    if (!this.isOverlappingPosition(desired, minDist)) return desired.clone();
    const golden = 2.399963229728653; // golden-angle
    for (let i = 1; i <= maxAttempts; i++) {
      const r = minDist * (0.8 + Math.sqrt(i) * 0.6);
      const a = i * golden;
      const x = desired.x + Math.cos(a) * r;
      const z = desired.z + Math.sin(a) * r;
      const cand = new THREE.Vector3(x, desired.y, z);
      if (!this.isOverlappingPosition(cand, minDist)) return cand;
    }
    // Fallback: return original desired if no space found
    return desired.clone();
  }

  // Remove and dispose instanced link meshes
  private clearLinks(): void {
    // Dispose instanced links if present
    if (this.linkCoreInst) {
      this.linkGroup.remove(this.linkCoreInst);
      this.linkCoreInst.geometry.dispose();
      (this.linkCoreInst.material as THREE.Material).dispose();
      this.linkCoreInst.dispose();
      this.linkCoreInst = undefined;
    }
    if (this.linkHaloInst) {
      this.linkGroup.remove(this.linkHaloInst);
      this.linkHaloInst.geometry.dispose();
      (this.linkHaloInst.material as THREE.Material).dispose();
      this.linkHaloInst.dispose();
      this.linkHaloInst = undefined;
    }

    // Also dispose any fallback link tubes previously added to linkGroup
    // Traverse and dispose geometries/materials for all children
    this.linkGroup.children.slice().forEach(child => {
      this.linkGroup.remove(child);
      child.traverse((obj: any) => {
        if (obj.isMesh || obj.isLine) {
          obj.geometry?.dispose?.();
          if (Array.isArray(obj.material)) obj.material.forEach((m: any) => { m.map?.dispose?.(); m.dispose?.(); });
          else obj.material?.map?.dispose?.(), obj.material?.dispose?.();
        } else if (obj.isSprite) {
          obj.material?.map?.dispose?.();
          obj.material?.dispose?.();
        }
      });
    });
    // No instanced link counters to reset
  }

  // Removed instanced link capacity handling (using simple tube segments instead)

  // Removed per-instance link builder path in favor of simpler orthogonal tubes
  
  // Check if a directory should be excluded from visualization
  private isExcludedDirectory(name: string): boolean {
    const excludedPatterns = [
      'base_code_template',
      '__pycache__',
      '.git',
      'node_modules',
      '.venv',
      'venv',
      '.idea',
      '.vscode',
      '.internal'
    ];
    
    return excludedPatterns.some(pattern => name.includes(pattern));
  }
  
  // Create a directory tower with sub-towers for children
  private createDirectoryTower(
    directory: FilesystemNode,
    position: THREE.Vector3,
    showSubDirectories: boolean,
    depth: number = 0
  ): THREE.Group {
    // Skip excluded directories
    if (this.isExcludedDirectory(directory.name)) {
      return new THREE.Group(); // Return empty group for filtered directories
    }
    
    const colors = this.getDirectoryColors(directory.name, depth);
    const activityMultiplier = directory.activity_level ? 1 + directory.activity_level * 0.5 : 1;
    const scaleFactor = Math.max(0.3, 1 - depth * 0.1); // Scale down very gradually with depth
    
    // Calculate height based on direct children count
    const directChildCount = directory.children ? directory.children.length : 0;
    const baseHeight = 8; // Minimum height
    const heightPerChild = 1.5; // Additional height per child
    const calculatedHeight = baseHeight + (directChildCount * heightPerChild);
    
    // Use calculated height instead of predefined height
    const height = calculatedHeight * activityMultiplier * scaleFactor;
    
    // Compute a minimum clearance based on tower scale and depth
    const minClear = (depth === 0) ? 14 : Math.max(7, 8 - Math.min(depth, 5) + height * 0.02);
    // Adjust desired position to avoid overlaps
    const adjustedPos = this.findNonOverlappingPosition(position, minClear);
    // Create main tower at the adjusted position
    const mainTower = depth === 0 
      ? this.createTower(directory.name, adjustedPos, height, colors.primary, colors.emissive)
      : this.createSubTower(directory.name, adjustedPos, height, colors.primary, colors.emissive);
    // Register occupancy for collision avoidance
    this.registerOccupied(adjustedPos);
    
    // Store this tower's position with its full path
    const pathKey = directory.path || directory.name;
    this.towers.set(pathKey, mainTower);
    this.towerPositions.set(pathKey, adjustedPos.clone());
    this.towerHeights.set(pathKey, height);
    
    // Also store with simplified paths for easier matching
    const simplifiedPaths = [
      directory.name,
      pathKey.replace('subspace/', ''),
      pathKey.replace(/^\//, ''),
      pathKey.split('/').slice(-2).join('/'),
      pathKey.split('/').slice(-3).join('/')
    ];
    simplifiedPaths.forEach(p => {
      if (p && !this.towerPositions.has(p)) {
        this.towerPositions.set(p, adjustedPos.clone());
      }
      if (p && !this.towerHeights.has(p)) {
        this.towerHeights.set(p, height);
      }
    });
    // No special '-home' aliases; personal folders are under 'personal/<cyber>'
    
    // Create sub-towers for children if enabled
    if (showSubDirectories && directory.children) {
      // Filter out excluded directories
      const childDirectories = directory.children.filter(c => 
        c.type === 'directory' && 
        !this.isExcludedDirectory(c.name)
      );
      const subPositions = this.calculateSubDirectoryPositions(adjustedPos, childDirectories.length, depth, childDirectories);
      
      let subIndex = 0;
      directory.children.forEach((child) => {
        if (child.type === 'directory' && 
            !this.isExcludedDirectory(child.name)) {
          // Recursively create tower for subdirectory
          const subTower = this.createDirectoryTower(child, subPositions[subIndex], true, depth + 1);
          // Only connect if tower was actually created (not filtered)
          if (subTower.children.length > 0) {
            // Determine child height and actual position after adjustment
            const childKey = child.path || child.name;
            const childHeight = this.getTowerHeight(childKey) ?? 5;
            const childPos = this.getTowerPosition(childKey) || subTower.position.clone();
            // Connect sub-tower to main tower with a line (top-to-top)
            this.createConnectionLine(adjustedPos, childPos, height, colors.primary, childHeight);
          }
          
          subIndex++;
        }
      });
      
      // Create file markers for files in this directory
      if (directory.children) {
        this.createFilesForDirectory(directory, adjustedPos);
      }
    }
    
    return mainTower;
  }
  
  // Calculate positions for sub-directories around their parent
  private calculateSubDirectoryPositions(
    parentPosition: THREE.Vector3,
    childCount: number,
    depth: number = 0,
    children?: FilesystemNode[]
  ): THREE.Vector3[] {
    const positions: THREE.Vector3[] = [];

    if (childCount <= 0) return positions;

    // Estimate footprint radius for each child based on subtree complexity
    const radii: number[] = [];
    let maxR = 0;
    for (let i = 0; i < childCount; i++) {
      const child = children && children[i] ? children[i] : undefined;
      const complexity = child ? this.calculateDirectoryComplexity(child) : 1;
      // Base footprint grows with depth and complexity
      const r = (8 + depth * 4) + complexity * 3; // tweakable constants
      radii.push(r);
      if (r > maxR) maxR = r;
    }

    // Cell size adapts to the largest subtree at this level
    const scale = Math.max(0.7, 1 - depth * 0.06);
    const street = this.CITY_STREET * scale;
    const cell = Math.max(this.CITY_CELL_SIZE * scale, 2 * maxR + street);

    // Arrange children in a near-square grid (uniform cell sized by maxR)
    const cols = Math.ceil(Math.sqrt(childCount));
    const rows = Math.ceil(childCount / cols);
    const width = cols * cell + (cols - 1) * street;
    const height = rows * cell + (rows - 1) * street;
    const originX = parentPosition.x - width / 2 + cell / 2;
    const originZ = parentPosition.z - height / 2 + cell / 2;

    for (let i = 0; i < childCount; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const x = originX + col * (cell + street);
      const z = originZ + row * (cell + street);
      positions.push(new THREE.Vector3(x, 0, z));
    }

    return positions;
  }
  
  // Calculate complexity (max depth + children count) of a directory tree
  private calculateDirectoryComplexity(node: FilesystemNode): number {
    if (!node.children || node.children.length === 0) {
      return 1;
    }
    
    // Filter out excluded directories
    const childDirectories = node.children.filter(c => 
      c.type === 'directory' && 
      !this.isExcludedDirectory(c.name)
    );
    if (childDirectories.length === 0) {
      return 1;
    }
    
    const maxChildDepth = Math.max(...childDirectories.map(child => this.calculateDirectoryComplexity(child)));
    return 1 + maxChildDepth + (childDirectories.length * 0.2); // Add bonus for having many children
  }
  
  // Get color scheme based on directory depth and type
  private getDirectoryColors(directoryName: string, depth: number = 0): { primary: number; height: number; emissive: number } {
    // Create a depth-based color scheme that maintains visibility
    const depthColors = [
      { primary: 0x00ffff, emissive: 0x003333 }, // Depth 0 - Bright cyan
      { primary: 0x00ddff, emissive: 0x002244 }, // Depth 1 - Light blue
      { primary: 0x66aaff, emissive: 0x112244 }, // Depth 2 - Sky blue
      { primary: 0x8899ff, emissive: 0x222244 }, // Depth 3 - Lavender blue
      { primary: 0xaa88ff, emissive: 0x332244 }, // Depth 4 - Purple blue
      { primary: 0xcc77ff, emissive: 0x442244 }, // Depth 5+ - Violet
    ];
    
    // Special cases for specific directories
    if (directoryName.endsWith('-home')) {
      return { primary: 0xff8800, height: 18, emissive: 0x332200 };
    }
    
    // Special colors for known directory types at root level
    if (depth === 0) {
      const specialColors: { [key: string]: { primary: number; emissive: number } } = {
        'grid': { primary: 0x00ffff, emissive: 0x003333 },
        'community': { primary: 0x00ff88, emissive: 0x003322 },
        'library': { primary: 0x00aaff, emissive: 0x002244 },
        'workshop': { primary: 0x44ffcc, emissive: 0x114433 },
      };
      
      if (specialColors[directoryName]) {
        return { ...specialColors[directoryName], height: 25 };
      }
    }
    
    // Use depth-based coloring
    const colorIndex = Math.min(depth, depthColors.length - 1);
    return { 
      ...depthColors[colorIndex], 
      height: 15 // This will be overridden by child-count-based height
    };
  }
  
  // Create a smaller cyber home tower
  private createCyberHomeTower(
    cyberHome: FilesystemNode,
    position: THREE.Vector3,
    displayName: string
  ): THREE.Group {
    const colors = this.directoryColors['cyber_home'];
    const activityMultiplier = cyberHome.activity_level ? 1 + cyberHome.activity_level * 0.3 : 1;
    const height = colors.height * activityMultiplier;
    
    const group = new THREE.Group();
    
    // Small tower structure (solid with flat shading)
    const towerMaterial = new THREE.MeshPhongMaterial({
      color: colors.primary,
      emissive: 0x000000,
      emissiveIntensity: 0.0,
      flatShading: true
    });
    
    const tower = new THREE.Mesh(this.subTowerGeometry, towerMaterial);
    tower.scale.y = height;
    tower.position.y = height / 2;
    group.add(tower);
    
    // Removed wireframe overlay for solid look
    
    // Glowing top
    const topGeometry = new THREE.BoxGeometry(2.2, 0.3, 2.2);
    const topMaterial = new THREE.MeshBasicMaterial({
      color: colors.primary,
      transparent: true,
      opacity: 0.8
    });
    const top = new THREE.Mesh(topGeometry, topMaterial);
    top.name = 'top-glow';
    top.position.y = height;
    group.add(top);
    
    // Label with cleaned name
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 32;
    const context = canvas.getContext('2d')!;
    context.fillStyle = `rgba(${(colors.primary >> 16) & 255}, ${(colors.primary >> 8) & 255}, ${colors.primary & 255}, 0.8)`;
    context.font = '14px Courier New';
    context.textAlign = 'center';
    context.fillText(displayName, 64, 22);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ 
      map: texture,
      transparent: true
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(6, 1.5, 1);
    sprite.position.y = height + 3;
    group.add(sprite);
    
    // Adjust position to avoid overlap with existing towers
    const adjustedPos = this.findNonOverlappingPosition(position, 8);
    // Position the tower
    group.position.copy(adjustedPos);
    
    // Add to scene and store reference and position
    this.rootGroup.add(group);
    this.towers.set(cyberHome.name, group);
    this.towerPositions.set(cyberHome.path, adjustedPos.clone());
    this.towerPositions.set(cyberHome.name, adjustedPos.clone()); // Also store by name
    this.towerHeights.set(cyberHome.path, height);
    this.towerHeights.set(cyberHome.name, height);
    // Register occupancy
    this.registerOccupied(adjustedPos);
    
    return group;
  }
  
  // Create connection lines between parent and child directories
  private createConnectionLine(
    parentPos: THREE.Vector3,
    childPos: THREE.Vector3,
    parentHeight: number,
    color: number,
    childHeight?: number
  ): void {
    // Straight line tube from parent top to child top (clean look)
    const start = new THREE.Vector3(parentPos.x, parentHeight, parentPos.z);
    const endY = typeof childHeight === 'number' ? childHeight : 5;
    const end = new THREE.Vector3(childPos.x, endY, childPos.z);
    this.createConnectionTube(start, end, color);
  }

  // Fallback: create a single glowy tube (core + halo) between two points
  private createConnectionTube(start: THREE.Vector3, end: THREE.Vector3, color: number): void {
    const dir = new THREE.Vector3().subVectors(end, start);
    const length = dir.length();
    if (length < 0.0001) return;
    const group = new THREE.Group();
    const coreRadius = 0.24;
    const coreGeom = new THREE.CylinderGeometry(coreRadius, coreRadius, 1, 4, 1, true);
    const coreMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide
    });
    const core = new THREE.Mesh(coreGeom, coreMat);
    const haloRadius = coreRadius * 1.35;
    const haloGeom = new THREE.CylinderGeometry(haloRadius, haloRadius, 1, 4, 1, true);
    const haloMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const halo = new THREE.Mesh(haloGeom, haloMat);
    group.add(core);
    group.add(halo);
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    group.position.copy(mid);
    const yAxis = new THREE.Vector3(0, 1, 0);
    group.quaternion.setFromUnitVectors(yAxis, dir.clone().normalize());
    group.scale.set(1, length, 1);
    this.linkGroup.add(group);
  }

  // Create a main directory tower
  private createTower(
    name: string,
    position: THREE.Vector3,
    height: number,
    color: number,
    _emissiveColor?: number
  ): THREE.Group {
    const group = new THREE.Group();
    
    // Main tower structure with robust diffuse lighting (Lambert) and fog disabled
    const towerMaterial = new THREE.MeshLambertMaterial({
      color: color,
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.08,
      side: THREE.DoubleSide
    });
    towerMaterial.fog = false;
    towerMaterial.transparent = false;
    towerMaterial.depthWrite = true;
    towerMaterial.depthTest = true;
    towerMaterial.alphaTest = 0.0;
    (towerMaterial as any).colorWrite = true;
    towerMaterial.blending = THREE.NormalBlending;
    
    // Use per-instance geometry sized to final height to avoid any shared-geometry disposal issues
    const towerGeom = new THREE.BoxGeometry(4, height, 4);
    const tower = new THREE.Mesh(towerGeom, towerMaterial);
    tower.position.y = height / 2;
    group.add(tower);

    // Subtle outline to ensure visibility in all lighting/fog angles
    const edgeGeom = new THREE.EdgesGeometry(towerGeom);
    const edgeMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 });
    // Occlude edges behind faces; avoid z-fighting via slight scale and render ordering
    edgeMat.depthTest = true;
    edgeMat.depthWrite = false;
    const edgeLines = new THREE.LineSegments(edgeGeom, edgeMat);
    edgeLines.position.y = height / 2;
    edgeLines.renderOrder = (tower.renderOrder || 0) + 1;
    edgeLines.scale.set(1.002, 1.002, 1.002);
    group.add(edgeLines);
    
    // Removed wireframe overlay for solid look
    
    // Glowing top
    const topGeometry = new THREE.BoxGeometry(4.5, 0.5, 4.5);
    const topMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    });
    const top = new THREE.Mesh(topGeometry, topMaterial);
    top.name = 'top-glow';
    top.position.y = height;
    group.add(top);
    
    // Label
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.fillStyle = `rgba(${(color >> 16) & 255}, ${(color >> 8) & 255}, ${color & 255}, 0.9)`;
    context.font = '20px Courier New';
    context.textAlign = 'center';
    context.fillText('/' + name, 128, 40);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ 
      map: texture,
      transparent: true
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(10, 2.5, 1);
    sprite.position.y = height + 5;
    group.add(sprite);
    
    // Position the tower
    group.position.copy(position);
    
    // Add to scene and store reference and position
    this.rootGroup.add(group);
    this.towers.set(name, group);
    this.towerPositions.set(name, position);
    this.towerHeights.set(name, height);
    
    return group;
  }
  
  // Create a smaller sub-directory tower
  private createSubTower(
    name: string,
    position: THREE.Vector3,
    height: number,
    color: number,
    _emissiveColor?: number
  ): THREE.Group {
    const group = new THREE.Group();
    
    // Sub-tower structure with robust diffuse lighting (Lambert) and fog disabled
    const towerMaterial = new THREE.MeshLambertMaterial({
      color: color,
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.07,
      side: THREE.DoubleSide
    });
    towerMaterial.fog = false;
    towerMaterial.transparent = false;
    towerMaterial.depthWrite = true;
    towerMaterial.depthTest = true;
    towerMaterial.alphaTest = 0.0;
    (towerMaterial as any).colorWrite = true;
    towerMaterial.blending = THREE.NormalBlending;
    
    // Use per-instance geometry sized to final height to avoid any shared-geometry disposal issues
    const towerGeom = new THREE.BoxGeometry(2, height, 2);
    const tower = new THREE.Mesh(towerGeom, towerMaterial);
    tower.position.y = height / 2;
    group.add(tower);

    // Subtle outline to ensure visibility in all lighting/fog angles
    const edgeGeom = new THREE.EdgesGeometry(towerGeom);
    const edgeMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.3 });
    edgeMat.depthTest = true;
    edgeMat.depthWrite = false;
    const edgeLines = new THREE.LineSegments(edgeGeom, edgeMat);
    edgeLines.position.y = height / 2;
    edgeLines.renderOrder = (tower.renderOrder || 0) + 1;
    edgeLines.scale.set(1.002, 1.002, 1.002);
    group.add(edgeLines);
    
    // Removed wireframe overlay for solid look
    
    // Smaller glowing top
    const topGeometry = new THREE.BoxGeometry(2.2, 0.3, 2.2);
    const topMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.8,
      depthWrite: false
    });
    const top = new THREE.Mesh(topGeometry, topMaterial);
    top.name = 'top-glow';
    top.position.y = height;
    group.add(top);
    
    // Smaller label
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 32;
    const context = canvas.getContext('2d')!;
    context.fillStyle = `rgba(${(color >> 16) & 255}, ${(color >> 8) & 255}, ${color & 255}, 0.8)`;
    context.font = '14px Courier New';
    context.textAlign = 'center';
    context.fillText(name, 64, 22);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ 
      map: texture,
      transparent: true
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(6, 1.5, 1);
    sprite.position.y = height + 3;
    group.add(sprite);
    
    // Position the tower
    group.position.copy(position);
    
    // Add to scene
    this.rootGroup.add(group);
    
    return group;
  }

  // Get stored height for a given tower key/path using the same relaxed matching as getTowerPosition
  getTowerHeight(path: string): number | null {
    // Normalize separators and strip Windows drive letters
    path = path.replace(/\\/g, '/').replace(/^([A-Za-z]:)/, '');
    let h = this.towerHeights.get(path);
    if (typeof h !== 'number') {
      const ci = this.ciGet(this.towerHeights, path);
      if (typeof ci === 'number') return ci;
    }
    if (typeof h === 'number') return h;
    const pathParts = path.split('/').filter(p => p.length > 0);
    // Special handling: map personal/<user>/... to <user>-home/...
    const personalUser = pathParts[0] === 'personal' && pathParts.length >= 2 ? pathParts[1] : null;
    const personalCandidates: string[] = [];
    if (personalUser) {
      const rest = pathParts.slice(2).join('/');
      const root = `personal/${personalUser}`;
      personalCandidates.push(root);
      if (rest) personalCandidates.push(`${root}/${rest}`);
      // Also try just the username alias
      personalCandidates.push(personalUser);
      if (rest) personalCandidates.push(`${personalUser}/${rest}`);
    }
    const possible = [
      pathParts.join('/'),
      pathParts.length > 3 ? pathParts.slice(0, 4).join('/') : null,
      pathParts.length > 2 ? pathParts.slice(0, 3).join('/') : null,
      pathParts.length > 1 ? pathParts.slice(0, 2).join('/') : null,
      pathParts.slice(-2).join('/'),
      pathParts[pathParts.length - 1],
      pathParts[0],
      ...personalCandidates
    ].filter(Boolean) as string[];
    for (const key of possible) {
      h = this.towerHeights.get(key);
      if (typeof h === 'number') return h;
      const ci = this.ciGet(this.towerHeights, key);
      if (typeof ci === 'number') return ci;
    }
    return null;
  }

  // Convenience: get the top world position for a tower path
  getTowerTopPosition(path: string): THREE.Vector3 | null {
    const pos = this.getTowerPosition(path);
    if (!pos) return null;
    const h = this.getTowerHeight(path) ?? 5;
    return new THREE.Vector3(pos.x, h, pos.z);
  }

  // Pulse a tower to show activity (improved path handling)
  pulseDirectory(path: string) {
    // Try to find the tower by various path patterns
    const pathParts = path.split('/').filter(p => p.length > 0);
    const possibleNames = [
      pathParts[pathParts.length - 1], // Last directory
      pathParts.join('/'), // Full relative path
      pathParts.slice(-2).join('/'), // Last two parts
      pathParts[0] // First directory
    ];
    
    let tower: THREE.Group | undefined;
    let foundName: string = '';
    
    for (const name of possibleNames) {
      tower = this.towers.get(name);
      if (tower) {
        foundName = name;
        break;
      }
    }
    
    if (tower) {
      console.log(`Pulsing tower: ${foundName} for path: ${path}`);
      const top = tower.children.find((child: any) => child.isMesh && child.name === 'top-glow') as THREE.Mesh | undefined;
      if (top) {
        const mat = top.material as THREE.MeshBasicMaterial;
        const startOpacity = mat.opacity;
        const targetOpacity = Math.max(0.8, Math.min(1.0, startOpacity + 0.6));
        const duration = 800;
        const startTime = Date.now();
        const animate = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / duration, 1);
          if (progress < 0.5) mat.opacity = startOpacity + (targetOpacity - startOpacity) * (progress * 2);
          else mat.opacity = targetOpacity - (targetOpacity - startOpacity) * ((progress - 0.5) * 2);
          mat.needsUpdate = true;
          if (progress < 1) requestAnimationFrame(animate);
          else mat.opacity = startOpacity;
        };
        animate();
      }
    } else {
      console.log(`No tower found for path: ${path}, tried: ${possibleNames.join(', ')}`);
    }
  }
  
  // Update directory activity level
  updateDirectoryActivity(path: string, activityLevel: number) {
    const pathParts = path.split('/').filter(p => p.length > 0);
    const name = pathParts[pathParts.length - 1];
    
    if (this.filesystemStructure && name) {
      // Update activity in the grid structure
      if (this.filesystemStructure.grid) {
        this.updateNodeActivity(this.filesystemStructure.grid, path, activityLevel);
      }
      
      // Update activity in cyber homes
      this.filesystemStructure.cyber_homes?.forEach(cyberHome => {
        this.updateNodeActivity(cyberHome, path, activityLevel);
      });
      
      // Pulse the corresponding tower
      this.pulseDirectory(path);
    }
  }
  
  // Helper to update activity in directory tree
  private updateNodeActivity(node: FilesystemNode, targetPath: string, activityLevel: number): void {
    if (node.path === targetPath) {
      node.activity_level = activityLevel;
      return;
    }
    
    if (node.children) {
      node.children.forEach(child => {
        this.updateNodeActivity(child, targetPath, activityLevel);
      });
    }
  }

  setVisible(visible: boolean) {
    this.rootGroup.visible = visible;
  }
  
  // Get current filesystem structure (for external access)
  getFilesystemStructure(): FilesystemStructure | null {
    return this.filesystemStructure;
  }
  
  // Force refresh of filesystem structure
  async refresh(): Promise<void> {
    await this.fetchFilesystemStructure();
  }
  
  // Clean up resources
  dispose(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.clearTowers();
  }

  update() {
    this.time += 0.01;
    
    // Animate towers
    this.towers.forEach((tower, name) => {
      // Special animation for NOT CONNECTED indicator
      if (name === 'not-connected') {
        // Pulse the opacity and scale
        const sprite = tower.children.find(child => child instanceof THREE.Sprite) as THREE.Sprite;
        if (sprite) {
          const pulse = Math.sin(this.time * 2) * 0.2 + 0.8;
          sprite.material.opacity = pulse;
        }
        
        const wireframe = tower.children[0] as THREE.Mesh;
        if (wireframe) {
          (wireframe.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(this.time * 2) * 0.2;
          wireframe.rotation.y += 0.005;
        }
      } else {
        // Normal tower animations: pulse the top glow opacity
        const top = tower.children.find((child: any) => child.isMesh && child.name === 'top-glow') as THREE.Mesh | undefined;
        if (top && (top.material as any)) {
          const mat = top.material as THREE.MeshBasicMaterial;
          const base = 0.55;
          const amp = 0.25;
          mat.opacity = Math.max(0.2, Math.min(1.0, base + Math.sin(this.time * 0.6 + tower.position.x * 0.07) * amp));
          mat.needsUpdate = true;
        }
      }
    });
  }

  // Add a connection line between a tower and an agent position
  showAccess(towerName: string, agentPosition: THREE.Vector3) {
    const tower = this.towers.get(towerName);
    if (!tower) return;
    
    // Create a temporary line showing file access
    const startY = this.getTowerHeight(towerName) ?? 5;
    const points = [
      new THREE.Vector3(tower.position.x, startY, tower.position.z),
      new THREE.Vector3(agentPosition.x, agentPosition.y, agentPosition.z)
    ];
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    });
    
    const line = new THREE.Line(geometry, material);
    this.linkGroup.add(line);
    
    // Fade out and remove
    const fadeOut = () => {
      material.opacity -= 0.02;
      if (material.opacity > 0) {
        requestAnimationFrame(fadeOut);
      } else {
        this.linkGroup.remove(line);
        geometry.dispose();
        material.dispose();
      }
    };
    
    setTimeout(fadeOut, 100);
  }
  
  // Get tower position for a given path - used by AgentManager
  getTowerPosition(path: string): THREE.Vector3 | null {
    // Normalize separators and strip Windows drive letters
    path = path.replace(/\\/g, '/').replace(/^([A-Za-z]:)/, '');
    // Try to find position by path
    let position = this.towerPositions.get(path);
    if (position) {
      return position.clone();
    }
    const ciExact = this.ciGet(this.towerPositions, path);
    if (ciExact) return (ciExact as THREE.Vector3).clone();
    
    // Try various path patterns, from most specific to least specific
    const pathParts = path.split('/').filter(p => p.length > 0);
    // Special handling: map personal/<user>/... to <user>-home/...
    const personalUser = pathParts[0] === 'personal' && pathParts.length >= 2 ? pathParts[1] : null;
    const personalCandidates: string[] = [];
    if (personalUser) {
      const rest = pathParts.slice(2).join('/');
      const root = `personal/${personalUser}`;
      personalCandidates.push(root);
      if (rest) personalCandidates.push(`${root}/${rest}`);
      // Also try just the username alias
      personalCandidates.push(personalUser);
      if (rest) personalCandidates.push(`${personalUser}/${rest}`);
    }
    const tail = pathParts[pathParts.length - 1] || '';
    const possiblePaths = [
      pathParts.join('/'), // Full relative path (most specific)
      // Try intermediate paths for deeply nested locations
      pathParts.length > 3 ? pathParts.slice(0, 4).join('/') : null,
      pathParts.length > 2 ? pathParts.slice(0, 3).join('/') : null,
      pathParts.length > 1 ? pathParts.slice(0, 2).join('/') : null,
      pathParts.slice(-2).join('/'), // Last two parts
      tail, // Last directory alone
      pathParts[0], // First directory (least specific - fallback)
      ...personalCandidates
    ].filter(p => p !== null);
    
    for (const possiblePath of possiblePaths) {
      position = this.towerPositions.get(possiblePath);
      if (position) {
        // Found position - return without logging (too spammy)
        return position.clone();
      }
      const ci = this.ciGet(this.towerPositions, possiblePath);
      if (ci) return (ci as THREE.Vector3).clone();
    }
    
    // Only log if not found (for debugging)
    // console.log(`No tower position found for path: ${path}`);
    return null;
  }
  
  // Highlight a tower - used by AgentManager when agent is at location
  highlightTower(path: string) {
    // Try to find the tower
    let tower = this.towers.get(path);
    
    if (!tower) {
      // Try various path patterns
      const pathParts = path.split('/').filter(p => p.length > 0);
      const possiblePaths = [
        pathParts[pathParts.length - 1], // Last directory
        pathParts.join('/'), // Full relative path
        pathParts.slice(-2).join('/'), // Last two parts
        pathParts[0] // First directory
      ];
      
      for (const possiblePath of possiblePaths) {
        tower = this.towers.get(possiblePath);
        if (tower) {
          console.log(`Found tower for path ${path} using pattern: ${possiblePath}`);
          break;
        }
      }
    }
    
    if (tower) {
      // Pulse the light to show highlighting
      const top = tower.children.find((child: any) => child.isMesh && child.name === 'top-glow') as THREE.Mesh | undefined;
      if (top) {
        const mat = top.material as THREE.MeshBasicMaterial;
        const originalOpacity = mat.opacity;
        const targetOpacity = Math.min(1.0, originalOpacity + 0.5);
        const duration = 1000;
        const startTime = Date.now();
        const animate = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / duration, 1);
          if (progress < 0.5) mat.opacity = originalOpacity + (targetOpacity - originalOpacity) * (progress * 2);
          else mat.opacity = targetOpacity - (targetOpacity - originalOpacity) * ((progress - 0.5) * 2);
          mat.needsUpdate = true;
          if (progress < 1) requestAnimationFrame(animate);
          else mat.opacity = originalOpacity;
        };
        animate();
      }
    } else {
      console.log(`No tower found to highlight for path: ${path}`);
    }
  }
  
  // Create file markers for files in a directory
  private createFilesForDirectory(directory: FilesystemNode, basePosition: THREE.Vector3) {
    if (!directory.children) return;
    
    const files = directory.children.filter(child => child.type === 'file');
    if (files.length === 0) return;
    
    // Position files in a small circle around the directory tower
    const radius = 3;
    files.forEach((file, index) => {
      const angle = (index / files.length) * Math.PI * 2;
      const filePosition = new THREE.Vector3(
        basePosition.x + Math.cos(angle) * radius,
        basePosition.y + 2,
        basePosition.z + Math.sin(angle) * radius
      );
      
      this.createFileMarker(file, filePosition);
    });
  }
  
  // Create a small marker for a file
  private createFileMarker(file: FilesystemNode, position: THREE.Vector3) {
    const group = new THREE.Group();
    
    // File colors based on extension or type
    let color = 0x888888; // Default gray
    if (file.name.endsWith('.json')) color = 0xffaa00;
    else if (file.name.endsWith('.py')) color = 0x3776ab;
    else if (file.name.endsWith('.js') || file.name.endsWith('.ts')) color = 0xf7df1e;
    else if (file.name.endsWith('.md')) color = 0x4285f4;
    else if (file.name.endsWith('.txt')) color = 0xcccccc;
    
    // Small sphere for the file
    const fileMaterial = new THREE.MeshPhongMaterial({
      color: color,
      transparent: true,
      opacity: 0.7,
      emissive: color,
      emissiveIntensity: 0.1
    });
    
    const fileMesh = new THREE.Mesh(this.fileGeometry, fileMaterial);
    group.add(fileMesh);
    
    // Small light
    // Removed point light to keep scene light count low and shaders valid on WebGL1/embedded renderers
    
    // Position the file marker
    group.position.copy(position);
    
    // Add to scene
    this.rootGroup.add(group);
    
    // Store reference
    this.towers.set(file.path, group);
    this.towerPositions.set(file.path, position);
  }

  // Case-insensitive map lookup helper
  private ciGet<V>(map: Map<string, V>, key: string): V | undefined {
    const target = key.toLowerCase();
    for (const [k, v] of map) {
      if (k.toLowerCase() === target) return v;
    }
    return undefined;
  }
}
