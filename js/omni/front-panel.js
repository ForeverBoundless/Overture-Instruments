import { MODULES } from './modules.js?v=20261118-organ-drawbar-r1';

const make = (tag, cls, parent, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
};
const id = () => 'fp-' + Math.random().toString(36).slice(2, 9);
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const clone = (value) => JSON.parse(JSON.stringify(value));
const TYPES = [
  ['knob', 'Knob', 'CONTROLS'],
  ['dial', 'Dial', 'CONTROLS'],
  ['slider', 'Slider', 'CONTROLS'],
  ['dropdown', 'Dropdown', 'CONTROLS'],
  ['button', 'Button', 'CONTROLS'],
  ['switch', 'Toggle switch', 'CONTROLS'],
  ['encoder', 'Rotary encoder', 'CONTROLS'],
  ['drawbars', 'Nine drawbars', 'CONTROLS'],
  ['meter', 'Level meter', 'DISPLAYS'],
  ['pad', 'Performance pad', 'PERFORMANCE'],
  ['label', 'Text label', 'LAYOUT'],
  ['section', 'Section divider', 'LAYOUT'],
  ['keyboard', 'Keyboard', 'PERFORMANCE'],
  ['pitchwheel', 'Pitch wheel', 'PERFORMANCE'],
  ['modwheel', 'Mod wheel', 'PERFORMANCE'],
  ['module', 'Module bay', 'MODULES'],
  ['screen', 'LCD screen', 'DISPLAYS'],
  ['oled', 'OLED display', 'DISPLAYS'],
  ['led', 'LED indicator', 'DISPLAYS'],
];
const FINISHES = [
  ['matte', 'Matte'],
  ['brushed', 'Brushed aluminium'],
  ['anodized', 'Anodized'],
  ['walnut', 'Walnut'],
  ['ivory', 'Ivory'],
];
const safeColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : fallback;

export class FrontPanelEditor {
  constructor(app, root) {
    this.app = app;
    this.selectedId = null;
    this.dragState = null;
    this.state = app.patch.frontPanel ? clone(app.patch.frontPanel) : this.defaultLayout();
    app.patch.frontPanel = this.state;
    this.build(root);
    this.render();
    if (typeof ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(() => this.scaleFaceplate());
      this.resizeObserver.observe(this.viewport);
    }
  }

  defaultLayout() {
    const find = (type) => this.app.patch.modules.find((item) => item.type === type);
    const bind = (type, key) => {
      const module = find(type);
      return module ? { moduleId: module.id, paramKey: key } : null;
    };
    const component = (type, label, x, y, w, h, extra = {}) => ({
      id: id(), type, label, x, y, w, h, value: 0.5,
      accent: '#ffb75e', surface: '#26313d', textColor: '#edf3fa',
      finish: 'matte', margin: 8, hidden: false, locked: false, ...extra,
    });
    const filter = find('filter') || find('ladder');
    const osc = find('oscillator');
    const env = find('envelope');
    const keyboard = find('keyboard');
    return {
      version: 1,
      width: 1240,
      height: 520,
      finish: 'brushed',
      unit: 'mm', safeMargin: 24, gridSize: 28,
      showRulers: true, showGrid: true, showGuides: true, showSmartGuides: true, showSafeMargin: true, snap: true,
      guides: [{ id: id(), axis: 'x', position: 620, color: '#7de4ff' }, { id: id(), axis: 'y', position: 205, color: '#ffb75e' }],
      measurements: [],
      panelColor: '#252d35',
      accent: '#ffb75e',
      textColor: '#edf3fa',
      components: [
        component('screen', 'INSTRUMENT', 26, 22, 238, 76, { text: 'OVERTURE  /  OMNI\\nUSER-DESIGNED INSTRUMENT', surface: '#111b25', accent: '#7de4ff' }),
        component('knob', 'CUTOFF', 296, 23, 112, 132, { bind: filter ? { moduleId: filter.id, paramKey: 'cutoff' } : null }),
        component('dial', 'RESONANCE', 422, 23, 112, 132, { bind: filter ? { moduleId: filter.id, paramKey: 'resonance' } : null }),
        component('slider', 'ATTACK', 554, 30, 74, 148, { bind: env ? { moduleId: env.id, paramKey: 'attack' } : null }),
        component('dropdown', 'WAVEFORM', 650, 38, 174, 54, { bind: osc ? { moduleId: osc.id, paramKey: 'wave' } : null }),
        component('button', 'ALL NOTES OFF', 856, 38, 142, 54, { action: 'panic', accent: '#82e6a8' }),
        component('module', 'OSCILLATOR', 1018, 24, 194, 88, { bind: osc ? { moduleId: osc.id } : null }),
        component('keyboard', 'KEYBOARD  /  2 OCTAVES', 26, 228, 720, 168, { startNote: 48 }),
        component('pitchwheel', 'PITCH', 772, 220, 94, 176),
        component('modwheel', 'MOD', 882, 220, 94, 176),
        component('oled', 'STATUS DISPLAY', 1000, 220, 212, 106, { text: 'READY\\nPATCH DESIGNER', surface: '#071218', accent: '#7de4ff' }),
        component('led', 'AUDIO', 1030, 352, 154, 42, { accent: '#82e6a8' }),
      ],
    };
  }

