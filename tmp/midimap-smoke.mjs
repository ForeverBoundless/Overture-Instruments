import '../harness-setup.mjs';
const { MidiManager } = await import('../js/engine/MidiManager.js');
const { MidiMap, registerMidiTarget } = await import('../js/shared/midiMap.js');
class T extends MidiMap { _buildPane(){ this.pane={contains:()=>false}; } open(){} _renderList(){} _renderCount(){} _renderLearn(){} _pulse(){} _pulseRow(){} }
let value = 0.25;
const el = { _oiMidi:null, setAttribute(){}, hasAttribute(){return true;}, toggleAttribute(){}, getAttribute(){return 'CUTOFF';}, isConnected:true };
registerMidiTarget(el, { id:'test::cutoff', label:'CUTOFF', group:'FILTER', get:()=>value, set:(t)=>{ value=t; } });
document.querySelectorAll = (sel) => sel === '[role="slider"]' ? [el] : [];
const map = new T();
let instrumentCC = 0;
const mm = new MidiManager({ onControlChange: () => { instrumentCC++; } });
const send = (cc, v) => mm._handleMessage({ data:[0xb0, cc, v], target:{ name:'TestCtl' } });
send(74, 10); // unassigned -> instrument sees it, detected recorded
console.assert(instrumentCC === 1, 'instrument should receive unassigned CC');
console.assert(map.state.detected.TestCtl.length === 1, 'detected');
map._startLearn();
send(74, 20);
console.assert(map.learn.step === 'target' && map.learn.source.cc === 74, 'learned source');
map.learn.targetId = 'test::cutoff';
map._commit({ source: map.learn.source, targetId: map.learn.targetId, invert: false }); map._cancelLearn();
send(74, 127);
console.assert(Math.abs(value - 1) < 1e-9, 'assigned CC drives target, got ' + value);
console.assert(instrumentCC === 1, 'assigned CC consumed (instrument should not see it) ' + instrumentCC);
send(75, 5); send(76, 5);
console.assert(map.detectedCount === 3, 'detected count 3 got '+map.detectedCount);
// invert + relearn to CC 75 replaces by source uniqueness
map._commit({ id: map.state.assignments[0].id, source:{device:'TestCtl',channel:1,cc:75}, targetId:'test::cutoff', invert:true });
send(75, 127); console.assert(Math.abs(value) < 1e-9, 'inverted');
console.assert(map.state.assignments.length === 1, 'single assignment');
console.assert(JSON.parse(localStorage.getItem(map.key)).assignments.length === 1, 'persisted');
map._delete(map.state.assignments[0].id); console.assert(map.state.assignments.length === 0, 'deleted');
console.log('midiMap smoke OK');
