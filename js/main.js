import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Bridge: expose Three + GLTFLoader for existing game.js code.
window.THREE = THREE;
window.GLTFLoader = GLTFLoader;

// Run the game after Three is ready.
import('./game.js');
