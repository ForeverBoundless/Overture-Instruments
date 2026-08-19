/**
 * OLEDDisplay.js
 *
 * The amber-on-black OLED readout, modeled after the Little Phatty's
 * hardware display: two lines, a preset number/name on top, and a
 * transient parameter-name/value readout on the second line whenever a
 * control is touched (auto-reverting to status info after a short delay).
 */

export class OLEDDisplay {
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'lp-oled';

    this._line1 = document.createElement('div');
    this._line1.className = 'lp-oled-line lp-oled-line1';
    this._line2 = document.createElement('div');
    this._line2.className = 'lp-oled-line lp-oled-line2';

    this.el.appendChild(this._line1);
    this.el.appendChild(this._line2);

    this._revertTimer = null;
    this._statusText = '';
    this._midiText = 'MIDI: --';

    this.showPreset(0, 'THANK YOU BOB');
  }

  showPreset(number, name) {
    this._presetText = `${String(number).padStart(2, '0')}  ${name}`;
    this._line1.textContent = this._presetText;
    this._renderLine2Status();
  }

  /** Transient readout - e.g. "CUTOFF   3400 Hz" - reverts to status after `holdMs`. */
  showParameter(name, valueText, holdMs = 1400) {
    this._line2.textContent = `${name.padEnd(10, ' ')}${valueText}`;
    if (this._revertTimer) clearTimeout(this._revertTimer);
    this._revertTimer = setTimeout(() => this._renderLine2Status(), holdMs);
  }

  setMidiStatus(connected, deviceName) {
    this._midiText = connected ? `MIDI: ${deviceName}` : 'MIDI: --';
    if (!this._revertTimer) this._renderLine2Status();
  }

  setPolyphony(voices) {
    this._polyText = `VOICE ${voices}`;
  }

  _renderLine2Status() {
    this._line2.textContent = this._midiText;
  }
}