  build(root) {
    this.el = make('section', 'omni-front-panel', root);
    this.el.hidden = true;
    const toolbar = make('div', 'ofp-toolbar', this.el);
    const identity = make('div', 'ofp-toolbar__identity', toolbar);
    make('span', 'ofp-kicker', identity, 'OMNI / INSTRUMENT DESIGN');
    make('strong', 'ofp-toolbar__title', identity, 'Front panel');
    const actions = make('div', 'ofp-toolbar__actions', toolbar);
    this.fitButton = make('button', 'ofp-action', actions, 'FIT PANEL');
    this.fitButton.type = 'button';
    this.fitButton.addEventListener('click', () => this.scaleFaceplate());
    this.resetButton = make('button', 'ofp-action', actions, 'RESET LAYOUT');
    this.resetButton.type = 'button';
    this.resetButton.addEventListener('click', () => {
      if (!window.confirm('Replace this front-panel layout with the starter design?')) return;
      this.state = this.defaultLayout();
      this.selectedId = null;
      this.render();
      this.commit();
    });
    this.exportButton = make('button', 'ofp-action ofp-action--primary', actions, 'EXPORT SVG');
    this.exportButton.type = 'button';
    this.exportButton.addEventListener('click', () => this.exportSVG());

    this.workspace = make('div', 'ofp-workspace', this.el);
    this.library = make('aside', 'ofp-library', this.workspace);
    const libHead = make('div', 'ofp-panel-heading', this.library);
    make('span', 'ofp-panel-heading__eyebrow', libHead, 'COMPONENTS');
    make('strong', '', libHead, 'Add to panel');
    make('p', 'ofp-help', this.library, 'Select a control to add it to the faceplate. Drag it into place, then edit its appearance and behaviour.');
    const groups = {};
    TYPES.forEach(([type, label, category]) => {
      if (!groups[category]) {
        groups[category] = make('div', 'ofp-library-group', this.library);
        make('h3', '', groups[category], category);
      }
      const button = make('button', 'ofp-library-item', groups[category]);
      button.type = 'button';
      make('span', 'ofp-library-item__glyph', button, this.glyph(type));
      make('span', '', button, label);
      button.addEventListener('click', () => this.addComponent(type));
    });

    this.stagePanel = make('section', 'ofp-stage-panel', this.workspace);
    const stageHead = make('div', 'ofp-stage-head', this.stagePanel);
    const stageName = make('div', '', stageHead);
    make('span', 'ofp-panel-heading__eyebrow', stageName, 'DESIGN CANVAS');
    make('strong', '', stageName, 'Instrument faceplate');
    this.stageDimensions = make('span', 'ofp-stage-dimensions', stageHead);
    this.viewport = make('div', 'ofp-viewport', this.stagePanel);
    this.stage = make('div', 'ofp-stage', this.viewport);
    this.faceplate = make('div', 'ofp-faceplate', this.stage);
    this.faceplate.addEventListener('pointerdown', (event) => {
      if (this.tool === 'measure') { this.beginMeasurement(event); return; }
      if (this.pendingGuideAxis) { this.placeGuide(event); return; }
      if (event.target === this.faceplate || event.target === this.stage) this.select(null);
    }, true);
    this.horizontalRuler = make('div', 'ofp-ruler ofp-ruler--horizontal', this.stagePanel);
    this.viewportRow = make('div', 'ofp-viewport-row', this.stagePanel);
    this.verticalRuler = make('div', 'ofp-ruler ofp-ruler--vertical', this.viewportRow);
    this.viewportRow.appendChild(this.viewport);
    this.stageFoot = make('div', 'ofp-stage-foot', this.stagePanel);
    make('span', '', this.stageFoot, 'DRAG TO POSITION');
    make('span', '', this.stageFoot, 'SELECT A CONTROL TO EDIT');
    make('span', '', this.stageFoot, 'PATCH-BINDABLE CONTROLS UPDATE THE ENGINE');
    this.buildDesignTools();
    this.buildLayerPanel();
    this.bindEditorShortcuts();

    this.inspector = make('aside', 'ofp-inspector', this.workspace);
    this.renderInspector();
  }

  glyph(type) {
    return ({
      knob: '◉', dial: '◌', slider: '▥', dropdown: '⌄', button: '▣', switch: '⏻', encoder: '◉',
      drawbars: 'Ⅲ', keyboard: '▤', pitchwheel: '↕', modwheel: '≋', meter: '▥', pad: '▣', label: 'T', section: '▤',
      module: '▦', screen: '▭', oled: '▰', led: '●',
    })[type] || '＋';
  }

  getComponent(componentId) {
    return this.state.components.find((item) => item.id === componentId) || null;
  }

  getModule(moduleId) {
    return this.app.patch.modules.find((item) => item.id === moduleId) || null;
  }

  getParameter(component, key = null) {
    const binding = component.type === 'drawbars' && key
      ? { moduleId: component.bind?.moduleId, paramKey: key }
      : component.bind;
    if (!binding?.moduleId || !binding?.paramKey) return null;
    const module = this.getModule(binding.moduleId);
    const definition = module && MODULES[module.type];
    const parameter = definition?.params.find((item) => item.key === binding.paramKey);
    return module && parameter ? { module, definition, parameter } : null;
  }

  getOptions(binding) {
    const raw = binding?.parameter?.options;
    if (!Array.isArray(raw)) return [];
    return raw.map((item, index) => {
      if (item && typeof item === 'object') {
        return { value: Number.isFinite(Number(item.value)) ? Number(item.value) : index, label: String(item.label ?? item.name ?? item.value ?? index) };
      }
      return { value: index, label: String(item) };
    });
  }

