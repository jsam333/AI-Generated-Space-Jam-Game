import { getMaxStack } from './utils.js';

export class Inventory {
  constructor(size = 9) {
    this.slots = new Array(size).fill(null);
    this.selectedSlot = 0;
  }

  add(itemName, quantity) {
    const maxStack = getMaxStack(itemName);

    while (quantity > 0) {
      // First try to stack with existing item
      let added = false;
      for (let i = 0; i < this.slots.length && quantity > 0; i++) {
        if (this.slots[i] && this.slots[i].item === itemName && this.slots[i].quantity != null && this.slots[i].quantity < maxStack) {
          const space = maxStack - this.slots[i].quantity;
          const add = Math.min(quantity, space);
          this.slots[i].quantity += add;
          quantity -= add;
          added = true;
        }
      }
      if (quantity <= 0) return true;

      // Otherwise find first empty slot
      for (let i = 0; i < this.slots.length; i++) {
        if (!this.slots[i]) {
          const add = Math.min(quantity, maxStack);
          this.slots[i] = { item: itemName, quantity: add };
          quantity -= add;
          added = true;
          break;
        }
      }
      if (!added) return false; // Inventory full
    }
    return true;
  }

  get(index) {
    return this.slots[index];
  }

  set(index, item) {
    this.slots[index] = item;
  }

  getSelected() {
    return this.slots[this.selectedSlot];
  }

  getFirstChargedCell() {
    for (let i = 0; i < this.slots.length; i++) {
      const cell = this.slots[i];
      if (cell && (cell.item === 'small energy cell' || cell.item === 'medium energy cell') && cell.energy != null && cell.energy > 0) return cell;
    }
    return null;
  }

  /** Resize inventory. Returns array of excess items that no longer fit (when shrinking). */
  resize(newSize) {
    const excess = [];
    if (newSize > this.slots.length) {
      while (this.slots.length < newSize) this.slots.push(null);
    } else if (newSize < this.slots.length) {
      for (let i = newSize; i < this.slots.length; i++) {
        if (this.slots[i]) excess.push(this.slots[i]);
      }
      this.slots.length = newSize;
    }
    return excess;
  }

  getFirstCellWithMinEnergy(min) {
    for (let i = 0; i < this.slots.length; i++) {
      const cell = this.slots[i];
      if (cell && (cell.item === 'small energy cell' || cell.item === 'medium energy cell') && cell.energy != null && cell.energy >= min) return cell;
    }
    return null;
  }
}
