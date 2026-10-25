// Web Bluetooth connection to an Aurora/Kilter board.

import { encodeMessage, chunk, apiLevelFromName } from './protocol.js';

export const ADVERTISED_SERVICE = '4488b571-7806-4df6-bcff-a2897e4953ff';
export const UART_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
export const UART_RX_CHARACTERISTIC = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';

export const isBluetoothSupported = () => typeof navigator !== 'undefined' && !!navigator.bluetooth;

export class KilterConnection {
  constructor({ onStatus = () => {} } = {}) {
    this.onStatus = onStatus;
    this.device = null;
    this.characteristic = null;
    this.apiOverride = null; // null = detect from the board name
    this.pending = null;
    this.sending = false;
    this.flushing = Promise.resolve();
    this.status = 'disconnected';
    this.handleDisconnect = this.handleDisconnect.bind(this);
  }

  get apiLevel() {
    return this.apiOverride ?? apiLevelFromName(this.device?.name);
  }

  get connected() {
    return this.status === 'connected';
  }

  setStatus(status, detail = '') {
    this.status = status;
    this.onStatus(status, detail);
  }

  // Must be called from a user gesture (button click).
  async connect({ showAllDevices = false } = {}) {
    if (!isBluetoothSupported()) throw new Error('Web Bluetooth is not available in this browser.');
    const options = showAllDevices
      ? { acceptAllDevices: true, optionalServices: [UART_SERVICE, ADVERTISED_SERVICE] }
      : { filters: [{ services: [ADVERTISED_SERVICE] }], optionalServices: [UART_SERVICE] };
    const device = await navigator.bluetooth.requestDevice(options);
    if (this.device && this.device !== device) await this.disconnect();
    this.device = device;
    device.addEventListener('gattserverdisconnected', this.handleDisconnect);
    await this.openGatt();
  }

  async reconnect() {
    if (!this.device) throw new Error('No board picked yet. Use Connect first.');
    await this.openGatt();
  }

  async openGatt() {
    this.setStatus('connecting', this.device.name || 'board');
    try {
      const server = await this.device.gatt.connect();
      const service = await server.getPrimaryService(UART_SERVICE);
      this.characteristic = await service.getCharacteristic(UART_RX_CHARACTERISTIC);
      this.setStatus('connected', this.device.name || 'board');
    } catch (err) {
      this.characteristic = null;
      if (this.device.gatt.connected) this.device.gatt.disconnect();
      this.setStatus('disconnected', err.message);
      throw err;
    }
  }

  async disconnect({ clearFirst = true } = {}) {
    if (!this.device) return;
    this.pending = null;
    await this.flushing;
    if (clearFirst && this.connected) {
      try {
        await this.writeFrame(new Map());
      } catch {
        // Board may already be gone; disconnecting anyway.
      }
    }
    if (this.device.gatt.connected) this.device.gatt.disconnect();
    else this.handleDisconnect();
  }

  // Forget the board entirely so the next Connect shows the picker.
  async forget() {
    await this.disconnect();
    this.device?.removeEventListener('gattserverdisconnected', this.handleDisconnect);
    this.device = null;
  }

  handleDisconnect() {
    this.characteristic = null;
    this.sending = false;
    this.setStatus('disconnected', this.device?.name ? `${this.device.name} disconnected` : '');
  }

  // Queue a frame (Map position -> rgb). Only the newest frame is kept while a send is in flight,
  // so a slow link drops intermediate frames instead of lagging further and further behind.
  send(frame) {
    if (!this.connected) return;
    this.pending = frame;
    if (!this.sending) this.flushing = this.flush();
  }

  async flush() {
    this.sending = true;
    try {
      while (this.pending && this.connected) {
        const frame = this.pending;
        this.pending = null;
        await this.writeFrame(frame);
      }
    } catch (err) {
      this.onStatus(this.status, `Send failed: ${err.message}`);
    } finally {
      this.sending = false;
    }
  }

  async writeFrame(frame) {
    const c = this.characteristic;
    if (!c) return;
    const bytes = encodeMessage(frame.entries(), this.apiLevel);
    const write = c.properties.write
      ? (data) => c.writeValueWithResponse(data)
      : (data) => c.writeValueWithoutResponse(data);
    for (const piece of chunk(bytes)) await write(piece);
  }
}
