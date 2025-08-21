import * as THREE from 'three';

interface GridLevel {
  size: number;
  divisions: number;
  mesh: THREE.LineSegments;
  material: THREE.LineBasicMaterial;
  lastUpdatePosition: THREE.Vector3;
}

export class GridSystem {
  mesh: THREE.Group;
  private gridLevels: GridLevel[] = [];
  private time: number = 0;
  private camera?: THREE.Camera;
  private lastCameraPosition: THREE.Vector3 = new THREE.Vector3();
  private gridLevelConfigs = [
    { size: 100, divisions: 50, opacity: 0.8, color: 0x00ffff, updateThreshold: 1 },      // Fine detail - close up
    { size: 400, divisions: 40, opacity: 0.6, color: 0x00ccdd, updateThreshold: 2 },      // Medium detail 
    { size: 1600, divisions: 32, opacity: 0.4, color: 0x0099bb, updateThreshold: 4 },     // Coarse detail
    { size: 6400, divisions: 16, opacity: 0.25, color: 0x006699, updateThreshold: 8 },    // Very coarse
    { size: 25600, divisions: 8, opacity: 0.15, color: 0x003366, updateThreshold: 16 }    // Horizon
  ];

  constructor() {
    this.mesh = new THREE.Group();
    this.createGridLevels();
  }

  // Set camera reference for LOD calculations
  setCamera(camera: THREE.Camera) {
    this.camera = camera;
    // Initial positioning
    if (camera) {
      this.updateGridPositions(true);
    }
  }

  private createGridLevels() {
    // Clear existing levels
    this.gridLevels.forEach(level => {
      this.mesh.remove(level.mesh);
      level.mesh.geometry.dispose();
      level.material.dispose();
    });
    this.gridLevels = [];

    this.gridLevelConfigs.forEach((levelConfig, _index) => {
      const level = this.createGridLevel(levelConfig.size, levelConfig.divisions, levelConfig.opacity, levelConfig.color);
      this.gridLevels.push(level);
      this.mesh.add(level.mesh);
    });

    // Add subtle background plane that follows the camera
    this.addBackgroundPlane();
  }

