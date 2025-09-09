import * as THREE from 'three';

export class GridSystem {
  mesh: THREE.Group;
  private time = 0;
  // Camera no longer needed for world-locked grid
  // private camera?: THREE.Camera;
  private gridPlane?: THREE.Mesh;
  private gridTexture?: THREE.Texture;
  private gridSize = 12000; // world units covered by the plane
  private baseRepeat = 60;  // how many small squares across the plane

  constructor() {
    this.mesh = new THREE.Group();
    this.createTexturedGrid();
  }

  setCamera(_camera: THREE.Camera) {
    // no-op for world-locked grid
  }

  private createTexturedGrid() {
    // Create hi‑res canvas texture with mipmaps for crisp lines
    this.gridTexture = this.makeGridTexture(2048, 2048);
    this.gridTexture.wrapS = THREE.RepeatWrapping;
    this.gridTexture.wrapT = THREE.RepeatWrapping;
    this.gridTexture.minFilter = THREE.LinearMipMapLinearFilter;
    this.gridTexture.magFilter = THREE.LinearFilter;
    this.gridTexture.anisotropy = 8;
    this.gridTexture.generateMipmaps = true;

    const mat = new THREE.MeshBasicMaterial({ map: this.gridTexture, transparent: false, color: 0xffffff, depthWrite: true, depthTest: true });
    const geo = new THREE.PlaneGeometry(this.gridSize, this.gridSize);
    const plane = new THREE.Mesh(geo, mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0.01; // slightly above world zero to avoid z-fighting
    this.mesh.add(plane);
    this.gridPlane = plane;

    // Initial UV repeat
    this.updateTextureRepeat(1.0);
  }

  private makeGridTexture(w: number, h: number): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d')!;
    // Background transparent
    ctx.clearRect(0, 0, w, h);
    // Colors
    const fine = 'rgba(0, 255, 255, 0.22)';
    const major = 'rgba(0, 255, 255, 0.45)';
    const majorStep = 8; // every N fine cells

    // Draw fine grid
    const cells = 64; // base cell count per texture
    const step = w / cells;
    ctx.lineWidth = 1;
    ctx.strokeStyle = fine;
    ctx.beginPath();
    for (let i = 0; i <= cells; i++) {
      const x = Math.round(i * step) + 0.5;
      ctx.moveTo(x, 0); ctx.lineTo(x, h);
      const y = Math.round(i * step) + 0.5;
      ctx.moveTo(0, y); ctx.lineTo(w, y);
    }
    ctx.stroke();

    // Draw major grid
    ctx.lineWidth = 2;
    ctx.strokeStyle = major;
    ctx.beginPath();
    for (let i = 0; i <= cells; i += majorStep) {
      const x = Math.round(i * step) + 0.5;
      ctx.moveTo(x, 0); ctx.lineTo(x, h);
      const y = Math.round(i * step) + 0.5;
      ctx.moveTo(0, y); ctx.lineTo(w, y);
    }
    ctx.stroke();

    const tex = new THREE.CanvasTexture(c);
    return tex;
  }

  private updateTextureRepeat(scaleFactor: number) {
    if (!this.gridPlane || !this.gridTexture) return;
    const rep = this.baseRepeat * scaleFactor;
    this.gridTexture.repeat.set(rep, rep);
    this.gridTexture.needsUpdate = true;
  }

  // Camera snapping removed to keep grid locked in world space

  // Deprecated functions removed – texture grid follows camera via snapPlaneToCamera
  // Former line-based grid utilities removed

  // Accent lines removed in texture-based grid

  update() {
    this.time += 0.01;
    // Grid is locked in world space; no camera-following.
  }
}
