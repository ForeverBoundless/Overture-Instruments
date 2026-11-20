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
    this.selectedIds = new Set();
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
      unit: 'mm', zoom: 1, safeMargin: 24, gridSize: 28,
      showRulers: true, showGrid: true, showGuides: true, showSmartGuides: true, showSafeMargin: true, snap: true,
      guides: [{ id: id(), axis: 'x', position: 620, color: '#7de4ff' }, { id: id(), axis: 'y', position: 205, color: '#ffb75e' }],
      measurements: [],
      panelColor: '#252d35',
      accent: '#ffb75e',
      textColor: '#edf3fa',
      components: [
        component('screen', 'INSTRUMENT', 26, 22, 238, 76, { text: 'OVERTURE  /  OMNI\nUSER-DESIGNED INSTRUMENT', surface: '#111b25', accent: '#7de4ff' }),
        component('knob', 'CUTOFF', 296, 23, 112, 132, { bind: filter ? { moduleId: filter.id, paramKey: 'cutoff' } : null }),
        component('dial', 'RESONANCE', 422, 23, 112, 132, { bind: filter ? { moduleId: filter.id, paramKey: 'resonance' } : null }),
        component('slider', 'ATTACK', 554, 30, 74, 148, { bind: env ? { moduleId: env.id, paramKey: 'attack' } : null }),
        component('dropdown', 'WAVEFORM', 650, 38, 174, 54, { bind: osc ? { moduleId: osc.id, paramKey: 'wave' } : null }),
        component('button', 'ALL NOTES OFF', 856, 38, 142, 54, { action: 'panic', accent: '#82e6a8' }),
        component('module', 'OSCILLATOR', 1018, 24, 194, 88, { bind: osc ? { moduleId: osc.id } : null }),
        component('keyboard', 'KEYBOARD  /  2 OCTAVES', 26, 228, 720, 168, { startNote: 48 }),
        component('pitchwheel', 'PITCH', 772, 220, 94, 176),
        component('modwheel', 'MOD', 882, 220, 94, 176),
        component('oled', 'STATUS DISPLAY', 1000, 220, 212, 106, { text: 'READY\nPATCH DESIGNER', surface: '#071218', accent: '#7de4ff' }),
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
    this.fitButton.addEventListener('click', () => { this.state.zoom = 1; this.scaleFaceplate(); this.commit(); });
    this.resetButton = make('button', 'ofp-action', actions, 'RESET LAYOUT');
    this.resetButton.type = 'button';
    this.resetButton.addEventListener('click', () => {
      if (!window.confirm('Replace this front-panel layout with the starter design?')) return;
      this.state = this.defaultLayout();
      this.selectedId = null;
      this.selectedIds?.clear();
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


  buildDesignTools() {
    const tools = make('div', 'ofp-design-tools', this.stagePanel);
    const toggle = (label, key) => {
      const button = make('button', 'ofp-tool-toggle', tools, label);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(Boolean(this.state[key])));
      button.addEventListener('click', () => {
        this.state[key] = !this.state[key];
        button.setAttribute('aria-pressed', String(this.state[key]));
        this.render();
        this.commit();
      });
      return button;
    };
    toggle('RULERS', 'showRulers');
    toggle('GRID', 'showGrid');
    toggle('GUIDES', 'showGuides');
    toggle('SMART', 'showSmartGuides');
    toggle('SAFE AREA', 'showSafeMargin');
    const zoomOut = make('button', 'ofp-tool-toggle', tools, '− ZOOM');
    zoomOut.type = 'button'; zoomOut.addEventListener('click', () => { this.state.zoom = clamp((this.state.zoom || 1) - .15, .25, 3); this.scaleFaceplate(); this.commit(); });
    const zoomIn = make('button', 'ofp-tool-toggle', tools, '+ ZOOM');
    zoomIn.type = 'button'; zoomIn.addEventListener('click', () => { this.state.zoom = clamp((this.state.zoom || 1) + .15, .25, 3); this.scaleFaceplate(); this.commit(); });
    this.snapButton = toggle('SNAP', 'snap');
    this.measureButton = make('button', 'ofp-tool-toggle', tools, 'MEASURE');
    this.measureButton.type = 'button';
    this.measureButton.setAttribute('aria-pressed', 'false');
    this.measureButton.addEventListener('click', () => {
      this.tool = this.tool === 'measure' ? 'select' : 'measure';
      this.measureButton.setAttribute('aria-pressed', String(this.tool === 'measure'));
      this.viewport.classList.toggle('is-measuring', this.tool === 'measure');
    });
    const unit = make('select', 'ofp-tool-select', tools);
    [['px','PX'],['mm','MM'],['in','IN']].forEach(([value,label]) => {
      const option = make('option', '', unit, label); option.value = value;
    });
    unit.value = this.state.unit || 'mm';
    unit.setAttribute('aria-label', 'Ruler measurement units');
    unit.addEventListener('change', () => { this.state.unit = unit.value; this.renderRulers(); this.renderInspector(); this.commit(); });
    const addGuide = (axis, label) => {
      const button = make('button', 'ofp-tool-toggle', tools, label);
      button.type = 'button';
      button.addEventListener('click', () => {
        this.pendingGuideAxis = axis;
        this.tool = 'guide';
        this.viewport.classList.add('is-placing-guide');
        this.app.msg('Click the faceplate to place a ' + (axis === 'x' ? 'vertical' : 'horizontal') + ' guide.');
      });
    };
    addGuide('x', '+ V GUIDE');
    addGuide('y', '+ H GUIDE');
    const clearMeasures = make('button', 'ofp-tool-toggle', tools, 'CLEAR MEASURE');
    clearMeasures.type = 'button';
    clearMeasures.addEventListener('click', () => { this.state.measurements = []; this.render(); this.commit(); });
    this.stagePanel.insertBefore(tools, this.horizontalRuler);
    const align = make('div', 'ofp-align-tools', this.stagePanel);
    make('span', 'ofp-align-tools__label', align, 'ALIGN');
    [['left','LEFT'],['centerX','CENTRE X'],['right','RIGHT'],['top','TOP'],['centerY','CENTRE Y'],['bottom','BOTTOM'],['distributeX','SPACE X']].forEach(([mode,label]) => {
      const button = make('button', 'ofp-tool-toggle ofp-tool-toggle--compact', align, label);
      button.type = 'button'; button.title = 'Align selected controls: ' + label.toLowerCase();
      button.addEventListener('click', () => this.alignSelection(mode));
    });
    this.stagePanel.insertBefore(align, this.horizontalRuler);
  }

  buildLayerPanel() {
    this.layersPanel = make('section', 'ofp-layers-panel', this.library);
    const head = make('div', 'ofp-panel-heading', this.layersPanel);
    make('span', 'ofp-panel-heading__eyebrow', head, 'LAYERS');
    make('strong', '', head, 'Faceplate stack');
    this.layersList = make('div', 'ofp-layers-list', this.layersPanel);
    this.renderLayers();
  }

  renderLayers() {
    if (!this.layersList) return;
    this.layersList.replaceChildren();
    [...this.state.components].reverse().forEach((component) => {
      const row = make('div', 'ofp-layer-row', this.layersList);
      row.classList.toggle('is-selected', this.selectedIds?.has(component.id) || component.id === this.selectedId);
      const select = make('button', 'ofp-layer-name', row, component.label || component.type);
      select.type = 'button'; select.title = component.type + ' · ' + component.id;
      select.addEventListener('click', (event) => this.select(component.id, event.shiftKey || event.ctrlKey || event.metaKey));
      const visibility = make('button', 'ofp-layer-icon', row, component.hidden ? '○' : '●');
      visibility.type = 'button'; visibility.title = component.hidden ? 'Show layer' : 'Hide layer';
      visibility.setAttribute('aria-label', visibility.title);
      visibility.addEventListener('click', () => { component.hidden = !component.hidden; this.render(); this.commit(); });
      const lock = make('button', 'ofp-layer-icon', row, component.locked ? '▣' : '◇');
      lock.type = 'button'; lock.title = component.locked ? 'Unlock layer' : 'Lock layer';
      lock.setAttribute('aria-label', lock.title);
      lock.addEventListener('click', () => { component.locked = !component.locked; this.render(); this.commit(); });
      const up = make('button', 'ofp-layer-icon', row, '↑'); up.type = 'button'; up.title = 'Bring forward';
      up.addEventListener('click', () => this.moveLayer(component.id, 1));
      const down = make('button', 'ofp-layer-icon', row, '↓'); down.type = 'button'; down.title = 'Send backward';
      down.addEventListener('click', () => this.moveLayer(component.id, -1));
    });
    if (!this.state.components.length) make('p', 'ofp-help', this.layersList, 'Your panel has no components yet.');
  }

  moveLayer(componentId, direction) {
    const index = this.state.components.findIndex((item) => item.id === componentId);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= this.state.components.length) return;
    const [item] = this.state.components.splice(index, 1);
    this.state.components.splice(next, 0, item);
    this.render();
    this.commit();
  }

  alignSelection(mode) {
    const ids = this.selectedIds?.size ? this.selectedIds : (this.selectedId ? new Set([this.selectedId]) : new Set());
    const items = this.state.components.filter((item) => ids.has(item.id) && !item.locked);
    if (items.length < 2) { this.app.msg('Select at least two unlocked layers to align them.'); return; }
    const left = Math.min(...items.map((item) => item.x));
    const right = Math.max(...items.map((item) => item.x + item.w));
    const top = Math.min(...items.map((item) => item.y));
    const bottom = Math.max(...items.map((item) => item.y + item.h));
    if (mode === 'left') items.forEach((item) => { item.x = left; });
    if (mode === 'right') items.forEach((item) => { item.x = right - item.w; });
    if (mode === 'centerX') items.forEach((item) => { item.x = (left + right - item.w) / 2; });
    if (mode === 'top') items.forEach((item) => { item.y = top; });
    if (mode === 'bottom') items.forEach((item) => { item.y = bottom - item.h; });
    if (mode === 'centerY') items.forEach((item) => { item.y = (top + bottom - item.h) / 2; });
    if (mode === 'distributeX' && items.length > 2) {
      const ordered = [...items].sort((a,b) => a.x-b.x);
      const occupied = ordered.reduce((sum,item)=>sum+item.w,0);
      const gap = (right-left-occupied)/(ordered.length-1);
      let cursor = left;
      ordered.forEach((item)=>{item.x=cursor;cursor+=item.w+gap;});
    }
    this.render();
    this.commit();
  }

  bindEditorShortcuts() {
    this.el.addEventListener('keydown', (event) => {
      if (this.el.hidden) return;
      const editable = event.target.closest('input,textarea,select,[contenteditable="true"]');
      if (editable) return;
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === 'd') { event.preventDefault(); event.stopPropagation(); this.duplicateSelected(); }
      else if (command && event.key.toLowerCase() === 'z') { event.preventDefault(); event.stopPropagation(); event.shiftKey ? this.app.redo() : this.app.undo(); }
      else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); event.stopPropagation(); this.removeSelected(); }
      else if (event.key.startsWith('Arrow') && this.selectedId) {
        const item = this.getComponent(this.selectedId); if (!item || item.locked) return;
        const step = event.shiftKey ? 10 : 1;
        if (event.key === 'ArrowLeft') item.x = Math.max(0, item.x-step);
        if (event.key === 'ArrowRight') item.x = Math.min(this.state.width-item.w, item.x+step);
        if (event.key === 'ArrowUp') item.y = Math.max(0, item.y-step);
        if (event.key === 'ArrowDown') item.y = Math.min(this.state.height-item.h, item.y+step);
        const node = this.faceplate.querySelector('[data-component-id="' + item.id + '"]');
        if (node) { node.style.left=item.x+'px'; node.style.top=item.y+'px'; }
        this.commit(); this.renderRulers(); event.preventDefault(); event.stopPropagation();
      }
    });
  }

  unitValue(px) {
    if (this.state.unit === 'mm') return px / 3.7795275591;
    if (this.state.unit === 'in') return px / 96;
    return px;
  }

  unitText(px) {
    const value = this.unitValue(px);
    const digits = this.state.unit === 'px' ? 0 : 1;
    return value.toFixed(digits) + ' ' + (this.state.unit || 'mm');
  }

  unitPixels(value) {
    if (this.state.unit === 'mm') return Number(value) * 3.7795275591;
    if (this.state.unit === 'in') return Number(value) * 96;
    return Number(value);
  }

  toPanelPoint(event) {
    const rect = this.faceplate.getBoundingClientRect();
    const scale = this.currentScale || 1;
    return {
      x: clamp((event.clientX - rect.left) / scale, 0, this.state.width),
      y: clamp((event.clientY - rect.top) / scale, 0, this.state.height),
    };
  }

  renderRulers() {
    if (!this.horizontalRuler || !this.verticalRuler) return;
    this.horizontalRuler.hidden = !this.state.showRulers;
    this.verticalRuler.hidden = !this.state.showRulers;
    if (!this.state.showRulers) return;
    this.horizontalRuler.replaceChildren();
    this.verticalRuler.replaceChildren();
    const scale = this.currentScale || 1;
    const rulerWidth = this.state.width * scale;
    const rulerHeight = this.state.height * scale;
    this.horizontalRuler.style.width = rulerWidth + 'px';
    this.horizontalRuler.style.marginLeft = 'calc(24px + (100% - 24px - ' + rulerWidth + 'px) / 2)';
    this.verticalRuler.style.height = rulerHeight + 'px';
    this.verticalRuler.style.marginTop = 'auto';
    this.verticalRuler.style.marginBottom = 'auto';
    const xStep = this.state.width > 1500 ? 200 : 100;
    const yStep = this.state.height > 650 ? 100 : 50;
    for (let x=0; x<=this.state.width; x+=xStep) {
      const tick = make('span','ofp-ruler__tick',this.horizontalRuler,this.unitText(x));
      tick.style.left=(x/this.state.width*100)+'%';
    }
    for (let y=0; y<=this.state.height; y+=yStep) {
      const tick = make('span','ofp-ruler__tick',this.verticalRuler,this.unitText(y));
      tick.style.top=(y/this.state.height*100)+'%';
    }
  }

  renderDesignOverlays() {
    const overlays = make('div','ofp-overlays',this.faceplate);
    if (this.state.showGrid) {
      const grid = make('div','ofp-grid-overlay',overlays);
      const size = Math.max(4, Number(this.state.gridSize) || 28);
      grid.style.backgroundSize = size+'px '+size+'px';
    }
    if (this.state.showSafeMargin) {
      const safe = make('div','ofp-safe-margin',overlays);
      const margin = clamp(this.state.safeMargin ?? 24,0,120);
      safe.style.inset = margin+'px';
    }
    if (this.state.showGuides) {
      (this.state.guides || []).forEach((guide) => {
        const line = make('div','ofp-guide-line ofp-guide-line--'+guide.axis,overlays);
        line.style.setProperty('--ofp-guide-color',safeColor(guide.color,'#7de4ff'));
        if (guide.axis === 'x') line.style.left=guide.position+'px';
        else line.style.top=guide.position+'px';
        line.title='Drag guide to reposition';
        line.addEventListener('pointerdown',(event)=>{
          event.preventDefault(); event.stopPropagation();
          const start=this.toPanelPoint(event), origin=guide.position;
          const move=(next)=>{
            const point=this.toPanelPoint(next);
            guide.position=clamp(origin+(guide.axis==='x'?point.x-start.x:point.y-start.y),0,guide.axis==='x'?this.state.width:this.state.height);
            line.style[guide.axis==='x'?'left':'top']=guide.position+'px';
          };
          const finish=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',finish);this.commit();this.renderRulers();};
          document.addEventListener('pointermove',move);document.addEventListener('pointerup',finish,{once:true});
        });
      });
    }
    this.smartGuideLayer=make('div','ofp-smart-guides',overlays);
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('class','ofp-measurements');svg.setAttribute('viewBox','0 0 '+this.state.width+' '+this.state.height);
    svg.setAttribute('width',String(this.state.width));svg.setAttribute('height',String(this.state.height));
    (this.state.measurements||[]).forEach((m)=>{
      const line=document.createElementNS('http://www.w3.org/2000/svg','line');
      line.setAttribute('x1',m.x1);line.setAttribute('y1',m.y1);line.setAttribute('x2',m.x2);line.setAttribute('y2',m.y2);
      line.setAttribute('stroke','#7de4ff');line.setAttribute('stroke-width','1.5');line.setAttribute('stroke-dasharray','6 4');
      svg.appendChild(line);
      const midX=(m.x1+m.x2)/2,midY=(m.y1+m.y2)/2;
      const label=document.createElementNS('http://www.w3.org/2000/svg','text');
      label.setAttribute('x',midX+7);label.setAttribute('y',midY-7);label.setAttribute('fill','#7de4ff');label.setAttribute('font-size','12');
      label.textContent=this.unitText(Math.hypot(m.x2-m.x1,m.y2-m.y1));svg.appendChild(label);
    });
    overlays.appendChild(svg);
    this.measureSvg=svg;
  }

  renderSmartGuides(alignX=null,alignY=null) {
    if (!this.smartGuideLayer || !this.state.showSmartGuides) return;
    this.smartGuideLayer.replaceChildren();
    if (alignX!==null) { const line=make('div','ofp-smart-guide ofp-smart-guide--vertical',this.smartGuideLayer);line.style.left=alignX+'px'; }
    if (alignY!==null) { const line=make('div','ofp-smart-guide ofp-smart-guide--horizontal',this.smartGuideLayer);line.style.top=alignY+'px'; }
  }

  clearSmartGuides() { this.smartGuideLayer?.replaceChildren(); }

  snapPosition(component,x,y) {
    if (this.state.snap) {
      const size=Math.max(1,Number(this.state.gridSize)||28);
      x=Math.round(x/size)*size;y=Math.round(y/size)*size;
    }
    const limit=9/(this.currentScale||1);
    let alignX=null,alignY=null,bestX=limit,bestY=limit;
    const xs=[x,x+component.w/2,x+component.w],ys=[y,y+component.h/2,y+component.h];
    const candidates=this.state.components.filter((item)=>item.id!==component.id&&!item.hidden);
    candidates.forEach((item)=>{
      const targetsX=[item.x,item.x+item.w/2,item.x+item.w];
      const targetsY=[item.y,item.y+item.h/2,item.y+item.h];
      xs.forEach((pos,index)=>targetsX.forEach((target)=>{
        const d=Math.abs(pos-target);if(d<bestX){bestX=d;alignX=target;x+=target-pos;}
      }));
      ys.forEach((pos,index)=>targetsY.forEach((target)=>{
        const d=Math.abs(pos-target);if(d<bestY){bestY=d;alignY=target;y+=target-pos;}
      }));
    });
    (this.state.guides||[]).forEach((guide)=>{
      const current=guide.axis==='x'?x+component.w/2:y+component.h/2;
      const d=Math.abs(current-guide.position);
      if(d<limit){if(guide.axis==='x'){x+=guide.position-current;alignX=guide.position;}else{y+=guide.position-current;alignY=guide.position;}}
    });
    return {x:clamp(x,0,this.state.width-component.w),y:clamp(y,0,this.state.height-component.h),alignX,alignY};
  }

  beginMeasurement(event) {
    event.preventDefault();event.stopPropagation();
    const start=this.toPanelPoint(event);
    const draft={x1:start.x,y1:start.y,x2:start.x,y2:start.y};
    this.measureDraft=draft;
    const update=()=>{
      const svg=this.measureSvg;if(!svg)return;
      svg.querySelector('[data-draft]')?.remove();
      const line=document.createElementNS('http://www.w3.org/2000/svg','line');
      line.dataset.draft='true';line.setAttribute('x1',draft.x1);line.setAttribute('y1',draft.y1);line.setAttribute('x2',draft.x2);line.setAttribute('y2',draft.y2);
      line.setAttribute('stroke','#ffb75e');line.setAttribute('stroke-width','2');line.setAttribute('stroke-dasharray','4 3');svg.appendChild(line);
      this.app.msg('Measure: '+this.unitText(Math.hypot(draft.x2-draft.x1,draft.y2-draft.y1))+' · ΔX '+this.unitText(Math.abs(draft.x2-draft.x1))+' · ΔY '+this.unitText(Math.abs(draft.y2-draft.y1)));
    };
    const move=(next)=>{const point=this.toPanelPoint(next);draft.x2=point.x;draft.y2=point.y;update();};
    const finish=()=>{
      document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',finish);
      if(Math.hypot(draft.x2-draft.x1,draft.y2-draft.y1)>2){this.state.measurements.push(draft);this.commit();}
      this.measureDraft=null;this.render();
    };
    document.addEventListener('pointermove',move);document.addEventListener('pointerup',finish,{once:true});
  }

  placeGuide(event) {
    event.preventDefault();event.stopPropagation();
    const point=this.toPanelPoint(event);
    const axis=this.pendingGuideAxis;
    const coordinate=axis==='x'?point.x:point.y;
    this.state.guides ||= [];
    this.state.guides.push({id:id(),axis,position:coordinate,color:'#7de4ff'});
    this.pendingGuideAxis=null;this.tool='select';this.viewport.classList.remove('is-placing-guide');
    this.render();this.commit();
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

  rangeRatio(range, value) {
    const number = Number(value);
    if (range.log && range.min > 0 && range.max > range.min) {
      return clamp((Math.log(Math.max(range.min, number)) - Math.log(range.min)) / (Math.log(range.max) - Math.log(range.min)), 0, 1);
    }
    return range.max > range.min ? clamp((number - range.min) / (range.max - range.min), 0, 1) : 0;
  }

  toInputValue(value, range) {
    return range.log && range.min > 0 ? Math.log(Math.max(range.min, Number(value))) : Number(value);
  }

  fromInputValue(value, range) {
    return range.log && range.min > 0 ? Math.exp(Number(value)) : Number(value);
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
    input.min = String(this.toInputValue(range.min, range));
    input.max = String(this.toInputValue(range.max, range));
    input.step = String(range.log ? 0.001 : range.step);
    input.value = String(this.toInputValue(clamp(this.getValue(component, key), range.min, range.max), range));
    input.setAttribute('aria-label', component.label + (key ? ' ' + key : ''));
    input.dataset.componentId = component.id;
    input.addEventListener('input', () => {
      const value = this.fromInputValue(Number(input.value), range);
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
    const ratio = this.rangeRatio(range, value);
    node.style.setProperty('--ofp-value', String(ratio));
    const output = node.querySelector('[data-ofp-role="value"]');
    if (output) output.textContent = range.log ? Math.round(value).toLocaleString() : (Number(value).toFixed(range.step >= 1 ? 0 : 2));
    const meterFill = node.querySelector('.ofp-meter__fill'); if (meterFill) meterFill.style.width = (ratio * 100) + '%';
    const ring = node.querySelector('.ofp-knob__ring');
    if (ring) ring.style.setProperty('--ofp-angle', String(-135 + ratio * 270) + 'deg');
    const toggle = node.querySelector('.ofp-switch'); if (toggle) { toggle.classList.toggle('is-on', value > (range.min + range.max) / 2); const label = toggle.querySelector('.ofp-switch__label'); if (label) label.textContent = value > (range.min + range.max) / 2 ? 'ON' : 'OFF'; }
  }

  render() {
    this.faceplate.replaceChildren();
    this.faceplate.style.width = this.state.width + 'px';
    this.faceplate.style.height = this.state.height + 'px';
    this.faceplate.dataset.finish = this.state.finish || 'matte';
    this.faceplate.style.setProperty('--ofp-panel-color', safeColor(this.state.panelColor, '#252d35'));
    this.faceplate.style.setProperty('--ofp-accent', safeColor(this.state.accent, '#ffb75e'));
    this.faceplate.style.setProperty('--ofp-text', safeColor(this.state.textColor, '#edf3fa'));
    this.stageDimensions.textContent = this.unitText(this.state.width) + ' × ' + this.unitText(this.state.height);
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
      const ratio = this.rangeRatio(range, value);
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
      const lines = String(component.text || 'DISPLAY TEXT').split('\n');
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
      let active = false;
      const down = (event) => {
        if (active) return;
        event.preventDefault();
        active = true;
        try { pad.setPointerCapture(event.pointerId); } catch { /* optional pointer capture */ }
        pad.classList.add('is-active');
        this.app.noteOn(note, .9, 1);
      };
      const up = (event) => {
        if (!active) return;
        active = false;
        pad.classList.remove('is-active');
        try { pad.releasePointerCapture(event.pointerId); } catch { /* pointer may already be released */ }
        this.app.noteOff(note, 1);
      };
      pad.addEventListener('pointerdown', down);
      pad.addEventListener('pointerup', up);
      pad.addEventListener('pointercancel', up);
      pad.addEventListener('lostpointercapture', () => { if (active) { active = false; pad.classList.remove('is-active'); this.app.noteOff(note, 1); } });
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
      if (event.target.closest('input,select,button,textarea,a') || event.target.closest('.ofp-component__resize')) {
        this.select(component.id, event.shiftKey || event.ctrlKey || event.metaKey);
        return;
      }
      if (component.locked) { this.select(component.id, event.shiftKey || event.ctrlKey || event.metaKey); return; }
      event.preventDefault();
      const multi = event.shiftKey || event.ctrlKey || event.metaKey;
      if (multi || !this.selectedIds?.has(component.id)) this.select(component.id, multi);
      const scale = this.currentScale || 1;
      const startX = event.clientX, startY = event.clientY;
      const moving = this.selectedIds?.has(component.id)
        ? [...this.selectedIds].map((selectedId) => this.getComponent(selectedId)).filter((item) => item && !item.locked)
        : [component];
      const origins = moving.map((item) => ({ item, x: item.x, y: item.y }));
      const originX = component.x, originY = component.y;
      try { node.setPointerCapture(event.pointerId); } catch { /* optional pointer capture */ }
      const move = (moveEvent) => {
        let nextX = clamp(originX + (moveEvent.clientX - startX) / scale, 0, this.state.width - component.w);
        let nextY = clamp(originY + (moveEvent.clientY - startY) / scale, 0, this.state.height - component.h);
        if (moving.length === 1) {
          const snapped = this.snapPosition(component, nextX, nextY);
          nextX = snapped.x; nextY = snapped.y;
          this.renderSmartGuides(snapped.alignX, snapped.alignY);
        } else {
          const grid = Math.max(1, Number(this.state.gridSize) || 28);
          if (this.state.snap) { nextX = Math.round(nextX / grid) * grid; nextY = Math.round(nextY / grid) * grid; }
        }
        const dx = nextX - originX, dy = nextY - originY;
        origins.forEach(({ item, x, y }) => {
          item.x = clamp(x + dx, 0, this.state.width - item.w);
          item.y = clamp(y + dy, 0, this.state.height - item.h);
          const element = this.faceplate.querySelector('[data-component-id="' + item.id + '"]');
          if (element) { element.style.left = item.x + 'px'; element.style.top = item.y + 'px'; }
        });
        this.renderRulers();
      };
      const finish = () => {
        node.removeEventListener('pointermove', move);
        node.removeEventListener('pointerup', finish);
        node.removeEventListener('pointercancel', finish);
        this.clearSmartGuides();
        this.commit();
        this.renderLayers();
        this.renderInspector();
      };
      node.addEventListener('pointermove', move);
      node.addEventListener('pointerup', finish, { once: true });
      node.addEventListener('pointercancel', finish, { once: true });
    });
  }

  bindResize(handle, node, component) {
    handle.disabled = Boolean(component.locked);
    handle.addEventListener('pointerdown', (event) => {
      if (component.locked) return;
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
    if (type === 'screen' || type === 'oled') component.text = 'YOUR TEXT\nDISPLAY CONTENT';
    this.state.components.push(component);
    this.selectedId = component.id;
    this.selectedIds = new Set([component.id]);
    this.render();
    this.commit();
  }

  removeSelected() {
    const ids = this.selectedIds?.size ? new Set(this.selectedIds) : new Set(this.selectedId ? [this.selectedId] : []);
    if (!ids.size) return;
    this.state.components = this.state.components.filter((item) => !ids.has(item.id));
    this.selectedId = null;
    this.selectedIds?.clear();
    this.render();
    this.commit();
  }

  duplicateSelected() {
    const selected = this.selectedIds?.size
      ? this.state.components.filter((item) => this.selectedIds.has(item.id))
      : [this.getComponent(this.selectedId)].filter(Boolean);
    const copies = selected.filter((item) => !item.locked).map((component) => {
      const copy = clone(component);
      copy.id = id(); copy.locked = false; copy.hidden = false;
      copy.x = clamp(copy.x + 26, 0, this.state.width - copy.w);
      copy.y = clamp(copy.y + 26, 0, this.state.height - copy.h);
      return copy;
    });
    if (!copies.length) return;
    this.state.components.push(...copies);
    this.selectedIds = new Set(copies.map((item) => item.id));
    this.selectedId = copies.length === 1 ? copies[0].id : null;
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
    this.inputField('X position (' + this.state.unit + ')', this.unitValue(component.x), 'number', (value) => this.updateComponentProperty(component, 'x', clamp(this.unitPixels(value), 0, this.state.width - component.w)), position);
    this.inputField('Y position (' + this.state.unit + ')', this.unitValue(component.y), 'number', (value) => this.updateComponentProperty(component, 'y', clamp(this.unitPixels(value), 0, this.state.height - component.h)), position);
    const dimensions = make('div', 'ofp-field-grid', this.inspectorBody);
    this.inputField('Width (' + this.state.unit + ')', this.unitValue(component.w), 'number', (value) => this.updateComponentProperty(component, 'w', clamp(this.unitPixels(value), 48, Math.min(760, this.state.width - component.x))), dimensions);
    this.inputField('Height (' + this.state.unit + ')', this.unitValue(component.h), 'number', (value) => this.updateComponentProperty(component, 'h', clamp(this.unitPixels(value), 42, Math.min(440, this.state.height - component.y))), dimensions);

    if (component.type === 'module') {
      const modules = [['', 'No module']];
      this.app.patch.modules.forEach((module) => modules.push([module.id, MODULES[module.type]?.name + ' · ' + module.id]));
      this.selectField('Module', component.bind?.moduleId || '', modules, (value) => {
        component.bind = value ? { moduleId: value } : null;
        this.render();
        this.commit();
      });
    } else if (['knob', 'dial', 'encoder', 'slider', 'dropdown', 'switch', 'meter', 'drawbars'].includes(component.type)) {
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
    this.inputField('Clearance / margin (' + this.state.unit + ')', this.unitValue(component.margin ?? 8), 'number', (value) => this.updateComponentProperty(component, 'margin', clamp(this.unitPixels(value), 0, 180)));
    this.colorField('Legend colour', component.textColor || this.state.textColor, (value, commit) => { component.textColor = value; this.faceplate.querySelector('[data-component-id="' + component.id + '"]')?.style.setProperty('--ofp-control-text', value); if (commit) this.commit(); });
    this.colorField('Border colour', component.borderColor || component.accent || this.state.accent, (value, commit) => { component.borderColor = value; this.faceplate.querySelector('[data-component-id="' + component.id + '"]')?.style.setProperty('--ofp-control-border', value); if (commit) this.commit(); });
    if (component.type === 'pad') this.inputField('MIDI note', component.note ?? 60, 'number', (value) => { component.note = clamp(value, 0, 127); this.render(); this.commit(); });
    if (component.type === 'keyboard') this.inputField('Starting MIDI note', component.startNote ?? 48, 'number', (value) => { component.startNote = clamp(value, 0, 96); this.render(); this.commit(); });
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
    this.inputField('Panel width (' + this.state.unit + ')', this.unitValue(this.state.width), 'number', (value) => {
      this.state.width = clamp(this.unitPixels(value), 800, 1800);
      this.state.components.forEach((item) => { item.w = Math.min(item.w, this.state.width); item.x = clamp(item.x, 0, this.state.width - item.w); });
      this.render();
      this.commit();
    });
    this.inputField('Panel height (' + this.state.unit + ')', this.unitValue(this.state.height), 'number', (value) => {
      this.state.height = clamp(this.unitPixels(value), 360, 900);
      this.state.components.forEach((item) => { item.h = Math.min(item.h, this.state.height); item.y = clamp(item.y, 0, this.state.height - item.h); });
      this.render();
      this.commit();
    });
    this.selectField('Panel material', this.state.finish, FINISHES, (value) => {
      this.state.finish = value;
      this.state.components.forEach((item) => { if (!item.finish) item.finish = value; });
      this.render();
      this.commit();
    });
    this.inputField('Safe margin (' + this.state.unit + ')', this.unitValue(this.state.safeMargin ?? 24), 'number', (value) => { this.state.safeMargin = clamp(this.unitPixels(value), 0, 450); this.render(); this.commit(); });
    this.inputField('Grid spacing (' + this.state.unit + ')', this.unitValue(this.state.gridSize ?? 28), 'number', (value) => { this.state.gridSize = clamp(this.unitPixels(value), 4, 450); this.render(); this.commit(); });
    const guideHead = make('div', 'ofp-panel-heading', this.inspectorBody);
    make('span', 'ofp-panel-heading__eyebrow', guideHead, 'GUIDES');
    make('strong', '', guideHead, 'Alignment references');
    (this.state.guides || []).forEach((guide, index) => {
      const row = make('div', 'ofp-guide-setting', this.inspectorBody);
      make('span', 'ofp-guide-setting__name', row, (guide.axis === 'x' ? 'VERTICAL' : 'HORIZONTAL') + ' GUIDE');
      this.inputField('Position (' + this.state.unit + ')', this.unitValue(guide.position), 'number', (value) => {
        guide.position = clamp(this.unitPixels(value), 0, guide.axis === 'x' ? this.state.width : this.state.height);
        this.render(); this.commit();
      }, row);
      this.colorField('Colour', guide.color || '#7de4ff', (value, commit) => {
        guide.color = value;
        this.faceplate.querySelectorAll('.ofp-guide-line')[index]?.style.setProperty('--ofp-guide-color', value);
        if (commit) this.commit();
      }, row);
      const removeGuide = make('button', 'ofp-inspector-action ofp-inspector-action--danger', row, 'REMOVE GUIDE');
      removeGuide.type = 'button';
      removeGuide.addEventListener('click', () => { this.state.guides.splice(index, 1); this.render(); this.commit(); });
    });
    const guideActions = make('div', 'ofp-field-grid', this.inspectorBody);
    [['x','ADD VERTICAL'],['y','ADD HORIZONTAL']].forEach(([axis,label]) => {
      const button = make('button', 'ofp-inspector-action', guideActions, label);
      button.type = 'button';
      button.addEventListener('click', () => {
        this.pendingGuideAxis = axis;
        this.tool = 'guide';
        this.viewport.classList.add('is-placing-guide');
        this.app.msg('Click the faceplate to position the guide.');
      });
    });
    const clearGuides = make('button', 'ofp-inspector-action ofp-inspector-action--danger', this.inspectorBody, 'CLEAR ALL GUIDES');
    clearGuides.type = 'button';
    clearGuides.addEventListener('click', () => { this.state.guides = []; this.render(); this.commit(); });
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
    const fit = Math.min(1, availableWidth / this.state.width, availableHeight / this.state.height);
    this.currentScale = clamp(fit * clamp(this.state.zoom ?? 1, .25, 3), 0.18, 3);
    this.faceplate.style.transform = 'scale(' + this.currentScale + ')';
    this.stage.style.width = (this.state.width * this.currentScale) + 'px';
    this.stage.style.height = (this.state.height * this.currentScale) + 'px';
    this.renderRulers();
  }

  refreshValues() {
    this.state.components.forEach((component) => {
      if (component.type === 'switch' || component.type === 'meter') {
        this.updateComponentVisual(component, null, this.getValue(component));
        return;
      }
      if (['knob','dial','encoder','slider','pitchwheel','modwheel'].includes(component.type)) {
        const node = this.faceplate.querySelector('[data-component-id="' + component.id + '"]');
        const input = node?.querySelector('input[type="range"]');
        if (!input) return;
        const value = this.getValue(component);
        const range = this.getRange(component);
        const inputValue = this.toInputValue(clamp(value, range.min, range.max), range);
        input.value = String(clamp(inputValue, Number(input.min), Number(input.max)));
        this.updateComponentVisual(component, null, value);
      } else if (component.type === 'dropdown') {
        const node = this.faceplate.querySelector('[data-component-id="' + component.id + '"]');
        const select = node?.querySelector('select');
        if (select) select.value = String(this.getValue(component));
      } else if (component.type === 'led') {
        const node = this.faceplate.querySelector('[data-component-id="' + component.id + '"]');
        node?.querySelector('.ofp-led')?.classList.toggle('is-on', Boolean(this.app.ctx));
      }
    });
  }

  refreshModuleReferences() {
    this.state.components.forEach((component) => {
      if (component.type !== 'module') return;
      const module = component.bind?.moduleId ? this.getModule(component.bind.moduleId) : null;
      const node = this.faceplate.querySelector('[data-component-id="' + component.id + '"]');
      if (!node) return;
      const name = node.querySelector('.ofp-module__name');
      const identity = node.querySelector('.ofp-module__id');
      const category = node.querySelector('.ofp-module__ports');
      if (name) name.textContent = module ? MODULES[module.type]?.name || module.type : 'Unassigned module';
      if (identity) identity.textContent = module ? module.id + '  /  LIVE MODULE' : 'SELECT A MODULE IN PROPERTIES';
      if (category) category.textContent = module ? MODULES[module.type]?.category || 'MODULE' : 'MODULE BAY';
    });
    if (this.inspector && this.selectedId) this.renderInspector();
  }

  setPatch(patch = this.app.patch) {
    this.state = patch.frontPanel ? clone(patch.frontPanel) : this.defaultLayout();
    patch.frontPanel = this.state;
    this.selectedId = null;
    this.selectedIds?.clear();
    this.render();
  }

  commit() {
    this.app.patch.frontPanel = this.state;
    this.app.pushHistory();
  }

  exportSVG() {
    const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    const width = this.state.width, height = this.state.height;
    const background = safeColor(this.state.panelColor, '#252d35');
    const globalAccent = safeColor(this.state.accent, '#ffb75e');
    const globalText = safeColor(this.state.textColor, '#edf3fa');
    const rect = (x,y,w,h,fill,stroke='none',radius=4,extra='') =>
      '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + radius + '" fill="' + fill + '" stroke="' + stroke + '" ' + extra + '/>';
    const text = (x,y,value,color,size=10,anchor='start',extra='') =>
      '<text x="' + x + '" y="' + y + '" fill="' + color + '" font-family="Arial,sans-serif" font-size="' + size + '" text-anchor="' + anchor + '" ' + extra + '>' + esc(value) + '</text>';
    const valueRatio = (component,key=null) => {
      const range=this.getRange(component,key), value=this.getValue(component,key);
      return this.rangeRatio(range,value);
    };
    const defs = [
      '<pattern id="ofp-brushed" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 1H4 M0 3H4" stroke="#ffffff" stroke-opacity=".12" stroke-width=".5"/></pattern>',
      '<pattern id="ofp-walnut" width="22" height="9" patternUnits="userSpaceOnUse"><path d="M0 2 C6 0 12 4 22 2 M0 7 C7 5 15 9 22 7" fill="none" stroke="#6e452d" stroke-opacity=".65" stroke-width=".8"/></pattern>',
      '<linearGradient id="ofp-anodized" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".14"/><stop offset=".48" stop-color="#6bc8df" stop-opacity=".06"/><stop offset="1" stop-color="#000000" stop-opacity=".2"/></linearGradient>',
      '<linearGradient id="ofp-ivory" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".35"/><stop offset="1" stop-color="#b3b9bc" stop-opacity=".12"/></linearGradient>',
    ].join('');
    const materialOverlay = (x,y,w,h,finish) => {
      if (finish === 'brushed') return rect(x,y,w,h,'url(#ofp-brushed)','none',7,'opacity=".75"');
      if (finish === 'walnut') return rect(x,y,w,h,'url(#ofp-walnut)','none',7,'opacity=".8"');
      if (finish === 'anodized') return rect(x,y,w,h,'url(#ofp-anodized)','none',7);
      if (finish === 'ivory') return rect(x,y,w,h,'url(#ofp-ivory)','none',7);
      return '';
    };
    const componentMarkup = this.state.components.filter((item) => !item.hidden).map((component) => {
      const x=component.x, y=component.y, w=component.w, h=component.h;
      const accent=safeColor(component.accent,globalAccent);
      const surface=safeColor(component.surface,'#26313d');
      const legend=safeColor(component.textColor,globalText);
      const border=safeColor(component.borderColor,accent);
      const finish=FINISHES.some(([key])=>key===component.finish)?component.finish:'matte';
      const label=esc(component.label || component.type.toUpperCase());
      let shape='';
      if (!['label','section'].includes(component.type)) {
        shape += rect(x,y,w,h,surface,border,7,'stroke-opacity=".55"');
        shape += materialOverlay(x,y,w,h,finish);
      }
      const cx=x+w/2, cy=y+h/2;
      if (['knob','dial','encoder'].includes(component.type)) {
        const r=Math.min(w,h)*.25, ratio=valueRatio(component), angle=(-135+ratio*270)*Math.PI/180;
        shape += '<circle cx="'+cx+'" cy="'+(y+h*.56)+'" r="'+(r*1.25)+'" fill="#111820" stroke="'+accent+'" stroke-width="2"/>';
        shape += '<circle cx="'+cx+'" cy="'+(y+h*.56)+'" r="'+r+'" fill="#56616b" stroke="#aeb9c2" stroke-opacity=".55"/>';
        shape += '<path d="M '+cx+' '+(y+h*.56-r*.65)+' L '+(cx+Math.sin(angle)*r*.75)+' '+(y+h*.56-Math.cos(angle)*r*.75)+'" stroke="'+accent+'" stroke-width="3" stroke-linecap="round"/>';
        shape += '<path d="M '+(cx-r*1.5)+' '+(y+h*.56+r*1.55)+' A '+(r*1.5)+' '+(r*1.5)+' 0 1 1 '+(cx+r*1.5)+' '+(y+h*.56+r*1.55)+'" fill="none" stroke="'+accent+'" stroke-opacity=".65"/>';
      } else if (component.type === 'slider') {
        const ratio=valueRatio(component), trackX=cx-3, trackY=y+28, trackH=Math.max(12,h-52);
        shape += rect(trackX,trackY,6,trackH,'#111820','#73808b',3);
        shape += rect(cx-10,trackY+trackH*(1-ratio)-5,20,10,'#cbd4da','#64727d',3);
      } else if (component.type === 'dropdown') {
        shape += rect(x+12,y+26,w-24,Math.max(18,h-36),'#17222c',border,4);
        shape += '<path d="M '+(x+w-30)+' '+(y+h/2-2)+' l 6 6 l 6 -6" fill="none" stroke="'+accent+'" stroke-width="1.5"/>';
      } else if (component.type === 'button') {
        shape += rect(x+14,y+25,w-28,Math.max(18,h-36),'#3d4a55',accent,5,'stroke-width="1.4"');
        shape += rect(x+18,y+28,w-36,Math.max(12,h-43),'#596672','none',4,'opacity=".45"');
      } else if (component.type === 'switch') {
        const ratio=valueRatio(component);
        shape += rect(cx-28,cy-12,56,24,ratio>.5?'#234b4c':'#111820',accent,12);
        shape += '<circle cx="'+(cx-16+ratio*32)+'" cy="'+cy+'" r="9" fill="#d5dde2" stroke="#778894"/>';
        shape += text(cx,y+h-8,ratio>.5?'ON':'OFF',legend,8,'middle');
      } else if (component.type === 'keyboard') {
        const top=y+27, keyHeight=Math.max(12,h-34), whiteCount=14, whiteW=w/whiteCount;
        shape += rect(x+7,top-4,w-14,keyHeight+8,'#090d11','#080b0e',3);
        for(let index=0;index<whiteCount;index++) shape += rect(x+7+index*whiteW,top,whiteW-1,keyHeight,'#e9edf0','#8996a2',2);
        const blackOffsets=[.70,1.72,3.70,4.72,5.72], blackW=whiteW*.52;
        for(let octave=0;octave<2;octave++) blackOffsets.forEach((offset)=>{shape+=rect(x+7+(octave*7+offset)*whiteW-blackW/2,top,blackW,keyHeight*.61,'#131a21','#05080b',2);});
      } else if (component.type === 'pitchwheel' || component.type === 'modwheel') {
        const ratio=valueRatio(component);
        shape += rect(cx-8,y+28,16,Math.max(15,h-48),'#0b1118','#6c7882',5);
        shape += rect(cx-20,y+30+(h-52)*(1-ratio)-6,40,12,'#cbd5dc',accent,3);
      } else if (component.type === 'drawbars') {
        const barTop=y+31, barH=Math.max(18,h-44), gap=3, slotW=(w-24-gap*8)/9;
        for(let index=1;index<=9;index++){
          const bx=x+12+(index-1)*(slotW+gap), ratio=this.getRange(component,'drawbar'+index);
          const actual=valueRatio(component,'drawbar'+index);
          shape += rect(bx+slotW*.38,barTop,Math.max(3,slotW*.24),barH,'#10171e','#65727d',2);
          shape += rect(bx+1,barTop+barH*(1-actual)-4,slotW-2,8,'#ccd6dc',accent,2);
        }
      } else if (component.type === 'module') {
        const module=component.bind?.moduleId?this.getModule(component.bind.moduleId):null;
        shape += text(cx,y+45,module?MODULES[module.type]?.name||module.type:'UNASSIGNED MODULE',legend,12,'middle','font-weight="bold"');
        shape += text(cx,y+62,module?module.id:'MODULE BAY',accent,8,'middle');
      } else if (component.type === 'screen' || component.type === 'oled') {
        shape += rect(x+8,y+25,w-16,h-33,'#061118',accent,3,'stroke-width="1.2"');
        String(component.text||'').split(/\r?\n/).slice(0,4).forEach((line,index)=>{
          shape += text(x+16,y+43+index*14,line,accent,index===0?12:9,'start','font-family="monospace"');
        });
      } else if (component.type === 'led') {
        shape += '<circle cx="'+cx+'" cy="'+(y+h*.6)+'" r="7" fill="'+(this.app.ctx?accent:'#202b35')+'" stroke="'+accent+'"/>';
        shape += text(cx+18,y+h*.64,component.label||'LED',legend,8,'start');
      } else if (component.type === 'meter') {
        const ratio=valueRatio(component);
        shape += rect(x+12,cy-6,w-24,12,'#101820','#667580',3);
        shape += rect(x+14,cy-4,(w-28)*ratio,8,accent,'none',2);
      } else if (component.type === 'pad') {
        shape += rect(x+12,y+27,w-24,h-38,'#36424c',accent,7,'stroke-width="1.4"');
      } else if (component.type === 'section') {
        shape += '<path d="M '+(x+6)+' '+cy+' H '+(x+w-6)+'" stroke="'+accent+'" stroke-width="1.5"/>';
      } else if (component.type === 'label') {
        shape += text(cx,cy+4,component.text||component.label,legend,12,'middle');
      }
      if (component.type !== 'label' && component.type !== 'section') {
        shape += text(cx,y+16,label,legend,8,'middle','letter-spacing="1"');
      } else if (component.type === 'section') {
        shape += '<rect x="'+(x+w*.2)+'" y="'+(cy-9)+'" width="'+(w*.6)+'" height="18" fill="'+background+'"/>';
        shape += text(cx,cy+3,component.text||component.label,legend,8,'middle','letter-spacing="1"');
      }
      return '<g data-component="'+esc(component.id)+'">'+shape+'</g>';
    }).join('');
    const panelFinish=materialOverlay(0,0,width,height,this.state.finish||'matte');
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'"><defs>'+defs+'</defs>'
      + rect(0,0,width,height,background,'#ffffff',16)
      + panelFinish + componentMarkup + '</svg>';
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
