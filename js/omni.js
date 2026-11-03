/** omni.js - OMNI modular instrument designer: library, canvas, inspector, toolbar, performance input. */
import { MODULES, CATEGORIES, SIGNAL_COLORS } from './omni/modules.js';
import { defaultPatch, validatePatch, connectionError, LiveGraph, patchToSVG, defaultParams } from './omni/graph.js';
import { TEMPLATES, templatePreview } from './omni/templates.js';
import { PresetStore, downloadText, pickFile } from './shared/presetStore.js';
import { AudioRecorder } from './shared/audioRecorder.js';
import { MidiRecorder } from './shared/midiRecorder.js';
import { Keyboard } from '../ui/Keyboard.js';
import { PitchWheel, ModWheel } from '../ui/Wheel.js';
import { MidiManager, midiNoteName } from './engine/MidiManager.js';
import { noteToMidi, KEY_TO_SEMI } from './shared/panel.js';
import { registerMidiTarget, registerMidiTargetProvider } from './shared/midiMap.js';

const el = (tag, cls, parent, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; if (parent) parent.appendChild(n); return n; };
const uid = (p) => `${p}${Math.random().toString(36).slice(2, 8)}`;
const NS = 'http://www.w3.org/2000/svg';

class OmniApp {
  constructor() {
    this.store = new PresetStore({ key: 'overture.omni.patches', version: 2, validate: validatePatch, migrations: { 1: (stored) => ({ ...stored, version: 2 }) } });
    this.patch = defaultPatch();
    try {
      const communityImport = sessionStorage.getItem('overture.community.import');
      if (communityImport) {
        sessionStorage.removeItem('overture.community.import');
        this.patch = validatePatch(JSON.parse(communityImport));
        this.msgOnLoad = `Loaded "${this.patch.name}" from the community library.`;
      }
    } catch (error) {
      try { sessionStorage.removeItem('overture.community.import'); } catch { /* storage may be unavailable */ }
      console.warn('Could not open the community patch.', error);
    }
    this.octaveShift = 0; this.keyboardPointerNotes = new Map();
    this.pitchBend = 0; this.modWheelValue = 0; this._modKeyDirection = 0; this._modRampRAF = null;
    this.ctx = null; this.live = null; this.selected = null; this.selectedWire = null; this.pending = null;
    this.selectedModules = new Set(); this.clipboard = null; this.snapEnabled = true;
    this.audioRecorder = null; this.midiRecorder = new MidiRecorder();
    this.view = { x: 20, y: 20, scale: 0.66 }; this.history = []; this.future = []; this.rebuildTimer = null;
    this._build();
    this.render();
    this.setInitialView();
    this.pushHistory();
    if (this.msgOnLoad) this.msg(this.msgOnLoad);
    this._bindMidi();
    this._bindKeys();
  }