  private createGridLevel(size: number, divisions: number, opacity: number, color: number): GridLevel {
    const geometry = new THREE.BufferGeometry();
    const vertices: number[] = [];
    
    const halfSize = size / 2;
    const step = size / divisions;

    // Create grid lines
    for (let i = 0; i <= divisions; i++) {
      const pos = -halfSize + i * step;
      
      // Lines parallel to X
      vertices.push(-halfSize, 0, pos);
      vertices.push(halfSize, 0, pos);
      
      // Lines parallel to Z
      vertices.push(pos, 0, -halfSize);
      vertices.push(pos, 0, halfSize);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

    // Create material
    const material = new THREE.LineBasicMaterial({
      color: color,
      opacity: opacity,
      transparent: true,
      blending: THREE.AdditiveBlending
    });

    const mesh = new THREE.LineSegments(geometry, material);
    
    return {
      size,
      divisions,
      mesh,
      material,
      lastUpdatePosition: new THREE.Vector3()
    };
  }

  private addBackgroundPlane() {
    // Add a subtle plane underneath for glow effect that will follow the camera
    const planeGeometry = new THREE.PlaneGeometry(800, 800);
    const planeMaterial = new THREE.MeshBasicMaterial({
      color: 0x001122,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide
    });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.1;
    plane.name = 'backgroundPlane';
    this.mesh.add(plane);

    // Add main crossing lines that extend across the view
    this.addAccentLines();
  }

  private updateGridPositions(force: boolean = false) {
    if (!this.camera) return;

    const cameraPos = this.camera.position;
    
    this.gridLevels.forEach((level, index) => {
      const config = this.gridLevelConfigs[index];
      
      // Re-enable fine grid repositioning with fix
      
      // Check if camera moved beyond threshold for this specific level
      const moveDelta = cameraPos.distanceTo(level.lastUpdatePosition);
      
      // Only update if camera moved beyond threshold for this level, or forced
      if (force || moveDelta > config.updateThreshold) {
        // Snap grid to align with camera position based on grid step size
        const step = config.size / config.divisions;
        const snappedX = Math.floor(cameraPos.x / step) * step;
        const snappedZ = Math.floor(cameraPos.z / step) * step;
        
        // Update grid geometry to be centered on snapped position
        this.updateGridGeometry(level, config.size, config.divisions, snappedX, snappedZ);
        
        // Update this level's last update position
        level.lastUpdatePosition.copy(cameraPos);
      }
    });

    // Update background plane position to follow camera (but keep it large and centered)
    const backgroundPlane = this.mesh.getObjectByName('backgroundPlane') as THREE.Mesh;
    if (backgroundPlane) {
      backgroundPlane.position.x = Math.floor(cameraPos.x / 100) * 100;
      backgroundPlane.position.z = Math.floor(cameraPos.z / 100) * 100;
    }

    // Update accent lines to span the current view
    this.updateAccentLines();

    this.lastCameraPosition.copy(cameraPos);
  }

  private updateGridGeometry(level: GridLevel, size: number, divisions: number, centerX: number, centerZ: number) {
    const vertices: number[] = [];
    const halfSize = size / 2;
    const step = size / divisions;

    // Create grid lines centered on the camera-snapped position
    for (let i = 0; i <= divisions; i++) {
      const localPos = -halfSize + i * step;
      const worldX = centerX + localPos;
      const worldZ = centerZ + localPos;
      
      // Lines parallel to X (running east-west)
      vertices.push(centerX - halfSize, 0, worldZ);
      vertices.push(centerX + halfSize, 0, worldZ);
      
      // Lines parallel to Z (running north-south)
      vertices.push(worldX, 0, centerZ - halfSize);
      vertices.push(worldX, 0, centerZ + halfSize);
    }

    // Dispose old geometry and create new one instead of updating
    level.mesh.geometry.dispose();
    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    level.mesh.geometry = newGeometry;
  }

  private addAccentLines() {
    const accentGeometry = new THREE.BufferGeometry();
    const vertices: number[] = [];
    
    const maxSize = 2000; // Reasonable size for accent lines
    const halfSize = maxSize / 2;
    
    // Initial main crossing lines - will be updated in updateAccentLines
    vertices.push(-halfSize, 0, 0);
    vertices.push(halfSize, 0, 0);
    vertices.push(0, 0, -halfSize);
    vertices.push(0, 0, halfSize);

    accentGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

    const accentMaterial = new THREE.LineBasicMaterial({
      color: 0x00ffff,
      opacity: 0.8,
      transparent: true,
      linewidth: 2,
      blending: THREE.AdditiveBlending
    });

    const accentLines = new THREE.LineSegments(accentGeometry, accentMaterial);
    accentLines.name = 'accentLines';
    this.mesh.add(accentLines);
  }

  private updateAccentLines() {
    if (!this.camera) return;

    const accentLines = this.mesh.getObjectByName('accentLines') as THREE.LineSegments;
    if (!accentLines) return;

    const cameraPos = this.camera.position;
    const maxSize = 2000;
    const halfSize = maxSize / 2;
    
    // Update accent lines to be centered on camera position
    const vertices = [
      // East-west line
      cameraPos.x - halfSize, 0, cameraPos.z,
      cameraPos.x + halfSize, 0, cameraPos.z,
      // North-south line
      cameraPos.x, 0, cameraPos.z - halfSize,
      cameraPos.x, 0, cameraPos.z + halfSize
    ];

    accentLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    accentLines.geometry.attributes.position.needsUpdate = true;
  }

  update() {
    this.time += 0.01;

    if (!this.camera) return;

    // Update grid positions if camera moved
    this.updateGridPositions();

    const cameraPosition = this.camera.position;
    const cameraHeight = Math.abs(cameraPosition.y);
    
    // Update grid LOD - simplified for debugging
    this.gridLevels.forEach((level, index) => {
      const config = this.gridLevelConfigs[index];
      let targetOpacity = config.opacity;
      
      // Fine grid (index 0) should always be visible
      if (index === 0) {
        targetOpacity = 0.8 + Math.sin(this.time * 2) * 0.1; // Always visible with pulsing
      } 
      // Medium grid (index 1) mostly visible
      else if (index === 1) {
        targetOpacity = 0.6;
      }
      // Other grids can fade based on height and distance
      else {
        const heightFactor = Math.max(0.1, 1 - cameraHeight / (500 + index * 200));
        const distanceFromOrigin = Math.sqrt(cameraPosition.x * cameraPosition.x + cameraPosition.z * cameraPosition.z);
        const maxDistance = 300 + index * 400;
        const distanceFactor = Math.max(0.1, 1 - distanceFromOrigin / maxDistance);
        targetOpacity = config.opacity * heightFactor * distanceFactor;
      }

      // Update opacity
      level.material.opacity = targetOpacity;
      level.mesh.visible = level.material.opacity > 0.01;
    });
  }
}