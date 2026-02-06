export class InputHandler {
  constructor(canvas) {
    this.canvas = canvas;
    this.mouseX = 0;
    this.mouseY = 0;
    this.rightMouseDown = false;
    this.leftMouseDown = false;
    this.ctrlBrake = false;
    this.keys = {};

    this.initListeners();
  }

  initListeners() {
    window.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      this.mouseX = (e.clientX - rect.left) * scaleX;
      this.mouseY = (e.clientY - rect.top) * scaleY;
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.leftMouseDown = true;
      if (e.button === 2) this.rightMouseDown = true;
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.leftMouseDown = false;
      if (e.button === 2) this.rightMouseDown = false;
    });

    window.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.key === 'Control') this.ctrlBrake = true;
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.key === 'Control') this.ctrlBrake = false;
    });
  }

  getMousePosition() {
    return { x: this.mouseX, y: this.mouseY };
  }

  isRightDown() {
    return this.rightMouseDown;
  }

  isLeftDown() {
    return this.leftMouseDown;
  }

  isCtrlDown() {
    return this.ctrlBrake;
  }
  
  isKeyDown(code) {
      return !!this.keys[code];
  }
  
  resetInputs() {
      this.leftMouseDown = false;
      this.rightMouseDown = false;
      this.ctrlBrake = false;
  }
}
