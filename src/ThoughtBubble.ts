import * as THREE from 'three';

export class ThoughtBubble {
  private mesh: THREE.Group;
  private textSprite: THREE.Sprite;
  
  constructor(text: string, position: THREE.Vector3) {
    this.mesh = new THREE.Group();
    
    const canvas = this.renderTextToCanvas(text);
    
    // Create sprite
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ 
      map: texture,
      transparent: true,
      opacity: 1
    });
    
    this.textSprite = new THREE.Sprite(material);
    this.textSprite.scale.set(16, 4, 1);
    this.mesh.add(this.textSprite);
    
    // Position above agent (static position)
    this.mesh.position.copy(position);
    this.mesh.position.y += 10;
  }
  
  updatePosition(position: THREE.Vector3) {
    // Update position to follow agent
    this.mesh.position.copy(position);
    this.mesh.position.y += 10;
  }
  
  updateText(text: string) {
    // Update the text content
    const canvas = this.renderTextToCanvas(text);

    // Update texture
    const material = this.textSprite.material as THREE.SpriteMaterial;
    if (material.map) material.map.dispose();
    material.map = new THREE.CanvasTexture(canvas);
    material.needsUpdate = true;
  }

  private renderTextToCanvas(text: string): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = 512;
    canvas.height = 160;

    // Background
    context.fillStyle = 'rgba(0, 17, 34, 0.8)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    // Border
    context.strokeStyle = '#00ffff';
    context.lineWidth = 2;
    context.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

    context.fillStyle = '#00ffff';
    context.font = '16px Courier New';
    context.textAlign = 'left';

    const maxWidth = canvas.width - 20;
    let y = 28;
    const lineHeight = 20;

    // Support explicit newlines for separate sections
    const paragraphs = text.split('\n');
    for (const para of paragraphs) {
      const words = para.split(' ');
      let line = '';
      for (const word of words) {
        const testLine = line + word + ' ';
        const metrics = context.measureText(testLine);
        if (metrics.width > maxWidth && line !== '') {
          context.fillText(line, 10, y);
          line = word + ' ';
          y += lineHeight;
          if (y > canvas.height - 18) return canvas; // stop if overflow
        } else {
          line = testLine;
        }
      }
      if (line) {
        context.fillText(line, 10, y);
        y += lineHeight;
        if (y > canvas.height - 18) break;
      }
    }
    return canvas;
  }
  
  getMesh(): THREE.Group {
    return this.mesh;
  }
  
  dispose() {
    const material = this.textSprite.material as THREE.SpriteMaterial;
    material.map?.dispose();
    material.dispose();
  }
}
