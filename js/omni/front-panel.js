import { MODULES } from './modules.js?v=20261118-organ-drawbar-r1';
import { validatePatch } from './graph.js?v=20261119-front-panel-r2';

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

const MATERIAL_PRESETS = [
  { id: 'graphite', label: 'Black anodised · ice', finish: 'anodized', surface: '#202a31', accent: '#77d6e8', text: '#edf4f6', border: '#70828c' },
  { id: 'brushed', label: 'Satin aluminium · amber', finish: 'brushed', surface: '#a2abb0', accent: '#b87538', text: '#202a30', border: '#d9e0e3' },
  { id: 'walnut', label: 'American walnut · cream', finish: 'walnut', surface: '#4b2d20', accent: '#d9ad70', text: '#f4e6d2', border: '#9d7048' },
  { id: 'ivory', label: 'Warm enamel · oxide', finish: 'ivory', surface: '#e9e1ce', accent: '#a84d40', text: '#353a3d', border: '#b7ae9b' },
  { id: 'forest', label: 'Forest enamel · brass', finish: 'matte', surface: '#293e3a', accent: '#b9a36b', text: '#eaf0e8', border: '#768b7f' },
];

const FINISHES = [
  ['matte', 'Fine-texture powder coat'],
  ['brushed', 'Satin-brushed aluminium'],
  ['anodized', 'Black anodised aluminium'],
  ['walnut', 'Natural walnut veneer'],
  ['ivory', 'Gloss ivory enamel'],
];
const safeColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : fallback;

export class FrontPanelEditor {
  constructor(app, root) {
    this.app = app;
    this.selectedId = null;
    this.selectedIds = new Set();
    this.dragState = null;
    const savedPanel = app.patch.frontPanel;
    this.state = savedPanel && !this.isLegacyStarterLayout(savedPanel) ? clone(savedPanel) : this.defaultLayout();
    app.patch.frontPanel = this.state;
    this.build(root);
    this.render();
    if (typeof ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(() => this.scaleFaceplate());
      this.resizeObserver.observe(this.viewport);
    }
  }

  defaultLayout() {
    return {
      version: 1,
      width: 1240,
      height: 560,
      finish: 'anodized',
      unit: 'mm',
      zoom: 1,
      safeMargin: 28,
      gridSize: 24,
      showRulers: false,
      showGrid: false,
      showGuides: false,
      showSmartGuides: true,
      showSafeMargin: false,
      snap: true,
      guides: [],
      measurements: [],
      panelColor: '#252b32',
      panelBorderColor: '#66717b',
      panelBorderWidth: 1,
      panelRadius: 12,
      accent: '#e7a94e',
      textColor: '#e7edf2',
      components: [],
    };
  }

    isLegacyStarterLayout(panel) {
    if (!panel || panel.width !== 1240 || panel.height !== 520 || panel.finish !== 'brushed') return false;
    if (panel.unit !== 'mm' || panel.zoom !== 1 || panel.safeMargin !== 24 || panel.gridSize !== 28) return false;
    if (!panel.showRulers || !panel.showGrid || !panel.showGuides || !panel.showSmartGuides || !panel.showSafeMargin || !panel.snap) return false;
    if (panel.panelColor !== '#252d35' || panel.panelBorderColor !== '#667583' || panel.panelBorderWidth !== 1 || panel.panelRadius !== 14) return false;
    if (panel.accent !== '#ffb75e' || panel.textColor !== '#edf3fa' || !Array.isArray(panel.components) || panel.components.length !== 12) return false;
    if (!Array.isArray(panel.guides) || panel.guides.length !== 2 || panel.measurements?.length) return false;
    const expectedGuides = [{ axis: 'x', position: 620, color: '#7de4ff' }, { axis: 'y', position: 205, color: '#ffb75e' }];
    if (!expectedGuides.every((guide, index) => {
      const actual = panel.guides[index];
      return actual && actual.axis === guide.axis && actual.position === guide.position && actual.color === guide.color;
    })) return false;

    const find = (type) => this.app.patch.modules.find((module) => module.type === type);
    const filter = find('filter') || find('ladder');
    const oscillator = find('oscillator');
    const envelope = find('envelope');
    const base = {
      value: 0.5, accent: '#ffb75e', surface: '#26313d', textColor: '#edf3fa',
      finish: 'matte', margin: 8, padding: 7, gap: 5, radius: 7, fontSize: 8,
      borderWidth: 1, shadow: 'soft', orientation: 'horizontal', hidden: false, locked: false,
    };
    const expected = [
      { type: 'screen', label: 'INSTRUMENT', x: 26, y: 22, w: 238, h: 76, text: 'OVERTURE  /  OMNI\nUSER-DESIGNED INSTRUMENT', surface: '#111b25', accent: '#7de4ff' },
      { type: 'knob', label: 'CUTOFF', x: 296, y: 23, w: 112, h: 132, bind: filter ? { moduleId: filter.id, paramKey: 'cutoff' } : null },
      { type: 'dial', label: 'RESONANCE', x: 422, y: 23, w: 112, h: 132, bind: filter ? { moduleId: filter.id, paramKey: 'resonance' } : null },
      { type: 'slider', label: 'ATTACK', x: 554, y: 30, w: 74, h: 148, bind: envelope ? { moduleId: envelope.id, paramKey: 'attack' } : null },
      { type: 'dropdown', label: 'WAVEFORM', x: 650, y: 38, w: 174, h: 54, bind: oscillator ? { moduleId: oscillator.id, paramKey: 'wave' } : null },
      { type: 'button', label: 'ALL NOTES OFF', x: 856, y: 38, w: 142, h: 54, action: 'panic', accent: '#82e6a8' },
      { type: 'module', label: 'OSCILLATOR', x: 1018, y: 24, w: 194, h: 88, bind: oscillator ? { moduleId: oscillator.id } : null },
      { type: 'keyboard', label: 'KEYBOARD  /  2 OCTAVES', x: 26, y: 228, w: 720, h: 168, startNote: 48 },
      { type: 'pitchwheel', label: 'PITCH', x: 772, y: 220, w: 94, h: 176 },
      { type: 'modwheel', label: 'MOD', x: 882, y: 220, w: 94, h: 176 },
      { type: 'oled', label: 'STATUS DISPLAY', x: 1000, y: 220, w: 212, h: 106, text: 'READY\nPATCH DESIGNER', surface: '#071218', accent: '#7de4ff' },
      { type: 'led', label: 'AUDIO', x: 1030, y: 352, w: 154, h: 42, accent: '#82e6a8' },
    ];
    const fields = ['type','label','x','y','w','h','value','accent','surface','textColor','finish','margin','padding','gap','radius','fontSize','borderWidth','shadow','orientation','hidden','locked','bind','action','text','startNote','octaves'];
    return expected.every((defaults, index) => {
      const actual = panel.components[index];
      const signature = { ...base, ...defaults };
      return fields.every((field) => {
        const left = Object.prototype.hasOwnProperty.call(signature, field) ? signature[field] : undefined;
        const right = Object.prototype.hasOwnProperty.call(actual, field) ? actual[field] : undefined;
        return JSON.stringify(left) === JSON.stringify(right);
      });
    });
  }

