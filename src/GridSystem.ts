import * as THREE from 'three';

export class GridSystem {
  mesh: THREE.Group;
  private gridLines: THREE.LineSegments;
  private time: number = 0;

  constructor(size: number = 200, divisions: number = 20) {
    this.mesh = new THREE.Group();

    // Create grid geometry
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

    // Create glowing material
    const material = new THREE.LineBasicMaterial({
      color: 0x00ffff,
      opacity: 0.6,
      transparent: true,
      blending: THREE.AdditiveBlending
    });

    this.gridLines = new THREE.LineSegments(geometry, material);
    this.mesh.add(this.gridLines);

    // Add a subtle plane underneath for glow effect
    const planeGeometry = new THREE.PlaneGeometry(size, size);
    const planeMaterial = new THREE.MeshBasicMaterial({
      color: 0x001122,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide
    });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.1;
    this.mesh.add(plane);

    // Add some accent lines for depth
    this.addAccentLines(size, divisions);
  }

  private addAccentLines(size: number, _divisions: number) {
    const accentGeometry = new THREE.BufferGeometry();
    const vertices: number[] = [];
    
    const halfSize = size / 2;
    
    // Main crossing lines
    vertices.push(-halfSize, 0, 0);
    vertices.push(halfSize, 0, 0);
    vertices.push(0, 0, -halfSize);
    vertices.push(0, 0, halfSize);

    accentGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

    const accentMaterial = new THREE.LineBasicMaterial({
      color: 0x00ffff,
      opacity: 1,
      transparent: true,
      linewidth: 2,
      blending: THREE.AdditiveBlending
    });

    const accentLines = new THREE.LineSegments(accentGeometry, accentMaterial);
    this.mesh.add(accentLines);
  }

  update() {
    this.time += 0.01;
    
    // Subtle pulsing effect
    const scale = 1 + Math.sin(this.time) * 0.002;
    this.gridLines.scale.set(scale, 1, scale);
    
    // Slight opacity variation
    const material = this.gridLines.material as THREE.LineBasicMaterial;
    material.opacity = 0.6 + Math.sin(this.time * 2) * 0.1;
  }
}