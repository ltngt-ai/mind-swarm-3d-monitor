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
  private updateInterval: NodeJS.Timeout | null = null;
  private apiUrl: string = config.apiUrl;
  
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
    
    // Base geometries for towers and files
    this.towerGeometry = new THREE.BoxGeometry(4, 1, 4);
    this.subTowerGeometry = new THREE.BoxGeometry(2, 1, 2);
    this.fileGeometry = new THREE.SphereGeometry(0.5, 8, 6);
    
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
    
    // Create cyber home directories if they exist
    if (this.filesystemStructure.cyber_homes && this.filesystemStructure.cyber_homes.length > 0) {
      const cyberPositions = this.calculateCyberHomePositions(this.filesystemStructure.cyber_homes.length);
      this.filesystemStructure.cyber_homes.forEach((cyberHome, index) => {
        // Use the directory name for small towers
        const towerName = cyberHome.name.replace('-home', ''); // Clean up display name
        this.createCyberHomeTower(cyberHome, cyberPositions[index], towerName);
      });
    }
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
        if (child instanceof THREE.Mesh) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(mat => mat.dispose());
            } else {
              child.material.dispose();
            }
          }
        }
      });
    });
    this.towers.clear();
    this.towerPositions.clear();
  }
  
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
      '.vscode'
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
    
    // Create main tower
    const mainTower = depth === 0 
      ? this.createTower(directory.name, position, height, colors.primary, colors.emissive)
      : this.createSubTower(directory.name, position, height, colors.primary, colors.emissive);
    
    // Store this tower's position with its full path
    const pathKey = directory.path || directory.name;
    this.towers.set(pathKey, mainTower);
    this.towerPositions.set(pathKey, position.clone());
    
    // Also store with simplified paths for easier matching
    const simplifiedPaths = [
      directory.name,
      pathKey.replace('subspace/', ''),
      pathKey.split('/').slice(-2).join('/'),
      pathKey.split('/').slice(-3).join('/')
    ];
    simplifiedPaths.forEach(p => {
      if (p && !this.towerPositions.has(p)) {
        this.towerPositions.set(p, position.clone());
      }
    });
    
    // Create sub-towers for children if enabled
    if (showSubDirectories && directory.children) {
      // Filter out excluded directories
      const childDirectories = directory.children.filter(c => 
        c.type === 'directory' && 
        !this.isExcludedDirectory(c.name)
      );
      const subPositions = this.calculateSubDirectoryPositions(position, childDirectories.length, depth, childDirectories);
      
      let subIndex = 0;
      directory.children.forEach((child) => {
        if (child.type === 'directory' && 
            !this.isExcludedDirectory(child.name)) {
          // Recursively create tower for subdirectory
          const subTower = this.createDirectoryTower(child, subPositions[subIndex], true, depth + 1);
          
          // Only connect if tower was actually created (not filtered)
          if (subTower.children.length > 0) {
            // Connect sub-tower to main tower with a line (from top of parent tower)
            this.createConnectionLine(position, subPositions[subIndex], height, colors.primary);
          }
          
          subIndex++;
        }
      });
      
      // Create file markers for files in this directory
      if (directory.children) {
        this.createFilesForDirectory(directory, position);
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
    
    // Calculate radius based on the complexity of children
    let maxChildComplexity = 1;
    if (children) {
      maxChildComplexity = Math.max(...children.map(child => this.calculateDirectoryComplexity(child)));
    }
    
    // Base radius that grows with depth to avoid collision, plus extra space for complex children
    const baseRadius = Math.max(15, 20 + depth * 5);
    const complexityBonus = Math.max(0, (maxChildComplexity - 1) * 8);
    const radius = baseRadius + complexityBonus;
    
    for (let i = 0; i < childCount; i++) {
      const angle = (i / childCount) * Math.PI * 2;
      const x = parentPosition.x + Math.cos(angle) * radius;
      const z = parentPosition.z + Math.sin(angle) * radius;
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
    
    // Small tower structure
    const towerMaterial = new THREE.MeshPhongMaterial({
      color: colors.primary,
      emissive: colors.emissive,
      emissiveIntensity: 0.15,
      transparent: true,
      opacity: 0.7
    });
    
    const tower = new THREE.Mesh(this.subTowerGeometry, towerMaterial);
    tower.scale.y = height;
    tower.position.y = height / 2;
    group.add(tower);
    
    // Wireframe overlay
    const wireframeMaterial = new THREE.MeshBasicMaterial({
      color: colors.primary,
      wireframe: true,
      transparent: true,
      opacity: 0.4
    });
    const wireframe = new THREE.Mesh(this.subTowerGeometry, wireframeMaterial);
    wireframe.scale.y = height;
    wireframe.scale.x = 1.02;
    wireframe.scale.z = 1.02;
    wireframe.position.y = height / 2;
    group.add(wireframe);
    
    // Glowing top
    const topGeometry = new THREE.BoxGeometry(2.2, 0.3, 2.2);
    const topMaterial = new THREE.MeshBasicMaterial({
      color: colors.primary,
      transparent: true,
      opacity: 0.8
    });
    const top = new THREE.Mesh(topGeometry, topMaterial);
    top.position.y = height;
    group.add(top);
    
    // Point light
    const light = new THREE.PointLight(colors.primary, 0.3, height * 1.5);
    light.position.y = height + 1;
    group.add(light);
    
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
    
    // Position the tower
    group.position.copy(position);
    
    // Add to scene and store reference and position
    this.rootGroup.add(group);
    this.towers.set(cyberHome.name, group);
    this.towerPositions.set(cyberHome.path, position);
    this.towerPositions.set(cyberHome.name, position); // Also store by name
    
    return group;
  }
  
  // Create connection lines between parent and child directories
  private createConnectionLine(
    parentPos: THREE.Vector3,
    childPos: THREE.Vector3,
    parentHeight: number,
    color: number
  ): void {
    const points = [
      new THREE.Vector3(parentPos.x, parentHeight, parentPos.z), // Start from top of parent tower
      new THREE.Vector3(childPos.x, 5, childPos.z) // End at base-ish of child tower
    ];
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.5, // Increased opacity for better visibility
      blending: THREE.AdditiveBlending,
      linewidth: 2 // Attempt to make lines thicker (note: may not work in WebGL)
    });
    
    const line = new THREE.Line(geometry, material);
    this.rootGroup.add(line);
  }

  // Create a main directory tower
  private createTower(
    name: string,
    position: THREE.Vector3,
    height: number,
    color: number,
    emissiveColor?: number
  ): THREE.Group {
    const group = new THREE.Group();
    
    // Main tower structure
    const towerMaterial = new THREE.MeshPhongMaterial({
      color: color,
      emissive: emissiveColor || color,
      emissiveIntensity: 0.2,
      transparent: true,
      opacity: 0.8
    });
    
    const tower = new THREE.Mesh(this.towerGeometry, towerMaterial);
    tower.scale.y = height;
    tower.position.y = height / 2;
    group.add(tower);
    
    // Wireframe overlay
    const wireframeMaterial = new THREE.MeshBasicMaterial({
      color: color,
      wireframe: true,
      transparent: true,
      opacity: 0.5
    });
    const wireframe = new THREE.Mesh(this.towerGeometry, wireframeMaterial);
    wireframe.scale.y = height;
    wireframe.scale.x = 1.02;
    wireframe.scale.z = 1.02;
    wireframe.position.y = height / 2;
    group.add(wireframe);
    
    // Glowing top
    const topGeometry = new THREE.BoxGeometry(4.5, 0.5, 4.5);
    const topMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.9
    });
    const top = new THREE.Mesh(topGeometry, topMaterial);
    top.position.y = height;
    group.add(top);
    
    // Point light at the top
    const light = new THREE.PointLight(color, 0.5, height * 2);
    light.position.y = height + 2;
    group.add(light);
    
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
    
    return group;
  }
  
  // Create a smaller sub-directory tower
  private createSubTower(
    name: string,
    position: THREE.Vector3,
    height: number,
    color: number,
    emissiveColor?: number
  ): THREE.Group {
    const group = new THREE.Group();
    
    // Sub-tower structure (smaller)
    const towerMaterial = new THREE.MeshPhongMaterial({
      color: color,
      emissive: emissiveColor || color,
      emissiveIntensity: 0.15,
      transparent: true,
      opacity: 0.7
    });
    
    const tower = new THREE.Mesh(this.subTowerGeometry, towerMaterial);
    tower.scale.y = height;
    tower.position.y = height / 2;
    group.add(tower);
    
    // Wireframe overlay (smaller)
    const wireframeMaterial = new THREE.MeshBasicMaterial({
      color: color,
      wireframe: true,
      transparent: true,
      opacity: 0.4
    });
    const wireframe = new THREE.Mesh(this.subTowerGeometry, wireframeMaterial);
    wireframe.scale.y = height;
    wireframe.scale.x = 1.02;
    wireframe.scale.z = 1.02;
    wireframe.position.y = height / 2;
    group.add(wireframe);
    
    // Smaller glowing top
    const topGeometry = new THREE.BoxGeometry(2.2, 0.3, 2.2);
    const topMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.8
    });
    const top = new THREE.Mesh(topGeometry, topMaterial);
    top.position.y = height;
    group.add(top);
    
    // Smaller point light
    const light = new THREE.PointLight(color, 0.3, height * 1.5);
    light.position.y = height + 1;
    group.add(light);
    
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
      const light = tower.children.find(child => child instanceof THREE.PointLight) as THREE.PointLight;
      if (light) {
        // Animate light intensity
        const startIntensity = light.intensity || 0.5;
        const targetIntensity = Math.max(startIntensity * 4, 2);
        const duration = 800;
        const startTime = Date.now();
        
        const animate = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / duration, 1);
          
          if (progress < 0.5) {
            light.intensity = startIntensity + (targetIntensity - startIntensity) * (progress * 2);
          } else {
            light.intensity = targetIntensity - (targetIntensity - startIntensity) * ((progress - 0.5) * 2);
          }
          
          if (progress < 1) {
            requestAnimationFrame(animate);
          } else {
            // Reset to original intensity
            light.intensity = startIntensity;
          }
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
        // Normal tower animations
        // Rotate wireframes slowly
        const wireframe = tower.children[1];
        if (wireframe) {
          wireframe.rotation.y += 0.001;
        }
        
        // Subtle glow pulse on the top light
        const light = tower.children.find(child => child instanceof THREE.PointLight) as THREE.PointLight;
        if (light) {
          light.intensity = 0.5 + Math.sin(this.time * 0.5 + tower.position.x * 0.1) * 0.1;
        }
      }
    });
  }

  // Add a connection line between a tower and an agent position
  showAccess(towerName: string, agentPosition: THREE.Vector3) {
    const tower = this.towers.get(towerName);
    if (!tower) return;
    
    // Create a temporary line showing file access
    const points = [
      new THREE.Vector3(tower.position.x, 5, tower.position.z),
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
    this.scene.add(line);
    
    // Fade out and remove
    const fadeOut = () => {
      material.opacity -= 0.02;
      if (material.opacity > 0) {
        requestAnimationFrame(fadeOut);
      } else {
        this.scene.remove(line);
        geometry.dispose();
        material.dispose();
      }
    };
    
    setTimeout(fadeOut, 100);
  }
  
  // Get tower position for a given path - used by AgentManager
  getTowerPosition(path: string): THREE.Vector3 | null {
    // Try to find position by path
    let position = this.towerPositions.get(path);
    if (position) {
      return position.clone();
    }
    
    // Try various path patterns, from most specific to least specific
    const pathParts = path.split('/').filter(p => p.length > 0);
    const possiblePaths = [
      pathParts.join('/'), // Full relative path (most specific)
      // Try intermediate paths for deeply nested locations
      pathParts.length > 3 ? pathParts.slice(0, 4).join('/') : null,
      pathParts.length > 2 ? pathParts.slice(0, 3).join('/') : null,
      pathParts.length > 1 ? pathParts.slice(0, 2).join('/') : null,
      pathParts.slice(-2).join('/'), // Last two parts
      pathParts[pathParts.length - 1], // Last directory alone
      pathParts[0] // First directory (least specific - fallback)
    ].filter(p => p !== null);
    
    for (const possiblePath of possiblePaths) {
      position = this.towerPositions.get(possiblePath);
      if (position) {
        // Found position - return without logging (too spammy)
        return position.clone();
      }
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
      const light = tower.children.find(child => child instanceof THREE.PointLight) as THREE.PointLight;
      if (light) {
        const originalIntensity = light.intensity || 0.5;
        const targetIntensity = originalIntensity * 3;
        const duration = 1000;
        const startTime = Date.now();
        
        const animate = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / duration, 1);
          
          if (progress < 0.5) {
            light.intensity = originalIntensity + (targetIntensity - originalIntensity) * (progress * 2);
          } else {
            light.intensity = targetIntensity - (targetIntensity - originalIntensity) * ((progress - 0.5) * 2);
          }
          
          if (progress < 1) {
            requestAnimationFrame(animate);
          } else {
            light.intensity = originalIntensity;
          }
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
    const light = new THREE.PointLight(color, 0.1, 5);
    light.position.y = 1;
    group.add(light);
    
    // Position the file marker
    group.position.copy(position);
    
    // Add to scene
    this.rootGroup.add(group);
    
    // Store reference
    this.towers.set(file.path, group);
    this.towerPositions.set(file.path, position);
  }
}