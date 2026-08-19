/**
 * Keyboard.js
 *
 * 37-key virtual piano (C2..C5, three octaves plus the top C), with mouse,
 * touch, and programmatic (computer-keyboard/MIDI) highlighting support.
 * Purely a view + input-capture component - it has no knowledge of audio;
 * it just reports note-on/note-off events and lets callers light up keys
 * that were triggered by other input methods (computer keyboard, MIDI).
 */

const WHITE_PATTERN = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const BLACK_AFTER = { C: 'C#', D: 'D#', F: 'F#', G: 'G#', A: 'A#' }; // which white keys have a black key immediately after

export class Keyboard {
  /**
   * @param {object} opts
   * @param {number} [opts.startOctave=2]
   * @param {number} [opts.octaves=3]
   * @param {(note:string, velocity:number)=>void} opts.onNoteOn
   * @param {(note:string)=>void} opts.onNoteOff
   */
  constructor(opts) {
    this.startOctave = opts.startOctave ?? 2;
    this.octaves = opts.octaves ?? 3;
    this.onNoteOn = opts.onNoteOn ?? (() => {});
    this.onNoteOff = opts.onNoteOff ?? (() => {});

    this.el = document.createElement('div');
    this.el.className = 'lp-keyboard';
    this.el.setAttribute('role', 'group');
    this.el.setAttribute('aria-label', 'Virtual piano keyboard');

    this._keyEls = new Map(); // note -> element
    this._activePointerNote = null;

    this._build();
  }

  _build() {
    const whiteKeys = [];
    const blackKeys = [];

    for (let o = 0; o < this.octaves; o++) {
      const octave = this.startOctave + o;
      WHITE_PATTERN.forEach((letter) => {
        whiteKeys.push(`${letter}${octave}`);
        if (BLACK_AFTER[letter]) {
          blackKeys.push({ note: `${BLACK_AFTER[letter]}${octave}`, afterWhiteIndex: whiteKeys.length - 1 });
        }
      });
    }
    // Final top C.
    whiteKeys.push(`C${this.startOctave + this.octaves}`);

    const whiteKeyWidthPct = 100 / whiteKeys.length;

    whiteKeys.forEach((note, i) => {
      const key = this._buildKeyEl(note, 'white');
      key.style.left = `${i * whiteKeyWidthPct}%`;
      key.style.width = `${whiteKeyWidthPct}%`;
      this.el.appendChild(key);
      this._keyEls.set(note, key);
    });

    blackKeys.forEach(({ note, afterWhiteIndex }) => {
      const key = this._buildKeyEl(note, 'black');
      const centerPct = (afterWhiteIndex + 1) * whiteKeyWidthPct;
      const blackWidthPct = whiteKeyWidthPct * 0.62;
      key.style.left = `calc(${centerPct}% - ${blackWidthPct / 2}%)`;
      key.style.width = `${blackWidthPct}%`;
      this.el.appendChild(key);
      this._keyEls.set(note, key);
    });
  }

  _buildKeyEl(note, colorClass) {
    const key = document.createElement('div');
    key.className = `lp-key lp-key-${colorClass}`;
    key.dataset.note = note;

    const label = document.createElement('div');
    label.className = 'lp-key-label';
    if (note.startsWith('C') && !note.includes('#')) {
      label.textContent = note; // show octave marker only on C keys, like real keybeds' silkscreen
    }
    key.appendChild(label);

    const press = (velocity = 0.9) => {
      if (this._activePointerNote) this._releasePointerNote();
      this._activePointerNote = note;
      this.setKeyActive(note, true);
      this.onNoteOn(note, velocity);
    };
    const release = () => {
      if (this._activePointerNote !== note) return;
      this._releasePointerNote();
    };

    key.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      key.setPointerCapture?.(e.pointerId);
      press(0.9);
    });
    key.addEventListener('pointerup', release);
    key.addEventListener('pointerleave', (e) => {
      // Only release on leave if the button is no longer down (pointercapture
      // means we still get pointerup even off-element, so this guards touch).
      if (e.buttons === 0) release();
    });
    key.addEventListener('pointercancel', release);

    return key;
  }

  _releasePointerNote() {
    const note = this._activePointerNote;
    this._activePointerNote = null;
    this.setKeyActive(note, false);
    this.onNoteOff(note);
  }

  /** Programmatically highlight/unhighlight a key (used for computer-keyboard and MIDI-driven notes). */
  setKeyActive(note, active) {
    const el = this._keyEls.get(note);
    if (!el) return;
    el.classList.toggle('active', active);
  }

  /** True if the note exists on this visible keyboard range. */
  hasNote(note) {
    return this._keyEls.has(note);
  }
}