  // ------------------------------------------------------------------ layout
  _build() {
    const root = document.getElementById('omni-root');
    const bar = el('header', 'omni-app-header', root);
    const topbar = el('div', 'omni-topbar', bar);
    const brand = el('div', 'omni-logo', topbar);
    brand.innerHTML = '<a class="omni-logo-mark" href="/#omni" title="Back to Overture OMNI"><img src="/ui/Logos/OvertureLogo.png" alt="Overture"></a><span class="omni-logo-wording"><strong>OMNI</strong></span>';
    const project = el('label', 'omni-project', topbar);
    el('span', 'omni-project-label', project, 'INSTRUMENT');
    this.nameInput = el('input', 'omni-name', project); this.nameInput.value = this.patch.name; this.nameInput.placeholder = 'Untitled instrument'; this.nameInput.setAttribute('aria-label', 'Instrument name'); this.nameInput.addEventListener('change', () => { this.patch.name = this.nameInput.value.slice(0, 60) || 'Untitled'; this.nameInput.value = this.patch.name; this.pushHistory(); });
    this.status = el('div', 'omni-status', topbar, 'Ready. Power on the audio to hear the instrument.');
    const account = el('a', 'header-account omni-account', topbar);
    account.href = '/account'; account.setAttribute('aria-label', 'Log in to your Overture account');
    const accountLabel = el('span', 'header-account__label', account, 'LOG IN');

    const commandbar = el('nav', 'omni-commandbar', bar);
    commandbar.setAttribute('aria-label', 'OMNI menus');
    const group = (label) => {
      const details = el('details', 'omni-menu', commandbar);
      const summary = el('summary', 'omni-menu__trigger', details, label);
      summary.setAttribute('aria-label', `${label} menu`);
      const panel = el('div', 'omni-menu__panel', details);
      panel.setAttribute('role', 'group');
      panel.setAttribute('aria-label', `${label} commands`);
      return { details, panel };
    };
    const tb = (label, fn, title, parent, variant = '') => {
      const button = el('button', `omni-tb${variant ? ` ${variant}` : ''}`, parent, label);
      button.type = 'button';
      if (title) button.title = title;
      button.addEventListener('click', fn);
      return button;
    };
    const action = (menu, label, fn, title, variant = '') => {
      const button = tb(label, () => { menu.details.open = false; fn(); }, title, menu.panel, variant);
      button.classList.add('omni-menu__item');
      button.setAttribute('role', 'menuitem');
      return button;
    };
    const separator = (menu) => el('div', 'omni-menu__separator', menu.panel);

    const fileMenu = group('File');
    action(fileMenu, 'New patch', () => this.load(defaultPatch()), 'Create a new instrument');
    action(fileMenu, 'Templates…', () => this.templates(), 'Open the starter patch library');
    action(fileMenu, 'Save patch…', () => this.save(), 'Save this instrument in this browser', 'omni-menu__item--primary');
    const loadField = el('label', 'omni-menu__field', fileMenu.panel);
    el('span', '', loadField, 'OPEN SAVED PATCH');
    this.loadSel = el('select', 'omni-menu__select', loadField);
    this.loadSel.setAttribute('aria-label', 'Open saved instrument');
    this.loadSel.title = 'Open a saved instrument';
    this.loadSel.addEventListener('change', () => {
      const item = this.store.get(this.loadSel.value);
      if (item) this.load(JSON.parse(JSON.stringify(item.data)), item.id);
      this.loadSel.value = '';
      fileMenu.details.open = false;
    });
    this.refreshLoadList();
    action(fileMenu, 'Delete saved patch…', () => {
      if (!this.currentId) { this.msg('This patch has not been saved yet.'); return; }
      if (confirm('Delete the saved patch?')) {
        this.store.remove(this.currentId);
        this.currentId = null;
        this.refreshLoadList();
        this.msg('Saved patch deleted.');
      }
    }, 'Delete the current saved patch', 'omni-menu__item--danger');
    separator(fileMenu);
    action(fileMenu, 'Publish to Community…', () => this.publishToCommunity(), 'Publish this patch to the Overture community');
    action(fileMenu, 'Import patch JSON…', () => pickFile('.json,application/json', (text) => {
      try { const { data } = this.store.parseImport(text); this.load(data); this.msg('Patch imported.'); }
      catch (error) { this.msg(error.message, true); }
    }), 'Import an OMNI patch');
    action(fileMenu, 'Export patch JSON', () => downloadText(
      `${this.patch.name.replace(/\W+/g, '-') || 'omni'}.omni.json`,
      this.store.exportJSON({ name: this.patch.name, data: this.patch }),
    ), 'Export the current patch');
    action(fileMenu, 'Import library backup…', () => pickFile('.json,application/json', (text) => {
      try { const items = this.store.importAll(text); this.refreshLoadList(); this.msg(`Imported ${items.length} saved patch${items.length === 1 ? '' : 'es'}.`); }
      catch (error) { this.msg(error.message, true); }
    }), 'Import an OMNI library backup');
    action(fileMenu, 'Export library backup', () => downloadText('omni-library.json', this.store.exportAllJSON()), 'Export every saved OMNI patch');
    action(fileMenu, 'Export SVG schematic', () => downloadText(
      `${this.patch.name.replace(/\W+/g, '-') || 'omni'}.schematic.svg`,
      patchToSVG(this.patch),
      'image/svg+xml',
    ), 'Export the current patch as an SVG schematic');

    const editMenu = group('Edit');
    this.undoBtn = action(editMenu, 'Undo', () => this.undo(), 'Undo · Ctrl/⌘ Z');
    this.redoBtn = action(editMenu, 'Redo', () => this.redo(), 'Redo · Ctrl/⌘ Shift Z');
    separator(editMenu);
    action(editMenu, 'Select all modules', () => this.selectAllModules(), 'Select all · Ctrl/⌘ A');
    action(editMenu, 'Copy selection', () => this.copySelection(), 'Copy · Ctrl/⌘ C');
    action(editMenu, 'Paste selection', () => this.pasteSelection(), 'Paste · Ctrl/⌘ V');
    action(editMenu, 'Duplicate selection', () => this.duplicateSelection(), 'Duplicate · Ctrl/⌘ D');
    action(editMenu, 'Delete selection', () => this.deleteSelection(), 'Delete or Backspace', 'omni-menu__item--danger');

    const viewMenu = group('View');
    action(viewMenu, 'Zoom in', () => this.zoom(1.25), 'Zoom in');
    action(viewMenu, 'Zoom out', () => this.zoom(0.8), 'Zoom out');
    action(viewMenu, 'Fit patch to canvas', () => this.fitView(), 'Fit all modules in the canvas');
    this.snapBtn = action(viewMenu, 'Snap to grid: ON', () => this.toggleSnap(), 'Toggle module snapping');

    const audioMenu = group('Audio');
    this.audioRecordBtn = action(audioMenu, 'Record audio…', () => this.toggleAudioRecording(), 'Record the live OMNI output');
    this.midiRecordBtn = action(audioMenu, 'Record MIDI…', () => this.toggleMidiRecording(), 'Record keyboard and controller performance');
    separator(audioMenu);
    action(audioMenu, 'Panic · All notes off', () => this.allOff(), 'Stop all currently held notes');

    const midiMenu = group('MIDI');
    action(midiMenu, 'MIDI assignments…', () => document.querySelector('.oi-midi-tab')?.click(), 'Assign physical MIDI controls');
    action(midiMenu, 'Request MIDI access', () => this.midi?.init().then((ok) => {
      this.midiEl.textContent = ok ? (this.midi.isConnected ? `MIDI: ${this.midi.deviceNames.join(', ')}` : 'MIDI: no device') : 'MIDI: permission not granted';
    }), 'Connect a MIDI controller');

    const helpMenu = group('Help');
    action(helpMenu, 'OMNI guide…', () => this.guide(), 'Open the OMNI guide');
    action(helpMenu, 'Keyboard shortcuts', () => this.showShortcuts(), 'View performance and editing shortcuts');

    this.menuDetails = [...commandbar.querySelectorAll('.omni-menu')];
    document.addEventListener('pointerdown', (event) => {
      if (event.target?.closest?.('.omni-menu')) return;
      this.menuDetails.forEach((menu) => { menu.open = false; });
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      const openMenu = this.menuDetails.find((menu) => menu.open);
      if (openMenu) { openMenu.open = false; openMenu.querySelector('summary')?.focus(); }
    });
    const main = el('div', 'omni-main', root);
    // Library
    const lib = el('aside', 'omni-library', main);
    el('h2', '', lib, 'MODULES');
    el('p', 'omni-hint', lib, 'Click to add at the centre, or drag onto the canvas.');
    this.moduleSearch = el('input', 'omni-module-search', lib);
    this.moduleSearch.type = 'search'; this.moduleSearch.placeholder = 'Search modules…';
    this.moduleSearch.setAttribute('aria-label', 'Search OMNI modules');
    this.moduleGroups = [];
    CATEGORIES.forEach((cat) => {
      const heading = el('h3', '', lib, cat.toUpperCase());
      const buttons = [];
      Object.entries(MODULES).filter(([, d]) => d.category === cat).forEach(([type, d]) => {
        const b = el('button', 'omni-lib-item', lib, d.name); b.type = 'button'; b.style.setProperty('--c', d.color); b.draggable = true;
        b.dataset.moduleName = d.name.toLowerCase();
        b.addEventListener('click', () => this.addModule(type));
        b.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/omni-module', type); e.dataTransfer.effectAllowed = 'copy'; });
        buttons.push(b);
      });
      this.moduleGroups.push({ heading, buttons });
    });
    this.moduleSearch.addEventListener('input', () => this.filterModules());
    // Canvas
    this.canvas = el('div', 'omni-canvas', main); this.canvas.tabIndex = 0; this.canvas.setAttribute('aria-label', 'Patch canvas');
    const canvasHud = el('div', 'omni-canvas-hud', this.canvas);
    const canvasTitle = el('div', 'omni-canvas-hud__title', canvasHud);
    el('span', 'omni-canvas-hud__live', canvasTitle);
    el('span', '', canvasTitle, 'PATCH CANVAS');
    el('span', 'omni-canvas-hud__hint', canvasHud, 'DRAG TO PAN  ·  SCROLL TO ZOOM');
    this.world = el('div', 'omni-world', this.canvas);
    this.worldContent = el('div', 'omni-world-content', this.world);
    this.selectionRect = el('div', 'omni-selection-rect', this.canvas);
    this.wires = document.createElementNS(NS, 'svg'); this.wires.classList.add('omni-wires'); this.worldContent.appendChild(this.wires);
    this.cards = el('div', 'omni-cards', this.worldContent);
    this.canvas.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/omni-module')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    this.canvas.addEventListener('drop', (e) => { const type = e.dataTransfer.getData('text/omni-module'); if (!type) return; e.preventDefault(); const p = this.toWorld(e.clientX, e.clientY); this.addModule(type, p.x - 90, p.y - 20); });
    this._bindCanvas();
    // Inspector
    this.inspector = el('aside', 'omni-inspector', main);
    el('h2', '', this.inspector, 'INSPECTOR');
    this.inspBody = el('div', '', this.inspector);
    // Performance deck: compact transport, tactile wheels and a full-width keybed.
    const perf = el('section', 'omni-perf', root);
    const perfTop = el('div', 'omni-perf__top', perf);
    const perfTitle = el('div', 'omni-perf__title', perfTop);
    el('span', 'omni-perf__live', perfTitle);
    el('span', '', perfTitle, 'PERFORMANCE');
    const perfTools = el('div', 'omni-perf__tools', perfTop);
    this.powerBtn = el('button', 'omni-tb omni-power', perfTools, 'POWER ON');
    this.powerBtn.type = 'button';
    this.powerBtn.addEventListener('click', () => this.power());
    const master = el('label', 'omni-master', perfTools);
    el('span', '', master, 'MASTER');
    this.masterInput = el('input', '', master);
    this.masterInput.type = 'range';
    this.masterInput.min = 0; this.masterInput.max = 1; this.masterInput.step = 0.01;
    this.masterInput.value = this.patch.global.master;
    this.masterInput.setAttribute('aria-label', 'Master output level');
    this.masterInput.addEventListener('input', () => {
      this.patch.global.master = Number(this.masterInput.value);
      if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.patch.global.master, this.ctx.currentTime, 0.01);
    });
    registerMidiTarget(this.masterInput, {
      id: 'omni::master', label: 'MASTER', group: 'OUTPUT',
      get: () => Number(this.masterInput.value),
      set: (value) => { this.masterInput.value = value; this.masterInput.dispatchEvent(new Event('input')); },
    });
    const panic = el('button', 'omni-tb omni-panic', perfTools, 'PANIC');
    panic.type = 'button';
    panic.addEventListener('click', () => this.allOff());
    this.midiEl = el('span', 'omni-midi', perfTop, 'MIDI: searching…');

    const perfDeck = el('div', 'omni-perf__deck', perf);
    const wheelBank = el('div', 'omni-wheel-bank', perfDeck);
    const pitchWrap = el('div', 'omni-wheel-control', wheelBank);
    el('span', 'omni-wheel-control__title', pitchWrap, 'PITCH');
    this.pitchWheel = new PitchWheel({ onChange: (value) => {
      this.pitchBend = value;
      this.live?.setPitchBend(value * 2);
    } });
    pitchWrap.append(this.pitchWheel.el);
    const modWrap = el('div', 'omni-wheel-control', wheelBank);
    el('span', 'omni-wheel-control__title', modWrap, 'MOD');
    this.modWheel = new ModWheel({ onChange: (value) => {
      this.modWheelValue = value;
      this.live?.setModWheel(value);
    } });
    modWrap.append(this.modWheel.el);
    registerMidiTarget(this.pitchWheel.el, {
      id: 'omni::pitch-bend', label: 'PITCH BEND', group: 'PERFORMANCE',
      get: () => (this.pitchWheel.value + 1) / 2,
      set: (value) => this.pitchWheel.setExternalValue(value * 2 - 1),
    });
    registerMidiTarget(this.modWheel.el, {
      id: 'omni::mod-wheel', label: 'MOD WHEEL', group: 'PERFORMANCE',
      get: () => this.modWheel.value,
      set: (value) => this.modWheel.setExternalValue(value),
    });