  getValue(component, key = null) {
    if (component.type === 'drawbars' && key) {
      const bound = this.getParameter(component, key);
      return bound ? Number(bound.module.params[key]) : Number(component.value || 0);
    }
    const bound = this.getParameter(component);
    if (bound) return Number(bound.module.params[bound.parameter.key]);
    if (component.type === 'pitchwheel') return Number(this.app.pitchBend || 0);
    if (component.type === 'modwheel') return Number(this.app.modWheelValue || 0);
    return Number(component.value ?? 0.5);
  }

  getRange(component, key = null) {
    const bound = this.getParameter(component, key);
    if (bound) {
      return {
        min: Number(bound.parameter.min),
        max: Number(bound.parameter.max),
        step: Number(bound.parameter.step) || 0.01,
        log: Boolean(bound.parameter.log),
      };
    }
    return { min: component.type === 'pitchwheel' ? -1 : 0, max: 1, step: 0.01, log: false };
  }

  buildInput(component, key = null, className = 'ofp-range') {
    const range = this.getRange(component, key);
    const input = make('input', className);
    input.type = 'range';
    input.min = String(range.min);
    input.max = String(range.max);
    input.step = String(range.step);
    input.value = String(clamp(this.getValue(component, key), range.min, range.max));
    input.setAttribute('aria-label', component.label + (key ? ' ' + key : ''));
    input.dataset.componentId = component.id;
    input.addEventListener('input', () => {
      const value = Number(input.value);
      if (component.type === 'pitchwheel') {
        this.app.pitchBend = value;
        this.app.live?.setPitchBend(value * 2);
      } else if (component.type === 'modwheel') {
        this.app.modWheelValue = value;
        this.app.live?.setModWheel(value);
      } else if (component.type === 'drawbars' && key) {
        this.changeParameter(component, key, value, false);
      } else {
        this.changeParameter(component, null, value, false);
      }
      this.updateComponentVisual(component, key, value);
    });
    input.addEventListener('change', () => {
      if (component.type !== 'pitchwheel' && component.type !== 'modwheel') this.commit();
      this.updateComponentVisual(component, key, Number(input.value));
    });
    return input;
  }

  changeParameter(component, key, value, commit) {
    const bound = this.getParameter(component, key);
    if (bound) {
      this.app.setParam(bound.module.id, key || bound.parameter.key, value, commit);
      return;
    }
    component.value = value;
    this.app.persistWorkspace();
    if (commit) this.commit();
  }

  updateComponentVisual(component, key, value) {
    const node = this.faceplate.querySelector('[data-component-id="' + component.id + '"]');
    if (!node) return;
    const range = this.getRange(component, key);
    const ratio = range.max > range.min ? clamp((value - range.min) / (range.max - range.min), 0, 1) : 0;
    node.style.setProperty('--ofp-value', String(ratio));
    const output = node.querySelector('[data-ofp-role="value"]');
    if (output) output.textContent = range.log ? Math.round(value).toLocaleString() : (Number(value).toFixed(range.step >= 1 ? 0 : 2));
    const meterFill = node.querySelector('.ofp-meter__fill'); if (meterFill) meterFill.style.width = (ratio * 100) + '%';
    const ring = node.querySelector('.ofp-knob__ring');
    if (ring) ring.style.setProperty('--ofp-angle', String(-135 + ratio * 270) + 'deg');
  }

  render() {
    this.faceplate.replaceChildren();
    this.faceplate.style.width = this.state.width + 'px';
    this.faceplate.style.height = this.state.height + 'px';
    this.faceplate.dataset.finish = this.state.finish || 'matte';
    this.faceplate.style.setProperty('--ofp-panel-color', safeColor(this.state.panelColor, '#252d35'));
    this.faceplate.style.setProperty('--ofp-accent', safeColor(this.state.accent, '#ffb75e'));
    this.faceplate.style.setProperty('--ofp-text', safeColor(this.state.textColor, '#edf3fa'));
    this.stageDimensions.textContent = this.state.width + ' × ' + this.state.height;
    this.state.components.forEach((component) => this.renderComponent(component));
    this.renderDesignOverlays();
    this.renderRulers();
    this.renderLayers();
    this.renderInspector();
    requestAnimationFrame(() => this.scaleFaceplate());
  }

