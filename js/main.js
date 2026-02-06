import * as THREE from '../vendor/three/build/three.module.js';
import { GLTFLoader } from '../vendor/three/examples/jsm/loaders/GLTFLoader.js';

// Bridge: expose Three + GLTFLoader for existing game.js code.
window.THREE = THREE;
window.GLTFLoader = GLTFLoader;

// Run the game after Three is ready.
import('./game.js');
