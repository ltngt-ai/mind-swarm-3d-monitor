import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { eventBus, Events } from '../utils/EventBus';

export enum CameraMode {
  ORBIT = 'orbit',
  FOLLOW = 'follow',
  CINEMATIC = 'cinematic',
  FREE = 'free',
  FIXED = 'fixed'
}

export interface CameraTarget {
  position: THREE.Vector3;
  lookAt?: THREE.Vector3;
  distance?: number;
  duration?: number;
}

export class CameraController {
  private camera: THREE.PerspectiveCamera;
  private orbitControls: OrbitControls;
  private currentMode: CameraMode = CameraMode.ORBIT;
  private targetObject?: THREE.Object3D;
  private animating: boolean = false;
  private cinematicPath?: THREE.CatmullRomCurve3;
  private cinematicProgress: number = 0;
  private cinematicSpeed: number = 0.001;
  
  // Camera limits
  private minDistance: number = 20;
  private maxDistance: number = 500;
  // private minPolarAngle: number = 0;
  private maxPolarAngle: number = Math.PI / 2;
  
  // Smooth movement
  private moveSpeed: number = 1;
  private targetPosition: THREE.Vector3 = new THREE.Vector3();
  private targetLookAt: THREE.Vector3 = new THREE.Vector3();
  private currentLookAt: THREE.Vector3 = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer) {
    this.camera = camera;
    
    // Initialize orbit controls
    this.orbitControls = new OrbitControls(camera, renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.05;
    this.orbitControls.minDistance = this.minDistance;
    this.orbitControls.maxDistance = this.maxDistance;
    this.orbitControls.maxPolarAngle = this.maxPolarAngle;
    
    // Set initial camera position
    this.camera.position.set(50, 50, 50);
    this.camera.lookAt(0, 0, 0);
    this.currentLookAt.set(0, 0, 0);
    this.targetLookAt.set(0, 0, 0);
  }

  setMode(mode: CameraMode): void {
    if (this.currentMode === mode) return;
    
    const previousMode = this.currentMode;
    this.currentMode = mode;
    
    switch (mode) {
      case CameraMode.ORBIT:
        this.orbitControls.enabled = true;
        this.orbitControls.enableDamping = true;
        this.orbitControls.autoRotate = false;
        break;
        
      case CameraMode.FOLLOW:
        this.orbitControls.enabled = false;
        break;
        
      case CameraMode.CINEMATIC:
        this.orbitControls.enabled = false;
        this.orbitControls.autoRotate = false;
        break;
        
      case CameraMode.FREE:
        this.orbitControls.enabled = true;
        this.orbitControls.enableDamping = true;
        this.orbitControls.autoRotate = false;
        this.orbitControls.minDistance = 5;
        this.orbitControls.maxDistance = 1000;
        break;
        
      case CameraMode.FIXED:
        this.orbitControls.enabled = false;
        break;
    }
    
    eventBus.emit(Events.CAMERA_MODE_CHANGED, { from: previousMode, to: mode });
  }

  getMode(): CameraMode {
    return this.currentMode;
  }

  setTarget(target: THREE.Object3D | null): void {
    this.targetObject = target || undefined;
    if (target) {
      this.targetLookAt.copy(target.position);
      eventBus.emit(Events.CAMERA_TARGET_CHANGED, target);
    }
  }

  async animateTo(target: CameraTarget): Promise<void> {
    if (this.animating) return;
    
    this.animating = true;
    const startPosition = this.camera.position.clone();
    const startLookAt = this.currentLookAt.clone();
    const duration = target.duration || 2000;
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Smooth easing
        const eased = this.easeInOutCubic(progress);
        
        // Interpolate position
        this.camera.position.lerpVectors(startPosition, target.position, eased);
        
        // Interpolate look-at point if provided
        if (target.lookAt) {
          this.currentLookAt.lerpVectors(startLookAt, target.lookAt, eased);
          this.camera.lookAt(this.currentLookAt);
        }
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          this.animating = false;
          this.targetPosition.copy(target.position);
          if (target.lookAt) {
            this.targetLookAt.copy(target.lookAt);
          }
          eventBus.emit(Events.CAMERA_ANIMATION_COMPLETE);
          resolve();
        }
      };
      
      animate();
    });
  }

  setCinematicPath(points: THREE.Vector3[]): void {
    this.cinematicPath = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.5);
    this.cinematicProgress = 0;
  }

  setCinematicSpeed(speed: number): void {
    this.cinematicSpeed = Math.max(0.0001, Math.min(0.01, speed));
  }

  setAutoRotate(enabled: boolean, speed: number = 1): void {
    this.orbitControls.autoRotate = enabled;
    this.orbitControls.autoRotateSpeed = speed;
  }

  enableControls(enabled: boolean): void {
    this.orbitControls.enabled = enabled;
  }

  setBounds(min: number, max: number): void {
    this.minDistance = min;
    this.maxDistance = max;
    this.orbitControls.minDistance = min;
    this.orbitControls.maxDistance = max;
  }

  update(deltaTime: number): void {
    switch (this.currentMode) {
      case CameraMode.ORBIT:
      case CameraMode.FREE:
        // Only update orbit controls if they're enabled
        if (this.orbitControls.enabled) {
          this.orbitControls.update();
        }
        break;
        
      case CameraMode.FOLLOW:
        if (this.targetObject) {
          this.followTarget(deltaTime);
        }
        break;
        
      case CameraMode.CINEMATIC:
        // Ensure orbit controls don't interfere
        this.orbitControls.enabled = false;
        if (this.cinematicPath) {
          this.updateCinematic(deltaTime);
        }
        break;
        
      case CameraMode.FIXED:
        // Camera doesn't move in fixed mode
        break;
    }
  }

  private followTarget(deltaTime: number): void {
    if (!this.targetObject) return;
    
    // Calculate desired camera position (behind and above target)
    const offset = new THREE.Vector3(20, 30, 20);
    const desiredPosition = this.targetObject.position.clone().add(offset);
    
    // Smooth camera movement
    this.camera.position.lerp(desiredPosition, deltaTime * this.moveSpeed);
    
    // Smooth look-at
    this.currentLookAt.lerp(this.targetObject.position, deltaTime * this.moveSpeed * 2);
    this.camera.lookAt(this.currentLookAt);
  }

  private updateCinematic(_deltaTime: number): void {
    if (!this.cinematicPath) return;
    
    // Update progress along path
    this.cinematicProgress += this.cinematicSpeed;
    if (this.cinematicProgress > 1) {
      this.cinematicProgress -= 1;
    }
    
    // Get position on path
    const point = this.cinematicPath.getPoint(this.cinematicProgress);
    this.camera.position.copy(point);
    
    // Look ahead on the path
    const lookAheadProgress = (this.cinematicProgress + 0.05) % 1;
    const lookAtPoint = this.cinematicPath.getPoint(lookAheadProgress);
    lookAtPoint.y = 0; // Keep looking at ground level
    this.camera.lookAt(lookAtPoint);
  }

  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // Public methods for manual camera control
  moveCamera(moveVector: THREE.Vector3): void {
    // Move both camera and orbit control target together
    this.camera.position.add(moveVector);
    this.orbitControls.target.add(moveVector);
  }
  
  moveForward(distance: number): void {
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    direction.y = 0; // Keep movement horizontal
    direction.normalize();
    this.camera.position.addScaledVector(direction, distance);
    this.orbitControls.target.addScaledVector(direction, distance);
  }

  moveRight(distance: number): void {
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    const right = new THREE.Vector3();
    right.crossVectors(direction, this.camera.up).normalize();
    this.camera.position.addScaledVector(right, distance);
    this.orbitControls.target.addScaledVector(right, distance);
  }

  rotate(deltaX: number, deltaY: number): void {
    if (this.currentMode === CameraMode.FREE) {
      // Manual rotation in free mode
      const spherical = new THREE.Spherical();
      spherical.setFromVector3(
        this.camera.position.clone().sub(this.orbitControls.target)
      );
      spherical.theta -= deltaX * 0.01;
      spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi + deltaY * 0.01));
      this.camera.position.setFromSpherical(spherical).add(this.orbitControls.target);
      this.camera.lookAt(this.orbitControls.target);
    }
  }

  zoom(delta: number): void {
    const distance = this.camera.position.distanceTo(this.orbitControls.target);
    const newDistance = Math.max(this.minDistance, Math.min(this.maxDistance, distance - delta));
    const direction = this.camera.position.clone().sub(this.orbitControls.target).normalize();
    this.camera.position.copy(this.orbitControls.target).addScaledVector(direction, newDistance);
  }

  reset(): void {
    this.camera.position.set(50, 50, 50);
    this.camera.lookAt(0, 0, 0);
    this.orbitControls.target.set(0, 0, 0);
    this.currentLookAt.set(0, 0, 0);
    this.targetLookAt.set(0, 0, 0);
    this.orbitControls.update();
  }

  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  getOrbitControls(): OrbitControls {
    return this.orbitControls;
  }
}