    build(root) {
    this.el = make('section', 'omni-front-panel', root);
    this.el.hidden = true;

    const toolbar = make('div', 'ofp-toolbar', this.el);
    const identity = make('div', 'ofp-toolbar__identity', toolbar);
    make('span', 'ofp-kicker', identity, 'OMNI');
    make('strong', 'ofp-toolbar__title', identity, 'Front panel');

    const actions = make('div', 'ofp-toolbar__actions', toolbar);
    this.previewButton = make('button', 'ofp-action ofp-action--primary', actions, 'Preview');
    this.previewButton.type = 'button';
    this.previewButton.addEventListener('click', () => this.openPreview());
    this.testModeButton = make('button', 'ofp-action', actions, 'Test');
    this.testModeButton.type = 'button';
    this.testModeButton.setAttribute('aria-pressed', 'false');
    this.testModeButton.addEventListener('click', () => this.toggleTestMode());

    const moreMenu = make('details', 'ofp-toolbar-menu', actions);
    make('summary', 'ofp-toolbar-menu__trigger', moreMenu, 'More');
    const morePanel = make('div', 'ofp-toolbar-menu__panel', moreMenu);
    this.fitButton = make('button', 'ofp-menu-action', morePanel, 'Fit panel');
    this.fitButton.type = 'button';
    this.fitButton.addEventListener('click', () => { this.fitToViewport(); moreMenu.open = false; this.commit(); });
    this.resetButton = make('button', 'ofp-menu-action', morePanel, 'Clear panel…');
    this.resetButton.type = 'button';
    this.resetButton.addEventListener('click', () => {
      moreMenu.open = false;
      if (!window.confirm('Clear the faceplate and start with an empty layout?')) return;
      this.state = this.defaultLayout();
      this.selectedId = null;
      this.selectedIds?.clear();
      this.inspectorOpen = false;
      this.workspace?.classList.remove('is-inspector-open');
      this.render();
      this.commit();
    });
    this.checkButton = make('button', 'ofp-menu-action', morePanel, 'Design check');
    this.checkButton.type = 'button';
    this.checkButton.addEventListener('click', () => { moreMenu.open = false; this.runDesignCheck(); });

    this.workspace = make('div', 'ofp-workspace', this.el);
    this.libraryOpen = false;
    this.inspectorOpen = false;
    this.libraryMode = 'add';

    this.rail = make('nav', 'ofp-rail', this.workspace);
    this.rail.setAttribute('aria-label', 'Editor panels');
    const railButton = (icon, label, title) => {
      const button = make('button', 'ofp-rail-button', this.rail);
      button.type = 'button';
      button.title = title;
      button.setAttribute('aria-label', title);
      button.setAttribute('aria-pressed', 'false');
      make('span', 'ofp-rail-icon', button, icon);
      make('span', 'ofp-rail-label', button, label);
      return button;
    };
    this.addRailButton = railButton('+', 'Add', 'Add a control');
    this.addRailButton.addEventListener('click', () => this.toggleLibrary('add'));
    this.layersRailButton = railButton('▤', 'Layers', 'Show faceplate layers');
    this.layersRailButton.addEventListener('click', () => this.toggleLibrary('layers'));
    this.panelSettingsButton = railButton('◫', 'Panel', 'Edit faceplate settings');
    this.panelSettingsButton.addEventListener('click', () => this.togglePanelInspector());

    this.library = make('aside', 'ofp-library', this.workspace);
    this.cataloguePane = make('div', 'ofp-library-pane', this.library);
    const libHead = make('div', 'ofp-panel-heading', this.cataloguePane);
    make('span', 'ofp-panel-heading__eyebrow', libHead, 'INSERT');
    make('strong', '', libHead, 'Components');
    make('p', 'ofp-help', this.cataloguePane, 'Add a control, then place it on the faceplate.');
    this.componentSearch = make('input', 'ofp-library-search', this.cataloguePane);
    this.componentSearch.type = 'search';
    this.componentSearch.placeholder = 'Search components';
    this.componentSearch.setAttribute('aria-label', 'Search front-panel components');
    this.componentSearch.addEventListener('input', () => {
      const query = this.componentSearch.value.trim().toLowerCase();
      this.library.querySelectorAll('.ofp-library-item').forEach((button) => {
        button.hidden = Boolean(query) && !button.dataset.searchText.includes(query);
      });
      this.library.querySelectorAll('.ofp-library-group').forEach((group) => {
        group.hidden = Boolean(query) && !group.querySelector('.ofp-library-item:not([hidden])');
        if (query && !group.hidden) group.open = true;
      });
    });
    const groups = {};
    TYPES.forEach(([type, label, category]) => {
      if (!groups[category]) {
        const section = make('details', 'ofp-library-group', this.cataloguePane);
        section.open = category === 'CONTROLS';
        make('summary', 'ofp-library-group__heading', section, category.charAt(0) + category.slice(1).toLowerCase());
        groups[category] = make('div', 'ofp-library-grid', section);
      }
      const button = make('button', 'ofp-library-item', groups[category]);
      button.type = 'button';
      button.draggable = true;
      button.dataset.searchText = (label + ' ' + type + ' ' + category).toLowerCase();
      this.renderPalettePreview(type, button);
      make('span', 'ofp-library-item__label', button, label);
      button.addEventListener('click', () => this.addComponent(type));
      button.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('text/omni-front-component', type);
        event.dataTransfer.effectAllowed = 'copy';
      });
    });

    this.stagePanel = make('section', 'ofp-stage-panel', this.workspace);
    const stageHead = make('div', 'ofp-stage-head', this.stagePanel);
    const stageName = make('div', 'ofp-stage-head__identity', stageHead);
    make('strong', '', stageName, 'Instrument faceplate');
    const stageTools = make('div', 'ofp-stage-head__tools', stageHead);
    this.stageDimensions = make('span', 'ofp-stage-dimensions', stageTools);
    this.zoomOutButton = make('button', 'ofp-stage-zoom-button', stageTools, '−');
    this.zoomOutButton.type = 'button';
    this.zoomOutButton.setAttribute('aria-label', 'Zoom out');
    this.zoomOutButton.addEventListener('click', () => this.zoomBy(.8));
    this.zoomReadout = make('output', 'ofp-stage-zoom', stageTools, '100%');
    this.zoomInButton = make('button', 'ofp-stage-zoom-button', stageTools, '+');
    this.zoomInButton.type = 'button';
    this.zoomInButton.setAttribute('aria-label', 'Zoom in');
    this.zoomInButton.addEventListener('click', () => this.zoomBy(1.25));
    this.zoomFitButton = make('button', 'ofp-stage-zoom-fit', stageTools, 'Fit');
    this.zoomFitButton.type = 'button';
    this.zoomFitButton.addEventListener('click', () => this.fitToViewport());

    this.viewport = make('div', 'ofp-viewport', this.stagePanel);
    this.stage = make('div', 'ofp-stage', this.viewport);
    this.faceplate = make('div', 'ofp-faceplate', this.stage);
    this.faceplate.addEventListener('pointerdown', (event) => {
      if (this.tool === 'measure') { this.beginMeasurement(event); return; }
      if (this.pendingGuideAxis) { this.placeGuide(event); return; }
      if (event.target === this.faceplate || event.target === this.stage) {
        if (this.panState) return;
        this.select(null);
      }
    }, true);
    this.faceplate.addEventListener('dragover', (event) => {
      if (event.dataTransfer?.types?.includes('text/omni-front-component')) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }
    });
    this.faceplate.addEventListener('drop', (event) => {
      const type = event.dataTransfer?.getData('text/omni-front-component');
      if (!type) return;
      event.preventDefault();
      event.stopPropagation();
      const point = this.toPanelPoint(event);
      this.addComponent(type, point.x, point.y);
    });

    this.horizontalRuler = make('div', 'ofp-ruler ofp-ruler--horizontal', this.stagePanel);
    this.viewportRow = make('div', 'ofp-viewport-row', this.stagePanel);
    this.verticalRuler = make('div', 'ofp-ruler ofp-ruler--vertical', this.viewportRow);
    this.viewportRow.appendChild(this.viewport);
    this.stageFoot = make('div', 'ofp-stage-foot', this.stagePanel);
    make('span', '', this.stageFoot, 'Drag to move · Shift-click to select multiple · Space-drag to pan');
    this.bindViewportNavigation();
    this.buildDesignTools();
    this.buildLayerPanel();
    this.bindEditorShortcuts();

    this.inspector = make('aside', 'ofp-inspector', this.workspace);
    this.renderInspector();
  }
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
    this.resetButton = make('button', 'ofp-action', actions, 'CLEAR PANEL');
    this.resetButton.type = 'button';
    this.resetButton.addEventListener('click', () => {
      if (!window.confirm('Clear the faceplate and start with an empty layout?')) return;
      this.state = this.defaultLayout();
      this.selectedId = null;
      this.selectedIds?.clear();
      this.render();
      this.commit();
    });
    this.previewButton = make('button', 'ofp-action', actions, 'PREVIEW');
    this.previewButton.type = 'button';
    this.previewButton.addEventListener('click', () => this.openPreview());
    this.testModeButton = make('button', 'ofp-action', actions, 'TEST PANEL');
    this.testModeButton.type = 'button';
    this.testModeButton.setAttribute('aria-pressed', 'false');
    this.testModeButton.addEventListener('click', () => this.toggleTestMode());
    this.checkButton = make('button', 'ofp-action', actions, 'DESIGN CHECK');
    this.checkButton.type = 'button';
    this.checkButton.addEventListener('click', () => this.runDesignCheck());

    this.workspace = make('div', 'ofp-workspace', this.el);
    this.library = make('aside', 'ofp-library', this.workspace);
    const libHead = make('div', 'ofp-panel-heading', this.library);
    make('span', 'ofp-panel-heading__eyebrow', libHead, 'COMPONENTS');
    make('strong', '', libHead, 'Add to panel');
    make('p', 'ofp-help', this.library, 'Select a control to add it to the faceplate. Drag it into place, then edit its appearance and behaviour.');
    this.componentSearch = make('input', 'ofp-library-search', this.library);
    this.componentSearch.type = 'search';
    this.componentSearch.placeholder = 'Search controls and displays…';
    this.componentSearch.setAttribute('aria-label', 'Search front-panel components');
    this.componentSearch.addEventListener('input', () => {
      const query = this.componentSearch.value.trim().toLowerCase();
      this.library.querySelectorAll('.ofp-library-item').forEach((button) => {
        button.hidden = Boolean(query) && !button.dataset.searchText.includes(query);
      });
      this.library.querySelectorAll('.ofp-library-group').forEach((group) => {
        group.hidden = Boolean(query) && !group.querySelector('.ofp-library-item:not([hidden])');
        if (query && !group.hidden) group.open = true;
      });
    });
    const groups = {};
    TYPES.forEach(([type, label, category]) => {
      if (!groups[category]) {
        const section = make('details', 'ofp-library-group', this.library);
        section.open = category === 'CONTROLS' || category === 'PERFORMANCE';
        make('summary', 'ofp-library-group__heading', section, category);
        groups[category] = make('div', 'ofp-library-grid', section);
      }
      const button = make('button', 'ofp-library-item', groups[category]);
      button.type = 'button';
      button.draggable = true;
      button.dataset.searchText = (label + ' ' + type + ' ' + category).toLowerCase();
      this.renderPalettePreview(type, button);
      make('span', 'ofp-library-item__label', button, label);
      button.addEventListener('click', () => this.addComponent(type));
      button.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('text/omni-front-component', type);
        event.dataTransfer.effectAllowed = 'copy';
      });
    });

    this.stagePanel = make('section', 'ofp-stage-panel', this.workspace);
    const stageHead = make('div', 'ofp-stage-head', this.stagePanel);
    const stageName = make('div', 'ofp-stage-head__identity', stageHead);
    make('span', 'ofp-panel-heading__eyebrow', stageName, 'DESIGN CANVAS');
    make('strong', '', stageName, 'Instrument faceplate');
    const stageTools = make('div', 'ofp-stage-head__tools', stageHead);
    this.stageDimensions = make('span', 'ofp-stage-dimensions', stageTools);
    this.zoomReadout = make('output', 'ofp-stage-zoom', stageTools, '100%');
    this.zoomOutButton = make('button', 'ofp-stage-zoom-button', stageTools, '−');
    this.zoomOutButton.type = 'button';
    this.zoomOutButton.setAttribute('aria-label', 'Zoom out');
    this.zoomOutButton.addEventListener('click', () => this.zoomBy(.8));
    this.zoomInButton = make('button', 'ofp-stage-zoom-button', stageTools, '+');
    this.zoomInButton.type = 'button';
    this.zoomInButton.setAttribute('aria-label', 'Zoom in');
    this.zoomInButton.addEventListener('click', () => this.zoomBy(1.25));
    this.zoomFitButton = make('button', 'ofp-stage-zoom-fit', stageTools, 'FIT');
    this.zoomFitButton.type = 'button';
    this.zoomFitButton.addEventListener('click', () => this.fitToViewport());
    this.viewport = make('div', 'ofp-viewport', this.stagePanel);
    this.stage = make('div', 'ofp-stage', this.viewport);
    this.faceplate = make('div', 'ofp-faceplate', this.stage);
    this.faceplate.addEventListener('pointerdown', (event) => {
      if (this.tool === 'measure') { this.beginMeasurement(event); return; }
      if (this.pendingGuideAxis) { this.placeGuide(event); return; }
      if (event.target === this.faceplate || event.target === this.stage) {
        if (this.panState) return;
        this.select(null);
      }
    }, true);
    this.faceplate.addEventListener('dragover', (event) => {
      if (event.dataTransfer?.types?.includes('text/omni-front-component')) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }
    });
    this.faceplate.addEventListener('drop', (event) => {
      const type = event.dataTransfer?.getData('text/omni-front-component');
      if (!type) return;
      event.preventDefault();
      event.stopPropagation();
      const point = this.toPanelPoint(event);
      this.addComponent(type, point.x, point.y);
    });
    this.horizontalRuler = make('div', 'ofp-ruler ofp-ruler--horizontal', this.stagePanel);
    this.viewportRow = make('div', 'ofp-viewport-row', this.stagePanel);
    this.verticalRuler = make('div', 'ofp-ruler ofp-ruler--vertical', this.viewportRow);
    this.viewportRow.appendChild(this.viewport);
    this.stageFoot = make('div', 'ofp-stage-foot', this.stagePanel);
    make('span', '', this.stageFoot, 'DRAG CONTROLS TO POSITION');
    make('span', '', this.stageFoot, 'SPACE+DRAG / MIDDLE-DRAG TO PAN');
    make('span', '', this.stageFoot, 'PATCH-BINDABLE CONTROLS UPDATE THE ENGINE');
    this.bindViewportNavigation();
    this.buildDesignTools();
    this.buildLayerPanel();
    this.bindEditorShortcuts();

    this.inspector = make('aside', 'ofp-inspector', this.workspace);
    this.renderInspector();
  }


  buildDesignTools() {
    const toolbar = make('div', 'ofp-design-tools', this.stagePanel);
    const button = (parent, label, title, callback, pressed = null) => {
      const control = make('button', 'ofp-tool-toggle', parent, label);
      control.type = 'button';
      control.title = title;
      control.setAttribute('aria-label', title);
      if (pressed !== null) control.setAttribute('aria-pressed', String(Boolean(pressed)));
      control.addEventListener('click', callback);
      return control;
    };
    const group = (label) => {
      const details = make('details', 'ofp-tool-group', toolbar);
      make('summary', 'ofp-tool-group__trigger', details, label);
      return make('div', 'ofp-tool-group__panel', details);
    };
    const toggle = (parent, label, key, title) =>
      button(parent, label, title, () => this.toggleViewSetting(key), this.state[key]);

    this.selectToolButton = button(toolbar, 'Select', 'Select and move controls', () => {
      this.tool = 'select';
      this.panMode = false;
      this.viewport.classList.remove('is-pan-tool', 'is-measuring', 'is-placing-guide');
      this.selectToolButton.setAttribute('aria-pressed', 'true');
      this.panModeButton.setAttribute('aria-pressed', 'false');
    }, true);
    this.panModeButton = button(toolbar, 'Hand', 'Pan the canvas without selecting controls', () => {
      this.panMode = !this.panMode;
      this.panModeButton.setAttribute('aria-pressed', String(this.panMode));
      this.selectToolButton.setAttribute('aria-pressed', String(!this.panMode));
      this.viewport.classList.toggle('is-pan-tool', this.panMode);
    }, this.panMode);
    this.snapButton = button(toolbar, 'Snap', 'Snap controls to the layout grid', () => this.toggleViewSetting('snap'), this.state.snap);

    const view = group('View');
    toggle(view, 'Rulers', 'showRulers', 'Show or hide measurement rulers');
    toggle(view, 'Grid', 'showGrid', 'Show or hide the layout grid');
    toggle(view, 'Safe area', 'showSafeMargin', 'Show or hide the safe margin');
    toggle(view, 'Guides', 'showGuides', 'Show or hide alignment guides');
    toggle(view, 'Smart guides', 'showSmartGuides', 'Show or hide smart alignment feedback');
    button(view, 'Measure distance', 'Measure a distance on the faceplate', () => {
      this.tool = this.tool === 'measure' ? 'select' : 'measure';
      this.measureButton?.setAttribute('aria-pressed', String(this.tool === 'measure'));
      this.viewport.classList.toggle('is-measuring', this.tool === 'measure');
      if (this.tool === 'measure') {
        this.panMode = false;
        this.panModeButton.setAttribute('aria-pressed', 'false');
        this.selectToolButton.setAttribute('aria-pressed', 'false');
      }
    });
    this.measureButton = view.querySelector('button:last-of-type');
    button(view, 'Add vertical guide', 'Place a vertical alignment guide', () => this.startGuide('x'));
    button(view, 'Add horizontal guide', 'Place a horizontal alignment guide', () => this.startGuide('y'));
    button(view, 'Clear measurements', 'Remove all saved measurements', () => { this.state.measurements = []; this.render(); this.commit(); });
    const unit = make('select', 'ofp-tool-select', view);
    [['px','Pixels'],['mm','Millimetres'],['in','Inches']].forEach(([value,label]) => {
      const option = make('option', '', unit, label); option.value = value;
    });
    unit.value = this.state.unit || 'mm';
    unit.setAttribute('aria-label', 'Ruler measurement units');
    unit.addEventListener('change', () => { this.state.unit = unit.value; this.renderRulers(); this.renderInspector(); this.commit(); });

    const arrange = group('Arrange');
    [
      ['Align left','left'],['Centre horizontally','centerX'],['Align right','right'],
      ['Align top','top'],['Centre vertically','centerY'],['Align bottom','bottom'],
      ['Distribute horizontally','distributeX'],['Distribute vertically','distributeY'],
      ['Match width','sameWidth'],['Match height','sameHeight'],
      ['Align to panel left','panelLeft'],['Align to panel right','panelRight'],
      ['Align to panel top','panelTop'],['Align to panel bottom','panelBottom'],
      ['Centre on panel horizontally','panelCenterX'],['Centre on panel vertically','panelCenterY']
    ].forEach(([label, mode]) => button(arrange, label, label, () => this.alignSelection(mode)));
  }
    const toolbar = make('div', 'ofp-design-tools', this.stagePanel);
    const group = (label) => {
      const details = make('details', 'ofp-tool-group', toolbar);
      make('summary', 'ofp-tool-group__trigger', details, label);
      return make('div', 'ofp-tool-group__panel', details);
    };
    const button = (parent, label, title, callback, pressed = null) => {
      const control = make('button', 'ofp-tool-toggle', parent, label);
      control.type = 'button';
      control.title = title;
      control.setAttribute('aria-label', title);
      if (pressed !== null) control.setAttribute('aria-pressed', String(Boolean(pressed)));
      control.addEventListener('click', callback);
      return control;
    };
    const toggle = (parent, label, key, title) => button(parent, label, title, () => this.toggleViewSetting(key), this.state[key]);

    const view = group('VIEW');
    toggle(view, 'Rulers', 'showRulers', 'Show or hide measurement rulers');
    toggle(view, 'Grid', 'showGrid', 'Show or hide the layout grid');
    toggle(view, 'Safe area', 'showSafeMargin', 'Show or hide the safe margin');
    toggle(view, 'Snap', 'snap', 'Snap components to grid and alignment targets');
    this.panModeButton = button(view, 'Pan tool', 'Drag the workspace without selecting or moving controls', () => {
      this.panMode = !this.panMode;
      this.panModeButton.setAttribute('aria-pressed', String(this.panMode));
      this.viewport.classList.toggle('is-pan-tool', this.panMode);
    }, this.panMode);
    button(view, '−', 'Zoom out', () => this.zoomBy(.8));
    button(view, '+', 'Zoom in', () => this.zoomBy(1.25));
    button(view, 'Fit', 'Fit the faceplate in the workspace', () => this.fitToViewport());
    const unit = make('select', 'ofp-tool-select', view);
    [['px','Pixels'],['mm','Millimetres'],['in','Inches']].forEach(([value,label]) => {
      const option = make('option', '', unit, label); option.value = value;
    });
    unit.value = this.state.unit || 'mm';
    unit.setAttribute('aria-label', 'Ruler measurement units');
    unit.addEventListener('change', () => { this.state.unit = unit.value; this.renderRulers(); this.renderInspector(); this.commit(); });

    const guides = group('GUIDES & MEASURE');
    toggle(guides, 'Guides', 'showGuides', 'Show or hide alignment guides');
    toggle(guides, 'Smart align', 'showSmartGuides', 'Show or hide smart alignment feedback');
    button(guides, 'Measure', 'Measure a distance on the faceplate', () => {
      this.tool = this.tool === 'measure' ? 'select' : 'measure';
      this.measureButton?.setAttribute('aria-pressed', String(this.tool === 'measure'));
      this.viewport.classList.toggle('is-measuring', this.tool === 'measure');
    });
    this.measureButton = guides.querySelector('button:last-of-type');
    button(guides, '+ Vertical guide', 'Place a vertical alignment guide', () => this.startGuide('x'));
    button(guides, '+ Horizontal guide', 'Place a horizontal alignment guide', () => this.startGuide('y'));
    button(guides, 'Clear measurements', 'Remove all saved measurements', () => { this.state.measurements = []; this.render(); this.commit(); });

    const arrange = group('ALIGN & DISTRIBUTE');
    [
      ['Left','left'],['Centre X','centerX'],['Right','right'],
      ['Top','top'],['Centre Y','centerY'],['Bottom','bottom'],
      ['Space X','distributeX'],['Space Y','distributeY'],
      ['Same width','sameWidth'],['Same height','sameHeight'],
      ['Panel left','panelLeft'],['Panel right','panelRight'],
      ['Panel top','panelTop'],['Panel bottom','panelBottom'],
      ['Panel centre X','panelCenterX'],['Panel centre Y','panelCenterY']
    ].forEach(([label, mode]) => button(arrange, label, 'Align selected controls: ' + label, () => this.alignSelection(mode)));
    this.stagePanel.insertBefore(toolbar, this.horizontalRuler);
  }

  toggleLibrary(mode = 'add') {
    const alreadyOpen = this.workspace.classList.contains('is-library-open');
    const sameMode = this.libraryMode === mode;
    const open = !(alreadyOpen && sameMode);
    this.libraryMode = mode;
    this.workspace.classList.toggle('is-library-open', open);
    this.cataloguePane.hidden = !open || mode !== 'add';
    this.layersPanel.hidden = !open || mode !== 'layers';
    this.addRailButton.setAttribute('aria-pressed', String(open && mode === 'add'));
    this.layersRailButton.setAttribute('aria-pressed', String(open && mode === 'layers'));
    if (open && mode === 'add') this.componentSearch?.focus();
  }

  togglePanelInspector() {
    const alreadyOpen = this.workspace.classList.contains('is-inspector-open');
    const isPanel = !this.selectedId;
    if (alreadyOpen && isPanel) {
      this.inspectorOpen = false;
      this.workspace.classList.remove('is-inspector-open');
      this.panelSettingsButton.setAttribute('aria-pressed', 'false');
      return;
    }
    this.selectedId = null;
    this.selectedIds?.clear();
    this.inspectorOpen = true;
    this.workspace.classList.add('is-inspector-open');
    this.panelSettingsButton.setAttribute('aria-pressed', 'true');
    this.faceplate.querySelectorAll('.ofp-component').forEach((node) => node.classList.remove('is-selected'));
    this.renderInspector();
    this.renderLayers();
  }

  startGuide(axis) {
    this.pendingGuideAxis = axis;
    this.tool = 'guide';
    this.viewport.classList.add('is-placing-guide');
    this.app.msg('Click the faceplate to position the ' + (axis === 'x' ? 'vertical' : 'horizontal') + ' guide.');
  }

  toggleViewSetting(key) {
    this.state[key] = !this.state[key];
    this.render();
    this.commit();
  }

  zoomBy(factor, clientX = null, clientY = null) {
    const viewport = this.viewport;
    if (!viewport || !Number.isFinite(factor) || factor <= 0) return;
    const viewportRect = viewport.getBoundingClientRect();
    const oldRect = this.faceplate.getBoundingClientRect();
    const anchorX = Number.isFinite(clientX) ? clientX : viewportRect.left + viewportRect.width / 2;
    const anchorY = Number.isFinite(clientY) ? clientY : viewportRect.top + viewportRect.height / 2;
    const oldScale = this.currentScale || 1;
    const localX = (anchorX - oldRect.left) / oldScale;
    const localY = (anchorY - oldRect.top) / oldScale;
    this.state.zoom = clamp((Number(this.state.zoom) || 1) * factor, .25, 4);
    this.scaleFaceplate();
    // Force layout before measuring the new transform so pointer-anchored zoom
    // stays under the cursor instead of jumping toward the top-left corner.
    void this.stage.offsetWidth;
    const nextRect = this.faceplate.getBoundingClientRect();
    viewport.scrollLeft += nextRect.left + localX * this.currentScale - anchorX;
    viewport.scrollTop += nextRect.top + localY * this.currentScale - anchorY;
    this.commit();
  }

  bindViewportNavigation() {
    const viewport = this.viewport;
    if (!viewport) return;
    const isEditable = (target) => target?.closest?.('input,textarea,select,button,a,[role="button"],[contenteditable="true"]');
    document.addEventListener('keydown', (event) => {
      if (this.el.hidden || event.code !== 'Space' || isEditable(event.target) || event.repeat) return;
      this.spacePressed = true;
      event.preventDefault();
      viewport.classList.add('is-pan-ready');
    });
    document.addEventListener('keyup', (event) => {
      if (event.code !== 'Space') return;
      this.spacePressed = false;
      viewport.classList.remove('is-pan-ready', 'is-panning');
    });
    window.addEventListener('blur', () => {
      this.spacePressed = false;
      this.panState = null;
      viewport.classList.remove('is-pan-ready', 'is-panning');
    });

    viewport.addEventListener('wheel', (event) => {
      if (this.el.hidden || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      this.zoomBy(Math.exp(-event.deltaY * .002), event.clientX, event.clientY);
    }, { passive: false });

    const stopPan = (event) => {
      const pan = this.panState;
      if (!pan || (event.pointerId !== undefined && event.pointerId !== pan.pointerId)) return;
      viewport.removeEventListener('pointermove', movePan);
      viewport.removeEventListener('pointerup', stopPan);
      viewport.removeEventListener('pointercancel', stopPan);
      try { viewport.releasePointerCapture(pan.pointerId); } catch { /* capture may already be released */ }
      viewport.classList.remove('is-panning');
      this.panState = null;
      if (!pan.moved && pan.clickToClear) this.select(null);
    };
    const movePan = (event) => {
      const pan = this.panState;
      if (!pan || event.pointerId !== pan.pointerId) return;
      const dx = event.clientX - pan.startX;
      const dy = event.clientY - pan.startY;
      if (Math.hypot(dx, dy) > 3) pan.moved = true;
      viewport.scrollLeft = pan.scrollLeft - dx;
      viewport.scrollTop = pan.scrollTop - dy;
    };

    viewport.addEventListener('pointerdown', (event) => {
      if (this.el.hidden || (event.button !== 0 && event.button !== 1)) return;
      const target = event.target;
      const overComponent = target.closest?.('.ofp-component');
      const explicitPan = event.button === 1 || this.spacePressed || this.panMode;
      const blankCanvas = !overComponent && !target.closest?.('.ofp-ruler');
      const shouldPan = explicitPan || (blankCanvas && event.button === 0);
      if (!shouldPan || this.tool === 'measure' || this.pendingGuideAxis) return;
      if (!explicitPan && target.closest?.('button,input,select,textarea,[contenteditable="true"]')) return;

      event.preventDefault();
      event.stopPropagation();
      const pan = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
        moved: false,
        clickToClear: blankCanvas && event.button === 0 && !this.panMode && !this.spacePressed,
      };
      this.panState = pan;
      viewport.classList.add('is-panning');
      try { viewport.setPointerCapture(event.pointerId); } catch { /* pointer capture is not supported by every input */ }
      viewport.addEventListener('pointermove', movePan);
      viewport.addEventListener('pointerup', stopPan);
      viewport.addEventListener('pointercancel', stopPan);
    }, true);
    viewport.addEventListener('contextmenu', (event) => {
      if (event.button === 1 || this.panMode || this.spacePressed) event.preventDefault();
    });
  }

  fitToViewport() {
    this.state.zoom = 1;
    this.scaleFaceplate();
    if (this.viewport) {
      this.viewport.scrollTop = 0;
      this.viewport.scrollLeft = 0;
    }
    this.commit();
  }

    selectAllComponents() {
    this.selectedIds = new Set(this.state.components.filter((item) => !item.hidden).map((item) => item.id));
    this.selectedId = this.selectedIds.size === 1 ? [...this.selectedIds][0] : null;
    this.faceplate.querySelectorAll('.ofp-component').forEach((node) => node.classList.toggle('is-selected', this.selectedIds.has(node.dataset.componentId)));
    this.renderLayers();
    this.renderInspector();
  }

  stepSelectedLayer(direction) {
    const ids = this.selectedIds?.size ? [...this.selectedIds] : this.selectedId ? [this.selectedId] : [];
    if (!ids.length) { this.app.msg('Select a control to change its layer order.'); return; }
    ids.forEach((componentId) => this.moveLayer(componentId, direction));
  }

  focusInspector() {
    this.inspector?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    this.inspector?.querySelector('input,select,textarea,button')?.focus({ preventScroll: true });
  }

  toggleTestMode() {
    this.testMode = !this.testMode;
    this.faceplate?.classList.toggle('is-test-mode', this.testMode);
    this.testModeButton?.setAttribute('aria-pressed', String(this.testMode));
    this.testModeButton.textContent = this.testMode ? 'EXIT TEST' : 'TEST PANEL';
    if (this.testMode) this.select(null);
    this.app.msg(this.testMode
      ? 'Live test mode: play the keyboard and operate bound controls. Editing is paused.'
      : 'Front-panel editing mode restored.');
  }

  showPerformanceReport() {
    const visible = this.state.components.filter((item) => !item.hidden);
    const counts = visible.reduce((result, item) => {
      result[item.type] = (result[item.type] || 0) + 1;
      return result;
    }, {});
    const svgBytes = new Blob([this.exportSVGMarkup()]).size;
    const dialog = make('dialog', 'ofp-check-dialog', this.el);
    const header = make('header', 'ofp-check-dialog__header', dialog);
    const head = make('div', '', header);
    make('span', 'ofp-panel-heading__eyebrow', head, 'EDITOR PERFORMANCE');
    make('strong', '', head, 'Design complexity');
    const close = make('button', 'ofp-action', header, 'CLOSE');
    close.type = 'button';
    close.addEventListener('click', () => dialog.close());
    const summary = make('div', 'ofp-check-summary', dialog);
    make('strong', '', summary, visible.length + ' visible components');
    make('span', '', summary, (this.lastRenderMs ?? 0).toFixed(2) + ' ms last DOM build');
    const list = make('div', 'ofp-check-list', dialog);
    [
      ['Total layers', String(this.state.components.length)],
      ['Visible layers', String(visible.length)],
      ['Hidden layers', String(this.state.components.length - visible.length)],
      ['SVG source size', (svgBytes / 1024).toFixed(1) + ' KB'],
      ['Panel dimensions', this.state.width + ' × ' + this.state.height + ' px'],
      ['Render timing', 'Last synchronous DOM construction only; excludes browser paint and audio processing.']
    ].forEach(([label, value]) => {
      const row = make('div', 'ofp-check-item', list);
      make('span', '', row, label.toUpperCase());
      make('p', '', row, value);
    });
    const breakdown = make('p', 'ofp-check-empty', list, Object.entries(counts).map(([type,count]) => type + ': ' + count).join(' · ') || 'No visible components.');
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    dialog.showModal();
  }

  renderPalettePreview(type, parent) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'ofp-library-preview');
    svg.setAttribute('viewBox', '0 0 64 44');
    svg.setAttribute('aria-hidden', 'true');
    const shape = (tag, attributes) => {
      const node = document.createElementNS(svgNS, tag);
      Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
      svg.appendChild(node);
    };
    const metal = '#b8c5cf', dark = '#18232e', accent = '#7de4ff';
    if (type === 'knob') {
      shape('circle',{cx:32,cy:22,r:16,fill:'#0d141b',stroke:'#7d8c96','stroke-width':2});
      for(let i=0;i<18;i++){const a=(i*20)*Math.PI/180;shape('line',{x1:32+Math.cos(a)*13,y1:22+Math.sin(a)*13,x2:32+Math.cos(a)*15,y2:22+Math.sin(a)*15,stroke:'#8d9ba4','stroke-width':1});}
      shape('circle',{cx:32,cy:22,r:11,fill:'#35434d',stroke:'#0a1016','stroke-width':1.5});
      shape('path',{d:'M32 13 L32 19',stroke:accent,'stroke-width':2.5,'stroke-linecap':'round'});
    } else if (type === 'dial') {
      shape('circle',{cx:32,cy:22,r:18,fill:'#121b23',stroke:'#a1adb5','stroke-width':1.6});
      shape('circle',{cx:32,cy:22,r:13,fill:'#34434d',stroke:accent,'stroke-width':1});
      for(let i=0;i<=10;i++){const a=(-135+i*27)*Math.PI/180;shape('line',{x1:32+Math.cos(a)*15,y1:22+Math.sin(a)*15,x2:32+Math.cos(a)*18,y2:22+Math.sin(a)*18,stroke:metal,'stroke-width':i%2===0?1.8:1});}
      shape('path',{d:'M32 22 L24 13',stroke:'#f2f5f6','stroke-width':2.2,'stroke-linecap':'round'});
      shape('circle',{cx:32,cy:22,r:2.5,fill:accent});
    } else if (type === 'encoder') {
      shape('circle',{cx:32,cy:22,r:17,fill:'#090f15',stroke:accent,'stroke-width':1.2});
      for(let i=0;i<28;i++){const a=i*Math.PI/14;shape('line',{x1:32+Math.cos(a)*15,y1:22+Math.sin(a)*15,x2:32+Math.cos(a)*18,y2:22+Math.sin(a)*18,stroke:metal,'stroke-width':1.4});}
      shape('circle',{cx:32,cy:22,r:11,fill:'#56636c',stroke:'#d0d8dd','stroke-width':1});
      shape('circle',{cx:32,cy:22,r:4,fill:'#202b33',stroke:accent,'stroke-width':1});
    } else if (type === 'keyboard') {
      shape('rect',{x:4,y:7,width:56,height:30,rx:2,fill:dark,stroke:metal});
      for(let i=0;i<7;i++)shape('rect',{x:5+i*7.8,y:8,width:7.3,height:28,fill:'#e8edf0',stroke:'#87949e','stroke-width':.5});
      [10,18,26,41,49].forEach(x=>shape('rect',{x,y:8,width:4.5,height:17,rx:1,fill:'#101820'}));
    } else if (type === 'slider' || type === 'drawbars') {
      if (type==='drawbars') for(let i=0;i<9;i++){shape('rect',{x:5+i*6.2,y:9,width:3,height:26,rx:1,fill:'#0e1821',stroke:'#556574'});shape('rect',{x:4+i*6.2,y:15+(i%4)*3,width:5,height:5,rx:1,fill:metal,stroke:accent});}
      else {shape('rect',{x:12,y:20,width:40,height:5,rx:2,fill:dark,stroke:'#61717e'});shape('rect',{x:30,y:12,width:9,height:21,rx:2,fill:metal,stroke:accent});}
    } else if (type === 'screen' || type === 'oled') {
      shape('rect',{x:5,y:6,width:54,height:32,rx:3,fill:'#07131a',stroke:accent});
      shape('path',{d:'M11 15 H43 M11 21 H51 M11 27 H35',stroke:accent,'stroke-width':1.5,opacity:.8});
    } else if (type === 'pitchwheel' || type === 'modwheel') {
      shape('rect',{x:17,y:4,width:30,height:36,rx:4,fill:'#1a252f',stroke:'#60717f'});
      shape('rect',{x:29,y:8,width:6,height:26,rx:3,fill:'#0a1117'});
      shape('rect',{x:22,y:18,width:20,height:7,rx:2,fill:metal,stroke:accent});
    } else if (type === 'led' || type === 'meter') {
      if(type==='led'){shape('circle',{cx:24,cy:22,r:8,fill:'#82e6a8',stroke:'#d4f6e1'});shape('circle',{cx:24,cy:22,r:13,fill:'none',stroke:'#82e6a8','stroke-opacity':.35});}
      else {shape('rect',{x:5,y:15,width:54,height:14,rx:3,fill:dark,stroke:metal});shape('rect',{x:7,y:17,width:33,height:10,rx:2,fill:'#82e6a8'});}
    } else if (type === 'switch' || type === 'button' || type === 'pad') {
      shape('rect',{x:9,y:8,width:46,height:28,rx:type==='pad'?6:4,fill:'#273541',stroke:accent});
      shape('rect',{x:15,y:13,width:34,height:17,rx:3,fill:metal,stroke:'#6e7d87'});
    } else if (type === 'dropdown') {
      shape('rect',{x:6,y:10,width:52,height:23,rx:3,fill:dark,stroke:metal});
      shape('path',{d:'M44 19 l5 5 l5 -5',fill:'none',stroke:accent,'stroke-width':1.8});
    } else {
      shape('rect',{x:6,y:9,width:52,height:26,rx:3,fill:dark,stroke:accent});
      shape('path',{d:'M12 22 H52',stroke:metal,'stroke-width':2});
    }
    parent.appendChild(svg);
  }

    buildLayerPanel() {
    this.layersPanel = make('section', 'ofp-layers-panel', this.library);
    this.layersPanel.hidden = true;
    const head = make('div', 'ofp-panel-heading', this.layersPanel);
    make('span', 'ofp-panel-heading__eyebrow', head, 'DOCUMENT');
    make('strong', '', head, 'Layers');
    this.layersList = make('div', 'ofp-layers-list', this.layersPanel);
    this.renderLayers();
  }
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
    if (mode === 'distributeY' && items.length > 2) {
      const ordered = [...items].sort((a,b) => a.y-b.y);
      const occupied = ordered.reduce((sum,item)=>sum+item.h,0);
      const gap = (bottom-top-occupied)/(ordered.length-1);
      let cursor = top;
      ordered.forEach((item)=>{item.y=cursor;cursor+=item.h+gap;});
    }
    if (mode === 'sameWidth') { const width = Math.min(...items.map((item)=>this.state.width-item.x)); items.forEach((item)=>{item.w=clamp(width,48,760);}); }
    if (mode === 'sameHeight') { const height = Math.min(...items.map((item)=>this.state.height-item.y)); items.forEach((item)=>{item.h=clamp(height,36,440);}); }
    if (mode === 'panelLeft') items.forEach((item)=>{item.x=0;});
    if (mode === 'panelRight') items.forEach((item)=>{item.x=this.state.width-item.w;});
    if (mode === 'panelTop') items.forEach((item)=>{item.y=0;});
    if (mode === 'panelBottom') items.forEach((item)=>{item.y=this.state.height-item.h;});
    if (mode === 'panelCenterX') items.forEach((item)=>{item.x=(this.state.width-item.w)/2;});
    if (mode === 'panelCenterY') items.forEach((item)=>{item.y=(this.state.height-item.h)/2;});
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
      else if (event.key.startsWith('Arrow') && (this.selectedIds?.size || this.selectedId)) {
        const ids=this.selectedIds?.size?this.selectedIds:new Set([this.selectedId]);
        const selected=this.state.components.filter((item)=>ids.has(item.id)&&!item.locked);
        if(!selected.length)return;
        const step=event.shiftKey?10:1;
        const dx=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0;
        const dy=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0;
        selected.forEach((item)=>{
          item.x=clamp(item.x+dx,0,this.state.width-item.w);
          item.y=clamp(item.y+dy,0,this.state.height-item.h);
          const node=this.faceplate.querySelector('[data-component-id="'+item.id+'"]');
          if(node){node.style.left=item.x+'px';node.style.top=item.y+'px';}
        });
        this.commit();this.renderRulers();event.preventDefault();event.stopPropagation();
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
      const margin = clamp(this.state.safeMargin ?? 24,0,450);
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
    const grid = Math.max(1,Number(this.state.gridSize)||28);
    if (this.state.snap) { x=Math.round(x/grid)*grid; y=Math.round(y/grid)*grid; }
    const limit=9/(this.currentScale||1);
    let alignX=null,alignY=null,bestX=limit,bestY=limit,deltaX=0,deltaY=0;
    const xs=[x,x+component.w/2,x+component.w],ys=[y,y+component.h/2,y+component.h];
    const candidates=this.state.components.filter((item)=>item.id!==component.id&&!item.hidden);
    candidates.forEach((item)=>{
      const targetsX=[item.x,item.x+item.w/2,item.x+item.w];
      const targetsY=[item.y,item.y+item.h/2,item.y+item.h];
      xs.forEach((pos)=>targetsX.forEach((target)=>{
        const offset=target-pos,d=Math.abs(offset);
        if(d<bestX){bestX=d;alignX=target;deltaX=offset;}
      }));
      ys.forEach((pos)=>targetsY.forEach((target)=>{
        const offset=target-pos,d=Math.abs(offset);
        if(d<bestY){bestY=d;alignY=target;deltaY=offset;}
      }));
    });
    if(this.state.showGuides) (this.state.guides||[]).forEach((guide)=>{
      const current=guide.axis==='x'?x+component.w/2:y+component.h/2;
      const d=Math.abs(current-guide.position);
      if(d<limit){
        if(guide.axis==='x'&&d<bestX){bestX=d;deltaX=guide.position-current;alignX=guide.position;}
        if(guide.axis==='y'&&d<bestY){bestY=d;deltaY=guide.position-current;alignY=guide.position;}
      }
    });
    return {x:clamp(x+deltaX,0,this.state.width-component.w),y:clamp(y+deltaY,0,this.state.height-component.h),alignX,alignY};
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
      knob: '◉', dial: '◉', slider: '▥', dropdown: '⌄', button: '▣', switch: '⏻', encoder: '◉',
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
        return {
          value: Object.prototype.hasOwnProperty.call(item, 'value') ? item.value : index,
          label: String(item.label ?? item.name ?? item.value ?? index),
        };
      }
      return { value: index, label: String(item) };
    });
  }

  getRawValue(component, key = null) {
    if (component.type === 'drawbars' && key) {
      const bound = this.getParameter(component, key);
      return bound ? bound.module.params[key] : (component.value ?? 0);
    }
    const bound = this.getParameter(component);
    if (bound) return bound.module.params[bound.parameter.key];
    if (component.type === 'pitchwheel') return Number(this.app.pitchBend || 0);
    if (component.type === 'modwheel') return Number(this.app.modWheelValue || 0);
    return component.value ?? 0.5;
  }

  getValue(component, key = null) {
    const value = this.getRawValue(component, key);
    return Number(value ?? 0.5);
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
    const pointer = node.querySelector('.ofp-knob__indicator, .ofp-dial__needle');
    if (pointer) pointer.style.transform = 'rotate(' + (-135 + ratio * 270) + 'deg)';
    const toggle = node.querySelector('.ofp-switch'); if (toggle) { toggle.classList.toggle('is-on', value > (range.min + range.max) / 2); const label = toggle.querySelector('.ofp-switch__label'); if (label) label.textContent = value > (range.min + range.max) / 2 ? 'ON' : 'OFF'; }
    const wheelCap = node.querySelector('.ofp-wheel__cap'); if (wheelCap) node.style.setProperty('--ofp-wheel-position', (10 + (1 - ratio) * 80) + '%');
  }

  render() {
    const renderStartedAt = performance.now();
    this.faceplate.replaceChildren();
    this.faceplate.style.width = this.state.width + 'px';
    this.faceplate.style.height = this.state.height + 'px';
    this.faceplate.dataset.finish = this.state.finish || 'matte';
    this.faceplate.style.setProperty('--ofp-panel-color', safeColor(this.state.panelColor, '#252d35'));
    this.faceplate.style.setProperty('--ofp-accent', safeColor(this.state.accent, '#ffb75e'));
    this.faceplate.style.setProperty('--ofp-text', safeColor(this.state.textColor, '#edf3fa'));
    this.faceplate.style.borderColor = safeColor(this.state.panelBorderColor, '#667583');
    this.faceplate.style.borderWidth = clamp(this.state.panelBorderWidth ?? 1, 0, 8) + 'px';
    this.faceplate.style.borderRadius = clamp(this.state.panelRadius ?? 14, 0, 40) + 'px';
    this.stageDimensions.textContent = this.unitText(this.state.width) + ' × ' + this.unitText(this.state.height);
    if (!this.state.components.length) {
      const empty = make('div','ofp-empty-state',this.faceplate);
      make('span','ofp-empty-state__eyebrow',empty,'NO CONTROLS YET');
      make('strong','',empty,'Build your instrument faceplate');
      make('p','',empty,'Choose a control from the Components library or use Insert in the menu. Select it to connect it to an OMNI module.');
      const add = make('button','ofp-empty-state__action',empty,'BROWSE COMPONENTS');
      add.type = 'button';
      add.addEventListener('click', () => this.componentSearch?.focus());
    }
    this.state.components.forEach((component) => this.renderComponent(component));
    this.renderDesignOverlays();
    this.renderRulers();
    this.renderLayers();
    this.renderInspector();
    this.faceplate.classList.toggle('is-test-mode', Boolean(this.testMode));
    this.lastRenderMs = Math.max(0, performance.now() - renderStartedAt);
    requestAnimationFrame(() => this.scaleFaceplate());
  }

  renderComponent(component) {
    const node = make('div', 'ofp-component ofp-component--' + component.type, this.faceplate);
    node.dataset.componentId = component.id;
    node.tabIndex = 0;
    node.setAttribute('role', 'group');
    node.setAttribute('aria-label', (component.label || component.type) + (component.locked ? ', locked' : ''));
    node.style.left = component.x + 'px';
    node.style.top = component.y + 'px';
    node.style.width = component.w + 'px';
    node.style.height = component.h + 'px';
    node.style.setProperty('--ofp-control-accent', safeColor(component.accent, this.state.accent));
    node.style.setProperty('--ofp-control-surface', safeColor(component.surface, '#26313d'));
    node.style.setProperty('--ofp-control-text', safeColor(component.textColor, this.state.textColor));
    node.style.setProperty('--ofp-control-border', safeColor(component.borderColor, component.accent || this.state.accent));
    node.style.setProperty('--ofp-padding', clamp(component.padding ?? 7, 0, 48) + 'px');
    node.style.setProperty('--ofp-gap', clamp(component.gap ?? 5, 0, 32) + 'px');
    node.style.setProperty('--ofp-radius', clamp(component.radius ?? 7, 0, 32) + 'px');
    node.style.setProperty('--ofp-font-size', clamp(component.fontSize ?? 8, 6, 28) + 'px');
    node.style.setProperty('--ofp-border-width', clamp(component.borderWidth ?? 1, 0, 6) + 'px');
    node.dataset.shadow = ['none','soft','hard'].includes(component.shadow) ? component.shadow : 'soft';
    node.dataset.finish = component.finish || 'matte';
    node.dataset.orientation = component.orientation || 'horizontal';
    node.classList.toggle('is-selected', this.selectedIds?.has(component.id) || component.id === this.selectedId);
    node.classList.toggle('is-locked', Boolean(component.locked));
    node.hidden = Boolean(component.hidden);
    node.style.setProperty('--ofp-clearance', Math.max(0, Number(component.margin) || 0) + 'px');
    node.style.setProperty('--ofp-control-border', safeColor(component.borderColor, component.accent || this.state.accent));
    const title = make('div', 'ofp-component__title', node, component.label || component.type.toUpperCase());
    title.title = 'Drag to move';
    if (component.type === 'dial') {
      const control = make('div', 'ofp-dial', node);
      const scale = make('div', 'ofp-dial__scale', control);
      for (let tick = 0; tick <= 20; tick += 1) {
        const angle = -135 + tick * 13.5;
        const mark = make('span', 'ofp-dial__tick', scale);
        mark.style.transform = 'rotate(' + angle + 'deg) translateY(-42px)';
        mark.classList.toggle('is-major', tick % 5 === 0);
        if (tick % 5 === 0) {
          const number = make('span', 'ofp-dial__number', scale, String(tick * 5));
          number.style.transform = 'rotate(' + angle + 'deg) translateY(-31px) rotate(' + (-angle) + 'deg)';
        }
      }
      make('div', 'ofp-dial__face', control);
      const needle = make('span', 'ofp-dial__needle', control);
      make('span', 'ofp-dial__hub', control);
      const input = this.buildInput(component, null, 'ofp-dial__input');
      control.appendChild(input);
      const range = this.getRange(component);
      const value = this.getValue(component);
      const ratio = this.rangeRatio(range, value);
      const angle = -135 + ratio * 270;
      node.style.setProperty('--ofp-value', String(ratio));
      needle.style.transform = 'rotate(' + angle + 'deg)';
      const output = make('output', 'ofp-component__value', node, range.log ? String(Math.round(value)) : value.toFixed(range.step >= 1 ? 0 : 2));
      output.dataset.ofpRole = 'value';
    } else if (component.type === 'knob' || component.type === 'encoder') {
      const isEncoder = component.type === 'encoder';
      const control = make('div', 'ofp-knob' + (isEncoder ? ' ofp-encoder' : ''), node);
      const scale = make('div', 'ofp-knob__scale', control);
      for (let tick = 0; tick <= 10; tick += 1) {
        const angle = -135 + tick * 27;
        const mark = make('span', 'ofp-knob__tick', scale);
        mark.style.transform = 'rotate(' + angle + 'deg) translateY(-42px)';
        mark.classList.toggle('is-major', tick % 2 === 0);
      }
      const ring = make('div', 'ofp-knob__ring', control);
      make('div', 'ofp-knob__bezel', control);
      const cap = make('div', 'ofp-knob__cap', control);
      make('span', 'ofp-knob__indicator', cap);
      if (isEncoder) {
        for (let groove = 0; groove < 24; groove += 1) {
          const tooth = make('span', 'ofp-encoder__tooth', control);
          tooth.style.transform = 'rotate(' + (groove * 15) + 'deg)';
        }
      }
      const input = this.buildInput(component, null, 'ofp-knob__input');
      control.appendChild(input);
      const range = this.getRange(component);
      const value = this.getValue(component);
      const ratio = this.rangeRatio(range, value);
      const angle = -135 + ratio * 270;
      node.style.setProperty('--ofp-value', String(ratio));
      ring.style.setProperty('--ofp-angle', angle + 'deg');
      const pointer = control.querySelector('.ofp-knob__indicator');
      if (pointer) pointer.style.transform = 'rotate(' + angle + 'deg)';
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
      if (options.length) {
        options.forEach((item, index) => {
          const option = make('option', '', select, item.label);
          option.value = String(index);
        });
        const rawValue = this.getRawValue(component);
        const selectedIndex = options.findIndex((item) => String(item.value) === String(rawValue));
        select.selectedIndex = selectedIndex >= 0 ? selectedIndex : 0;
      } else {
        const option = make('option', '', select, 'Connect a parameter in Behaviour');
        option.value = '';
        option.disabled = true;
      }
      select.addEventListener('change', () => {
        const selected = options[select.selectedIndex];
        if (selected) {
          this.changeParameter(component, null, selected.value, true);
          this.refreshValues();
        }
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
      const bound = this.getParameter(component);
      button.classList.toggle('is-bound', Boolean(bound));
      button.addEventListener('click', () => {
        const current = this.getParameter(component);
        if (current && component.action === 'toggle') {
          const min = Number(current.parameter.min);
          const max = Number(current.parameter.max);
          const midpoint = (min + max) / 2;
          this.changeParameter(component, null, this.getValue(component) > midpoint ? min : max, true);
          this.refreshValues();
        } else if (component.action === 'panic') this.app.allOff();
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
      pad.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') down(event); });
      pad.addEventListener('keyup', (event) => { if (event.key === 'Enter' || event.key === ' ') up(event); });
      pad.addEventListener('blur', () => { if (active) up({}); });
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
    const octaves = clamp(Math.round(component.octaves ?? 2), 1, 5);
    const start = clamp(Math.round(Number(component.startNote ?? 48) / 12) * 12, 0, 127 - 12 * octaves);
    const board = make('div', 'ofp-keyboard', node);
    const rearRail = make('div', 'ofp-keyboard__rear-rail', board);
    make('span', 'ofp-keyboard__brand', rearRail, 'OVERTURE');
    make('span', 'ofp-keyboard__model', rearRail, octaves + ' OCTAVE · PERFORMANCE KEYBED');
    const keywell = make('div', 'ofp-keyboard__keywell', board);
    const keys = make('div', 'ofp-keyboard__keys', keywell);
    const whiteSemitones = [0, 2, 4, 5, 7, 9, 11];
    const whiteCount = 7 * octaves;
    const whiteWidth = 100 / whiteCount;
    for (let index = 0; index < whiteCount; index += 1) {
      const octave = Math.floor(index / 7);
      const semitone = whiteSemitones[index % 7];
      const note = start + octave * 12 + semitone;
      const key = make('button', 'ofp-key ofp-key--white', keys);
      key.type = 'button';
      key.style.left = (index * whiteWidth) + '%';
      key.style.width = whiteWidth + '%';
      this.bindKey(key, note);
      if (semitone === 0) {
        const marker = make('span', 'ofp-keyboard__octave-mark', key);
        marker.textContent = 'C' + (Math.floor(start / 12) - 1 + octave);
      }
    }
    const blackOffsets = [0.68, 1.68, 3.68, 4.68, 5.68];
    const blackSemitones = [1, 3, 6, 8, 10];
    for (let octave = 0; octave < octaves; octave += 1) {
      blackSemitones.forEach((semitone, index) => {
        const note = start + octave * 12 + semitone;
        const key = make('button', 'ofp-key ofp-key--black', keys);
        key.type = 'button';
        key.style.left = ((octave * 7 + blackOffsets[index]) * whiteWidth) + '%';
        key.style.width = (whiteWidth * .62) + '%';
        this.bindKey(key, note);
      });
    }
    make('div', 'ofp-keyboard__front-lip', board);
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
      if (this.testMode || this.panState || this.spacePressed || this.panMode || event.button === 1) return;
      if (event.target.closest('input,select,button,textarea,a') || event.target.closest('.ofp-component__resize')) {
        this.select(component.id, event.shiftKey || event.ctrlKey || event.metaKey);
        return;
      }
      if (component.locked) { this.select(component.id, event.shiftKey || event.ctrlKey || event.metaKey); node.focus({preventScroll:true}); return; }
      event.preventDefault();
      node.focus({preventScroll:true});
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
        let nextW = clamp(originW + (moveEvent.clientX - startX) / scale, 48, Math.min(760, this.state.width - component.x));
        let nextH = clamp(originH + (moveEvent.clientY - startY) / scale, 36, Math.min(440, this.state.height - component.y));
        if (this.state.snap) {
          const grid = Math.max(1, Number(this.state.gridSize) || 28);
          nextW = clamp(Math.round(nextW / grid) * grid, 48, Math.min(760, this.state.width - component.x));
          nextH = clamp(Math.round(nextH / grid) * grid, 36, Math.min(440, this.state.height - component.y));
        }
        component.w = nextW;
        component.h = nextH;
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
    if (componentId === null) {
      this.selectedId = null;
      this.selectedIds.clear();
      this.inspectorOpen = false;
    } else if (multi) {
      if (this.selectedIds.has(componentId)) this.selectedIds.delete(componentId);
      else this.selectedIds.add(componentId);
      this.selectedId = this.selectedIds.has(componentId) ? componentId : [...this.selectedIds].at(-1) || null;
      this.inspectorOpen = Boolean(this.selectedId);
    } else {
      this.selectedId = componentId;
      this.selectedIds = new Set([componentId]);
      this.inspectorOpen = true;
      const component = this.getComponent(componentId);
      const bindable = ['knob','dial','encoder','slider','dropdown','button','switch','drawbars','meter'];
      if (component && bindable.includes(component.type) && !component.bind?.moduleId) this.inspectorTab = 'behavior';
    }
    this.workspace.classList.toggle('is-inspector-open', this.inspectorOpen);
    this.panelSettingsButton?.setAttribute('aria-pressed', 'false');
    this.faceplate.querySelectorAll('.ofp-component').forEach((node) => node.classList.toggle('is-selected', this.selectedIds.has(node.dataset.componentId)));
    this.renderLayers();
    this.renderInspector();
  }
    this.selectedIds ||= new Set();
    if (componentId === null) { this.selectedId = null; this.selectedIds.clear(); }
    else if (multi) {
      if (this.selectedIds.has(componentId)) this.selectedIds.delete(componentId); else this.selectedIds.add(componentId);
      this.selectedId = this.selectedIds.has(componentId) ? componentId : [...this.selectedIds].at(-1) || null;
    } else {
      this.selectedId = componentId;
      this.selectedIds = new Set([componentId]);
      const component = this.getComponent(componentId);
      const bindable = ['knob','dial','encoder','slider','dropdown','button','switch','drawbars','meter'];
      if (component && bindable.includes(component.type) && !component.bind?.moduleId) this.inspectorTab = 'behavior';
    }
    this.faceplate.querySelectorAll('.ofp-component').forEach((node) => node.classList.toggle('is-selected', this.selectedIds.has(node.dataset.componentId)));
    this.renderLayers();
    this.renderInspector();
  }

  addComponent(type, x = null, y = null) {
    const label = TYPES.find((item) => item[0] === type)?.[1] || type;
    const size = ({
      knob: [112, 138], dial: [112, 138], encoder: [112, 138], slider: [74, 148], dropdown: [170, 54],
      button: [140, 54], switch: [110, 68], drawbars: [270, 160], keyboard: [520, 150],
      meter: [118, 92], pad: [92, 92], label: [170, 42], section: [220, 36],
      pitchwheel: [92, 172], modwheel: [92, 172], module: [190, 88],
      screen: [220, 76], oled: [180, 96], led: [120, 42],
    })[type] || [120, 80];
    const count = this.state.components.length;
    const component = {
      id: id(), type, label: type === 'button' ? 'BUTTON' : label.toUpperCase(),
      x: clamp(Number.isFinite(x) ? x - size[0] / 2 : (this.state.width - size[0]) / 2 + (count % 4) * 26, 0, this.state.width - size[0]),
      y: clamp(Number.isFinite(y) ? y - size[1] / 2 : (this.state.height - size[1]) / 2 + (count % 4) * 22, 0, this.state.height - size[1]),
      w: size[0], h: size[1], value: 0.5,
      accent: this.state.accent, surface: '#26313d', textColor: this.state.textColor,
      finish: this.state.finish, margin: 8, padding: 7, gap: 5, radius: 7, fontSize: 8, borderWidth: 1, shadow: 'soft', orientation: 'horizontal', hidden: false, locked: false,
    };
    if (type === 'button') component.action = 'none';
    if (type === 'pad') component.note = 60;
    if (type === 'label' || type === 'section') component.text = label.toUpperCase();
    if (type === 'keyboard') { component.startNote = 48; component.octaves = 2; }
    if (type === 'screen' || type === 'oled') component.text = 'YOUR TEXT\nDISPLAY CONTENT';
    this.state.components.push(component);
    this.selectedId = component.id;
    this.selectedIds = new Set([component.id]);
    this.inspectorOpen = true;
    this.workspace.classList.remove('is-library-open');
    this.addRailButton?.setAttribute('aria-pressed', 'false');
    this.layersRailButton?.setAttribute('aria-pressed', 'false');
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
    this.inspector.hidden = !this.inspectorOpen;
    this.workspace.classList.toggle('is-inspector-open', this.inspectorOpen);
    this.panelSettingsButton?.setAttribute('aria-pressed', String(this.inspectorOpen && !this.selectedId));
    if (!this.inspectorOpen) return;

    const component = this.getComponent(this.selectedId);
    const header = make('div', 'ofp-panel-heading ofp-inspector__heading', this.inspector);
    const identity = make('div', '', header);
    make('span', 'ofp-panel-heading__eyebrow', identity, component ? 'SELECTION' : 'DOCUMENT');
    make('strong', '', identity, component ? (component.label || 'Selected control') : 'Faceplate');
    const close = make('button', 'ofp-inspector-close', header, '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close properties');
    close.addEventListener('click', () => {
      this.inspectorOpen = false;
      this.workspace.classList.remove('is-inspector-open');
      this.panelSettingsButton?.setAttribute('aria-pressed', 'false');
    });

    if (!component) {
      this.inspectorBody = make('div', 'ofp-inspector__body', this.inspector);
      this.renderPanelSettings();
      return;
    }
    const tabs = make('div', 'ofp-inspector-tabs', this.inspector);
    const tabNames = [['layout','Layout'],['appearance','Style'],['behavior','Behaviour']];
    this.inspectorTab ||= 'layout';
    tabNames.forEach(([key,label]) => {
      const button = make('button', 'ofp-inspector-tab', tabs, label);
      button.type = 'button';
      button.setAttribute('role','tab');
      button.setAttribute('aria-selected',String(this.inspectorTab===key));
      button.addEventListener('click',()=>{this.inspectorTab=key;this.renderInspector();});
    });
    this.inspectorBody = make('div', 'ofp-inspector__body', this.inspector);
    if (this.inspectorTab === 'layout') this.renderComponentLayout(component);
    else if (this.inspectorTab === 'appearance') this.renderComponentAppearance(component);
    else this.renderComponentBehavior(component);
  }
    if (!this.inspector) return;
    this.inspector.replaceChildren();
    const header = make('div', 'ofp-panel-heading', this.inspector);
    make('span', 'ofp-panel-heading__eyebrow', header, 'PROPERTIES');
    const component = this.getComponent(this.selectedId);
    make('strong', '', header, component ? (component.label || 'Selected control') : 'Faceplate settings');
    if (!component) {
      this.inspectorBody = make('div', 'ofp-inspector__body', this.inspector);
      this.renderPanelSettings();
      return;
    }
    const tabs = make('div', 'ofp-inspector-tabs', this.inspector);
    const tabNames = [['layout','Layout'],['appearance','Appearance'],['behavior','Behaviour']];
    this.inspectorTab ||= 'layout';
    tabNames.forEach(([key,label]) => {
      const button = make('button', 'ofp-inspector-tab', tabs, label);
      button.type = 'button';
      button.setAttribute('role','tab');
      button.setAttribute('aria-selected',String(this.inspectorTab===key));
      button.addEventListener('click',()=>{this.inspectorTab=key;this.renderInspector();});
    });
    this.inspectorBody = make('div', 'ofp-inspector__body', this.inspector);
    if (this.inspectorTab === 'layout') this.renderComponentLayout(component);
    else if (this.inspectorTab === 'appearance') this.renderComponentAppearance(component);
    else this.renderComponentBehavior(component);
  }

  renderComponentLayout(component) {
    this.inputField('Label', component.label, 'text', (value) => {
      component.label = value.slice(0, 40);
      this.render();
      this.commit();
    });
    const position = make('div', 'ofp-field-grid', this.inspectorBody);
    this.inputField('X (' + this.state.unit + ')', this.unitValue(component.x), 'number', (value) => this.updateComponentProperty(component, 'x', clamp(this.unitPixels(value), 0, this.state.width - component.w)), position);
    this.inputField('Y (' + this.state.unit + ')', this.unitValue(component.y), 'number', (value) => this.updateComponentProperty(component, 'y', clamp(this.unitPixels(value), 0, this.state.height - component.h)), position);
    const dimensions = make('div', 'ofp-field-grid', this.inspectorBody);
    this.inputField('Width (' + this.state.unit + ')', this.unitValue(component.w), 'number', (value) => this.updateComponentProperty(component, 'w', clamp(this.unitPixels(value), 48, Math.min(760, this.state.width - component.x))), dimensions);
    this.inputField('Height (' + this.state.unit + ')', this.unitValue(component.h), 'number', (value) => this.updateComponentProperty(component, 'h', clamp(this.unitPixels(value), 42, Math.min(440, this.state.height - component.y))), dimensions);

    const advanced = make('details', 'ofp-advanced', this.inspectorBody);
    make('summary', 'ofp-advanced__summary', advanced, 'Advanced layout');
    const body = make('div', 'ofp-advanced__body', advanced);
    this.inputField('Clearance (' + this.state.unit + ')', this.unitValue(component.margin ?? 8), 'number', (value) => this.updateComponentProperty(component, 'margin', clamp(this.unitPixels(value), 0, 180)), body);
    if (component.type === 'keyboard') {
      this.inputField('Starting C MIDI note', component.startNote ?? 48, 'number', (value) => { component.startNote = clamp(Math.round(value / 12) * 12, 0, 127 - 12 * (component.octaves ?? 2)); this.render(); this.commit(); }, body);
      this.inputField('Octaves', component.octaves ?? 2, 'number', (value) => { component.octaves = clamp(Math.round(value), 1, 5); component.startNote = clamp(Math.round((component.startNote ?? 48) / 12) * 12, 0, 127 - 12 * component.octaves); this.render(); this.commit(); }, body);
    }
    if (component.type === 'slider') this.selectField('Orientation', component.orientation || 'horizontal', [['horizontal','Horizontal'],['vertical','Vertical']], (value) => { component.orientation = value; this.render(); this.commit(); }, body);
    this.selectField('Visibility', component.hidden ? 'hidden' : 'visible', [['visible','Visible'],['hidden','Hidden']], (value) => { component.hidden = value === 'hidden'; this.render(); this.commit(); }, body);
    this.selectField('Layer lock', component.locked ? 'locked' : 'unlocked', [['unlocked','Unlocked'],['locked','Locked']], (value) => { component.locked = value === 'locked'; this.render(); this.commit(); }, body);

    const actions = make('div', 'ofp-inspector-actions', this.inspectorBody);
    if (component.type !== 'keyboard' && component.type !== 'pitchwheel' && component.type !== 'modwheel') {
      const duplicate = make('button', 'ofp-inspector-action', actions, 'Duplicate');
      duplicate.type = 'button';
      duplicate.addEventListener('click', () => this.duplicateSelected());
    }
    const remove = make('button', 'ofp-inspector-action ofp-inspector-action--danger', actions, 'Delete');
    remove.type = 'button';
    remove.addEventListener('click', () => this.removeSelected());
  }
    this.inputField('Control label', component.label, 'text', (value) => {
      component.label = value.slice(0, 40);
      this.render();
      this.commit();
    });
    const position = make('div', 'ofp-field-grid', this.inspectorBody);
    this.inputField('X (' + this.state.unit + ')', this.unitValue(component.x), 'number', (value) => this.updateComponentProperty(component, 'x', clamp(this.unitPixels(value), 0, this.state.width - component.w)), position);
    this.inputField('Y (' + this.state.unit + ')', this.unitValue(component.y), 'number', (value) => this.updateComponentProperty(component, 'y', clamp(this.unitPixels(value), 0, this.state.height - component.h)), position);
    const dimensions = make('div', 'ofp-field-grid', this.inspectorBody);
    this.inputField('Width (' + this.state.unit + ')', this.unitValue(component.w), 'number', (value) => this.updateComponentProperty(component, 'w', clamp(this.unitPixels(value), 48, Math.min(760, this.state.width - component.x))), dimensions);
    this.inputField('Height (' + this.state.unit + ')', this.unitValue(component.h), 'number', (value) => this.updateComponentProperty(component, 'h', clamp(this.unitPixels(value), 42, Math.min(440, this.state.height - component.y))), dimensions);
    this.inputField('Clearance / margin (' + this.state.unit + ')', this.unitValue(component.margin ?? 8), 'number', (value) => this.updateComponentProperty(component, 'margin', clamp(this.unitPixels(value), 0, 180)));
    if (component.type === 'keyboard') {
      this.inputField('Starting C MIDI note', component.startNote ?? 48, 'number', (value) => { component.startNote = clamp(Math.round(value / 12) * 12, 0, 127 - 12 * (component.octaves ?? 2)); this.render(); this.commit(); });
      this.inputField('Octaves', component.octaves ?? 2, 'number', (value) => { component.octaves = clamp(Math.round(value), 1, 5); component.startNote = clamp(Math.round((component.startNote ?? 48) / 12) * 12, 0, 127 - 12 * component.octaves); this.render(); this.commit(); });
    }
    if (component.type === 'slider') this.selectField('Orientation', component.orientation || 'horizontal', [['horizontal','Horizontal'],['vertical','Vertical']], (value) => { component.orientation = value; this.render(); this.commit(); });
    this.selectField('Visibility', component.hidden ? 'hidden' : 'visible', [['visible','Visible'],['hidden','Hidden']], (value) => { component.hidden = value === 'hidden'; this.render(); this.commit(); });
    this.selectField('Layer lock', component.locked ? 'locked' : 'unlocked', [['unlocked','Unlocked'],['locked','Locked']], (value) => { component.locked = value === 'locked'; this.render(); this.commit(); });
    const actions = make('div', 'ofp-inspector-actions', this.inspectorBody);
    if (component.type !== 'keyboard' && component.type !== 'pitchwheel' && component.type !== 'modwheel') {
      const duplicate = make('button', 'ofp-inspector-action', actions, 'Duplicate');
      duplicate.type = 'button';
      duplicate.addEventListener('click', () => this.duplicateSelected());
    }
    const remove = make('button', 'ofp-inspector-action ofp-inspector-action--danger', actions, 'Remove');
    remove.type = 'button';
    remove.addEventListener('click', () => this.removeSelected());
  }

  applyMaterialPreset(presetId, component = null) {
    const preset = MATERIAL_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    if (component) {
      component.finish = preset.finish;
      component.surface = preset.surface;
      component.accent = preset.accent;
      component.textColor = preset.text;
      component.borderColor = preset.border;
    } else {
      this.state.finish = preset.finish;
      this.state.panelColor = preset.surface;
      this.state.accent = preset.accent;
      this.state.textColor = preset.text;
      this.state.panelBorderColor = preset.border;
    }
    this.render();
    this.commit();
  }

  renderMaterialPresets(parent, component = null) {
    const group = make('div', 'ofp-material-presets', parent);
    make('span', 'ofp-panel-heading__eyebrow', group, 'HARDWARE PALETTES');
    const grid = make('div', 'ofp-material-presets__grid', group);
    MATERIAL_PRESETS.forEach((preset) => {
      const button = make('button', 'ofp-material-preset', grid);
      button.type = 'button';
      button.title = preset.label;
      button.setAttribute('aria-label', 'Apply ' + preset.label + ' palette');
      button.dataset.finish = preset.finish;
      const chips = make('span', 'ofp-material-preset__chips', button);
      [preset.surface,preset.accent,preset.text].forEach((colour) => {
        const chip = make('span', '', chips);
        chip.style.backgroundColor = colour;
      });
      make('span', 'ofp-material-preset__label', button, preset.label);
      button.addEventListener('click', () => this.applyMaterialPreset(preset.id, component));
    });
  }

  renderComponentAppearance(component) {
    const presets = make('details', 'ofp-advanced', this.inspectorBody);
    make('summary', 'ofp-advanced__summary', presets, 'Material presets');
    const presetBody = make('div', 'ofp-advanced__body', presets);
    this.renderMaterialPresets(presetBody, component);
    this.selectField('Finish', component.finish || this.state.finish, FINISHES, (value) => {
      component.finish = value;
      this.render();
      this.commit();
    });
    this.colorField('Accent', component.accent || this.state.accent, (value, commit) => {
      component.accent = value;
      this.faceplate.querySelector('[data-component-id="' + component.id + '"]')?.style.setProperty('--ofp-control-accent', value);
      if (commit) this.commit();
    }, this.inspectorBody);

    const advanced = make('details', 'ofp-advanced', this.inspectorBody);
    make('summary', 'ofp-advanced__summary', advanced, 'Advanced appearance');
    const body = make('div', 'ofp-advanced__body', advanced);
    const colors = make('div', 'ofp-field-grid ofp-color-grid', body);
    this.colorField('Surface', component.surface || '#26313d', (value, commit) => {
      component.surface = value;
      this.faceplate.querySelector('[data-component-id="' + component.id + '"]')?.style.setProperty('--ofp-control-surface', value);
      if (commit) this.commit();
    }, colors);
    this.colorField('Legend', component.textColor || this.state.textColor, (value, commit) => {
      component.textColor = value;
      this.faceplate.querySelector('[data-component-id="' + component.id + '"]')?.style.setProperty('--ofp-control-text', value);
      if (commit) this.commit();
    }, colors);
    this.colorField('Border', component.borderColor || component.accent || this.state.accent, (value, commit) => {
      component.borderColor = value;
      this.faceplate.querySelector('[data-component-id="' + component.id + '"]')?.style.setProperty('--ofp-control-border', value);
      if (commit) this.commit();
    }, body);
    const metrics = make('div', 'ofp-field-grid', body);
    this.inputField('Inner padding', component.padding ?? 7, 'number', (value) => this.updateComponentProperty(component, 'padding', clamp(value, 0, 48)), metrics);
    this.inputField('Control spacing', component.gap ?? 5, 'number', (value) => this.updateComponentProperty(component, 'gap', clamp(value, 0, 32)), metrics);
    const typeMetrics = make('div', 'ofp-field-grid', body);
    this.inputField('Corner radius', component.radius ?? 7, 'number', (value) => this.updateComponentProperty(component, 'radius', clamp(value, 0, 32)), typeMetrics);
    this.inputField('Legend size', component.fontSize ?? 8, 'number', (value) => this.updateComponentProperty(component, 'fontSize', clamp(value, 6, 28)), typeMetrics);
    this.inputField('Border width', component.borderWidth ?? 1, 'number', (value) => this.updateComponentProperty(component, 'borderWidth', clamp(value, 0, 6)), body);
    this.selectField('Depth', component.shadow || 'soft', [['none','Flat'],['soft','Soft shadow'],['hard','Raised hardware']], (value) => this.updateComponentProperty(component, 'shadow', value), body);
  }
    this.renderMaterialPresets(this.inspectorBody, component);
    this.selectField('Material', component.finish || this.state.finish, FINISHES, (value) => {
      component.finish = value;
      this.render();
      this.commit();
    });
    const colors = make('div', 'ofp-field-grid ofp-color-grid', this.inspectorBody);
    this.colorField('Accent', component.accent || this.state.accent, (value, commit) => {
      component.accent = value;
      this.faceplate.querySelector('[data-component-id="' + component.id + '"]')?.style.setProperty('--ofp-control-accent', value);
      if (commit) this.commit();
    }, colors);
    this.colorField('Surface', component.surface || '#26313d', (value, commit) => {
      component.surface = value;
      this.faceplate.querySelector('[data-component-id="' + component.id + '"]')?.style.setProperty('--ofp-control-surface', value);
      if (commit) this.commit();
    }, colors);
    this.colorField('Legend colour', component.textColor || this.state.textColor, (value, commit) => {
      component.textColor = value;
      this.faceplate.querySelector('[data-component-id="' + component.id + '"]')?.style.setProperty('--ofp-control-text', value);
      if (commit) this.commit();
    }, colors);
    this.colorField('Border colour', component.borderColor || component.accent || this.state.accent, (value, commit) => {
      component.borderColor = value;
      this.faceplate.querySelector('[data-component-id="' + component.id + '"]')?.style.setProperty('--ofp-control-border', value);
      if (commit) this.commit();
    });
    const metrics = make('div', 'ofp-field-grid', this.inspectorBody);
    this.inputField('Inner padding (px)', component.padding ?? 7, 'number', (value) => this.updateComponentProperty(component, 'padding', clamp(value, 0, 48)), metrics);
    this.inputField('Control spacing (px)', component.gap ?? 5, 'number', (value) => this.updateComponentProperty(component, 'gap', clamp(value, 0, 32)), metrics);
    const typeMetrics = make('div', 'ofp-field-grid', this.inspectorBody);
    this.inputField('Corner radius (px)', component.radius ?? 7, 'number', (value) => this.updateComponentProperty(component, 'radius', clamp(value, 0, 32)), typeMetrics);
    this.inputField('Legend size (px)', component.fontSize ?? 8, 'number', (value) => this.updateComponentProperty(component, 'fontSize', clamp(value, 6, 28)), typeMetrics);
    this.inputField('Border width (px)', component.borderWidth ?? 1, 'number', (value) => this.updateComponentProperty(component, 'borderWidth', clamp(value, 0, 6)), typeMetrics);
    this.selectField('Depth treatment', component.shadow || 'soft', [['none','Flat'],['soft','Soft shadow'],['hard','Raised hardware']], (value) => this.updateComponentProperty(component, 'shadow', value));
  }

  renderComponentBehavior(component) {
    const modules = this.app.patch.modules
      .map((module) => ({ module, definition: MODULES[module.type] }))
      .filter((item) => item.definition);
    const numericParameters = (module) => {
      const definition = MODULES[module.type];
      return (definition?.params || []).filter((parameter) =>
        Number.isFinite(Number(parameter.min)) &&
        Number.isFinite(Number(parameter.max)) &&
        Number(parameter.max) > Number(parameter.min) &&
        !Array.isArray(parameter.options)
      );
    };

    if (component.type === 'module') {
      const options = [['', 'Choose an OMNI module…']];
      modules.forEach(({ module, definition }) => options.push([module.id, definition.name + ' · ' + module.id]));
      this.selectField('Connected module', component.bind?.moduleId || '', options, (value) => {
        component.bind = value ? { moduleId: value } : null;
        this.render();
        this.commit();
      });
      make('p', 'ofp-field-note', this.inspectorBody, 'A module bay identifies a live module on the faceplate. Audio routing remains in Engine View.');
      return;
    }

    const numericTypes = ['knob', 'dial', 'encoder', 'slider', 'switch', 'meter', 'button'];
    const isDrawbars = component.type === 'drawbars';
    const isDropdown = component.type === 'dropdown';
    const canBind = numericTypes.includes(component.type) || isDropdown || isDrawbars;

    if (canBind) {
      make('p', 'ofp-field-note ofp-binding-intro', this.inspectorBody, 'Connect this control to a live OMNI module parameter. Moving it will change that parameter in the synthesis engine.');
      const parametersFor = (moduleId) => {
        const selected = modules.find((item) => item.module.id === moduleId);
        if (!selected) return [];
        const params = selected.definition.params || [];
        if (isDrawbars) {
          return params.some((parameter) => parameter.key === 'drawbar1')
            ? [{ key: 'drawbar1', label: 'Nine drawbars', parameter: params.find((parameter) => parameter.key === 'drawbar1') }]
            : [];
        }
        if (isDropdown) {
          return params.filter((parameter) => Array.isArray(parameter.options))
            .map((parameter) => ({ key: parameter.key, label: parameter.label, parameter }));
        }
        return numericParameters(selected.module)
          .map((parameter) => ({ key: parameter.key, label: parameter.label, parameter }));
      };

      const eligible = modules.filter(({ module }) => parametersFor(module.id).length > 0);
      const currentModuleId = component.bind?.moduleId || '';
      const selectedModuleId = eligible.some(({ module }) => module.id === currentModuleId) ? currentModuleId : '';
      const moduleOptions = [['', 'Choose a module…'], ...eligible.map(({ module, definition }) => [module.id, definition.name + ' · ' + module.id])];
      this.selectField('OMNI module', selectedModuleId, moduleOptions, (value) => {
        if (!value) {
          component.bind = null;
          if (component.type === 'button') component.action = 'none';
        } else {
          const first = parametersFor(value)[0];
          component.bind = isDrawbars ? { moduleId: value } : { moduleId: value, paramKey: first?.key || '' };
          if (component.type === 'button') component.action = 'toggle';
        }
        this.render();
        this.commit();
      });

      if (selectedModuleId && !isDrawbars) {
        const parameters = parametersFor(selectedModuleId);
        const currentKey = component.bind?.paramKey || '';
        const parameterOptions = parameters.map((item) => [item.key, item.label]);
        this.selectField('Module parameter', currentKey, parameterOptions, (value) => {
          component.bind = value ? { moduleId: selectedModuleId, paramKey: value } : null;
          if (component.type === 'button') component.action = value ? 'toggle' : 'none';
          this.render();
          this.commit();
        });
        const selected = parameters.find((item) => item.key === currentKey);
        if (selected && !isDropdown) {
          const range = selected.parameter;
          const rangeReadout = make('div', 'ofp-binding-range', this.inspectorBody);
          make('span', '', rangeReadout, 'ENGINE RANGE');
          make('strong', '', rangeReadout, String(range.min) + ' – ' + String(range.max));
          make('span', '', rangeReadout, 'Step ' + (range.step ?? 0.01) + (range.log ? ' · logarithmic' : ''));
        }
      } else if (selectedModuleId && isDrawbars) {
        make('p', 'ofp-field-note', this.inspectorBody, 'All nine drawbars bind to drawbar1–drawbar9 on this organ module.');
      }

      if (!eligible.length) {
        make('p', 'ofp-field-note', this.inspectorBody, isDropdown
          ? 'Add an OMNI module with a parameter that offers discrete options.'
          : 'Add an OMNI module with numeric parameters first. Then choose the module and the parameter you want this control to change.');
      } else if (!selectedModuleId) {
        make('p', 'ofp-field-note', this.inspectorBody, 'Choose an OMNI module, then choose one of its parameters. Moving this control will update that module in the live sound engine.');
      }
    }

    if (component.type === 'button') {
      this.selectField('Button action', component.bind?.paramKey ? 'toggle' : (component.action || 'none'), [
        ['none', 'No action'],
        ['panic', 'All notes off'],
        ['toggle', 'Toggle bound parameter'],
      ], (value) => {
        component.action = value;
        if (value === 'panic' || value === 'none') component.bind = null;
        this.render();
        this.commit();
      });
    }

    if (component.type === 'pad') {
      this.inputField('MIDI note', component.note ?? 60, 'number', (value) => {
        component.note = clamp(value, 0, 127);
        this.render();
        this.commit();
      });
    }
    if (['screen', 'oled', 'label', 'section'].includes(component.type)) {
      const textarea = make('textarea', 'ofp-textarea', this.inspectorBody);
      textarea.value = component.text || '';
      textarea.rows = 4;
      textarea.addEventListener('change', () => {
        component.text = textarea.value.slice(0, 240);
        this.render();
        this.commit();
      });
      this.field('Text / display content', textarea);
    }
    const bound = this.getParameter(component);
    const drawbarModule = component.type === 'drawbars' ? this.getModule(component.bind?.moduleId) : null;
    const bindingState = bound
      ? 'LIVE · ' + bound.definition.name + ' / ' + bound.parameter.label
      : drawbarModule
        ? 'LIVE · ' + (MODULES[drawbarModule.type]?.name || drawbarModule.type) + ' / NINE DRAWBARS'
      : component.bind?.moduleId
        ? 'Module or parameter is missing.'
        : canBind
          ? 'NOT CONNECTED · choose a module and parameter above.'
          : 'PERFORMANCE CONTROL · uses the shared OMNI engine.';
    make('p', 'ofp-binding-status' + (bound ? ' is-connected' : ''), this.inspectorBody, bindingState);
  }

  renderPanelSettings() {
    this.inputField('Width (' + this.state.unit + ')', this.unitValue(this.state.width), 'number', (value) => {
      this.state.width = clamp(this.unitPixels(value), 800, 1800);
      this.state.components.forEach((item) => { item.w = Math.min(item.w, this.state.width); item.x = clamp(item.x, 0, this.state.width - item.w); });
      this.render();
      this.commit();
    });
    this.inputField('Height (' + this.state.unit + ')', this.unitValue(this.state.height), 'number', (value) => {
      this.state.height = clamp(this.unitPixels(value), 360, 900);
      this.state.components.forEach((item) => { item.h = Math.min(item.h, this.state.height); item.y = clamp(item.y, 0, this.state.height - item.h); });
      this.render();
      this.commit();
    });
    this.selectField('Finish', this.state.finish, FINISHES, (value) => {
      this.state.finish = value;
      this.state.components.forEach((item) => { if (!item.finish) item.finish = value; });
      this.render();
      this.commit();
    });
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

    const presets = make('details', 'ofp-advanced', this.inspectorBody);
    make('summary', 'ofp-advanced__summary', presets, 'Material presets');
    const presetBody = make('div', 'ofp-advanced__body', presets);
    this.renderMaterialPresets(presetBody);

    const advanced = make('details', 'ofp-advanced', this.inspectorBody);
    make('summary', 'ofp-advanced__summary', advanced, 'Advanced settings');
    const body = make('div', 'ofp-advanced__body', advanced);
    this.selectField('Units', this.state.unit || 'mm', [['px','Pixels'],['mm','Millimetres'],['in','Inches']], (value) => { this.state.unit = value; this.render(); this.commit(); }, body);
    this.inputField('Safe margin (' + this.state.unit + ')', this.unitValue(this.state.safeMargin ?? 24), 'number', (value) => { this.state.safeMargin = clamp(this.unitPixels(value), 0, 450); this.render(); this.commit(); }, body);
    this.inputField('Grid spacing (' + this.state.unit + ')', this.unitValue(this.state.gridSize ?? 28), 'number', (value) => { this.state.gridSize = clamp(this.unitPixels(value), 4, 450); this.render(); this.commit(); }, body);

    const frame = make('div', 'ofp-panel-heading ofp-panel-heading--subsection', body);
    make('strong', '', frame, 'Frame');
    this.colorField('Frame colour', this.state.panelBorderColor || '#667583', (value, commit) => {
      this.state.panelBorderColor = value;
      this.faceplate.style.borderColor = value;
      if (commit) this.commit();
    }, body);
    const frameMetrics = make('div', 'ofp-field-grid', body);
    this.inputField('Frame width (px)', this.state.panelBorderWidth ?? 1, 'number', (value) => {
      this.state.panelBorderWidth = clamp(value, 0, 8);
      this.faceplate.style.borderWidth = this.state.panelBorderWidth + 'px';
      this.commit();
    }, frameMetrics);
    this.inputField('Corner radius (px)', this.state.panelRadius ?? 14, 'number', (value) => {
      this.state.panelRadius = clamp(value, 0, 40);
      this.faceplate.style.borderRadius = this.state.panelRadius + 'px';
      this.commit();
    }, frameMetrics);
    this.colorField('Legend colour', this.state.textColor, (value, commit) => {
      this.state.textColor = value;
      this.faceplate.style.setProperty('--ofp-text', value);
      if (commit) this.commit();
    }, body);

    const guidesHead = make('div', 'ofp-panel-heading ofp-panel-heading--subsection', body);
    make('strong', '', guidesHead, 'Guides and measurements');
    (this.state.guides || []).forEach((guide, index) => {
      const row = make('div', 'ofp-guide-setting', body);
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
      const removeGuide = make('button', 'ofp-inspector-action ofp-inspector-action--danger', row, 'Remove guide');
      removeGuide.type = 'button';
      removeGuide.addEventListener('click', () => { this.state.guides.splice(index, 1); this.render(); this.commit(); });
    });
    (this.state.measurements || []).forEach((measurement, index) => {
      const row = make('div', 'ofp-guide-setting', body);
      const dx = Math.abs(measurement.x2 - measurement.x1);
      const dy = Math.abs(measurement.y2 - measurement.y1);
      const distance = Math.hypot(dx, dy);
      make('span', 'ofp-guide-setting__name', row, 'MEASUREMENT ' + (index + 1));
      make('span', 'ofp-measurement-readout', row, 'DIST ' + this.unitText(distance) + ' · X ' + this.unitText(dx) + ' · Y ' + this.unitText(dy));
      const removeMeasurement = make('button', 'ofp-inspector-action ofp-inspector-action--danger', row, 'Remove measurement');
      removeMeasurement.type = 'button';
      removeMeasurement.addEventListener('click', () => { this.state.measurements.splice(index, 1); this.render(); this.commit(); });
    });
    const guideActions = make('div', 'ofp-field-grid', body);
    [['x','Add vertical'],['y','Add horizontal']].forEach(([axis,label]) => {
      const button = make('button', 'ofp-inspector-action', guideActions, label);
      button.type = 'button';
      button.addEventListener('click', () => {
        this.pendingGuideAxis = axis;
        this.tool = 'guide';
        this.viewport.classList.add('is-placing-guide');
        this.app.msg('Click the faceplate to position the guide.');
      });
    });
    const clearGuides = make('button', 'ofp-inspector-action ofp-inspector-action--danger', body, 'Clear guides and measurements');
    clearGuides.type = 'button';
    clearGuides.addEventListener('click', () => { this.state.guides = []; this.state.measurements = []; this.render(); this.commit(); });
    make('p', 'ofp-field-note', body, 'These settings are saved with the instrument patch.');
  }
    this.renderMaterialPresets(this.inspectorBody);
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
    const measureHead = make('div', 'ofp-panel-heading', this.inspectorBody);
    make('span', 'ofp-panel-heading__eyebrow', measureHead, 'MEASUREMENTS');
    make('strong', '', measureHead, (this.state.measurements || []).length + ' saved distances');
    (this.state.measurements || []).forEach((measurement, index) => {
      const row = make('div', 'ofp-guide-setting', this.inspectorBody);
      const dx = Math.abs(measurement.x2 - measurement.x1);
      const dy = Math.abs(measurement.y2 - measurement.y1);
      const distance = Math.hypot(dx, dy);
      make('span', 'ofp-guide-setting__name', row, 'MEASUREMENT ' + (index + 1));
      make('span', 'ofp-measurement-readout', row, 'DIST ' + this.unitText(distance) + ' · X ' + this.unitText(dx) + ' · Y ' + this.unitText(dy));
      const removeMeasurement = make('button', 'ofp-inspector-action ofp-inspector-action--danger', row, 'REMOVE MEASUREMENT');
      removeMeasurement.type = 'button';
      removeMeasurement.addEventListener('click', () => { this.state.measurements.splice(index, 1); this.render(); this.commit(); });
    });
    const clearMeasurementList = make('button', 'ofp-inspector-action ofp-inspector-action--danger', this.inspectorBody, 'CLEAR MEASUREMENTS');
    clearMeasurementList.type = 'button';
    clearMeasurementList.disabled = !(this.state.measurements || []).length;
    clearMeasurementList.addEventListener('click', () => { this.state.measurements = []; this.render(); this.commit(); });

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
    this.colorField('Panel frame colour', this.state.panelBorderColor || '#667583', (value, commit) => {
      this.state.panelBorderColor = value;
      this.faceplate.style.borderColor = value;
      if (commit) this.commit();
    });
    const frameMetrics = make('div', 'ofp-field-grid', this.inspectorBody);
    this.inputField('Frame width (px)', this.state.panelBorderWidth ?? 1, 'number', (value) => {
      this.state.panelBorderWidth = clamp(value, 0, 8);
      this.faceplate.style.borderWidth = this.state.panelBorderWidth + 'px';
      this.commit();
    }, frameMetrics);
    this.inputField('Panel radius (px)', this.state.panelRadius ?? 14, 'number', (value) => {
      this.state.panelRadius = clamp(value, 0, 40);
      this.faceplate.style.borderRadius = this.state.panelRadius + 'px';
      this.commit();
    }, frameMetrics);
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
      const variables = {
        margin: '--ofp-clearance', padding: '--ofp-padding', gap: '--ofp-gap',
        radius: '--ofp-radius', fontSize: '--ofp-font-size', borderWidth: '--ofp-border-width',
      };
      if (variables[key]) node.style.setProperty(variables[key], value + 'px');
      if (key === 'shadow') node.dataset.shadow = value;
      if (key === 'x') node.style.left = value + 'px';
      if (key === 'y') node.style.top = value + 'px';
      if (key === 'w') node.style.width = value + 'px';
      if (key === 'h') node.style.height = value + 'px';
    }
    this.commit();
    this.renderInspector();
  }

  scaleFaceplate() {
    if (!this.viewport || !this.faceplate || !this.stage) return;
    const availableWidth = Math.max(100, this.viewport.clientWidth - 48);
    const availableHeight = Math.max(100, this.viewport.clientHeight - 48);
    const fitScale = Math.min(1, availableWidth / this.state.width, availableHeight / this.state.height);
    this.currentScale = clamp(fitScale * clamp(this.state.zoom ?? 1, .25, 4), 0.18, 4);
    const scaledWidth = this.state.width * this.currentScale;
    const scaledHeight = this.state.height * this.currentScale;
    this.faceplate.style.transform = 'scale(' + this.currentScale + ')';
    this.stage.style.width = scaledWidth + 'px';
    this.stage.style.height = scaledHeight + 'px';
    this.stage.style.marginLeft = Math.max(16,(this.viewport.clientWidth-scaledWidth)/2) + 'px';
    this.stage.style.marginTop = Math.max(16,(this.viewport.clientHeight-scaledHeight)/2) + 'px';
    this.stage.style.marginRight = '16px';
    this.stage.style.marginBottom = '16px';
    if (this.zoomReadout) this.zoomReadout.textContent = Math.round((this.state.zoom || 1) * 100) + '%';
    if (this.zoomOutButton) this.zoomOutButton.disabled = (this.state.zoom || 1) <= .25;
    if (this.zoomInButton) this.zoomInButton.disabled = (this.state.zoom || 1) >= 4;
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
        if (select) {
          const options = this.getOptions(this.getParameter(component));
          const rawValue = this.getRawValue(component);
          const index = options.findIndex((item) => String(item.value) === String(rawValue));
          if (index >= 0) select.selectedIndex = index;
        }
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
    this.state = patch.frontPanel && !this.isLegacyStarterLayout(patch.frontPanel) ? clone(patch.frontPanel) : this.defaultLayout();
    patch.frontPanel = this.state;
    this.selectedId = null;
    this.selectedIds?.clear();
    this.render();
  }

  commit() {
    this.app.patch.frontPanel = this.state;
    this.app.pushHistory();
  }

  exportSVGMarkup() {
    const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    const width = this.state.width, height = this.state.height;
    const background = safeColor(this.state.panelColor, '#252d35');
    const panelBorder = safeColor(this.state.panelBorderColor, '#667583');
    const panelBorderWidth = clamp(this.state.panelBorderWidth ?? 1, 0, 8);
    const panelRadius = clamp(this.state.panelRadius ?? 14, 0, 40);
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
      '<pattern id="ofp-matte" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".35" fill="#ffffff" fill-opacity=".16"/><circle cx="4" cy="3" r=".3" fill="#000000" fill-opacity=".2"/></pattern>',
      '<pattern id="ofp-brushed" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 1H6 M0 3H6 M0 5H6" stroke="#ffffff" stroke-opacity=".17" stroke-width=".45"/><path d="M0 2H6" stroke="#17242c" stroke-opacity=".12" stroke-width=".5"/></pattern>',
      '<pattern id="ofp-walnut" width="34" height="14" patternUnits="userSpaceOnUse"><path d="M0 2 C8 -1 15 6 34 2 M0 7 C10 4 19 11 34 7 M0 12 C8 9 23 15 34 12" fill="none" stroke="#b47c50" stroke-opacity=".42" stroke-width=".8"/><path d="M10 0 C16 4 12 8 20 14" fill="none" stroke="#24140d" stroke-opacity=".3" stroke-width="1"/></pattern>',
      '<pattern id="ofp-anodized" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 0V4 M2 0V4" stroke="#a9c6d2" stroke-opacity=".09" stroke-width=".55"/><path d="M3 0V4" stroke="#000000" stroke-opacity=".2" stroke-width=".5"/></pattern>',
      '<linearGradient id="ofp-ivory" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".5"/><stop offset=".38" stop-color="#f7f1e4" stop-opacity=".18"/><stop offset="1" stop-color="#8e8a7d" stop-opacity=".13"/></linearGradient>',
      '<linearGradient id="ofp-enamel-highlight" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".32"/><stop offset=".14" stop-color="#ffffff" stop-opacity=".04"/><stop offset="1" stop-color="#000000" stop-opacity=".08"/></linearGradient>',
      '<filter id="ofp-soft-shadow" x="-25%" y="-25%" width="150%" height="165%"><feGaussianBlur in="SourceAlpha" stdDeviation="3"/><feOffset dy="4"/><feComponentTransfer><feFuncA type="linear" slope=".38"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
      '<filter id="ofp-hard-shadow" x="-25%" y="-25%" width="150%" height="170%"><feGaussianBlur in="SourceAlpha" stdDeviation="1"/><feOffset dy="7"/><feComponentTransfer><feFuncA type="linear" slope=".48"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
    ].join('');
    const materialOverlay = (x,y,w,h,finish) => {
      if (finish === 'matte') return rect(x,y,w,h,'url(#ofp-matte)','none',7,'opacity=".58"');
      if (finish === 'brushed') return rect(x,y,w,h,'url(#ofp-brushed)','none',7,'opacity=".82"');
      if (finish === 'walnut') return rect(x,y,w,h,'url(#ofp-walnut)','none',7,'opacity=".85"');
      if (finish === 'anodized') return rect(x,y,w,h,'url(#ofp-anodized)','none',7,'opacity=".9"');
      if (finish === 'ivory') return rect(x,y,w,h,'url(#ofp-ivory)','none',7);
      return '';
    };
    const componentMarkup = this.state.components.filter((item) => !item.hidden).map((component) => {
      const x=component.x, y=component.y, w=component.w, h=component.h;
      const accent=safeColor(component.accent,globalAccent);
      const surface=safeColor(component.surface,'#26313d');
      const legend=safeColor(component.textColor,globalText);
      const border=safeColor(component.borderColor,accent);
      const radius=clamp(component.radius ?? 7,0,32);
      const borderWidth=clamp(component.borderWidth ?? 1,0,6);
      const fontSize=clamp(component.fontSize ?? 8,6,28);
      const shadow=component.shadow==='hard'?'url(#ofp-hard-shadow)':component.shadow==='none'?'':'url(#ofp-soft-shadow)';
      const finish=FINISHES.some(([key])=>key===component.finish)?component.finish:'matte';
      const label=esc(component.label || component.type.toUpperCase());
      let shape='';
      if (!['label','section'].includes(component.type)) {
        shape += rect(x,y,w,h,surface,border,radius,'stroke-opacity=".72" stroke-width="'+borderWidth+'"');
        shape += materialOverlay(x,y,w,h,finish);
      }
      const cx=x+w/2, cy=y+h/2;
      if (component.type === 'dial') {
        const r=Math.min(w,h)*.31, ratio=valueRatio(component), angle=(-135+ratio*270)*Math.PI/180, faceY=y+h*.58;
        shape += '<circle cx="'+cx+'" cy="'+faceY+'" r="'+(r*1.2)+'" fill="#0b1118" stroke="'+border+'" stroke-width="2"/>';
        shape += '<circle cx="'+cx+'" cy="'+faceY+'" r="'+r+'" fill="'+surface+'" stroke="'+accent+'" stroke-opacity=".7" stroke-width="1.2"/>';
        for(let tick=0;tick<=20;tick++){
          const a=(-135+tick*13.5)*Math.PI/180, major=tick%5===0, inner=r*.94, outer=r*(major?1.12:1.05);
          shape += '<path d="M '+(cx+Math.sin(a)*inner)+' '+(faceY-Math.cos(a)*inner)+' L '+(cx+Math.sin(a)*outer)+' '+(faceY-Math.cos(a)*outer)+'" stroke="'+legend+'" stroke-opacity="'+(major?'.9':'.45')+'" stroke-width="'+(major?1.8:1)+'"/>';
          if(major){
            const label=tick*5, tx=cx+Math.sin(a)*r*1.29, ty=faceY-Math.cos(a)*r*1.29+2;
            shape += text(tx,ty,String(label),legend,Math.max(5,fontSize-2),'middle');
          }
        }
        const tipX=cx+Math.sin(angle)*r*.85, tipY=faceY-Math.cos(angle)*r*.85;
        shape += '<path d="M '+cx+' '+faceY+' L '+tipX+' '+tipY+'" stroke="#f5f7f8" stroke-width="2.4" stroke-linecap="round"/>';
        shape += '<circle cx="'+cx+'" cy="'+faceY+'" r="'+(r*.12)+'" fill="'+accent+'" stroke="#111820" stroke-width="1"/>';
      } else if (component.type === 'knob' || component.type === 'encoder') {
        const r=Math.min(w,h)*.25, ratio=valueRatio(component), angle=(-135+ratio*270)*Math.PI/180, faceY=y+h*.56;
        shape += '<circle cx="'+cx+'" cy="'+faceY+'" r="'+(r*1.25)+'" fill="#101820" stroke="'+border+'" stroke-width="2"/>';
        if(component.type==='encoder'){
          for(let tooth=0;tooth<32;tooth++){const a=tooth*Math.PI/16;shape += '<path d="M '+(cx+Math.cos(a)*r*1.12)+' '+(faceY+Math.sin(a)*r*1.12)+' L '+(cx+Math.cos(a)*r*1.28)+' '+(faceY+Math.sin(a)*r*1.28)+'" stroke="'+legend+'" stroke-opacity=".8" stroke-width="1.2"/>';}
        }
        shape += '<circle cx="'+cx+'" cy="'+faceY+'" r="'+r+'" fill="'+surface+'" stroke="#aeb9c2" stroke-opacity=".55"/>';
        shape += '<path d="M '+cx+' '+(faceY-r*.65)+' L '+(cx+Math.sin(angle)*r*.75)+' '+(faceY-Math.cos(angle)*r*.75)+'" stroke="'+accent+'" stroke-width="3" stroke-linecap="round"/>';
        shape += '<path d="M '+(cx-r*1.5)+' '+(faceY+r*1.55)+' A '+(r*1.5)+' '+(r*1.5)+' 0 1 1 '+(cx+r*1.5)+' '+(faceY+r*1.55)+'" fill="none" stroke="'+accent+'" stroke-opacity=".65"/>';
      } else if (component.type === 'slider') {
        const ratio=valueRatio(component);
        if (component.orientation === 'horizontal') {
          const trackX=x+18, trackW=Math.max(12,w-36), trackY=cy-3;
          shape += rect(trackX,trackY,trackW,6,'#111820','#73808b',3);
          shape += rect(trackX+trackW*ratio-5,cy-10,10,20,'#cbd4da','#64727d',3);
        } else {
          const trackX=cx-3,trackY=y+28,trackH=Math.max(12,h-52);
          shape += rect(trackX,trackY,6,trackH,'#111820','#73808b',3);
          shape += rect(cx-10,trackY+trackH*(1-ratio)-5,20,10,'#cbd4da','#64727d',3);
        }
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
        const top=y+27, keyHeight=Math.max(12,h-34), octaves=clamp(Math.round(component.octaves ?? 2),1,5);
        const whiteCount=7*octaves, whiteW=(w-14)/whiteCount;
        shape += rect(x+7,top-4,w-14,keyHeight+8,'#090d11','#080b0e',3);
        for(let index=0;index<whiteCount;index++) shape += rect(x+7+index*whiteW,top,whiteW-1,keyHeight,'#e9edf0','#8996a2',2);
        const blackOffsets=[.70,1.72,3.70,4.72,5.72], blackW=whiteW*.52;
        for(let octave=0;octave<octaves;octave++) blackOffsets.forEach((offset)=>{shape+=rect(x+7+(octave*7+offset)*whiteW-blackW/2,top,blackW,keyHeight*.61,'#131a21','#05080b',2);});
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
        shape += text(cx,y+45,module?MODULES[module.type]?.name||module.type:'UNASSIGNED MODULE',legend,fontSize,'middle','font-weight="bold"');
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
        shape += text(cx,cy+4,component.text||component.label,legend,fontSize,'middle');
      }
      if (component.type !== 'label' && component.type !== 'section') {
        shape += text(cx,y+16,label,legend,fontSize,'middle','letter-spacing="1"');
      } else if (component.type === 'section') {
        shape += '<rect x="'+(x+w*.2)+'" y="'+(cy-9)+'" width="'+(w*.6)+'" height="18" fill="'+background+'"/>';
        shape += text(cx,cy+3,component.text||component.label,legend,fontSize,'middle','letter-spacing="1"');
      }
      return '<g data-component="'+esc(component.id)+'"'+(shadow?' filter="'+shadow+'"':'')+'>'+shape+'</g>';
    }).join('');
    const panelFinish=materialOverlay(0,0,width,height,this.state.finish||'matte');
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'"><defs>'+defs+'</defs>'
      + rect(0,0,width,height,background,panelBorder,panelRadius,'stroke-width="'+panelBorderWidth+'"')
      + panelFinish + componentMarkup + '</svg>';
    return svg;
  }

  get exportBaseName() {
    return (this.app.patch.name || 'omni-instrument').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'omni-instrument';
  }

  downloadBlob(blob, extension) {
    const url = URL.createObjectURL(blob);
    const link = make('a', '', document.body);
    link.href = url;
    link.download = this.exportBaseName + '-front-panel.' + extension;
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  exportSVG() {
    this.downloadBlob(new Blob([this.exportSVGMarkup()], { type: 'image/svg+xml;charset=utf-8' }), 'svg');
    this.app.msg('Front-panel SVG exported.');
  }

  exportPNG(scale = 2) {
    this.exportRaster('image/png', clamp(scale, 1, 4), 'png');
  }

  exportJPEG(scale = 1) {
    this.exportRaster('image/jpeg', clamp(scale, 1, 4), 'jpg');
  }

  exportRaster(type, scale, extension) {
    const markup = this.exportSVGMarkup();
    const source = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(this.state.width * scale);
      canvas.height = Math.round(this.state.height * scale);
      const context = canvas.getContext('2d');
      if (!context) { URL.revokeObjectURL(source); this.app.msg('Raster export is unavailable in this browser.', true); return; }
      if (type === 'image/jpeg') { context.fillStyle = safeColor(this.state.panelColor, '#252d35'); context.fillRect(0, 0, canvas.width, canvas.height); }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(source);
        if (!blob) { this.app.msg('The browser could not create this export.', true); return; }
        this.downloadBlob(blob, extension);
        this.app.msg(extension.toUpperCase() + ' front-panel export ready (' + scale + '×).');
      }, type, .94);
    };
    image.onerror = () => { URL.revokeObjectURL(source); this.app.msg('Could not render the front panel for export.', true); };
    image.src = source;
  }

  exportJSON() {
    const payload = { format: 'overture-front-panel', version: 1, panel: this.state };
    this.downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }), 'front-panel.json');
    this.app.msg('Editable front-panel JSON exported.');
  }

  importJSON() {
    const picker = make('input', '', document.body);
    picker.type = 'file';
    picker.accept = '.json,application/json';
    picker.hidden = true;
    picker.addEventListener('change', async () => {
      const file = picker.files?.[0];
      if (!file) { picker.remove(); return; }
      if (file.size > 8 * 1024 * 1024) { picker.remove(); this.app.msg('That design file is larger than 8 MB.', true); return; }
      try {
        const parsed = JSON.parse(await file.text());
        const candidate = parsed?.format === 'overture-front-panel' ? parsed.panel : parsed?.frontPanel;
        if (!candidate || !Array.isArray(candidate.components)) throw new Error('This is not an Overture front-panel design file.');
        const validated = validatePatch({ ...clone(this.app.patch), frontPanel: candidate });
        this.app.patch = validated;
        this.app.frontPanelEditor?.setPatch(validated);
        this.app.pushHistory();
        this.app.msg('Front-panel design imported and validated.');
      } catch (error) {
        this.app.msg(error.message || 'Could not import this front-panel design.', true);
      } finally { picker.remove(); }
    }, { once: true });
    picker.click();
  }

  printPDF() {
    const popup = window.open('', '_blank');
    if (!popup) { this.app.msg('Allow pop-ups to print the faceplate or save it as a PDF.', true); return; }
    const markup = this.exportSVGMarkup();
    popup.document.open();
    popup.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Front-panel print sheet</title><style>@page{size:landscape;margin:12mm}*{box-sizing:border-box}html,body{margin:0;background:#fff;font:12px Arial,sans-serif}header{display:flex;justify-content:space-between;align-items:center;margin:0 0 10mm;color:#263646}main{display:grid;place-items:center;width:100%;height:calc(100vh - 36mm)}svg{max-width:100%;max-height:100%;width:auto;height:auto}button{position:fixed;top:12px;right:12px;padding:9px 14px} @media print{button{display:none}main{height:auto}}</style></head><body><header><strong>OVERTURE / OMNI · FRONT PANEL</strong><span>'+this.state.width+' × '+this.state.height+' px</span></header><button onclick="window.print()">Print / Save PDF</button><main>'+markup+'</main></body></html>');
    popup.document.close();
    this.app.msg('Print sheet opened. Choose “Save as PDF” in the print dialog.');
  }

  openPreview() {
    this.previewDialog?.remove();
    const dialog = make('dialog', 'ofp-preview-dialog', this.el);
    this.previewDialog = dialog;
    const header = make('header', 'ofp-preview-dialog__header', dialog);
    const title = make('div', '', header);
    make('span', 'ofp-panel-heading__eyebrow', title, 'FRONT-PANEL PREVIEW');
    make('strong', '', title, this.app.patch.name || 'Untitled instrument');
    const close = make('button', 'ofp-action', header, 'CLOSE');
    close.type = 'button';
    close.addEventListener('click', () => dialog.close());
    const viewport = make('div', 'ofp-preview-dialog__stage', dialog);

    try {
      const template = document.createElement('template');
      template.innerHTML = this.exportSVGMarkup().trim();
      const sourceSvg = template.content.querySelector('svg');
      if (!sourceSvg || sourceSvg.namespaceURI !== 'http://www.w3.org/2000/svg') {
        throw new Error('The exported faceplate did not contain a valid SVG element.');
      }
      const svg = document.importNode(sourceSvg, true);
      svg.setAttribute('class', 'ofp-preview-dialog__artwork');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', 'Front-panel artwork preview');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.style.display = 'block';
      svg.style.width = '100%';
      svg.style.height = 'auto';
      svg.style.maxWidth = '100%';
      svg.style.maxHeight = '72vh';
      viewport.appendChild(svg);
    } catch (error) {
      dialog.remove();
      this.previewDialog = null;
      this.app.msg('Preview could not be generated: ' + (error?.message || 'Invalid front-panel artwork.'), true);
      return;
    }

    dialog.addEventListener('close', () => { dialog.remove(); this.previewDialog = null; }, { once: true });
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    try {
      dialog.showModal();
      close.focus({ preventScroll: true });
    } catch (error) {
      dialog.remove();
      this.previewDialog = null;
      this.app.msg('Preview could not be opened: ' + (error?.message || 'Dialog unavailable.'), true);
    }
  }

    runDesignCheck() {
    const components = this.state.components.filter((item) => !item.hidden);
    const findings = [];
    components.forEach((item) => {
      if (item.x < 0 || item.y < 0 || item.x + item.w > this.state.width || item.y + item.h > this.state.height) findings.push({ level: 'error', message: (item.label || item.type) + ' extends beyond the faceplate.' });
      if (item.w < 58 || item.h < 42) findings.push({ level: 'warning', message: (item.label || item.type) + ' is very small and may be difficult to use.' });
      if (!String(item.label || '').trim()) findings.push({ level: 'warning', message: item.type + ' has no visible label.' });
      const hasValidParameter = item.type === 'drawbars'
        ? Boolean(this.getParameter(item, 'drawbar1'))
        : Boolean(this.getParameter(item));
      if (['knob','dial','encoder','slider','dropdown','switch','meter','drawbars'].includes(item.type) && !hasValidParameter) findings.push({ level: 'warning', message: (item.label || item.type) + ' is not connected to a valid engine parameter.' });
      if (item.type === 'button' && item.action === 'toggle' && (!item.bind?.moduleId || !item.bind?.paramKey)) findings.push({ level: 'warning', message: (item.label || item.type) + ' is set to toggle a parameter but has no valid module binding.' });
    });
    for (let i=0;i<components.length;i++) for(let j=i+1;j<components.length;j++) {
      const a=components[i],b=components[j];
      const overlap=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
      const ratio=overlap/Math.max(1,Math.min(a.w*a.h,b.w*b.h));
      if(ratio>.12) findings.push({level:'warning',message:(a.label||a.type)+' overlaps '+(b.label||b.type)+'.'});
    }
    const errors=findings.filter((item)=>item.level==='error').length;
    const warnings=findings.filter((item)=>item.level==='warning').length;
    const dialog=make('dialog','ofp-check-dialog',this.el);
    const header=make('header','ofp-check-dialog__header',dialog);
    const head=make('div','',header);
    make('span','ofp-panel-heading__eyebrow',head,'FRONT-PANEL VALIDATION');
    make('strong','',head,errors?'Issues found':warnings?'Review suggested':'No layout issues found');
    const close=make('button','ofp-action',header,'CLOSE');close.type='button';close.addEventListener('click',()=>dialog.close());
    const summary=make('div','ofp-check-summary',dialog);
    make('strong','',summary,errors+' errors · '+warnings+' warnings');
    make('span','',summary,components.length+' visible components · '+this.state.width+' × '+this.state.height+' px');
    const list=make('div','ofp-check-list',dialog);
    if(!findings.length) make('p','ofp-check-empty',list,'The current panel fits inside its faceplate and has no detected overlaps. This check does not replace testing the live instrument.');
    findings.forEach((finding)=>{
      const row=make('div','ofp-check-item ofp-check-item--'+finding.level,list);
      make('span','',row,finding.level==='error'?'ERROR':'REVIEW');
      make('p','',row,finding.message);
    });
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});
    dialog.addEventListener('click',(event)=>{if(event.target===dialog)dialog.close();});
    dialog.showModal();
    this.app.msg(errors?'Design check found '+errors+' error(s).':warnings?'Design check complete: '+warnings+' item(s) to review.':'Design check passed.');
  }

  openGuide() {
    const dialog=make('dialog','ofp-guide-dialog',this.el);
    const header=make('header','ofp-check-dialog__header',dialog);
    const title=make('div','',header);
    make('span','ofp-panel-heading__eyebrow',title,'OMNI FRONT-PANEL STUDIO');
    make('strong','',title,'Design workflow');
    const close=make('button','ofp-action',header,'CLOSE');close.type='button';close.addEventListener('click',()=>dialog.close());
    const body=make('div','ofp-guide-content',dialog);
    [
      ['Build','Choose a control from the visual component library or drag it onto the faceplate. Search narrows the library; expand a category to browse its parts.'],
      ['Arrange','Move and resize controls on the canvas. Use the Arrange menu for alignment and distribution, and the layer stack to reorder, hide or lock parts.'],
      ['Style','Select a component and use the Layout, Appearance and Behaviour tabs. Set exact dimensions, materials, colours, labels, surface metrics and engine bindings.'],
      ['Inspect','Use rulers, grid, guides and the measurement tool for placement. Run Design Check to find overlaps, controls outside the faceplate and unbound parameters.'],
      ['Preview & export','Preview the panel at full size, then export vector SVG, 1×/2× raster images, editable JSON, or a print sheet that can be saved as PDF.']
    ].forEach(([heading,copy])=>{const section=make('section','ofp-guide-content__section',body);make('h3','',section,heading);make('p','',section,copy);});
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});
    dialog.showModal();
  }

}
