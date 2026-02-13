import { getMaxStack } from './utils.js';

const ENERGY_CELL_ITEMS = new Set(['small energy cell', 'medium energy cell', 'large energy cell']);

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
    if (item && item.quantity != null) {
      const max = getMaxStack(item.item);
      item.quantity = Math.min(item.quantity, max);
    }
    this.slots[index] = item;
  }

  getSelected() {
    return this.slots[this.selectedSlot];
  }

  findFirstEnergyCell(where) {
    for (let i = 0; i < this.slots.length; i++) {
      const cell = this.slots[i];
      if (!cell || !ENERGY_CELL_ITEMS.has(cell.item) || cell.energy == null) continue;
      if (!where || where(cell)) return cell;
    }
    return null;
  }

  getFirstChargedCell() {
    return this.findFirstEnergyCell((cell) => cell.energy > 0);
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
    return this.findFirstEnergyCell((cell) => cell.energy >= min);
  }

  /** Returns total count of item across all slots (quantity or 1 for non-stackable). */
  countItem(itemName) {
    let total = 0;
    for (const slot of this.slots) {
      if (!slot || slot.item !== itemName) continue;
      total += slot.quantity != null ? slot.quantity : 1;
    }
    return total;
  }

  /** Remove up to `quantity` of `itemName` from inventory. Returns true if all removed. */
  removeItem(itemName, quantity) {
    if (quantity <= 0) return true;
    let remaining = quantity;
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      const slot = this.slots[i];
      if (!slot || slot.item !== itemName) continue;
      const have = slot.quantity != null ? slot.quantity : 1;
      const take = Math.min(remaining, have);
      remaining -= take;
      if (have <= take) {
        this.slots[i] = null;
      } else {
        slot.quantity = have - take;
      }
    }
    return remaining === 0;
  }
}
