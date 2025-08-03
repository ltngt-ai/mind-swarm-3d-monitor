import * as THREE from 'three';

interface DirectoryNode {
  name: string;
  path: string;
  type: 'directory' | 'file';
  children?: DirectoryNode[];
  tower?: THREE.Group;
  position?: THREE.Vector3;
}

export class FilesystemVisualizer {
  private scene: THREE.Scene;
  private rootGroup: THREE.Group;
  private towers: Map<string, THREE.Group> = new Map();
  private towerGeometry: THREE.BoxGeometry;
  private time: number = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.rootGroup = new THREE.Group();
    this.scene.add(this.rootGroup);
    
    // Base tower geometry - will be scaled for different heights
    this.towerGeometry = new THREE.BoxGeometry(4, 1, 4);
    
    // Create the subspace filesystem structure
    this.createFilesystemStructure();
  }

  private createFilesystemStructure() {
    // Main subspace directories as landmarks
    const subspaceStructure: DirectoryNode[] = [
      {
        name: 'agents',
        path: '/subspace/agents',
        type: 'directory',
        children: [] // Will be populated with agent homes
      },
      {
        name: 'grid',
        path: '/subspace/grid',
        type: 'directory',
        children: [
          { name: 'plaza', path: '/subspace/grid/plaza', type: 'directory' },
          { name: 'library', path: '/subspace/grid/library', type: 'directory' },
          { name: 'workshop', path: '/subspace/grid/workshop', type: 'directory' },
          { name: 'bulletin', path: '/subspace/grid/bulletin', type: 'directory' }
        ]
      },
      {
        name: 'runtime',
        path: '/subspace/runtime',
        type: 'directory'
      }
    ];

    // Position towers in strategic locations
    this.createTower('agents', new THREE.Vector3(-50, 0, -50), 20, 0x00ff00);
    this.createTower('grid', new THREE.Vector3(0, 0, -70), 30, 0x00ffff);
    this.createTower('runtime', new THREE.Vector3(50, 0, -50), 15, 0xff9f00);
    
    // Create sub-towers for grid directories
    const gridSubDirs = [
      { name: 'plaza', pos: new THREE.Vector3(-20, 0, -60), height: 15, color: 0x00cccc },
      { name: 'library', pos: new THREE.Vector3(20, 0, -60), height: 15, color: 0x00cccc },
      { name: 'workshop', pos: new THREE.Vector3(-10, 0, -80), height: 12, color: 0x00aaaa },
      { name: 'bulletin', pos: new THREE.Vector3(10, 0, -80), height: 12, color: 0x00aaaa }
    ];

    gridSubDirs.forEach(dir => {
      this.createTower(dir.name, dir.pos, dir.height, dir.color);
    });
  }

  private createTower(name: string, position: THREE.Vector3, height: number, color: number): THREE.Group {
    const group = new THREE.Group();
    
    // Main tower structure
    const towerMaterial = new THREE.MeshPhongMaterial({
      color: color,
      emissive: color,
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
    
    // Add to scene and store reference
    this.rootGroup.add(group);
    this.towers.set(name, group);
    
    return group;
  }

  // Pulse a tower to show activity
  pulseDirectory(path: string) {
    const name = path.split('/').pop();
    if (!name) return;
    
    const tower = this.towers.get(name);
    if (tower) {
      const light = tower.children.find(child => child instanceof THREE.PointLight) as THREE.PointLight;
      if (light) {
        // Animate light intensity
        const startIntensity = 0.5;
        const targetIntensity = 2;
        const duration = 500;
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
          }
        };
        
        animate();
      }
    }
  }

  setVisible(visible: boolean) {
    this.rootGroup.visible = visible;
  }

  update() {
    this.time += 0.01;
    
    // Just rotate wireframes slowly - no bouncing
    this.towers.forEach((tower, name) => {
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
}