  renderComponent(component) {
    const node = make('div', 'ofp-component ofp-component--' + component.type, this.faceplate);
    node.dataset.componentId = component.id;
    node.style.left = component.x + 'px';
    node.style.top = component.y + 'px';
    node.style.width = component.w + 'px';
    node.style.height = component.h + 'px';
    node.style.setProperty('--ofp-control-accent', safeColor(component.accent, this.state.accent));
    node.style.setProperty('--ofp-control-surface', safeColor(component.surface, '#26313d'));
    node.style.setProperty('--ofp-control-text', safeColor(component.textColor, this.state.textColor));
    node.style.setProperty('--ofp-control-border', safeColor(component.borderColor, component.accent || this.state.accent));
    node.dataset.finish = component.finish || 'matte';
    node.classList.toggle('is-selected', this.selectedIds?.has(component.id) || component.id === this.selectedId);
    node.classList.toggle('is-locked', Boolean(component.locked));
    node.hidden = Boolean(component.hidden);
    node.style.setProperty('--ofp-clearance', Math.max(0, Number(component.margin) || 0) + 'px');
    node.style.setProperty('--ofp-control-border', safeColor(component.borderColor, component.accent || this.state.accent));
    const title = make('div', 'ofp-component__title', node, component.label || component.type.toUpperCase());
    title.title = 'Drag to move';
    if (component.type === 'knob' || component.type === 'dial' || component.type === 'encoder') {
      const control = make('div', 'ofp-knob', node);
      const ring = make('div', 'ofp-knob__ring', control);
      make('div', 'ofp-knob__cap', control);
      const input = this.buildInput(component, null, 'ofp-knob__input');
      control.appendChild(input);
      const range = this.getRange(component);
      const value = this.getValue(component);
      const ratio = range.max > range.min ? clamp((value - range.min) / (range.max - range.min), 0, 1) : 0;
      ring.style.setProperty('--ofp-angle', String(-135 + ratio * 270) + 'deg');
      const output = make('output', 'ofp-component__value', node, range.log ? String(Math.round(value)) : value.toFixed(range.step >= 1 ? 0 : 2));
      output.dataset.ofpRole = 'value';
    } else if (component.type === 'slider') {
      const control = make('div', 'ofp-slider', node);
      control.appendChild(this.buildInput(component, null, 'ofp-slider__input'));
      const value = make('output', 'ofp-component__value', node, this.getValue(component).toFixed(2));
      value.dataset.ofpRole = 'value';
    } else if (component.type === 'dropdown') {
      const select = make('select', 'ofp-dropdown', node);
      const bound = this.getParameter(component);
      const options = this.getOptions(bound);
      if (options.length) options.forEach((item) => {
        const option = make('option', '', select, item.label);
        option.value = String(item.value);
      });
      else {
        ['Option 1', 'Option 2', 'Option 3', 'Option 4'].forEach((label, index) => {
          const option = make('option', '', select, label);
          option.value = String(index);
        });
      }
      select.value = String(this.getValue(component));
      select.addEventListener('change', () => {
        this.changeParameter(component, null, Number(select.value), true);
      });
    } else if (component.type === 'switch') {
      const button = make('button', 'ofp-switch' + (this.getValue(component) > .5 ? ' is-on' : ''), node);
      button.type = 'button';
      make('span', 'ofp-switch__track', button);
      make('span', 'ofp-switch__label', button, this.getValue(component) > .5 ? 'ON' : 'OFF');
      button.addEventListener('click', () => {
        const bound = this.getParameter(component);
        if (bound) { const midpoint = (bound.parameter.min + bound.parameter.max) / 2; this.changeParameter(component, null, this.getValue(component) > midpoint ? bound.parameter.min : bound.parameter.max, true); }
        else { component.value = component.value > .5 ? 0 : 1; this.commit(); }
        this.render();
      });
    } else if (component.type === 'button') {
      const button = make('button', 'ofp-hardware-button', node, component.label || 'BUTTON');
      button.type = 'button';
      button.addEventListener('click', () => {
        if (component.action === 'panic') this.app.allOff();
      });
    } else if (component.type === 'keyboard') {
      this.renderKeyboard(component, node);
    } else if (component.type === 'pitchwheel' || component.type === 'modwheel') {
      const wheel = make('div', 'ofp-wheel', node);
      make('span', 'ofp-wheel__track', wheel);
      const input = this.buildInput(component, null, 'ofp-wheel__input');
      wheel.appendChild(input);
      make('span', 'ofp-wheel__cap', wheel);
    } else if (component.type === 'module') {
      const module = component.bind?.moduleId ? this.getModule(component.bind.moduleId) : null;
      const name = module ? MODULES[module.type]?.name || module.type : 'Unassigned module';
      make('strong', 'ofp-module__name', node, name);
      make('span', 'ofp-module__id', node, module ? module.id + '  /  LIVE MODULE' : 'SELECT A MODULE IN PROPERTIES');
      make('span', 'ofp-module__ports', node, module ? MODULES[module.type]?.category || 'MODULE' : 'MODULE BAY');
    } else if (component.type === 'screen' || component.type === 'oled') {
      const display = make('div', 'ofp-display', node);
      const lines = String(component.text || 'DISPLAY TEXT').split('\\n');
      lines.slice(0, 4).forEach((line, index) => make('span', 'ofp-display__line' + (index === 0 ? ' is-primary' : ''), display, line));
    } else if (component.type === 'meter') {
      const meter = make('div', 'ofp-meter', node);
      make('span', 'ofp-meter__fill', meter).style.width = (clamp(this.getValue(component), 0, 1) * 100) + '%';
      const output = make('output', 'ofp-component__value', node, Math.round(clamp(this.getValue(component), 0, 1) * 100) + '%');
      output.dataset.ofpRole = 'value';
    } else if (component.type === 'pad') {
      const pad = make('button', 'ofp-pad', node, component.label || 'PAD');
      pad.type = 'button';
      const note = clamp(component.note ?? 60, 0, 127);
      const down = (event) => { event.preventDefault(); pad.classList.add('is-active'); this.app.noteOn(note, .9, 1); };
      const up = () => { pad.classList.remove('is-active'); this.app.noteOff(note, 1); };
      pad.addEventListener('pointerdown', down); pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up); pad.addEventListener('lostpointercapture', up);
    } else if (component.type === 'label') {
      make('span', 'ofp-free-label', node, component.text || component.label || 'TEXT');
    } else if (component.type === 'section') {
      make('span', 'ofp-section__line', node);
      make('strong', 'ofp-section__text', node, component.text || component.label || 'SECTION');
    } else if (component.type === 'led') {
      const led = make('span', 'ofp-led', node);
      led.classList.toggle('is-on', Boolean(this.app.ctx));
      make('span', 'ofp-led__label', node, component.label || 'STATUS');
    } else if (component.type === 'drawbars') {
      const bank = make('div', 'ofp-drawbars', node);
      for (let index = 1; index <= 9; index += 1) {
        const column = make('label', 'ofp-drawbar', bank);
        make('span', '', column, ['16′', '5⅓′', '8′', '4′', '2⅔′', '2′', '1⅗′', '1⅓′', '1′'][index - 1]);
        column.appendChild(this.buildInput(component, 'drawbar' + index, 'ofp-drawbar__input'));
      }
    }
    this.bindComponentDrag(node, component);
    const resize = make('button', 'ofp-component__resize', node);
    resize.type = 'button';
    resize.title = 'Resize component';
    resize.setAttribute('aria-label', 'Resize ' + component.label);
    this.bindResize(resize, node, component);
  }

  renderKeyboard(component, node) {
    const board = make('div', 'ofp-keyboard', node);
    const whiteSemitones = [0, 2, 4, 5, 7, 9, 11];
    const start = Number(component.startNote) || 48;
    const whiteCount = 14;
    const whiteWidth = 100 / whiteCount;
    for (let index = 0; index < whiteCount; index += 1) {
      const octave = Math.floor(index / 7);
      const semitone = whiteSemitones[index % 7];
      const note = start + octave * 12 + semitone;
      const key = make('button', 'ofp-key ofp-key--white', board);
      key.type = 'button';
      key.style.left = (index * whiteWidth) + '%';
      key.style.width = whiteWidth + '%';
      this.bindKey(key, note);
    }
    const blackOffsets = [0.70, 1.72, 3.70, 4.72, 5.72];
    const blackSemitones = [1, 3, 6, 8, 10];
    for (let octave = 0; octave < 2; octave += 1) {
      blackSemitones.forEach((semitone, index) => {
        const note = start + octave * 12 + semitone;
        const key = make('button', 'ofp-key ofp-key--black', board);
        key.type = 'button';
        key.style.left = ((octave * 7 + blackOffsets[index]) * whiteWidth) + '%';
        this.bindKey(key, note);
      });
    }
  }

  bindKey(key, note) {
    let active = false;
    const down = (event) => {
      if (active) return;
      event.preventDefault();
      event.stopPropagation();
      active = true;
      key.classList.add('is-active');
      try { key.setPointerCapture(event.pointerId); } catch { /* optional pointer capture */ }
      this.app.noteOn(note, 0.86, 1);
    };
    const up = (event) => {
      if (!active) return;
      active = false;
      key.classList.remove('is-active');
      try { key.releasePointerCapture(event.pointerId); } catch { /* pointer may already be released */ }
      this.app.noteOff(note, 1);
    };
    key.addEventListener('pointerdown', down);
    key.addEventListener('pointerup', up);
    key.addEventListener('pointercancel', up);
    key.addEventListener('lostpointercapture', up);
    key.addEventListener('contextmenu', (event) => event.preventDefault());
    key.addEventListener('keydown', (event) => {
      if (event.key === ' ' || event.key === 'Enter') down({ preventDefault: () => event.preventDefault(), stopPropagation: () => event.stopPropagation(), pointerId: -1 });
    });
    key.addEventListener('keyup', (event) => {
      if (event.key === ' ' || event.key === 'Enter') up({ pointerId: -1 });
    });
  }

  bindComponentDrag(node, component) {
    node.addEventListener('pointerdown', (event) => {
      if (event.target.closest('input,select,button,textarea,a') || event.target.closest('.ofp-component__resize')) return;
      event.preventDefault();
      this.select(component.id);
      const scale = this.currentScale || 1;
      const startX = event.clientX;
      const startY = event.clientY;
      const originX = component.x;
      const originY = component.y;
      try { node.setPointerCapture(event.pointerId); } catch { /* optional */ }
      const move = (moveEvent) => {
        component.x = clamp(originX + (moveEvent.clientX - startX) / scale, 0, this.state.width - 36);
        component.y = clamp(originY + (moveEvent.clientY - startY) / scale, 0, this.state.height - 36);
        node.style.left = component.x + 'px';
        node.style.top = component.y + 'px';
      };
      const finish = () => {
        node.removeEventListener('pointermove', move);
        node.removeEventListener('pointerup', finish);
        node.removeEventListener('pointercancel', finish);
        this.commit();
        this.renderInspector();
      };
      node.addEventListener('pointermove', move);
      node.addEventListener('pointerup', finish, { once: true });
      node.addEventListener('pointercancel', finish, { once: true });
    });
  }

  bindResize(handle, node, component) {
    handle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const scale = this.currentScale || 1;
      const startX = event.clientX;
      const startY = event.clientY;
      const originW = component.w;
      const originH = component.h;
      try { handle.setPointerCapture(event.pointerId); } catch { /* optional */ }
      const move = (moveEvent) => {
        component.w = clamp(originW + (moveEvent.clientX - startX) / scale, 48, Math.min(760, this.state.width - component.x));
        component.h = clamp(originH + (moveEvent.clientY - startY) / scale, 42, Math.min(440, this.state.height - component.y));
        node.style.width = component.w + 'px';
        node.style.height = component.h + 'px';
      };
      const finish = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', finish);
        handle.removeEventListener('pointercancel', finish);
        this.commit();
        this.renderInspector();
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', finish, { once: true });
      handle.addEventListener('pointercancel', finish, { once: true });
    });
  }

  select(componentId, multi = false) {
    this.selectedIds ||= new Set();
    if (componentId === null) { this.selectedId = null; this.selectedIds.clear(); }
    else if (multi) {
      if (this.selectedIds.has(componentId)) this.selectedIds.delete(componentId); else this.selectedIds.add(componentId);
      this.selectedId = this.selectedIds.has(componentId) ? componentId : [...this.selectedIds].at(-1) || null;
    } else { this.selectedId = componentId; this.selectedIds = new Set([componentId]); }
    this.faceplate.querySelectorAll('.ofp-component').forEach((node) => node.classList.toggle('is-selected', this.selectedIds.has(node.dataset.componentId)));
    this.renderLayers();
    this.renderInspector();
  }

  addComponent(type) {
    const label = TYPES.find((item) => item[0] === type)?.[1] || type;
    const size = ({
      knob: [112, 132], dial: [112, 132], encoder: [112, 132], slider: [74, 148], dropdown: [170, 54],
      button: [140, 54], switch: [110, 68], drawbars: [270, 160], keyboard: [520, 150],
      meter: [118, 92], pad: [92, 92], label: [170, 42], section: [220, 36],
      pitchwheel: [92, 172], modwheel: [92, 172], module: [190, 88],
      screen: [220, 76], oled: [180, 96], led: [120, 42],
    })[type] || [120, 80];
    const count = this.state.components.length;
    const component = {
      id: id(), type, label: type === 'button' ? 'BUTTON' : label.toUpperCase(),
      x: clamp(24 + (count % 4) * 34, 0, this.state.width - size[0]),
      y: clamp(24 + (count % 4) * 30, 0, this.state.height - size[1]),
      w: size[0], h: size[1], value: 0.5,
      accent: this.state.accent, surface: '#26313d', textColor: this.state.textColor,
      finish: this.state.finish, margin: 8, hidden: false, locked: false,
    };
    if (type === 'button') component.action = 'none';
    if (type === 'pad') component.note = 60;
    if (type === 'label' || type === 'section') component.text = label.toUpperCase();
    if (type === 'keyboard') component.startNote = 48;
    if (type === 'screen' || type === 'oled') component.text = 'YOUR TEXT\\nDISPLAY CONTENT';
    this.state.components.push(component);
    this.selectedId = component.id;
    this.selectedIds = new Set([component.id]);
    this.render();
    this.commit();
  }

  removeSelected() {
    if (!this.selectedId) return;
    this.state.components = this.state.components.filter((item) => item.id !== this.selectedId);
    this.selectedId = null;
    this.selectedIds?.clear();
    this.render();
    this.commit();
  }

  duplicateSelected() {
    const component = this.getComponent(this.selectedId);
    if (!component) return;
    const copy = clone(component);
    copy.id = id(); copy.locked = false; copy.hidden = false;
    copy.x = clamp(copy.x + 26, 0, this.state.width - copy.w);
    copy.y = clamp(copy.y + 26, 0, this.state.height - copy.h);
    this.state.components.push(copy);
    this.selectedId = copy.id;
    this.selectedIds = new Set([copy.id]);
    this.render();
    this.commit();
  }

  field(label, control, parent = this.inspectorBody) {
    const wrap = make('label', 'ofp-field', parent);
    make('span', '', wrap, label);
    wrap.appendChild(control);
    return control;
  }

  inputField(label, value, type, onChange, parent) {
    const input = make('input', 'ofp-input', null);
    input.type = type || 'text';
    input.value = value ?? '';
    input.addEventListener('change', () => onChange(input.value));
    return this.field(label, input, parent);
  }

  selectField(label, value, options, onChange, parent) {
    const select = make('select', 'ofp-select', null);
    options.forEach(([optionValue, optionLabel]) => {
      const option = make('option', '', select, optionLabel);
      option.value = String(optionValue);
    });
    select.value = String(value ?? '');
    select.addEventListener('change', () => onChange(select.value));
    return this.field(label, select, parent);
  }

  colorField(label, value, onChange, parent) {
    const input = make('input', 'ofp-color', null);
    input.type = 'color';
    input.value = safeColor(value, '#ffffff');
    input.addEventListener('input', () => onChange(input.value, false));
    input.addEventListener('change', () => { onChange(input.value, true); });
    return this.field(label, input, parent);
  }

  renderInspector() {
    if (!this.inspector) return;
    this.inspector.replaceChildren();
    const header = make('div', 'ofp-panel-heading', this.inspector);
    make('span', 'ofp-panel-heading__eyebrow', header, 'PROPERTIES');
    make('strong', '', header, this.selectedId ? 'Selected component' : 'Panel settings');
    this.inspectorBody = make('div', 'ofp-inspector__body', this.inspector);
    const component = this.getComponent(this.selectedId);
    if (!component) {
      this.renderPanelSettings();
      return;
    }
    this.inputField('Control label', component.label, 'text', (value) => {
      component.label = value.slice(0, 40);
      this.render();
      this.commit();
    });
    const position = make('div', 'ofp-field-grid', this.inspectorBody);
    this.inputField('X position', component.x, 'number', (value) => this.updateComponentProperty(component, 'x', clamp(value, 0, this.state.width - 36)), position);
    this.inputField('Y position', component.y, 'number', (value) => this.updateComponentProperty(component, 'y', clamp(value, 0, this.state.height - 36)), position);
    const dimensions = make('div', 'ofp-field-grid', this.inspectorBody);
    this.inputField('Width', component.w, 'number', (value) => this.updateComponentProperty(component, 'w', clamp(value, 48, Math.min(760, this.state.width - component.x))), dimensions);
    this.inputField('Height', component.h, 'number', (value) => this.updateComponentProperty(component, 'h', clamp(value, 42, Math.min(440, this.state.height - component.y))), dimensions);

    if (component.type === 'module') {
      const modules = [['', 'No module']];
      this.app.patch.modules.forEach((module) => modules.push([module.id, MODULES[module.type]?.name + ' · ' + module.id]));
      this.selectField('Module', component.bind?.moduleId || '', modules, (value) => {
        component.bind = value ? { moduleId: value } : null;
        this.render();
        this.commit();
      });
    } else if (['knob', 'dial', 'slider', 'dropdown', 'drawbars'].includes(component.type)) {
      const bindings = [['', 'Not connected']];
      this.app.patch.modules.forEach((module) => {
        const definition = MODULES[module.type];
        definition.params.forEach((parameter) => {
          if (component.type === 'dropdown' && !parameter.options) return;
          bindings.push([module.id + '::' + parameter.key, definition.name + ' · ' + parameter.label + ' (' + module.id + ')']);
        });
      });
      const current = component.type === 'drawbars' ? component.bind?.moduleId || '' : component.bind ? component.bind.moduleId + '::' + component.bind.paramKey : '';
      this.selectField('Engine binding', current, bindings, (value) => {
        if (!value) component.bind = null;
        else if (component.type === 'drawbars') component.bind = { moduleId: value.split('::')[0] };
        else component.bind = { moduleId: value.split('::')[0], paramKey: value.split('::')[1] };
        this.render();
        this.commit();
      });
      if (component.type === 'drawbars') make('p', 'ofp-field-note', this.inspectorBody, 'Connect this bank to a tonewheel organ module with nine drawbar parameters.');
    }
    if (component.type === 'button') {
      this.selectField('Button action', component.action || 'none', [['none', 'No action'], ['panic', 'All notes off']], (value) => {
        component.action = value;
        this.commit();
      });
    }
    if (component.type === 'screen' || component.type === 'oled' || component.type === 'label' || component.type === 'section') {
      const textarea = make('textarea', 'ofp-textarea', this.inspectorBody);
      textarea.value = component.text || '';
      textarea.rows = 4;
      textarea.addEventListener('change', () => {
        component.text = textarea.value.slice(0, 240);
        this.render();
        this.commit();
      });
      this.field('Display text', textarea);
    }
    this.selectField('Material', component.finish || this.state.finish, FINISHES, (value) => {
      component.finish = value;
      this.render();
      this.commit();
    });
    const colors = make('div', 'ofp-field-grid', this.inspectorBody);
    this.colorField('Accent', component.accent || this.state.accent, (value, commit) => {
      component.accent = value;
      if (commit) this.commit();
      else this.faceplate.querySelector('[data-component-id="' + component.id + '"]')?.style.setProperty('--ofp-control-accent', value);
    }, colors);
    this.colorField('Surface', component.surface || '#26313d', (value, commit) => {
      component.surface = value;
      if (commit) this.commit();
      else this.faceplate.querySelector('[data-component-id="' + component.id + '"]')?.style.setProperty('--ofp-control-surface', value);
    }, colors);
    this.selectField('Visibility', component.hidden ? 'hidden' : 'visible', [['visible','Visible'],['hidden','Hidden']], (value) => { component.hidden = value === 'hidden'; this.render(); this.commit(); });
    this.selectField('Layer lock', component.locked ? 'locked' : 'unlocked', [['unlocked','Unlocked'],['locked','Locked']], (value) => { component.locked = value === 'locked'; this.render(); this.commit(); });
    this.inputField('Clearance / margin', component.margin ?? 8, 'number', (value) => this.updateComponentProperty(component, 'margin', clamp(value, 0, 48)));
    this.colorField('Legend colour', component.textColor || this.state.textColor, (value, commit) => { component.textColor = value; this.faceplate.querySelector('[data-component-id="' + component.id + '"]')?.style.setProperty('--ofp-control-text', value); if (commit) this.commit(); });
    this.colorField('Border colour', component.borderColor || component.accent || this.state.accent, (value, commit) => { component.borderColor = value; this.faceplate.querySelector('[data-component-id="' + component.id + '"]')?.style.setProperty('--ofp-control-border', value); if (commit) this.commit(); });
    if (component.type === 'pad') this.inputField('MIDI note', component.note ?? 60, 'number', (value) => { component.note = clamp(value, 0, 127); this.render(); this.commit(); });
    if (component.type === 'label' || component.type === 'section') this.inputField('Text', component.text || '', 'text', (value) => { component.text = value.slice(0, 80); this.render(); this.commit(); });
    if (component.type !== 'keyboard' && component.type !== 'pitchwheel' && component.type !== 'modwheel') {
      const duplicate = make('button', 'ofp-inspector-action', this.inspectorBody, 'DUPLICATE CONTROL');
      duplicate.type = 'button';
      duplicate.addEventListener('click', () => this.duplicateSelected());
    }
    const remove = make('button', 'ofp-inspector-action ofp-inspector-action--danger', this.inspectorBody, 'REMOVE CONTROL');
    remove.type = 'button';
    remove.addEventListener('click', () => this.removeSelected());
  }

  renderPanelSettings() {
    this.inputField('Panel width', this.state.width, 'number', (value) => {
      this.state.width = clamp(value, 800, 1800);
      this.state.components.forEach((item) => { item.x = clamp(item.x, 0, this.state.width - 36); });
      this.render();
      this.commit();
    });
    this.inputField('Panel height', this.state.height, 'number', (value) => {
      this.state.height = clamp(value, 360, 900);
      this.state.components.forEach((item) => { item.y = clamp(item.y, 0, this.state.height - 36); });
      this.render();
      this.commit();
    });
    this.selectField('Panel material', this.state.finish, FINISHES, (value) => {
      this.state.finish = value;
      this.state.components.forEach((item) => { if (!item.finish) item.finish = value; });
      this.render();
      this.commit();
    });
    this.inputField('Safe margin (px)', this.state.safeMargin ?? 24, 'number', (value) => { this.state.safeMargin = clamp(value, 0, 120); this.render(); this.commit(); });
    this.inputField('Grid spacing (px)', this.state.gridSize ?? 28, 'number', (value) => { this.state.gridSize = clamp(value, 4, 120); this.render(); this.commit(); });
    this.selectField('Units', this.state.unit || 'mm', [['px','Pixels'],['mm','Millimetres'],['in','Inches']], (value) => { this.state.unit = value; this.render(); this.commit(); });
    this.colorField('Panel colour', this.state.panelColor, (value, commit) => {
      this.state.panelColor = value;
      this.faceplate.style.setProperty('--ofp-panel-color', value);
      if (commit) this.commit();
    });
    this.colorField('Accent colour', this.state.accent, (value, commit) => {
      this.state.accent = value;
      this.faceplate.style.setProperty('--ofp-accent', value);
      if (commit) this.commit();
    });
    this.colorField('Legend colour', this.state.textColor, (value, commit) => {
      this.state.textColor = value;
      this.faceplate.style.setProperty('--ofp-text', value);
      if (commit) this.commit();
    });
    make('p', 'ofp-field-note', this.inspectorBody, 'The faceplate design is saved inside the OMNI patch. Component bindings connect the matching controls to the sound engine.');
  }

  updateComponentProperty(component, key, value) {
    component[key] = value;
    const node = this.faceplate.querySelector('[data-component-id="' + component.id + '"]');
    if (node) {
      if (key === 'x') node.style.left = value + 'px';
      if (key === 'y') node.style.top = value + 'px';
      if (key === 'w') node.style.width = value + 'px';
      if (key === 'h') node.style.height = value + 'px';
    }
    this.commit();
    this.renderInspector();
  }

  scaleFaceplate() {
    if (!this.viewport || !this.faceplate) return;
    const availableWidth = Math.max(100, this.viewport.clientWidth - 34);
    const availableHeight = Math.max(100, this.viewport.clientHeight - 34);
    const scale = Math.min(1, availableWidth / this.state.width, availableHeight / this.state.height);
    this.currentScale = Math.max(0.18, scale);
    this.faceplate.style.transform = 'scale(' + this.currentScale + ')';
    this.stage.style.width = (this.state.width * this.currentScale) + 'px';
    this.stage.style.height = (this.state.height * this.currentScale) + 'px';
  }

  refreshValues() {
    this.state.components.forEach((component) => {
      if (['knob','dial','encoder','slider','pitchwheel','modwheel','meter'].includes(component.type)) {
        const node = this.faceplate.querySelector('[data-component-id="' + component.id + '"]');
        const input = node?.querySelector('input[type="range"]');
        if (!input) return;
        const value = this.getValue(component);
        input.value = String(clamp(value, Number(input.min), Number(input.max)));
        this.updateComponentVisual(component, null, value);
      } else if (component.type === 'dropdown') {
        const node = this.faceplate.querySelector('[data-component-id="' + component.id + '"]');
        const select = node?.querySelector('select');
        if (select) select.value = String(this.getValue(component));
      }
    });
  }

  setPatch(patch = this.app.patch) {
    this.state = patch.frontPanel ? clone(patch.frontPanel) : this.defaultLayout();
    patch.frontPanel = this.state;
    this.selectedId = null;
    this.render();
  }

  commit() {
    this.app.patch.frontPanel = this.state;
    this.app.pushHistory();
  }

  exportSVG() {
    const esc = (value) => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    const width = this.state.width;
    const height = this.state.height;
    const background = safeColor(this.state.panelColor, '#252d35');
    const accent = safeColor(this.state.accent, '#ffb75e');
    const textColor = safeColor(this.state.textColor, '#edf3fa');
    const body = this.state.components.map((component) => {
      const x = component.x, y = component.y, w = component.w, h = component.h;
      const color = safeColor(component.accent, accent);
      const fill = safeColor(component.surface, '#26313d');
      let shape = '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="8" fill="' + fill + '" stroke="' + color + '" stroke-opacity=".42"/>';
      if (component.type === 'knob' || component.type === 'dial') shape += '<circle cx="' + (x + w / 2) + '" cy="' + (y + h / 2) + '" r="' + Math.min(w, h) * .28 + '" fill="#101820" stroke="' + color + '"/>';
      if (component.type === 'keyboard') {
        const count = 14;
        for (let index = 0; index < count; index += 1) shape += '<rect x="' + (x + index * w / count) + '" y="' + (y + 26) + '" width="' + (w / count - 1) + '" height="' + (h - 32) + '" rx="2" fill="#e9edf0" stroke="#8996a2"/>';
      }
      if (component.type === 'oled' || component.type === 'screen') shape += '<text x="' + (x + 14) + '" y="' + (y + h / 2 + 5) + '" fill="' + color + '" font-family="monospace" font-size="12">' + esc(component.text || '') + '</text>';
      shape += '<text x="' + (x + 10) + '" y="' + (y + 16) + '" fill="' + textColor + '" font-family="sans-serif" font-size="10" letter-spacing="1">' + esc(component.label) + '</text>';
      return shape;
    }).join('');
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '"><rect width="100%" height="100%" rx="16" fill="' + background + '"/>' + body + '</svg>';
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = make('a', '', document.body);
    link.href = url;
    link.download = (this.app.patch.name || 'omni-instrument').replace(/[^a-z0-9_-]+/gi, '-') + '-front-panel.svg';
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}