    const keyboardGroup = el('div', 'omni-key-group', perfDeck);
    const keyboardMeta = el('div', 'omni-key-group__head', keyboardGroup);
    const keyboardIdentity = el('div', 'omni-key-group__identity', keyboardMeta);
    el('span', 'omni-key-group__title', keyboardIdentity, 'BUILT-IN KEYBOARD');
    el('span', 'omni-key-group__hint', keyboardIdentity, 'C2 – C6');
    const kbWrap = el('div', 'omni-keys', keyboardGroup);
    this.keyboard = new Keyboard({
      startOctave: 2,
      octaves: 4,
      onNoteOn: (note, velocity) => {
        const midi = noteToMidi(note) + this.octaveShift * 12;
        this.keyboardPointerNotes.set(note, midi);
        this.noteOn(midi, velocity, 1, note);
      },
      onNoteOff: (note) => {
        const midi = this.keyboardPointerNotes.get(note) ?? (noteToMidi(note) + this.octaveShift * 12);
        this.keyboardPointerNotes.delete(note);
        this.noteOff(midi, 1, note);
      },
    });
    kbWrap.appendChild(this.keyboard.el);

    const octavePanel = el('div', 'omni-octave', keyboardMeta);
    el('span', 'omni-octave__title', octavePanel, 'OCTAVE');
    const octaveButtons = el('div', 'omni-octave__buttons', octavePanel);
    this.octaveDownBtn = el('button', 'omni-octave__step', octaveButtons, '−');
    this.octaveDownBtn.type = 'button';
    this.octaveDownBtn.setAttribute('aria-label', 'Shift keyboard down one octave');
    this.octaveDownBtn.addEventListener('click', () => this.setKeyboardOctave(this.octaveShift - 1));
    this.octaveReadout = el('output', 'omni-octave__readout', octaveButtons, '0');
    this.octaveUpBtn = el('button', 'omni-octave__step', octaveButtons, '+');
    this.octaveUpBtn.type = 'button';
    this.octaveUpBtn.setAttribute('aria-label', 'Shift keyboard up one octave');
    this.octaveUpBtn.addEventListener('click', () => this.setKeyboardOctave(this.octaveShift + 1));
    el('span', 'omni-octave__hint', octavePanel, '− / +');
    this.setKeyboardOctave(0);
    registerMidiTargetProvider(() => [{
      id: 'omni::keyboard-octave', label: 'KEYBOARD OCTAVE', group: 'PERFORMANCE',
      get: () => (this.octaveShift + 3) / 6,
      set: (value) => this.setKeyboardOctave(Math.round(value * 6) - 3),
    }]);
    // Every numeric module parameter is assignable, even when its module is not in the inspector.
    registerMidiTargetProvider(() => {
      const out = [];
      this.patch.modules.forEach((m) => {
        const def = MODULES[m.type]; if (!def) return;
        def.params.forEach((p) => {
          if (p.options) return;
          const log = !!p.log;
          const norm = (v) => (log ? (Math.log(v) - Math.log(p.min)) / (Math.log(p.max) - Math.log(p.min)) : (v - p.min) / (p.max - p.min));
          const denorm = (t) => { let v = log ? Math.exp(Math.log(p.min) + t * (Math.log(p.max) - Math.log(p.min))) : p.min + t * (p.max - p.min); if (p.step) v = Math.round(v / p.step) * p.step; return Math.min(p.max, Math.max(p.min, v)); };
          out.push({ id: `omni::${m.id}::${p.key}`, label: p.label, group: `${def.name} (${m.id})`, el: document.getElementById(`p-${m.id}-${p.key}`),
            get: () => norm(m.params[p.key]),
            set: (t) => { const v = denorm(t); this.setParam(m.id, p.key, v, false); const inp = document.getElementById(`p-${m.id}-${p.key}`); if (inp) { inp.value = log ? Math.log(v) : v; const o = inp.parentElement?.querySelector('output'); if (o) o.textContent = v.toFixed(p.step === 1 ? 0 : 2); } } });
        });
      });
      this.patch.macros.forEach((macro) => {
        out.push({
          id: `omni::macro::${macro.id}`, label: macro.name, group: 'MACROS',
          get: () => macro.value,
          set: (value) => {
            macro.value = Math.min(1, Math.max(0, value));
            this.applyMacro(macro);
            const input = document.getElementById(`macro-${macro.id}`);
            if (input) {
              input.value = macro.value;
              const output = input.parentElement?.querySelector('output');
              if (output) output.textContent = Math.round(macro.value * 100).toString();
            }
          },
        });
      });
      return out;
    });
  }

  msg(text, error = false) { this.status.textContent = text; this.status.classList.toggle('is-error', error); }

  filterModules() {
    const query = this.moduleSearch.value.trim().toLowerCase();
    this.moduleGroups.forEach(({ heading, buttons }) => {
      let visible = 0;
      buttons.forEach((button) => {
        const match = !query || button.dataset.moduleName.includes(query);
        button.hidden = !match;
        if (match) visible += 1;
      });
      heading.hidden = visible === 0;
    });
  }

  toggleSnap() {
    this.snapEnabled = !this.snapEnabled;
    this.snapBtn.textContent = `Snap to grid: ${this.snapEnabled ? 'ON' : 'OFF'}`;
    this.msg(this.snapEnabled ? 'Module snapping enabled.' : 'Module snapping disabled.');
  }

  snapCoordinate(value) {
    return this.snapEnabled ? Math.round(value / 28) * 28 : value;
  }

  setInitialView() {
    const modules = [...this.cards.querySelectorAll('.omni-module')];
    if (!modules.length) {
      this.view = { x: 20, y: 20, scale: 0.66 };
      this.applyView();
      return;
    }
    const bounds = modules.map((card) => ({
      x: Number.parseFloat(card.style.left) || 0,
      y: Number.parseFloat(card.style.top) || 0,
      width: card.offsetWidth || 210,
      height: card.offsetHeight || 110,
    }));
    const minX = Math.min(...bounds.map((item) => item.x));
    const minY = Math.min(...bounds.map((item) => item.y));
    const maxX = Math.max(...bounds.map((item) => item.x + item.width));
    const maxY = Math.max(...bounds.map((item) => item.y + item.height));
    const scale = 0.66;
    this.view = {
      scale,
      x: (this.canvas.clientWidth - (maxX - minX) * scale) / 2 - minX * scale,
      y: (this.canvas.clientHeight - (maxY - minY) * scale) / 2 - minY * scale,
    };
    this.applyView();
  }

  fitView() {
    const modules = [...this.cards.querySelectorAll('.omni-module')];
    if (!modules.length) {
      this.view = { x: 20, y: 20, scale: 1 };
      this.applyView();
      return;
    }
    const bounds = modules.map((card) => ({
      x: Number.parseFloat(card.style.left) || 0,
      y: Number.parseFloat(card.style.top) || 0,
      width: card.offsetWidth || 180,
      height: card.offsetHeight || 100,
    }));
    const minX = Math.min(...bounds.map((item) => item.x));
    const minY = Math.min(...bounds.map((item) => item.y));
    const maxX = Math.max(...bounds.map((item) => item.x + item.width));
    const maxY = Math.max(...bounds.map((item) => item.y + item.height));
    const width = Math.max(1, maxX - minX), height = Math.max(1, maxY - minY);
    const availableWidth = Math.max(120, this.canvas.clientWidth - 72);
    const availableHeight = Math.max(100, this.canvas.clientHeight - 72);
    const scale = Math.min(2.5, Math.max(0.3, Math.min(availableWidth / width, availableHeight / height)));
    this.view = {
      scale,
      x: (this.canvas.clientWidth - width * scale) / 2 - minX * scale,
      y: (this.canvas.clientHeight - height * scale) / 2 - minY * scale,
    };
    this.applyView();
  }

  recordingName(extension) {
    const stem = (this.patch.name || 'overture-patch').trim().toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'overture-patch';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${stem}-${stamp}.${extension}`;
  }

  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = el('a', '', document.body);
    link.href = url; link.download = filename; link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  async toggleAudioRecording() {
    if (this.audioRecorder?.recording) { await this.stopAudioRecording(); return; }
    if (!this.ctx || !this.master || !this.live) {
      this.msg('Power on OMNI audio before recording.', true); return;
    }
    try {
      this.audioRecorder = new AudioRecorder(this.ctx, this.master);
      this.audioRecorder.start();
      this.audioRecordBtn.textContent = 'STOP AUDIO';
      this.audioRecordBtn.classList.add('is-recording');
      this.msg('Recording OMNI audio output…');
    } catch (error) {
      this.audioRecorder = null;
      this.audioRecordBtn.textContent = 'AUDIO REC';
      this.audioRecordBtn.classList.remove('is-recording');
      this.msg(error.message || 'Audio recording could not start.', true);
    }
  }

  async stopAudioRecording() {
    const recorder = this.audioRecorder;
    if (!recorder) return;
    this.audioRecorder = null;
    try {
      const blob = await recorder.stop();
      if (!blob?.size) { this.msg('The audio recording was empty.', true); return; }
      const mime = (blob.type || '').toLowerCase();
      const extension = mime.includes('ogg') ? 'ogg' : mime.includes('webm') ? 'webm' : mime.includes('mp4') ? 'm4a' : 'dat';
      this.downloadBlob(blob, this.recordingName(extension));
      this.msg(`Audio recording saved (${(blob.size / (1024 * 1024)).toFixed(2)} MB).`);
    } catch (error) {
      this.msg(error.message || 'Audio recording could not be finalised.', true);
    } finally {
      this.audioRecordBtn.textContent = 'AUDIO REC';
      this.audioRecordBtn.classList.remove('is-recording');
    }
  }

  toggleMidiRecording() {
    if (this.midiRecorder.recording) {
      const bytes = this.midiRecorder.stop();
      this.midiRecordBtn.textContent = 'MIDI REC';
      this.midiRecordBtn.classList.remove('is-recording');
      if (!bytes) { this.msg('No MIDI notes were recorded.'); return; }
      this.downloadBlob(new Blob([bytes], { type: 'audio/midi' }), this.recordingName('mid'));
      this.msg('MIDI performance exported.');
      return;
    }
    if (this.ctx) this.midiRecorder.clock = () => this.ctx?.currentTime ?? performance.now() / 1000;
    if (!this.ctx || !this.live) { this.msg('Power on audio before recording MIDI so note timing uses the audio clock.', true); return; }
    this.midiRecorder.clock = () => this.ctx?.currentTime ?? 0;
    this.midiRecorder.start();
    this.midiRecordBtn.textContent = 'SAVE MIDI';
    this.midiRecordBtn.classList.add('is-recording');
    this.msg('Recording keyboard and MIDI input…');
  }

  publishToCommunity() {
    try {
      sessionStorage.setItem('overture.community.draft', JSON.stringify(this.patch));
      window.location.assign('/community?publish=1');
    } catch (error) {
      this.msg(`Could not prepare this patch for publishing: ${error.message}`, true);
    }
  }

  applyMacro(macro) {
    const value = Math.min(1, Math.max(0, Number(macro.value) || 0));
    macro.bindings.forEach((binding) => {
      const module = this.patch.modules.find((item) => item.id === binding.moduleId);
      if (!module) return;
      const parameter = MODULES[module.type].params.find((item) => item.key === binding.paramKey);
      if (!parameter) return;
      const next = parameter.log
        ? Math.exp(Math.log(binding.min) + value * (Math.log(binding.max) - Math.log(binding.min)))
        : binding.min + value * (binding.max - binding.min);
      this.setParam(module.id, binding.paramKey, next, false);
      const input = document.getElementById(`p-${module.id}-${binding.paramKey}`);
      if (input) {
        input.value = parameter.log ? Math.log(next) : next;
        const output = input.parentElement?.querySelector('output');
        if (output) output.textContent = Number(next).toFixed(parameter.step === 1 ? 0 : 2);
      }
    });
  }

  openMacros() {
    const overlay = el('div', 'omni-guide', document.body);
    const card = el('div', 'omni-guide-card omni-macros', overlay);
    el('h2', '', card, 'Macro controls');
    el('p', 'omni-hint', card, 'A macro can control several numeric parameters at once. Bind a target, then move its slider or assign that macro to a MIDI CC.');
    const list = el('div', 'omni-macro-list', card);
    const render = () => {
      list.replaceChildren();
      this.patch.macros.forEach((macro, index) => {
        const row = el('section', 'omni-macro', list);
        const head = el('div', 'omni-macro__head', row);
        const name = el('input', 'omni-module-search', head);
        name.value = macro.name; name.maxLength = 32; name.setAttribute('aria-label', 'Macro name');
        name.addEventListener('change', () => { macro.name = name.value.trim().slice(0, 32) || `Macro ${index + 1}`; this.pushHistory(); });
        const remove = el('button', 'omni-tb omni-tb--danger', head, 'REMOVE');
        remove.type = 'button'; remove.addEventListener('click', () => {
          this.patch.macros = this.patch.macros.filter((item) => item.id !== macro.id);
          this.pushHistory(); render();
        });
        const control = el('label', 'omni-macro__control', row);
        const slider = el('input', '', control); slider.type = 'range'; slider.min = 0; slider.max = 1; slider.step = 0.001;
        slider.value = macro.value; slider.id = `macro-${macro.id}`;
        const value = el('output', '', control, Math.round(macro.value * 100).toString());
        slider.addEventListener('input', () => {
          macro.value = Number(slider.value);
          value.textContent = Math.round(macro.value * 100).toString();
          this.applyMacro(macro);
        });
        slider.addEventListener('change', () => this.pushHistory());

        const bindings = el('div', 'omni-macro__bindings', row);
        macro.bindings.forEach((binding) => {
          const targetModule = this.patch.modules.find((item) => item.id === binding.moduleId);
          const definition = targetModule && MODULES[targetModule.type];
          const parameter = definition?.params.find((item) => item.key === binding.paramKey);
          const chip = el('span', 'omni-macro__chip', bindings, `${definition?.name || targetModule?.type || 'Missing'} · ${parameter?.label || binding.paramKey}`);
          const unbind = el('button', '', chip, '×'); unbind.type = 'button';
          unbind.setAttribute('aria-label', 'Remove macro binding');
          unbind.addEventListener('click', () => {
            macro.bindings = macro.bindings.filter((item) => item !== binding);
            this.pushHistory(); render();
          });
        });

        const bindRow = el('div', 'omni-macro__bind', row);
        const select = el('select', '', bindRow);
        const placeholder = el('option', '', select, 'Choose a parameter…'); placeholder.value = '';
        this.patch.modules.forEach((module) => {
          const definition = MODULES[module.type];
          definition.params.filter((parameter) => !parameter.options).forEach((parameter) => {
            const option = el('option', '', select, `${definition.name} · ${parameter.label}`);
            option.value = `${module.id}::${parameter.key}`;
          });
        });
        const bind = el('button', 'omni-tb', bindRow, 'BIND');
        bind.type = 'button';
        bind.addEventListener('click', () => {
          const [moduleId, paramKey] = select.value.split('::');
          const module = this.patch.modules.find((item) => item.id === moduleId);
          const parameter = module && MODULES[module.type].params.find((item) => item.key === paramKey);
          if (!module || !parameter || macro.bindings.some((item) => item.moduleId === moduleId && item.paramKey === paramKey)) return;
          macro.bindings.push({ moduleId, paramKey, min: parameter.min, max: parameter.max });
          this.pushHistory(); render();
          this.msg(`Bound ${parameter.label} to ${macro.name}.`);
        });
      });
    };
    const add = el('button', 'omni-tb omni-tb--primary', card, 'ADD MACRO');
    add.type = 'button';
    add.disabled = this.patch.macros.length >= 8;
    add.addEventListener('click', () => {
      this.patch.macros.push({ id: uid('macro'), name: `Macro ${this.patch.macros.length + 1}`, value: 0, bindings: [] });
      this.pushHistory(); render();
    });
    render();
    const close = el('button', '', card, 'CLOSE'); close.type = 'button'; close.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.remove(); });
  }

  refreshLoadList() { this.loadSel.replaceChildren(); const o = el('option', '', this.loadSel, 'LOAD…'); o.value = ''; this.store.items.forEach((it) => { const op = el('option', '', this.loadSel, it.name); op.value = it.id; }); }

  // ------------------------------------------------------------------ audio
  async power() {
    if (this.ctx) {
      await this.stopAudioRecording();
      if (this.midiRecorder.recording) this.toggleMidiRecording();
      clearTimeout(this.rebuildTimer);
      this.live?.teardown(); this.live = null;
      const oldContext = this.ctx; this.ctx = null; this.master = null;
      await oldContext.close();
      this.powerBtn.textContent = 'POWER ON'; this.powerBtn.classList.remove('lit'); this.msg('Audio off.'); return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; this.ctx = new AC({ latencyHint: 'interactive' }); await this.ctx.resume();
      this.master = this.ctx.createGain(); this.master.gain.value = this.patch.global.master; this.master.connect(this.ctx.destination);
      this.live = new LiveGraph(this.ctx, this.master, { onNoteEvent: (event) => this._recordGraphNote(event) });
      await this.live.build(this.patch);
      this.live.setPitchBend(this.pitchBend * 2);
      this.live.setModWheel(this.modWheelValue);
      this.powerBtn.textContent = 'POWER OFF'; this.powerBtn.classList.add('lit'); this.msg('Audio running - play the keyboard or your MIDI controller.');
    } catch (err) { this.msg(`Audio could not start: ${err.message}`, true); }
  }
  scheduleRebuild() {
    if (!this.live) return;
    clearTimeout(this.rebuildTimer);
    this.rebuildTimer = setTimeout(async () => {
      try { await this.live.build(this.patch); }
      catch (err) { this.msg(`Graph error: ${err.message}`, true); }
    }, 60);
  }
  _recordGraphNote(event) {
    if (!this.midiRecorder.recording || !event || !Number.isFinite(event.note)) return;
    const options = { time: Number.isFinite(event.time) ? event.time : this.ctx?.currentTime, channel: event.channel || 1 };
    if (event.on) this.midiRecorder.noteOn(event.note, event.velocity ?? 0.8, options);
    else this.midiRecorder.noteOff(event.note, options);
  }

  noteOn(midi, vel, channel = 1, visualNote = null) {
    this.keyboard.setKeyActive(visualNote || midiNoteName(midi), true);
    this.live?.noteOn(midi, vel, channel);
  }

  noteOff(midi, channel = 1, visualNote = null) {
    this.keyboard.setKeyActive(visualNote || midiNoteName(midi), false);
    this.live?.noteOff(midi, channel);
  }
  allOff() { this.live?.allOff(); this.keyboardPointerNotes.clear(); this._stopModWheelRamp(); this.keyboard.el.querySelectorAll('.lp-key.active').forEach((k) => k.classList.remove('active')); }

  _bindMidi() {
    this.midi = new MidiManager({
      onNoteOn: (n, v, channel) => this.noteOn(n, v, channel),
      onNoteOff: (n, channel) => this.noteOff(n, channel),
      onAllNotesOff: () => this.allOff(), onAllSoundOff: () => this.allOff(),
      onControlChange: (controller, value, channel) => this.midiRecorder.controlChange(controller, value, { channel, time: this.ctx?.currentTime }),
      onPitchBend: (_range, normalized, channel, raw) => { this.pitchWheel.setExternalValue(normalized); this.midiRecorder.pitchBend(raw, { channel, time: this.ctx?.currentTime }); },
      onModWheel: (value) => this.modWheel.setExternalValue(value),
      onAftertouch: (value, channel) => this.midiRecorder.aftertouch(Math.round(value * 127), { channel, time: this.ctx?.currentTime }),
      onPolyAftertouch: (note, value, channel) => this.midiRecorder.polyAftertouch(note, Math.round(value * 127), { channel, time: this.ctx?.currentTime }),
      onProgramChange: (program, channel) => this.midiRecorder.programChange(program, { channel, time: this.ctx?.currentTime }),
      onConnectionChange: (c, _n, names) => { this.midiEl.textContent = c ? `MIDI: ${names.join(', ')}` : 'MIDI: no device'; },
    });
    this.midi.init().then((ok) => { if (!ok) this.midiEl.textContent = this.midi.supported ? 'MIDI: permission not granted' : 'MIDI: not supported'; else if (!this.midi.isConnected) this.midiEl.textContent = 'MIDI: no device'; });
  }

  setKeyboardOctave(value) {
    this.octaveShift = Math.max(-3, Math.min(3, Math.round(Number(value) || 0)));
    if (this.octaveReadout) this.octaveReadout.textContent = this.octaveShift > 0 ? `+${this.octaveShift}` : String(this.octaveShift);
    if (this.octaveDownBtn) this.octaveDownBtn.disabled = this.octaveShift <= -3;
    if (this.octaveUpBtn) this.octaveUpBtn.disabled = this.octaveShift >= 3;
    if (this.octaveReadout) this.octaveReadout.title = `Keyboard octave shift: ${this.octaveShift > 0 ? '+' : ''}${this.octaveShift}`;
  }

  _startModWheelRamp(direction) {
    this._modKeyDirection = direction;
    if (this._modRampRAF) return;
    let previous = performance.now();
    const step = (now) => {
      if (!this._modKeyDirection) { this._modRampRAF = null; return; }
      const elapsed = Math.min(0.05, Math.max(0, (now - previous) / 1000));
      previous = now;
      this.modWheel.setExternalValue(this.modWheel.value + this._modKeyDirection * elapsed * 1.4);
      this._modRampRAF = requestAnimationFrame(step);
    };
    this._modRampRAF = requestAnimationFrame(step);
  }

  _stopModWheelRamp() {
    this._modKeyDirection = 0;
    if (this._modRampRAF) cancelAnimationFrame(this._modRampRAF);
    this._modRampRAF = null;
  }

  _bindKeys() {
    const held = new Map();
    const isTyping = (target) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || target?.isContentEditable;
    window.addEventListener('keydown', (e) => {
      const typing = isTyping(e.target);
      if ((e.ctrlKey || e.metaKey) && !typing) {
        const key = e.key.toLowerCase();
        if (key === 'z') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
        if (key === 'a') { e.preventDefault(); this.selectAllModules(); return; }
        if (key === 'c' && (this.selectedModules.size || this.selected)) { e.preventDefault(); this.copySelection(); return; }
        if (key === 'v' && this.clipboard) { e.preventDefault(); this.pasteSelection(); return; }
        if (key === 'd' && (this.selectedModules.size || this.selected)) { e.preventDefault(); this.duplicateSelection(); return; }
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Tab' && !e.repeat) { e.preventDefault(); this.pitchWheel.setExternalValue(1); return; }
      if (e.key === 'Shift' && e.location === KeyboardEvent.DOM_KEY_LOCATION_LEFT && !e.repeat) {
        e.preventDefault(); this.pitchWheel.setExternalValue(-1); return;
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (!e.repeat) this._startModWheelRamp(e.key === 'ArrowUp' ? 1 : -1);
        return;
      }
      if (e.repeat) return;
      if (e.key === '-' || e.key === '_') { this.setKeyboardOctave(this.octaveShift - 1); return; }
      if (e.key === '=' || e.key === '+') { this.setKeyboardOctave(this.octaveShift + 1); return; }
      if (e.target?.closest?.('button, a, summary, select, [role="menuitem"]')) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.selectedWire) this.removeConnection(this.selectedWire);
        else if (this.selectedModules.size || this.selected) this.deleteSelection();
        return;
      }
      if (e.key === 'Escape') { this.pending = null; this.renderWires(); this.allOff(); return; }
      const semi = KEY_TO_SEMI[e.key.toLowerCase()];
      if (semi === undefined || held.has(e.code || e.key)) return;
      const baseNote = 48 + semi;
      const midi = baseNote + this.octaveShift * 12;
      const visualNote = midiNoteName(baseNote);
      held.set(e.code || e.key, { midi, visualNote });
      this.noteOn(midi, 0.8, 1, visualNote);
    });
    window.addEventListener('keyup', (e) => {
      const key = e.code || e.key;
      const heldNote = held.get(key);
      if (heldNote) {
        held.delete(key);
        this.noteOff(heldNote.midi, 1, heldNote.visualNote);
      }
      if (e.key === 'Tab' || (e.key === 'Shift' && e.location === KeyboardEvent.DOM_KEY_LOCATION_LEFT)) {
        this.pitchWheel.springReturnToCenter();
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if ((e.key === 'ArrowUp' && this._modKeyDirection === 1) || (e.key === 'ArrowDown' && this._modKeyDirection === -1)) this._stopModWheelRamp();
      }
    });
    window.addEventListener('blur', () => {
      held.forEach(({ midi, visualNote }) => this.noteOff(midi, 1, visualNote));
      held.clear();
      this.pitchWheel.springReturnToCenter();
      this._stopModWheelRamp();
      this.allOff();
    });
  }

  // ------------------------------------------------------------------ patch editing
  pushHistory() { this.history.push(JSON.stringify(this.patch)); if (this.history.length > 60) this.history.shift(); this.future = []; this.refreshHistoryButtons(); }
  refreshHistoryButtons() { this.undoBtn.disabled = this.history.length <= 1; this.redoBtn.disabled = !this.future.length; }
  undo() { if (this.history.length <= 1) return; this.future.push(this.history.pop()); this.patch = JSON.parse(this.history[this.history.length - 1]); this.afterLoad(); }
  redo() { if (!this.future.length) return; const s = this.future.pop(); this.history.push(s); this.patch = JSON.parse(s); this.afterLoad(); }
  afterLoad() { this.selected = null; this.selectedModules.clear(); this.selectedWire = null; this.nameInput.value = this.patch.name; this.masterInput.value = this.patch.global.master; this.render(); this.scheduleRebuild(); this.refreshHistoryButtons(); }
  load(patch, id = null) { try { this.patch = validatePatch(patch); this.currentId = id; this.afterLoad(); this.setInitialView(); this.pushHistory(); } catch (err) { this.msg(err.message, true); } }
  save() { const existing = this.currentId ? this.store.get(this.currentId) : null; const name = prompt('Instrument name', existing?.name || this.patch.name); if (name === null) return; this.patch.name = name.slice(0, 60) || 'Untitled'; this.nameInput.value = this.patch.name; const it = this.store.save(this.patch.name, this.patch, existing?.id); this.currentId = it.id; this.refreshLoadList(); this.msg(`Saved "${it.name}".`); }

  addModule(type, x, y) {
    const def = MODULES[type];
    if (def.single && this.patch.modules.some((m) => m.type === type)) { this.msg('Only one Audio Output per instrument.', true); return; }
    const centre = this.toWorld(this.canvas.clientWidth / 2 + this.canvas.getBoundingClientRect().left, this.canvas.clientHeight / 2 + this.canvas.getBoundingClientRect().top);
    const rawX = x ?? centre.x - 90 + (this.patch.modules.length % 4) * 18;
    const rawY = y ?? centre.y - 40 + (this.patch.modules.length % 4) * 18;
    const m = { id: uid(type.slice(0, 3)), type, x: this.snapCoordinate(rawX), y: this.snapCoordinate(rawY), params: defaultParams(type) };
    this.patch.modules.push(m); this.selected = m.id; this.selectedModules = new Set([m.id]); this.render(); this.scheduleRebuild(); this.pushHistory(); this.msg(`Added ${def.name}.`);
  }
  removeModule(id) {
    this.patch.modules = this.patch.modules.filter((m) => m.id !== id);
    this.patch.connections = this.patch.connections.filter((c) => c.from.module !== id && c.to.module !== id);
    this.selected = null; this.selectedModules.delete(id);
    this.render(); this.scheduleRebuild(); this.pushHistory();
  }

  copySelection() {
    const ids = this.selectedModules.size ? this.selectedModules : (this.selected ? new Set([this.selected]) : new Set());
    if (!ids.size) return false;
    this.clipboard = {
      modules: this.patch.modules.filter((m) => ids.has(m.id)).map((m) => JSON.parse(JSON.stringify(m))),
      connections: this.patch.connections.filter((c) => ids.has(c.from.module) && ids.has(c.to.module)).map((c) => JSON.parse(JSON.stringify(c))),
    };
    this.msg(`Copied ${this.clipboard.modules.length} modules.`);
    return true;
  }

  pasteSelection() {
    if (!this.clipboard?.modules?.length) return false;
    const copied = this.clipboard.modules.filter((m) => !MODULES[m.type].single);
    if (!copied.length) { this.msg('The Audio Output module cannot be duplicated.', true); return false; }
    const idMap = new Map(copied.map((m) => [m.id, uid(m.type.slice(0, 3))]));
    const modules = copied.map((m) => ({
      ...JSON.parse(JSON.stringify(m)), id: idMap.get(m.id),
      x: m.x + 28, y: m.y + 28, params: { ...m.params },
    }));
    const connections = this.clipboard.connections
      .filter((c) => idMap.has(c.from.module) && idMap.has(c.to.module))
      .map((c) => ({ id: uid('c'), from: { module: idMap.get(c.from.module), port: c.from.port }, to: { module: idMap.get(c.to.module), port: c.to.port } }));
    this.patch.modules.push(...modules);
    this.patch.connections.push(...connections);
    this.selectedModules = new Set(modules.map((m) => m.id));
    this.selected = modules.length === 1 ? modules[0].id : null;
    this.selectedWire = null;
    this.render(); this.scheduleRebuild(); this.pushHistory();
    this.msg(`Pasted ${modules.length} modules.`);
    return true;
  }

  duplicateSelection() {
    if (!this.copySelection()) return false;
    return this.pasteSelection();
  }

  deleteSelection() {
    const ids = new Set(this.selectedModules);
    if (!ids.size && this.selected) ids.add(this.selected);
    if (!ids.size) return false;
    this.patch.modules = this.patch.modules.filter((m) => !ids.has(m.id));
    this.patch.connections = this.patch.connections.filter((c) => !ids.has(c.from.module) && !ids.has(c.to.module));
    this.selectedModules.clear(); this.selected = null; this.selectedWire = null;
    this.render(); this.scheduleRebuild(); this.pushHistory();
    this.msg(`Deleted ${ids.size} modules.`);
    return true;
  }

  selectAllModules() {
    this.selectedModules = new Set(this.patch.modules.map((m) => m.id));
    this.selected = this.selectedModules.size === 1 ? [...this.selectedModules][0] : null;
    this.selectedWire = null;
    this.renderSelection(); this.renderInspector();
  }

  duplicateModule(id) {
    const m = this.patch.modules.find((item) => item.id === id);
    if (!m || MODULES[m.type].single) return;
    this.selectedModules = new Set([id]); this.selected = id;
    this.duplicateSelection();
  }
  tryConnect(from, to) {
    const byId = Object.fromEntries(this.patch.modules.map((m) => [m.id, m]));
    const err = connectionError(byId, from, to, this.patch.connections);
    if (err) { this.msg(`Cannot connect: ${err}`, true); return false; }
    this.patch.connections.push({ id: uid('c'), from, to }); this.render(); this.scheduleRebuild(); this.pushHistory(); this.msg('Connected.'); return true;
  }
  removeConnection(id) { this.patch.connections = this.patch.connections.filter((c) => c.id !== id); this.selectedWire = null; this.selected = null; this.selectedModules.clear(); this.render(); this.scheduleRebuild(); this.pushHistory(); }
  setParam(id, key, value, commit) {
    const m = this.patch.modules.find((x) => x.id === id); if (!m) return; m.params[key] = value;
    if (this.live) { const ok = this.live.setParam(id, key, value); if (!ok) this.scheduleRebuild(); }
    if (commit) this.pushHistory();
  }

  // ------------------------------------------------------------------ canvas
  toWorld(cx, cy) { const r = this.canvas.getBoundingClientRect(); return { x: (cx - r.left - this.view.x) / this.view.scale, y: (cy - r.top - this.view.y) / this.view.scale }; }
  applyView() {
    // Pan with layout positioning rather than a transformed compositing layer.
    // Zoom is applied as layout zoom to the inner world so text, borders, ports,
    // and SVG wires are re-rasterized sharply at the current scale instead of
    // being enlarged from a cached texture.
    this.world.style.left = `${this.view.x}px`;
    this.world.style.top = `${this.view.y}px`;
    this.world.style.transform = 'none';
    this.worldContent.style.zoom = String(this.view.scale);

    // Keep the canvas grid aligned with the same world-space pan and zoom.
    const gridSize = Math.max(12, 28 * this.view.scale);
    this.canvas.style.setProperty('--omni-grid-x', `${this.view.x}px`);
    this.canvas.style.setProperty('--omni-grid-y', `${this.view.y}px`);
    this.canvas.style.setProperty('--omni-grid-size', `${gridSize}px`);
  }
  zoom(f, cx, cy) { const r = this.canvas.getBoundingClientRect(); const px = cx ?? r.width / 2; const py = cy ?? r.height / 2; const next = Math.min(2.5, Math.max(0.3, this.view.scale * f)); this.view.x = px - (px - this.view.x) * (next / this.view.scale); this.view.y = py - (py - this.view.y) * (next / this.view.scale); this.view.scale = next; this.applyView(); }

  _bindCanvas() {
    let drag = null;
    this.canvas.addEventListener('pointerdown', (e) => {
      const port = e.target.closest('.omni-port'), card = e.target.closest('.omni-module'), wire = e.target.closest('.omni-wire');
      if (port) {
        e.preventDefault();
        const ref = { module: port.dataset.module, port: port.dataset.port };
        if (port.dataset.dir === 'out') {
          drag = { kind: 'wire', from: ref, x: e.clientX, y: e.clientY };
          this.pending = ref; this.highlightTargets(ref); this.canvas.setPointerCapture(e.pointerId);
        } else if (this.pending) {
          this.tryConnect(this.pending, ref); this.pending = null; this.highlightTargets(null);
        } else this.msg('Drag from an output port to an input port, or click an output first.');
        return;
      }
      if (wire) {
        this.selectedWire = wire.dataset.id; this.selected = null; this.selectedModules.clear();
        this.renderWires(); this.renderInspector(); return;
      }
      if (card) {
        const module = this.patch.modules.find((item) => item.id === card.dataset.id);
        if (e.shiftKey) {
          const ids = new Set(this.selectedModules);
          if (ids.has(module.id)) ids.delete(module.id); else ids.add(module.id);
          this.selectedModules = ids;
          this.selected = ids.size === 1 ? [...ids][0] : null;
        } else if (!this.selectedModules.has(module.id)) {
          this.selectedModules = new Set([module.id]); this.selected = module.id;
        } else this.selected = this.selectedModules.size === 1 ? module.id : null;
        this.selectedWire = null;
        this.renderSelection(); this.renderInspector();
        if (e.target.closest('.omni-module-head') && this.selectedModules.has(module.id)) {
          e.preventDefault();
          const items = [...this.selectedModules].map((id) => this.patch.modules.find((item) => item.id === id))
            .filter(Boolean).map((item) => ({ module: item, x: item.x, y: item.y }));
          drag = { kind: 'move', items, ox: e.clientX, oy: e.clientY };
          this.canvas.setPointerCapture(e.pointerId);
        }
        return;
      }
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault(); window.getSelection?.()?.removeAllRanges?.();
      if (e.shiftKey) {
        const rect = this.canvas.getBoundingClientRect();
        drag = { kind: 'select', x: e.clientX, y: e.clientY, rect };
        Object.assign(this.selectionRect.style, { display: 'block', left: `${e.clientX - rect.left}px`, top: `${e.clientY - rect.top}px`, width: '0px', height: '0px' });
        this.canvas.setPointerCapture(e.pointerId);
      } else {
        drag = { kind: 'pan', ox: e.clientX, oy: e.clientY, sx: this.view.x, sy: this.view.y };
        this.canvas.setPointerCapture(e.pointerId); this.canvas.classList.add('is-panning');
        this.selected = null; this.selectedModules.clear(); this.selectedWire = null;
        this.renderSelection(); this.renderInspector();
      }
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (drag.kind === 'move') {
        const dx = (e.clientX - drag.ox) / this.view.scale, dy = (e.clientY - drag.oy) / this.view.scale;
        drag.items.forEach(({ module, x, y }) => { module.x = x + dx; module.y = y + dy; this.positionCard(module); });
        this.renderWires();
      } else if (drag.kind === 'pan') {
        this.view.x = drag.sx + e.clientX - drag.ox; this.view.y = drag.sy + e.clientY - drag.oy; this.applyView();
      } else if (drag.kind === 'wire') {
        this.renderWires({ from: drag.from, to: this.toWorld(e.clientX, e.clientY) });
      } else if (drag.kind === 'select') {
        const left = Math.min(drag.x, e.clientX) - drag.rect.left;
        const top = Math.min(drag.y, e.clientY) - drag.rect.top;
        Object.assign(this.selectionRect.style, {
          left: `${left}px`, top: `${top}px`,
          width: `${Math.abs(e.clientX - drag.x)}px`, height: `${Math.abs(e.clientY - drag.y)}px`,
        });
      }
    });
    const up = (e) => {
      if (!drag) return;
      if (drag.kind === 'wire') {
        const target = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.omni-port[data-dir="in"]');
        if (target) {
          this.tryConnect(drag.from, { module: target.dataset.module, port: target.dataset.port });
          this.pending = null; this.highlightTargets(null);
        } else if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) {
          this.pending = null; this.highlightTargets(null); this.msg('Released away from an input - cable dropped.');
        } else this.msg(`${drag.from.port} selected - now click a highlighted input.`);
        this.renderWires();
      } else if (drag.kind === 'move') {
        drag.items.forEach(({ module }) => {
          module.x = this.snapCoordinate(module.x); module.y = this.snapCoordinate(module.y);
          this.positionCard(module);
        });
        this.renderWires(); this.pushHistory();
      } else if (drag.kind === 'select') {
        const left = Math.min(drag.x, e.clientX), right = Math.max(drag.x, e.clientX);
        const top = Math.min(drag.y, e.clientY), bottom = Math.max(drag.y, e.clientY);
        const selected = [...this.cards.querySelectorAll('.omni-module')].filter((item) => {
          const box = item.getBoundingClientRect();
          return box.right >= left && box.left <= right && box.bottom >= top && box.top <= bottom;
        }).map((item) => item.dataset.id);
        this.selectedModules = new Set(selected); this.selected = selected.length === 1 ? selected[0] : null;
        this.selectedWire = null; this.selectionRect.style.display = 'none';
        this.renderSelection(); this.renderInspector();
      }
      this.selectionRect.style.display = 'none'; this.canvas.classList.remove('is-panning'); drag = null;
    };
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', up);
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault(); const rect = this.canvas.getBoundingClientRect();
      this.zoom(e.deltaY < 0 ? 1.1 : 0.9, e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });
  }

  highlightTargets(ref) {
    this.cards.querySelectorAll('.omni-port').forEach((p) => p.classList.remove('is-valid', 'is-pending'));
    if (!ref) return;
    const byId = Object.fromEntries(this.patch.modules.map((m) => [m.id, m]));
    this.cards.querySelector(`.omni-port[data-dir="out"][data-module="${ref.module}"][data-port="${ref.port}"]`)?.classList.add('is-pending');
    this.cards.querySelectorAll('.omni-port[data-dir="in"]').forEach((p) => { if (!connectionError(byId, ref, { module: p.dataset.module, port: p.dataset.port }, this.patch.connections)) p.classList.add('is-valid'); });
  }

  // ------------------------------------------------------------------ rendering
  render() { this.renderCards(); this.renderWires(); this.renderInspector(); this.applyView(); }
  positionCard(m) { const c = this.cards.querySelector(`[data-id="${m.id}"]`); if (c) { c.style.left = `${m.x}px`; c.style.top = `${m.y}px`; } }
  renderCards() {
    this.cards.replaceChildren();
    this.patch.modules.forEach((m) => {
      const def = MODULES[m.type];
      const card = el('div', 'omni-module', this.cards); card.dataset.id = m.id; card.style.setProperty('--c', def.color); this.positionCard(m);
      const head = el('div', 'omni-module-head', card); el('span', '', head, def.name); el('small', '', head, m.id);
      const ports = el('div', 'omni-ports', card);
      const inCol = el('div', 'omni-port-col', ports); const outCol = el('div', 'omni-port-col omni-port-col--out', ports);
      def.inputs.forEach((p) => { const row = el('div', 'omni-port-row', inCol); const dot = el('button', `omni-port omni-port--${p.type}`, row); dot.type = 'button'; dot.dataset.dir = 'in'; dot.dataset.module = m.id; dot.dataset.port = p.id; dot.title = `${p.label} (${p.type} in)`; dot.setAttribute('aria-label', `${def.name} ${p.label} input`); el('span', '', row, p.label); });
      def.outputs.forEach((p) => { const row = el('div', 'omni-port-row', outCol); el('span', '', row, p.label); const dot = el('button', `omni-port omni-port--${p.type}`, row); dot.type = 'button'; dot.dataset.dir = 'out'; dot.dataset.module = m.id; dot.dataset.port = p.id; dot.title = `${p.label} (${p.type} out)`; dot.setAttribute('aria-label', `${def.name} ${p.label} output`); });
      const sum = def.params.slice(0, 2).map((p) => `${p.label.split(' (')[0]} ${p.options ? p.options[Math.round(m.params[p.key])] : +Number(m.params[p.key]).toFixed(2)}`).join(' · ');
      el('div', 'omni-module-summary', card, sum);
    });
    this.renderSelection();
  }
  renderSelection() { this.cards.querySelectorAll('.omni-module').forEach((c) => { c.classList.toggle('is-selected', this.selectedModules.has(c.dataset.id) && this.selectedModules.size === 1); c.classList.toggle('is-multi-selected', this.selectedModules.has(c.dataset.id) && this.selectedModules.size > 1); }); }
  portPos(ref, dir) {
    const dot = this.cards.querySelector(`.omni-port[data-dir="${dir}"][data-module="${ref.module}"][data-port="${ref.port}"]`); if (!dot) return null;
    const r = dot.getBoundingClientRect(); const w = this.world.getBoundingClientRect();
    return { x: (r.left + r.width / 2 - w.left) / this.view.scale, y: (r.top + r.height / 2 - w.top) / this.view.scale };
  }
  renderWires(temp = null) {
    this.wires.replaceChildren();
    const byId = Object.fromEntries(this.patch.modules.map((m) => [m.id, m]));
    const draw = (a, b, color, id, type = '') => {
      const path = document.createElementNS(NS, 'path'); const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
      path.setAttribute('d', `M${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`); path.setAttribute('stroke', color); path.classList.add('omni-wire');
      if (type) path.classList.add(`omni-wire--${type}`);
      if (id) { path.dataset.id = id; if (id === this.selectedWire) path.classList.add('is-selected'); } else path.classList.add('is-temp');
      this.wires.appendChild(path);
    };
    this.patch.connections.forEach((c) => { const a = this.portPos(c.from, 'out'); const b = this.portPos(c.to, 'in'); if (!a || !b) return; const type = MODULES[byId[c.from.module].type].outputs.find((p) => p.id === c.from.port)?.type; draw(a, b, SIGNAL_COLORS[type], c.id, type); });
    if (temp) { const a = this.portPos(temp.from, 'out'); if (a) draw(a, temp.to, '#fff', null); }
  }
  renderInspector() {
    const body = this.inspBody; body.replaceChildren();
    if (this.selectedWire) { const c = this.patch.connections.find((x) => x.id === this.selectedWire); if (c) { el('p', 'omni-hint', body, `${c.from.module}.${c.from.port} → ${c.to.module}.${c.to.port}`); const b = el('button', 'omni-tb', body, 'REMOVE WIRE'); b.type = 'button'; b.addEventListener('click', () => this.removeConnection(c.id)); } return; }
    const m = this.patch.modules.find((x) => x.id === this.selected);
    if (this.selectedModules.size > 1) {
      el('h3', '', body, `${this.selectedModules.size} modules selected`);
      el('p', 'omni-hint', body, 'Drag any selected module header to move the group. Copy, paste, duplicate and delete operate on the whole selection. Internal connections are preserved when duplicated.');
      const actions = el('div', 'omni-insp-buttons', body);
      const duplicate = el('button', 'omni-tb', actions, 'DUPLICATE GROUP'); duplicate.type = 'button'; duplicate.addEventListener('click', () => this.duplicateSelection());
      const remove = el('button', 'omni-tb omni-tb--danger', actions, 'DELETE GROUP'); remove.type = 'button'; remove.addEventListener('click', () => this.deleteSelection());
      return;
    }
    if (!m) { el('p', 'omni-hint', body, 'Select a module to edit its parameters. Drag module headers to move them; drag from a right-hand port to a left-hand port to connect.'); const miss = this.missingReport(); if (miss) el('p', 'omni-warn', body, miss); return; }
    const def = MODULES[m.type];
    el('h3', '', body, def.name); el('p', 'omni-hint', body, `${m.id} · ${def.category}`);
    def.params.forEach((p) => {
      const row = el('label', 'omni-param', body); const lab = el('span', '', row, p.label);
      if (p.options) {
        const s = el('select', '', row); p.options.forEach((o, i) => { const op = el('option', '', s, o); op.value = i; }); s.value = Math.round(m.params[p.key]);
        s.addEventListener('change', () => { this.setParam(m.id, p.key, Number(s.value), true); this.renderCards(); this.renderWires(); });
      } else {
        const inp = el('input', '', row); inp.type = 'range'; const log = !!p.log; inp.min = log ? Math.log(p.min) : p.min; inp.max = log ? Math.log(p.max) : p.max; inp.step = p.step ?? (log ? 0.001 : (p.max - p.min) / 400);
        inp.value = log ? Math.log(m.params[p.key]) : m.params[p.key];
        const out = el('output', '', row, (+m.params[p.key]).toFixed(p.step === 1 ? 0 : 2));
        const val = () => (log ? Math.exp(Number(inp.value)) : Number(inp.value));
        inp.addEventListener('input', () => { this.setParam(m.id, p.key, val(), false); out.textContent = val().toFixed(p.step === 1 ? 0 : 2); });
        inp.addEventListener('change', () => { this.setParam(m.id, p.key, val(), true); this.renderCards(); this.renderWires(); });
        lab.htmlFor = inp.id = `p-${m.id}-${p.key}`;
        inp.setAttribute('role', 'slider');
        inp._oiMidi = { id: `omni::${m.id}::${p.key}`, label: p.label, group: `${def.name} (${m.id})`, get: () => 0, set: () => {} };
      }
    });
    const bb = el('div', 'omni-insp-buttons', body);
    const dup = el('button', 'omni-tb', bb, 'DUPLICATE'); dup.type = 'button'; dup.addEventListener('click', () => this.duplicateModule(m.id)); if (def.single) dup.disabled = true;
    const del = el('button', 'omni-tb', bb, 'DELETE'); del.type = 'button'; del.addEventListener('click', () => this.removeModule(m.id));
    const miss = this.missingReport(); if (miss) el('p', 'omni-warn', body, miss);
  }
  missingReport() {
    const out = this.patch.modules.find((m) => m.type === 'output');
    if (!out) return 'No Audio Output module - nothing will be heard.';
    if (!this.patch.connections.some((c) => c.to.module === out.id)) return 'The Audio Output has nothing connected to it.';
    const reaches = new Set([out.id]); let grew = true;
    while (grew) { grew = false; this.patch.connections.forEach((c) => { if (reaches.has(c.to.module) && !reaches.has(c.from.module)) { reaches.add(c.from.module); grew = true; } }); }
    const unheard = this.patch.modules.filter((m) => !reaches.has(m.id) && MODULES[m.type].outputs.length);
    return unheard.length ? `Not reaching the output: ${unheard.map((m) => m.id).join(', ')}.` : '';
  }
  templates() {
    const o = el('div', 'omni-guide', document.body);
    const card = el('div', 'omni-guide-card omni-templates', o);
    el('h2', '', card, 'Templates'); el('p', 'omni-hint', card, 'Click a template to load it. Unsaved changes are replaced (Ctrl+Z restores them).');
    const grid = el('div', 'omni-tpl-grid', card);
    TEMPLATES.forEach((t) => {
      const b = el('button', 'omni-tpl', grid); b.type = 'button';
      el('div', 'omni-tpl-prev', b).innerHTML = templatePreview(t.patch);
      el('strong', '', b, t.name); el('span', '', b, t.desc);
      b.addEventListener('click', () => { this.load(JSON.parse(JSON.stringify(t.patch))); this.setInitialView(); o.remove(); this.msg(`Loaded template "${t.name}".`); });
    });
    const close = el('button', '', card, 'CLOSE'); close.type = 'button'; close.addEventListener('click', () => o.remove());
    o.addEventListener('click', (e) => { if (e.target === o) o.remove(); });
  }
  showShortcuts() {
    const overlay = el('div', 'omni-guide', document.body);
    const card = el('div', 'omni-guide-card omni-shortcuts', overlay);
    el('h2', '', card, 'Keyboard shortcuts');
    const rows = [
      ['Play notes', 'A–; and W/E/T/Y/U/O/P note keys'],
      ['Pitch bend up / down', 'Tab / Left Shift (release to centre)'],
      ['Mod wheel', 'Hold Arrow Up / Arrow Down'],
      ['Keyboard octave', '− / +'],
      ['Undo / Redo', 'Ctrl/⌘ Z / Ctrl/⌘ Shift Z'],
      ['Select all / Copy / Paste', 'Ctrl/⌘ A / C / V'],
      ['Duplicate / Delete', 'Ctrl/⌘ D / Delete'],
      ['Canvas', 'Drag to pan · Scroll to zoom · Fit in View menu'],
    ];
    const list = el('dl', 'omni-shortcuts__list', card);
    rows.forEach(([label, value]) => {
      el('dt', '', list, label);
      el('dd', '', list, value);
    });
    const close = el('button', 'omni-shortcuts__close', card, 'CLOSE');
    close.type = 'button';
    close.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.remove(); });
    overlay.addEventListener('keydown', (event) => { if (event.key === 'Escape') overlay.remove(); });
    close.focus();
  }

  guide() {
    const o = el('div', 'omni-guide', document.body);
    o.innerHTML = `<div class="omni-guide-card"><h2>OMNI guide</h2>
<p><b>Build:</b> click a module in the library (or drag it onto the canvas). Drag a module by its header. Scroll to zoom, drag empty space to pan.</p>
<p><b>Connect:</b> drag from an output port (right edge) to an input port (left edge), or click an output then a highlighted input. Colours: <span style="color:#ff9f0a">audio</span>, <span style="color:#7de4ff">control voltage</span>, <span style="color:#82e6a8">note/gate events</span>. Audio feeds audio inputs; CV feeds modulation inputs (filter cutoff, VCA gain, oscillator pitch mod); note ports carry key presses from the keyboard, sequencer, clock, arpeggiator or rhythm generators to oscillators, drums, envelopes and the FM voice. Note utilities (Chord, Transpose, Echo) sit between a note source and its destination.</p>
<p><b>Edit:</b> select a module to change its parameters. Shift-click modules or Shift-drag on empty canvas to select a group; drag any selected header to move the group. Ctrl/Cmd+A selects all; Ctrl/Cmd+C/V copies and pastes; Ctrl/Cmd+D duplicates; Delete removes the selection. SNAP aligns modules to the grid and FIT VIEW frames the whole patch. Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z undo and redo.</p>
<p><b>Play:</b> press POWER ON, then play the on-screen keys, your computer keys (A–') or a MIDI controller. Notes are monophonic per keyboard module (last note wins).</p>
<p><b>Record:</b> AUDIO REC captures the live master output after you power on audio and downloads a browser-supported audio file. MIDI REC records notes played on the on-screen/computer keyboard or an incoming MIDI controller, then exports a standard MIDI file at 120 BPM. It records note events, not sequencer-generated notes or controller automation.</p>
<p><b>Keep:</b> SAVE stores the instrument in this browser; EXPORT/IMPORT JSON moves it between browsers; LIBRARY export backs up all saved patches; EXPORT SVG produces a schematic drawing. Structural changes rebuild the audio graph (a brief gap in sound is expected); parameter changes are live.</p>
<button type="button">CLOSE</button></div>`;
    o.querySelector('button').addEventListener('click', () => o.remove()); o.addEventListener('click', (e) => { if (e.target === o) o.remove(); });
  }
}
document.addEventListener('DOMContentLoaded', () => { window.__omniApp = new OmniApp(); });
