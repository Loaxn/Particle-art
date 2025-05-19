// Import required libraries
import canvasSketch from 'canvas-sketch';
import random from 'canvas-sketch-util/random';
import math from 'canvas-sketch-util/math';
import eases from 'eases';
import colormap from 'colormap';
import interpolate from 'color-interpolate';

// CanvasSketch configuration
const settings = {
  dimensions: [1080, 1080],
  animate: true,
};

// Global state
const particles = [];
const cursor = { x: 9999, y: 9999 }; // Cursor starts far away (off-canvas)

// Generate a color palette using 'viridis' colormap
const colors = colormap({
  colormap: 'viridis',
  nshades: 20,
});

// Variables for images and canvas reference
let elCanvas;
let imgA, imgB;

// Main sketch function
const sketch = ({ width, height, canvas }) => {
  let x, y, particle, radius;

  // Create offscreen canvases for both images
  const imgACanvas = document.createElement('canvas');
  const imgAContext = imgACanvas.getContext('2d');
  const imgBCanvas = document.createElement('canvas');
  const imgBContext = imgBCanvas.getContext('2d');

  // Set size for both canvases to match image dimensions
  imgACanvas.width = imgA.width;
  imgACanvas.height = imgA.height;
  imgBCanvas.width = imgB.width;
  imgBCanvas.height = imgB.height;

  // Draw the images into their respective canvases
  imgAContext.drawImage(imgA, 0, 0);
  imgBContext.drawImage(imgB, 0, 0);

  // Extract RGBA pixel data from both images
  const imgAData = imgAContext.getImageData(0, 0, imgA.width, imgA.height).data;
  const imgBData = imgBContext.getImageData(0, 0, imgB.width, imgB.height).data;

  // Parameters for particle layout
  const numCircles = 30;
  const gapCircle = 2;
  const gapDot = 2;
  let dotRadius = 12;
  let cirRadius = 1;
  const fitRadius = dotRadius;

  // Save canvas reference for mouse interactivity
  elCanvas = canvas;
  canvas.addEventListener('mousedown', onMouseDown);

  // Create particles arranged in concentric circles
  for (let i = 0; i < numCircles; i++) {
    const circumference = Math.PI * 2 * cirRadius;
    const numFit = i ? Math.floor(circumference / (fitRadius * 2 + gapDot)) : 1;
    const fitSlice = Math.PI * 2 / numFit;

    for (let j = 0; j < numFit; j++) {
      const theta = fitSlice * j;

      // Calculate polar position for particle
      x = Math.cos(theta) * cirRadius + width * 0.5;
      y = Math.sin(theta) * cirRadius + height * 0.5;

      // Convert screen coordinates to image pixel coordinates
      const ix = Math.floor((x / width) * imgA.width);
      const iy = Math.floor((y / height) * imgA.height);
      const idx = (iy * imgA.width + ix) * 4;

      // Extract color from image A
      let r = imgAData[idx + 0];
      let g = imgAData[idx + 1];
      let b = imgAData[idx + 2];
      const colA = `rgb(${r}, ${g}, ${b})`;

      // Map red channel to particle size
      radius = math.mapRange(r, 0, 255, 1, 12);

      // Extract color from image B
      r = imgBData[idx + 0];
      g = imgBData[idx + 1];
      b = imgBData[idx + 2];
      const colB = `rgb(${r}, ${g}, ${b})`;

      // Create a color interpolator between color A and B
      const colMap = interpolate([colA, colB]);

      // Instantiate a new particle
      particle = new Particle({ x, y, radius, colMap });
      particles.push(particle);
    }

    // Increase radius and ease dot size
    cirRadius += fitRadius * 2 + gapCircle;
    dotRadius = (1 - eases.quadOut(i / numCircles)) * fitRadius;
  }

  // Animation loop
  return ({ context, width, height }) => {
    // Clear canvas
    context.fillStyle = 'black';
    context.fillRect(0, 0, width, height);

    // Optional: draw base image in the background
    context.drawImage(imgACanvas, 0, 0);

    // Sort particles for visual layering based on scale
    particles.sort((a, b) => a.scale - b.scale);

    // Update and draw each particle
    particles.forEach(particle => {
      particle.update();
      particle.draw(context);
    });
  };
};

// Mouse event listeners for interactivity
const onMouseDown = (e) => {
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  onMouseMove(e); // Trigger once on click
};

const onMouseMove = (e) => {
  // Convert to canvas coordinates
  const x = (e.offsetX / elCanvas.offsetWidth) * elCanvas.width;
  const y = (e.offsetY / elCanvas.offsetHeight) * elCanvas.height;
  cursor.x = x;
  cursor.y = y;
};

const onMouseUp = () => {
  // Remove listeners and reset cursor
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
  cursor.x = 9999;
  cursor.y = 9999;
};

// Utility: load an image via a Promise
const loadImage = async (url) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject();
    img.src = url;
  });
};

// Main entry point
const start = async () => {
  imgA = await loadImage('/images/visage.png');
  imgB = await loadImage('/images/test.png');
  canvasSketch(sketch, settings);
};

start();

// Particle class definition
class Particle {
  constructor({ x, y, radius = 10, colMap }) {
    // Initial and current positions
    this.x = x;
    this.y = y;
    this.ix = x;
    this.iy = y;

    // Motion vectors
    this.vx = 0;
    this.vy = 0;
    this.ax = 0;
    this.ay = 0;

    // Visual attributes
    this.radius = radius;
    this.scale = 1;
    this.colMap = colMap;
    this.color = colMap(0);

    // Physics parameters
    this.minDist = random.range(100, 200);
    this.pushFactor = random.range(0.01, 0.02);
    this.pullFactor = random.range(0.002, 0.006);
    this.dampFactor = random.range(0.90, 0.95);
  }

  update() {
    // Pull back toward original position
    let dx = this.ix - this.x;
    let dy = this.iy - this.y;
    let dd = Math.sqrt(dx * dx + dy * dy);

    this.ax = dx * this.pullFactor;
    this.ay = dy * this.pullFactor;

    // Scale and color interpolation based on distance to origin
    this.scale = math.mapRange(dd, 0, 200, 1, 5);
    this.color = this.colMap(math.mapRange(dd, 0, 200, 0, 1, true));

    // Push away from cursor if too close
    dx = this.x - cursor.x;
    dy = this.y - cursor.y;
    dd = Math.sqrt(dx * dx + dy * dy);

    const distDelta = this.minDist - dd;
    if (dd < this.minDist) {
      this.ax += (dx / dd) * distDelta * this.pushFactor;
      this.ay += (dy / dd) * distDelta * this.pushFactor;
    }

    // Apply acceleration to velocity, and velocity to position
    this.vx += this.ax;
    this.vy += this.ay;

    // Apply damping (friction)
    this.vx *= this.dampFactor;
    this.vy *= this.dampFactor;

    // Update position
    this.x += this.vx;
    this.y += this.vy;
  }

  draw(context) {
    context.save();
    context.translate(this.x, this.y);
    context.fillStyle = this.color;
    context.beginPath();
    context.arc(0, 0, this.radius * this.scale, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
}
