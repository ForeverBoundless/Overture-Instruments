// harness.mjs — a deliberately minimal DOM + Web Audio API shim, just
// enough surface area for js/app.js and everything it imports to
// construct and run without throwing. This is a testing tool only; it is
// NOT part of the delivered synth.

function makeAudioParam(defaultValue = 0) {
  return {
    value: defaultValue,
    setValueAtTime(v) { this.value = v; return this; },
    linearRampToValueAtTime(v) { this.value = v; return this; },
    exponentialRampToValueAtTime(v) { this.value = Math.max(v, 1e-6); return this; },
    setTargetAtTime(v) { this.value = v; return this; },
    cancelScheduledValues() { return this; },
    cancelAndHoldAtTime() { return this; },
  };
}

function makeNode(extra = {}) {
  return {
    connect(dest) { return dest; },
    disconnect() {},
    ...extra,
  };
}

class MockAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.destination = makeNode();
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
  createGain() { return makeNode({ gain: makeAudioParam(1) }); }
  createOscillator() {
    return makeNode({
      type: 'sine',
      frequency: makeAudioParam(440),
      detune: makeAudioParam(0),
      start() {}, stop() {},
      setPeriodicWave() {},
      onended: null,
    });
  }
  createBiquadFilter() {
    return makeNode({
      type: 'lowpass',
      frequency: makeAudioParam(350),
      Q: makeAudioParam(1),
      gain: makeAudioParam(0),
      detune: makeAudioParam(0),
    });
  }
  createWaveShaper() {
    return makeNode({ curve: null, oversample: 'none' });
  }
  createBufferSource() {
    return makeNode({
      buffer: null, loop: false, loopStart: 0, loopEnd: 0,
      start() {}, stop() {},
    });
  }
  createBuffer(channels, length, sampleRate) {
    const data = new Float32Array(length);
    return {
      getChannelData: () => data,
      duration: length / sampleRate,
      sampleRate, length, numberOfChannels: channels,
    };
  }
  createConstantSource() {
    return makeNode({ offset: makeAudioParam(1), start() {}, stop() {} });
  }
  createDynamicsCompressor() {
    return makeNode({
      threshold: makeAudioParam(-24), knee: makeAudioParam(30),
      ratio: makeAudioParam(12), attack: makeAudioParam(0.003),
      release: makeAudioParam(0.25), reduction: 0,
    });
  }
  createAnalyser() {
    const self = makeNode({
      fftSize: 2048,
      smoothingTimeConstant: 0.8,
      minDecibels: -100,
      maxDecibels: -30,
      getFloatTimeDomainData(arr) { arr.fill(0); },
      getByteFrequencyData(arr) { arr.fill(0); },
    });
    Object.defineProperty(self, 'frequencyBinCount', { get() { return self.fftSize / 2; } });
    return self;
  }
  createPeriodicWave() { return {}; }
}

// --- Minimal DOM ---

const elementsById = new Map();

function makeClassList(el) {
  const set = new Set();
  return {
    add: (...c) => c.forEach((x) => set.add(x)),
    remove: (...c) => c.forEach((x) => set.delete(x)),
    toggle: (c, force) => {
      const has = set.has(c);
      const next = force === undefined ? !has : force;
      if (next) set.add(c); else set.delete(c);
      return next;
    },
    contains: (c) => set.has(c),
  };
}

function makeEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const arr = listeners.get(type);
      if (!arr) return;
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    },
    dispatchEvent(type, evt = {}) {
      (listeners.get(type) || []).slice().forEach((fn) => fn(evt));
    },
  };
}

function makeElement(tag) {
  const et = makeEventTarget();
  const children = [];
  let _id = '';
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    style: {
      setProperty(name, v) { this[`--${name.replace(/^--/, '')}`] = v; },
      removeProperty(name) { delete this[name]; },
    },
    dataset: {},
    children,
    childNodes: children,
    attributes: {},
    classList: null,
    value: '',
    textContent: '',
    innerHTML: '',
    tabIndex: 0,
    title: '',
    ...et,
    get id() { return _id; },
    set id(v) { _id = v; elementsById.set(v, el); },
    setAttribute(name, v) { el.attributes[name] = v; if (name === 'id') el.id = v; },
    getAttribute(name) { return el.attributes[name] ?? null; },
    removeAttribute(name) { delete el.attributes[name]; },
    appendChild(child) { children.push(child); child.parentNode = el; return child; },
    removeChild(child) {
      const i = children.indexOf(child);
      if (i >= 0) children.splice(i, 1);
      return child;
    },
    remove() { if (el.parentNode) el.parentNode.removeChild(el); },
    setPointerCapture() {},
    focus() {},
    getBoundingClientRect() { return { width: 1240, height: 800, top: 0, left: 0, right: 1240, bottom: 800 }; },
    getContext(type) {
      if (type !== '2d') return null;
      const noop = () => {};
      return {
        clearRect: noop, fillRect: noop, strokeRect: noop,
        beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop, fill: noop,
        set fillStyle(v) {}, get fillStyle() { return '#000'; },
        set strokeStyle(v) {}, get strokeStyle() { return '#000'; },
        set lineWidth(v) {}, get lineWidth() { return 1; },
      };
    },
  };
  el.classList = makeClassList(el);
  return el;
}

function makeSvgElement(tag) {
  const el = makeElement(tag);
  el._attrs = {};
  const origSet = el.setAttribute;
  el.setAttribute = (name, v) => { el._attrs[name] = v; origSet(name, v); };
  return el;
}

const documentEventTarget = makeEventTarget();
const bodyEl = makeElement('body');
const appRootEl = makeElement('div');
appRootEl.id = 'app-root'; // mirrors <div id="app-root"></div> in index.html
bodyEl.appendChild(appRootEl);

global.document = {
  ...documentEventTarget,
  body: bodyEl,
  documentElement: makeElement('html'),
  createElement: (tag) => makeElement(tag),
  createElementNS: (ns, tag) => makeSvgElement(tag),
  getElementById: (id) => elementsById.get(id) || null,
  querySelector: () => null,
  querySelectorAll: () => [],
  activeElement: null,
};

const windowEventTarget = makeEventTarget();
global.window = global;
Object.assign(global, windowEventTarget);
global.innerWidth = 1366;
global.innerHeight = 768;
global.devicePixelRatio = 1;
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = () => 0; // intentionally inert for this smoke test
global.cancelAnimationFrame = () => {};
global.AudioContext = MockAudioContext;
global.webkitAudioContext = MockAudioContext;
Object.defineProperty(global, 'navigator', {
  value: { requestMIDIAccess: undefined }, // simulate no Web MIDI support
  configurable: true,
});
global.localStorage = (() => {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
})();
global.ResizeObserver = class {
  observe() {} disconnect() {} unobserve() {}
};
global.Blob = class { constructor(parts) { this.parts = parts; } };
global.URL.createObjectURL = () => 'blob:mock';
global.URL.revokeObjectURL = () => {};
global.KeyboardEvent = { DOM_KEY_LOCATION_LEFT: 1 };

export { elementsById };
