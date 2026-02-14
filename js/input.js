export class InputHandler {
  constructor(canvas) {
    this.canvas = canvas;
    this.mouseX = 0;
    this.mouseY = 0;
    this.rightMouseDown = false;
    this.leftMouseDown = false;
    this.ctrlBrake = false;
    this.keys = {};
    this.touchEnabled = false;
    this.touchThrustActive = false;
    this.touchFireActive = false;
    this.touchBrakeActive = false;
    this.touchMoveX = 0;
    this.touchMoveY = 0;

    this.initListeners();
  }

  initListeners() {
    window.addEventListener('mousemove', (e) => {
      this.setMouseFromClient(e.clientX, e.clientY);
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

  setMouseFromClient(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    this.mouseX = (clientX - rect.left) * scaleX;
    this.mouseY = (clientY - rect.top) * scaleY;
  }

  setTouchEnabled(enabled) {
    this.touchEnabled = !!enabled;
    if (!this.touchEnabled) this.clearTouchState();
  }

  setTouchAimFromClient(clientX, clientY) {
    this.setMouseFromClient(clientX, clientY);
  }

  setTouchFireActive(active) {
    this.touchFireActive = !!active;
    this.leftMouseDown = this.touchFireActive;
  }

  setTouchBrakeActive(active) {
    this.touchBrakeActive = !!active;
    if (this.touchEnabled) this.ctrlBrake = this.touchBrakeActive;
  }

  setTouchMoveVector(x, y, active) {
    const dx = Number.isFinite(x) ? x : 0;
    const dy = Number.isFinite(y) ? y : 0;
    const mag = Math.hypot(dx, dy);
    if (mag > 0) {
      this.touchMoveX = dx / mag;
      this.touchMoveY = dy / mag;
    } else {
      this.touchMoveX = 0;
      this.touchMoveY = 0;
    }
    this.touchThrustActive = !!active && mag > 0;
    this.rightMouseDown = this.touchThrustActive;
  }

  clearTouchState() {
    this.touchThrustActive = false;
    this.touchFireActive = false;
    this.touchBrakeActive = false;
    this.touchMoveX = 0;
    this.touchMoveY = 0;
    this.rightMouseDown = false;
    this.leftMouseDown = false;
    this.ctrlBrake = false;
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
      this.clearTouchState();
  }
}
