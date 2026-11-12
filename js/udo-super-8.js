import { WorkletEngine } from './shared/workletEngine.js';
import { PresetStore } from './shared/presetStore.js';
import { performance, power } from './shared/panel.js';
import { registerMidiTargetProvider } from './shared/midiMap.js';
import { createHardwareSurface,addPanel,addRow,addLabel,addKnob,addFader,addButton,addSelect,addDisplay,addKeyboard } from './shared/hardwarePanel.js';
import { SUPER8_PRESETS } from './data/super8Presets.js';
import { consumeCommunityInstrumentPreset, createCommunityShareButton } from './shared/communityPreset.js';

const NOTE_NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTES=Array.from({length:61},(_,i)=>{const n=36+i;return NOTE_NAMES[n%12]+(Math.floor(n/12)-1);});
const clone=o=>JSON.parse(JSON.stringify(o));
const SOURCE_NAMES=['DDS 2','LFO 2','ENV 1','VELOCITY','AFTERTOUCH','EXPRESSION','BENDER','NOTE'];
const DEST_NAMES=['LFO 1 RATE','CROSS MOD','WAVE MOD','OSC MIX','HPF CUTOFF','LPF RESONANCE','ENV 1 DECAY','DELAY TIME'];
const LAYER={
 dds1Wave:'saw',dds1Range:8,altA:0,altB:1,waveMod:0,waveModSource:'Manual',superMode:'off',detune:.16,pwDrift:.1,lfo1PitchAmount:0,env1PitchAmount:0,oscPitchDestination:'1+2',
 dds2Wave:'saw',dds2Range:8,dds2Tune:0,dds2Mode:'normal',crossMod:0,subMode:'sine',dds2WaveMod:.5,
 mix:.5,pan:.5,hpf:.04,cutoff:.72,resonance:.16,drive:'off',keyTrack:'on',filterMod:'env1',filterLfoAmount:0,filterOscAmount:0,
 env1Attack:.08,env1AttackHold:0,env1DecayHold:0,env1Decay:.25,env1Sustain:.6,env1Release:.35,env1Loop:false,env1KeyTrack:0,
 env2Attack:.02,env2DecayHold:0,env2Decay:.32,env2Sustain:.78,env2Release:.3,
 lfo1Rate:.15,lfo1Delay:0,lfo1Wave:'sine',lfo1Mode:'free',lfo1HighFreq:false,lfo1KeyTrack:false,lrPhase:0,
 lfo2Rate:.15,lfo2Delay:0,lfo2Wave:'sine',lfo2Mode:'trig',lfo2RateAmount:1,lfo2Dds:0,lfo2Vcf:0,lfo2Vca:0,benderDds:.5,benderVcf:0,
 chorus:'off',chorusMix:.25,delayTime:.28,delayFeedback:.25,delayMod:.1,delayMix:.25,delaySync:false,delayFreeze:false,
 voiceMode:'poly1',unison:'off',modMatrix:Array(64).fill(0),
 seqEnabled:false,seqLength:16,seqMode:'step',seqSteps:Array(64).fill(null),seqSlides:Array(64).fill(false),seqAccents:Array(64).fill(false),seqGates:Array(64).fill(.75),seqSwing:0,seqBpm:120,
 arpEnabled:false,arpMode:'up',arpDivision:4,arpRange:1,arpSwing:0,arpHold:false,
 portamento:0,transpose:0,bendRange:2,velocity:'off',aftertouch:0
};
const GLOBAL={mode:'single',activeLayer:0,splitPoint:60,binaural:true,mpe:true,volume:.72,distortion:0,benderX:0,benderY:0,expression:1};
function cleanLayer(d={}){const p={...clone(LAYER),...d};p.modMatrix=Array.from({length:64},(_,i)=>Number(d.modMatrix?.[i])||0);p.seqSteps=Array.from({length:64},(_,i)=>d.seqSteps?.[i]??null);p.seqSlides=Array.from({length:64},(_,i)=>!!d.seqSlides?.[i]);p.seqAccents=Array.from({length:64},(_,i)=>!!d.seqAccents?.[i]);p.seqGates=Array.from({length:64},(_,i)=>Math.max(.05,Math.min(1,Number(d.seqGates?.[i]??.75))));return p;}
function validate(d){
 if(!d||typeof d!=='object')throw new Error('Not a Super 8 performance.');
 return {...GLOBAL,...d,layers:[cleanLayer(d.layers?.[0]),cleanLayer(d.layers?.[1])]};
}
const FACTORY=SUPER8_PRESETS.map(x=>({name:x.name,data:validate(x.data)}));
const fmt2=v=>Number(v).toFixed(2);
const WAVES1=['sine','saw','square','triangle','whiteNoise','altA','altB'],WAVES2=['sine','saw','square','triangle','whiteNoise','pulse'];
const LFO_SHAPES=['sine','triangle','saw','reverseSaw','square','sampleHold','noise'];

class Super8App{
 constructor(){
  this.engine=new WorkletEngine(new URL('./engine/Super8Processor.js',import.meta.url).href,'super8-processor');
  // Bind the overlay before building the large hardware UI. This way a UI
  // construction exception cannot leave the Super 8 power screen inert.
  this.patch=validate({});
  // Queue a playable factory state before building the extensive hardware
  // surface; the overlay remains useful even if a visual module fails.
  this.engine.post({t:'patch',patch:this.patch});
  this.activateAudio=power('super8-power',()=>this.engine.start(),()=>{
   this.engine.post({t:'patch',patch:this.patch});
   this.hwPower?.setValue(true,true);
   this.perf?.flushPending();
   this.hwDisplay?.set('SUPER 8 READY','TWO FPGA-STYLE DDS CORES · STEREO OUTPUT');
  },error=>{
   this.hwPower?.setValue(false,true);
   this.hwDisplay?.set('AUDIO START FAILED',String(error?.message||error||'Unknown audio error').slice(0,58));
  });
  this.engine.onProcessorError=error=>this.hwDisplay?.set('AUDIO PROCESSOR ERROR',String(error?.message||error).slice(0,58));this.store=new PresetStore({key:'overture.udo-super-8.performances',version:1,validate});
  this.layerStores=[0,1].map(i=>new PresetStore({key:'overture.udo-super-8.layer.'+i,version:1,validate:cleanLayer}));
  this.active=0;this.seqPage=0;
  this.buildHardwarePanel();
  this.display=this.hwDisplay;
  this.display.flash=message=>this.hwDisplay.set(String(message).toUpperCase(),'UDO AUDIO · SUPER 8');
  this.midi=this.hw.midi;
  this.presets={load:id=>this.loadPerformance(id)};
  // Computer-keyboard and external MIDI input; the visible 61-key bed is the hardware surface.
  this.midiHost=document.createElement('div');
  this.midiHost.setAttribute('aria-hidden','true');
  this.midiHost.style.cssText='position:fixed;left:-10000px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
  document.body.appendChild(this.midiHost);
  this.shell=this.midiHost;
  this.buildKeyboard();
  this.presets.load('f:0');
  const community=consumeCommunityInstrumentPreset('udo-super-8',validate);
  if(community){this.patch=community.data;this.active=this.patch.activeLayer?1:0;this.refresh();this.displayHardwarePreset(community.title);this.refreshHardwarePresetList('f:0');}
 }
 loadPerformance(id){
  let item=null,key=String(id||'f:0');
  if(key.startsWith('f:'))item=FACTORY[Number(key.slice(2))];
  else if(key.startsWith('u:'))item=this.store.get(key.slice(2));
  if(!item)return;
  const name=item.name||'Untitled Performance';
  this.patch=validate(clone(item.data));
  this.active=this.patch.activeLayer?1:0;
  this.refresh();
  this.displayHardwarePreset(name);this.refreshHardwarePresetList(key);
 }
 p(){return this.patch.layers[this.active];}
 set(key,value){this.p()[key]=value;this.engine.post({t:'param',layer:this.active,key,value});}
 setGlobal(key,value){this.patch[key]=value;this.engine.post({t:'param',key,value});}
 postPatch(){this.engine.post({t:'patch',patch:this.patch});}
 refresh(){this.postPatch();this.syncHardware();}
 selectLayer(index){this.active=index?1:0;this.patch.activeLayer=this.active;this.engine.post({t:'param',key:'activeLayer',value:this.active});this.syncHardware();}
 toggleSeqStep(i){
  const p=this.p(),step=this.seqPage*16+i,mode=p.seqMode,v=p.seqSteps[step];
  if(mode==='slide'){if(v===null||v===undefined)p.seqSteps[step]=48+i;p.seqSlides[step]=!p.seqSlides[step];}
  else if(mode==='accent'){if(v===null||v===undefined)p.seqSteps[step]=48+i;p.seqAccents[step]=!p.seqAccents[step];}
  else if(mode==='rest'){p.seqSteps[step]=null;p.seqSlides[step]=false;p.seqAccents[step]=false;}
  else if(mode==='length'){const lengths=[.25,.375,.5,.625,.75,.875,1],current=Number(p.seqGates[step]??.75);p.seqGates[step]=lengths[(Math.max(0,lengths.indexOf(current))+1)%lengths.length];}
  else if(v===null||v===undefined)p.seqSteps[step]=48+i;
  else{p.seqSteps[step]=null;p.seqSlides[step]=false;p.seqAccents[step]=false;}
  ['seqSteps','seqSlides','seqAccents','seqGates'].forEach(key=>this.engine.post({t:'param',layer:this.active,key,value:p[key]}));
  this.renderSeq();
 }
 renderSeq(){
  const p=this.p(),offset=this.seqPage*16;
  this.hwSeqButtons?.forEach((control,i)=>{
   const step=offset+i,button=control.el,active=p.seqSteps[step]!==null&&p.seqSteps[step]!==undefined;
   control.setValue(active,true);button.classList.toggle('is-slide',!!p.seqSlides[step]);button.classList.toggle('is-accent',!!p.seqAccents[step]);
   button.title='Step '+(step+1)+' · '+(active?'note '+p.seqSteps[step]:'rest')+(p.seqSlides[step]?' · slide':'')+(p.seqAccents[step]?' · accent':'')+' · gate '+Math.round(p.seqGates[step]*100)+'%';
  });
  this.hwSeqPageButtons?.forEach((c,j)=>c.setValue(j===this.seqPage,true));
 }
 buildKeyboard(){
  this.perf=performance(this.shell,{notes:NOTES,octaves:5,startOctave:1,wheels:false,started:()=>this.engine.started,midiStatusEl:this.midi,handlers:{
   noteOn:(n,v,source,channel)=>{this.hwKeyboard?.setActive(n,true);this.engine.post({t:'noteOn',note:n,vel:v,channel,source});},noteOff:(n,source,channel)=>{this.hwKeyboard?.setActive(n,false);this.engine.post({t:'noteOff',note:n,channel,source});},
   bend:(v,channel)=>this.engine.post({t:'bend',value:v,channel}),mod:v=>this.engine.setModWheel(v),aftertouch:(v,channel)=>this.engine.post({t:'at',value:v,channel}),expression:(v,channel)=>this.engine.post({t:'expression',value:v,channel}),
   polyAftertouch:(n,v,channel)=>this.engine.post({t:'polyAt',note:n,value:v,channel}),sustain:d=>this.engine.setSustain(d),allOff:()=>this.engine.allNotesOff(),
   program:p=>this.presets.load('f:'+p%FACTORY.length),clock:()=>this.engine.post({t:'clock'}),start:()=>this.engine.post({t:'transport',layer:this.active,play:true}),continue:()=>this.engine.post({t:'transport',layer:this.active,play:true}),stop:()=>this.engine.post({t:'transport',layer:this.active,play:false}),cc:(cc,v,channel)=>{if(cc===7){this.setGlobal('volume',v/127);this.syncHardware();}if(cc===11)this.engine.post({t:'expression',value:v/127,channel});if(cc===74)this.engine.post({t:'mpeSlide',value:v/127,channel});}
  }});
 }

 buildHardwarePanel(){
  const root=document.getElementById('super8-root');
  const hw=createHardwareSurface(root,{id:'udo-super-8',skin:'super8',programLabel:'SUPER 8 · INITIAL PERFORMANCE'});
  this.hw=hw;const p=hw.instrument;
  this.hwControls={knobs:[],faders:[],buttons:[],selects:[],all:[]};
  this.hwKnobs=[];this.hwFaders=[];this.hwButtons=[];this.hwSelects=[];
  const owner=global=>global?this.patch:this.p();
  const remember=(type,key,control,global)=>{this.hwControls[type].push({key,control,global});this.hwControls.all.push(control);return control;};
  const k=(parent,key,label,o={})=>remember('knobs',key,addKnob(parent,{label,min:o.min??0,max:o.max??1,value:owner(o.global)[key],step:o.step,size:o.size||46,small:o.small,bipolar:o.bipolar,midiId:'SUPER8:'+(o.global?'G:':'')+key,group:o.group||'SYNTHESIS',formatValue:o.fmt||(o.max>10?(v=>Number(v).toFixed(1)):o.max>5?(v=>String(Math.round(v))):fmt2),onChange:v=>o.global?this.setGlobal(key,v):this.set(key,v)}),o.global);
  const f=(parent,key,label,o={})=>remember('faders',key,addFader(parent,{label,value:this.p()[key],height:o.height||84,midiId:'SUPER8:'+key,group:o.group||'SYNTHESIS',onChange:v=>this.set(key,v)}));
  const b=(parent,key,label,o={})=>remember('buttons',key,addButton(parent,{label,value:!!owner(o.global)[key],led:o.led||'red',midiId:'SUPER8:'+(o.global?'G:':'')+key,group:o.group||'SYNTHESIS',onChange:v=>o.global?this.setGlobal(key,v):this.set(key,v)}),o.global);
  const s=(parent,key,label,options,o={})=>remember('selects',key,addSelect(parent,{label,options,value:owner(o.global)[key],optionLabels:o.labels,wide:o.wide,midiId:'SUPER8:'+(o.global?'G:':'')+key,group:o.group||'SYNTHESIS',onChange:v=>{o.global?this.setGlobal(key,v):this.set(key,v);if(o.after)o.after(v);}}),o.global);

  // ---- top strip ----
  const top=addRow(p,'s8-top');
  const brand=document.createElement('div');brand.className='s8-brand';top.appendChild(brand);
  const logo=document.createElement('img');logo.src='/ui/Logos/UDO_logo.png';logo.alt='UDO Audio';logo.draggable=false;brand.appendChild(logo);
  const model=document.createElement('div');model.className='s8-model';model.innerHTML='<strong>SUPER 8</strong><span>16-voice binaural analogue-hybrid synthesizer</span>';brand.appendChild(model);
  this.hwDisplay=addDisplay(top,{brand:'PERFORMANCE / PROGRAM'});this.hwDisplay.set('P 001','OVERTURE PERFORMANCE');
  const master=addRow(top,'s8-master');
  k(master,'volume','Master',{global:true,size:50,group:'MASTER'});k(master,'distortion','Distortion',{global:true,size:42,group:'MASTER'});
  this.hwPower=addButton(master,{label:'POWER',value:false,toggle:false,led:'green',group:'GLOBAL',onChange:async()=>{const ready=await this.activateAudio?.();this.hwPower?.setValue(!!ready,true);}});

  // ---- parts, voice mode ----
  const part=addPanel(p,{title:'Parts and voices',sub:'upper and lower layer · binaural allocation',className:'s8-part'});
  const pr=addRow(part.body,'s8-part-row');
  const upper=addButton(pr,{label:'UPPER',value:this.active===0,led:'red',group:'LAYER',onChange:()=>this.selectLayer(0)});
  const lower=addButton(pr,{label:'LOWER',value:this.active===1,led:'red',group:'LAYER',onChange:()=>this.selectLayer(1)});
  this.layerButtonsHardware=[upper,lower];this.hwControls.all.push(upper,lower);
  s(pr,'mode','Voice mode',['single','dual','split'],{global:true,group:'GLOBAL'});
  b(pr,'binaural','Binaural',{global:true,group:'GLOBAL',led:'amber'});b(pr,'mpe','MPE',{global:true,group:'GLOBAL',led:'amber'});
  s(pr,'splitPoint','Split point',Array.from({length:49},(_,i)=>48+i),{global:true,group:'GLOBAL',labels:Array.from({length:49},(_,i)=>NOTE_NAMES[(48+i)%12]+(Math.floor((48+i)/12)-1))});
  s(pr,'voiceMode','Voice assign',['solo','legato','poly1','poly2'],{group:'PERFORMANCE'});s(pr,'unison','Unison',['off','half','all','octave','fifth'],{group:'PERFORMANCE'});
  k(pr,'portamento','Portamento',{size:40,group:'PERFORMANCE'});k(pr,'transpose','Transpose',{min:-24,max:24,step:1,size:40,bipolar:true,group:'PERFORMANCE',fmt:v=>(v>0?'+':'')+Math.round(v)});k(pr,'bendRange','Bend range',{min:1,max:12,step:1,size:40,group:'PERFORMANCE',fmt:v=>String(Math.round(v))});

  // ---- oscillators ----
  const osc=addRow(p,'hp-main s8-osc');
  const d1=addPanel(osc,{title:'DDS 1',sub:'oscillator · super wave',className:'s8-dds1'});
  s(d1.body,'dds1Wave','Waveform',WAVES1,{group:'DDS 1',wide:true});s(d1.body,'dds1Range','Range',[64,32,16,8,4,2],{group:'DDS 1'});
  s(d1.body,'altA','Wave A',Array.from({length:64},(_,i)=>i),{group:'DDS 1',labels:Array.from({length:64},(_,i)=>String(i+1).padStart(2,'0'))});s(d1.body,'altB','Wave B',Array.from({length:64},(_,i)=>i),{group:'DDS 1',labels:Array.from({length:64},(_,i)=>String(i+1).padStart(2,'0'))});
  s(d1.body,'superMode','Super',['off','half','on'],{group:'DDS 1'});k(d1.body,'detune','Detune',{group:'DDS 1'});k(d1.body,'pwDrift','PW drift',{group:'DDS 1'});
  const d2=addPanel(osc,{title:'DDS 2',sub:'second oscillator · modes',className:'s8-dds2'});
  s(d2.body,'dds2Wave','Waveform',WAVES2,{group:'DDS 2',wide:true});s(d2.body,'dds2Range','Range',[32,16,8,4,2,'LFO'],{group:'DDS 2'});
  s(d2.body,'dds2Mode','Mode',['normal','sync','ring','sub'],{group:'DDS 2'});s(d2.body,'subMode','Sub wave',['sine','square'],{group:'DDS 2'});
  k(d2.body,'dds2Tune','Fine tune',{min:-7,max:7,step:.01,bipolar:true,group:'DDS 2',fmt:v=>Number(v).toFixed(1)});k(d2.body,'crossMod','Cross mod',{group:'DDS 2'});k(d2.body,'dds2WaveMod','PWM',{group:'DDS 2'});
  const dm=addPanel(osc,{title:'DDS modulator',sub:'LFO 1 · ENV 1 · wave morph',className:'s8-ddsmod'});
  f(dm.body,'lfo1PitchAmount','LFO 1',{group:'DDS MODULATOR'});f(dm.body,'env1PitchAmount','ENV 1',{group:'DDS MODULATOR'});
  s(dm.body,'oscPitchDestination','Pitch dest',['DDS 1','1+2','DDS 2'],{group:'DDS MODULATOR'});s(dm.body,'waveModSource','Wave source',['Manual','LFO 1','ENV 1'],{group:'DDS MODULATOR'});
  k(dm.body,'waveMod','Wave / PWM',{group:'DDS MODULATOR'});
  const mx=addPanel(osc,{title:'Mixer',sub:'DDS 1 ↔ DDS 2 · layer pan',className:'s8-mixer'});
  k(mx.body,'mix','DDS 1 ↔ 2',{size:58,group:'MIXER'});k(mx.body,'pan','Layer pan',{size:46,bipolar:true,group:'MIXER'});

  // ---- filter, envelopes, effects ----
  const mid=addRow(p,'hp-main s8-mid');
  const vcf=addPanel(mid,{title:'VCF',sub:'analogue HPF · four-pole LPF',className:'s8-vcf'});
  const vf=addRow(vcf.body,'hp-row-tight');
  f(vf,'hpf','HPF',{group:'VCF',height:96});f(vf,'cutoff','LPF',{group:'VCF',height:96});f(vf,'resonance','Res',{group:'VCF',height:96});f(vf,'filterLfoAmount','LFO 1',{group:'VCF',height:96});f(vf,'filterOscAmount','DDS 2',{group:'VCF',height:96});
  const vs=addRow(vcf.body,'s8-selects');
  s(vs,'drive','Drive',['off','1','2'],{group:'VCF'});s(vs,'keyTrack','Key track',['off','half','on'],{group:'VCF'});s(vs,'filterMod','Env source',['env1','both','env2'],{group:'VCF'});s(vs,'velocity','Velocity (VCA)',['off','half','on'],{group:'VCA'});
  const envp=addPanel(mid,{title:'Envelopes',sub:'ENV 1 modulation · ENV 2 amplifier',className:'s8-env'});
  const e1=document.createElement('div');e1.className='p3-col s8-env-col';envp.body.appendChild(e1);addLabel(e1,'ENV 1');
  const e1f=addRow(e1,'hp-row-tight');[['env1Attack','A'],['env1Decay','D'],['env1Sustain','S'],['env1Release','R']].forEach(([key,l])=>f(e1f,key,l,{group:'ENVELOPE 1',height:80}));
  const e1k=addRow(e1,'hp-row-tight');k(e1k,'env1AttackHold','A hold',{small:true,size:34,group:'ENVELOPE 1'});k(e1k,'env1DecayHold','D hold',{small:true,size:34,group:'ENVELOPE 1'});b(e1k,'env1Loop','Loop',{group:'ENVELOPE 1'});
  const e2=document.createElement('div');e2.className='p3-col s8-env-col';envp.body.appendChild(e2);addLabel(e2,'ENV 2');
  const e2f=addRow(e2,'hp-row-tight');[['env2Attack','A'],['env2Decay','D'],['env2Sustain','S'],['env2Release','R']].forEach(([key,l])=>f(e2f,key,l,{group:'ENVELOPE 2',height:80}));
  const e2k=addRow(e2,'hp-row-tight');k(e2k,'env2DecayHold','D hold',{small:true,size:34,group:'ENVELOPE 2'});
  const fxp=addPanel(mid,{title:'Effects',sub:'chorus · stereo delay',className:'s8-fx'});
  s(fxp.body,'chorus','Chorus',['off','I','II','both'],{group:'EFFECTS'});k(fxp.body,'chorusMix','Chorus mix',{size:42,group:'EFFECTS'});
  addRow(fxp.body,'p3-break');
  k(fxp.body,'delayTime','Delay time',{size:42,group:'EFFECTS'});k(fxp.body,'delayFeedback','Feedback',{size:42,group:'EFFECTS'});k(fxp.body,'delayMod','Modulation',{size:42,group:'EFFECTS'});k(fxp.body,'delayMix','Delay mix',{size:42,group:'EFFECTS'});
  b(fxp.body,'delaySync','Tempo sync',{group:'EFFECTS',led:'amber'});b(fxp.body,'delayFreeze','Freeze',{group:'EFFECTS',led:'amber'});

  // ---- modulation: LFOs and bender ----
  const mod=addRow(p,'hp-main s8-mod');
  const l1=addPanel(mod,{title:'LFO 1',sub:'rate · delay · L/R phase',className:'s8-lfo1'});
  s(l1.body,'lfo1Wave','Waveform',LFO_SHAPES,{group:'LFO 1',wide:true});s(l1.body,'lfo1Mode','Mode',['free','once','reset'],{group:'LFO 1'});
  k(l1.body,'lfo1Rate','Rate',{group:'LFO 1'});k(l1.body,'lfo1Delay','Delay',{group:'LFO 1'});k(l1.body,'lrPhase','L/R phase',{group:'LFO 1'});
  b(l1.body,'lfo1HighFreq','High freq',{group:'LFO 1',led:'amber'});b(l1.body,'lfo1KeyTrack','Key track',{group:'LFO 1',led:'amber'});
  const l2=addPanel(mod,{title:'LFO 2 and bender',sub:'modulation · two-axis control',className:'s8-lfo2'});
  s(l2.body,'lfo2Wave','Waveform',LFO_SHAPES,{group:'LFO 2',wide:true});s(l2.body,'lfo2Mode','Trigger',['trig','atTrig','onAtBend'],{group:'LFO 2',labels:['Always','Pressure','On bend']});
  k(l2.body,'lfo2Rate','Rate',{group:'LFO 2'});k(l2.body,'lfo2Delay','Delay',{group:'LFO 2'});
  addRow(l2.body,'p3-break');
  [['lfo2RateAmount','Rate mod'],['lfo2Dds','To DDS'],['lfo2Vcf','To VCF'],['lfo2Vca','To VCA'],['benderDds','Bend pitch'],['benderVcf','Bend VCF']].forEach(([key,l])=>f(l2.body,key,l,{group:'LFO 2',height:56}));

  // ---- sequencer and arpeggiator ----
  const seqp=addPanel(p,{title:'Sequencer and arpeggiator',sub:'64 steps per part · four pages of 16',className:'s8-seq'});
  const st=addRow(seqp.body,'s8-seq-top');
  this.hwSeqPageButtons=[];const pages=document.createElement('div');pages.className='s8-pages';st.appendChild(pages);
  ['1–16','17–32','33–48','49–64'].forEach((label,i)=>{const c=addButton(pages,{label,value:i===0,led:'amber',group:'SEQUENCER',onChange:()=>{this.seqPage=i;this.renderSeq();}});c.el.addEventListener('click',()=>{this.seqPage=i;this.renderSeq();});this.hwSeqPageButtons.push(c);});
  s(st,'seqLength','Length',Array.from({length:64},(_,i)=>i+1),{group:'SEQUENCER'});s(st,'seqMode','Step mode',['step','slide','accent','rest','length'],{group:'SEQUENCER'});
  k(st,'seqBpm','Tempo',{min:40,max:240,step:1,size:42,group:'SEQUENCER',fmt:v=>String(Math.round(v))});k(st,'seqSwing','Swing',{size:42,group:'SEQUENCER'});
  const play=b(st,'seqEnabled','Play',{group:'SEQUENCER',led:'green'});play.el.addEventListener('click',()=>this.engine.post({t:'transport',layer:this.active,play:!!this.p().seqEnabled}));
  const sd=document.createElement('div');sd.className='s8-divider';st.appendChild(sd);
  b(st,'arpEnabled','Arp on',{group:'ARPEGGIATOR',led:'green'});b(st,'arpHold','Hold',{group:'ARPEGGIATOR'});
  s(st,'arpMode','Arp mode',['up','down','upDown','random','assign'],{group:'ARPEGGIATOR'});s(st,'arpDivision','Arp clock',[1,2,4,8,16],{group:'ARPEGGIATOR'});
  k(st,'arpRange','Octaves',{min:1,max:4,step:1,size:42,group:'ARPEGGIATOR',fmt:v=>String(Math.round(v))});k(st,'arpSwing','Arp swing',{size:42,group:'ARPEGGIATOR'});
  const steps=document.createElement('div');steps.className='s8-steps';seqp.body.appendChild(steps);this.hwSeqButtons=[];
  for(let i=0;i<16;i++){const c=addButton(steps,{label:String(i+1),value:false,led:'red',group:'SEQUENCER',midiId:'SUPER8:SEQ:STEP:'+i,onChange:()=>this.toggleSeqStep(i)});this.hwSeqButtons.push(c);this.hwControls.all.push(c);}

  // ---- performance and keybed ----
  const playRow=addRow(p,'hp-play');
  const left=document.createElement('div');left.className='hp-wheels s8-bender-block';playRow.appendChild(left);
  const pad=document.createElement('div');pad.className='hp-super8-bender-pad';pad.tabIndex=0;pad.setAttribute('role','group');pad.setAttribute('aria-label','Bender X pitch, Y pressure');
  const padCross=document.createElement('i');padCross.className='hp-super8-bender-cross';const padDot=document.createElement('i');padDot.className='hp-super8-bender-dot';pad.append(padCross,padDot);
  const padCaption=document.createElement('span');padCaption.className='hp-super8-bender-caption';padCaption.textContent='PITCH  ←  X  →    ·    PRESSURE  Y';
  left.append(pad,padCaption);
  const renderBender=()=>{padDot.style.left=((this.patch.benderX+1)*50)+'%';padDot.style.top=((1-this.patch.benderY)*100)+'%';pad.setAttribute('aria-label','Bender pitch '+this.patch.benderX.toFixed(2)+', pressure '+this.patch.benderY.toFixed(2));};
  const post=()=>this.engine.post({t:'bendAxis',x:this.patch.benderX,y:this.patch.benderY});
  const updateBender=e=>{const rect=pad.getBoundingClientRect();this.patch.benderX=Math.max(-1,Math.min(1,((e.clientX-rect.left)/(rect.width||1))*2-1));this.patch.benderY=Math.max(0,Math.min(1,1-((e.clientY-rect.top)/(rect.height||1))));renderBender();post();};
  let benderPointer=null;
  pad.addEventListener('pointerdown',e=>{benderPointer=e.pointerId;pad.setPointerCapture?.(e.pointerId);updateBender(e);e.preventDefault();});
  pad.addEventListener('pointermove',e=>{if(e.pointerId===benderPointer)updateBender(e);});
  const finishBender=e=>{if(e.pointerId!==benderPointer)return;benderPointer=null;this.patch.benderX=0;this.patch.benderY=0;renderBender();post();};pad.addEventListener('pointerup',finishBender);pad.addEventListener('pointercancel',finishBender);
  pad.addEventListener('keydown',e=>{const step=e.shiftKey?.2:.05;if(e.key==='ArrowLeft')this.patch.benderX-=step;else if(e.key==='ArrowRight')this.patch.benderX+=step;else if(e.key==='ArrowUp')this.patch.benderY+=step;else if(e.key==='ArrowDown')this.patch.benderY-=step;else return;this.patch.benderX=Math.max(-1,Math.min(1,this.patch.benderX));this.patch.benderY=Math.max(0,Math.min(1,this.patch.benderY));renderBender();post();e.preventDefault();});
  this.renderHardwareBender=renderBender;renderBender();
  this.hwKeyboard=addKeyboard(playRow,{firstNote:36,count:61,keyColor:'amber',onNoteOn:(n,v)=>this.perf.noteOn(n,v,'ui'),onNoteOff:n=>this.perf.noteOff(n,'ui'),onAftertouch:(n,v)=>this.engine.post({t:'polyAt',note:n,value:v,channel:1})});

  // ---- memory and tools ----
  const footer=document.createElement('div');footer.className='hp-footer hp-super8-hardware-footer';p.appendChild(footer);
  this.hwPresets=document.createElement('select');this.hwPresets.setAttribute('aria-label','Performance');footer.appendChild(this.hwPresets);
  this.hwPresets.addEventListener('change',()=>this.presets.load(this.hwPresets.value));
  const action=(label,fn)=>{const a=document.createElement('button');a.type='button';a.className='hp-action';a.textContent=label;a.addEventListener('click',fn);footer.appendChild(a);return a;};
  action('Save performance',()=>{const name=prompt('Name this performance','My Super 8 Performance');if(name===null)return;try{const item=this.store.save(name,clone(this.patch));this.refreshHardwarePresetList('u:'+item.id);this.displayHardwarePreset(item.name);}catch(e){alert(e.message);}});
  createCommunityShareButton(footer,{instrumentId:'udo-super-8',className:'hp-action',getData:()=>validate(clone(this.patch)),getTitle:()=> 'UDO Super 8 performance'});
  action('Save layer',()=>{const name=prompt('Name this layer patch','My Layer Patch');if(name===null)return;try{const item=this.layerStores[this.active].save(name,clone(this.p()));this.refreshHardwareLayerList(item.id);}catch(e){alert(e.message);}});
  this.hwLayerPresets=document.createElement('select');this.hwLayerPresets.setAttribute('aria-label','Layer patch');footer.appendChild(this.hwLayerPresets);
  this.hwLayerPresets.addEventListener('change',()=>{const item=this.layerStores[this.active].get(this.hwLayerPresets.value);if(item){this.patch.layers[this.active]=cleanLayer(item.data);this.refresh();}});
  action('Mod matrix',()=>{this.renderHardwareMatrix();this.matrixDialog.showModal();});
  const waveLabel=document.createElement('label');waveLabel.className='hp-action hp-super8-wave-import';waveLabel.textContent='Load waves';
  const waveInput=document.createElement('input');waveInput.type='file';waveInput.multiple=true;waveInput.accept='.wav,audio/wav';waveLabel.appendChild(waveInput);footer.appendChild(waveLabel);
  waveInput.addEventListener('change',async()=>{try{if(!this.engine.ctx)throw new Error('Power on audio first.');const waves=[];for(const file of [...(waveInput.files||[])].slice(0,64)){const decoded=await this.engine.ctx.decodeAudioData(await file.arrayBuffer());const data=decoded.getChannelData(0);if(data.length<64||data.length>65536)throw new Error(file.name+' is not a supported single-cycle file.');waves.push(Array.from(data));}if(waves.length)this.engine.post({t:'waves',layer:this.active,waves});this.display.flash(waves.length+' waves loaded');}catch(error){this.display.flash('Wave import failed');alert(error.message);}});
  this.refreshHardwarePresetList=(selected='f:0')=>{this.hwPresets.replaceChildren();FACTORY.forEach((item,i)=>{const o=document.createElement('option');o.value='f:'+i;o.textContent=String(i+1).padStart(2,'0')+' · '+item.name;this.hwPresets.appendChild(o);});this.store.items.forEach(item=>{const o=document.createElement('option');o.value='u:'+item.id;o.textContent='User · '+item.name;this.hwPresets.appendChild(o);});this.hwPresets.value=selected;};
  this.refreshHardwareLayerList=selected=>{this.hwLayerPresets.replaceChildren();const first=document.createElement('option');first.value='';first.textContent='Layer patches…';this.hwLayerPresets.appendChild(first);this.layerStores[this.active].items.forEach(item=>{const o=document.createElement('option');o.value=item.id;o.textContent='Layer · '+item.name;this.hwLayerPresets.appendChild(o);});this.hwLayerPresets.value=selected||'';};
  this.displayHardwarePreset=name=>{this.hwDisplay.set(name.toUpperCase(),'SUPER 8 · PERFORMANCE');hw.program.textContent='SUPER 8 · '+name;};

  // ---- modulation matrix dialog ----
  this.matrixDialog=document.createElement('dialog');this.matrixDialog.className='hp-dialog hp-super8-matrix-dialog';
  this.matrixDialog.innerHTML='<form method="dialog"><header><strong>8 × 8 MODULATION MATRIX</strong><button aria-label="Close">×</button></header><p>Rows are sources, columns are destinations. Click a cell to cycle positive depth, negative depth and off.</p><div class="hp-super8-matrix-grid"></div></form>';
  const hardwareGrid=this.matrixDialog.querySelector('.hp-super8-matrix-grid');
  hardwareGrid.appendChild(document.createElement('span'));
  DEST_NAMES.forEach(label=>{const h=document.createElement('span');h.textContent=label;h.className='hp-super8-matrix-head';hardwareGrid.appendChild(h);});
  this.hwMatrixCells=[];
  SOURCE_NAMES.forEach((source,sIdx)=>{
   const label=document.createElement('strong');label.textContent=source;label.className='hp-super8-matrix-source';hardwareGrid.appendChild(label);
   for(let d=0;d<8;d++){
    const i=sIdx*8+d,cell=document.createElement('button');cell.type='button';cell.title=source+' → '+DEST_NAMES[d];
    cell.addEventListener('click',()=>{const old=this.p().modMatrix[i]||0;this.p().modMatrix[i]=old===0?.6:old>0?-.6:0;this.renderHardwareMatrix();this.engine.post({t:'param',layer:this.active,key:'modMatrix',value:this.p().modMatrix});});
    this.hwMatrixCells.push({button:cell,index:i});hardwareGrid.appendChild(cell);
   }
  });
  document.body.appendChild(this.matrixDialog);
  this.renderHardwareMatrix=()=>this.hwMatrixCells.forEach(({button,index})=>{const v=this.p().modMatrix[index]||0;button.dataset.value=String(v);button.textContent=v>0?'+':v<0?'−':'·';button.setAttribute('aria-label',button.title+' · '+(v>0?'positive depth':v<0?'negative depth':'off'));});

  this.syncHardware=()=>{
   this.hwControls.knobs.forEach(({key,control,global})=>control.setValue(global?this.patch[key]:this.p()[key],true));
   this.hwControls.faders.forEach(({key,control})=>control.setValue(this.p()[key],true));
   this.hwControls.buttons.forEach(({key,control,global})=>{const o=global?this.patch:this.p();if(key in o)control.setValue(o[key],true);});
   this.hwControls.selects.forEach(({key,control,global})=>{const o=global?this.patch:this.p();if(key in o)control.setValue(o[key]);});
   this.renderHardwareBender();
   this.layerButtonsHardware.forEach((c,i)=>c.setValue(i===this.active,true));
   this.refreshHardwareLayerList();this.renderSeq();this.renderHardwareMatrix();
  };
  this.hwControls.all.push({el:pad,_oiMidi:{id:'SUPER8:G:benderX',label:'Bender X · Pitch',group:'PERFORMANCE',get:()=>((this.patch.benderX+1)/2),set:v=>{this.patch.benderX=v*2-1;renderBender();post();}}});
  this.hwControls.all.push({el:pad,_oiMidi:{id:'SUPER8:G:benderY',label:'Bender Y · Modulation',group:'PERFORMANCE',get:()=>this.patch.benderY,set:v=>{this.patch.benderY=Math.max(0,Math.min(1,v));renderBender();post();}}});
  this.refreshHardwarePresetList('f:0');this.syncHardware();
  if(!this._hardwareMidiCleanup)this._hardwareMidiCleanup=registerMidiTargetProvider(()=>this.hwControls.all.map(control=>{const m=control.el?._oiMidi||control._oiMidi;if(!m)return null;return {id:m.id,label:m.label,group:m.group||'SUPER 8',get:m.get,set:m.set,el:control.el||null};}).filter(Boolean));
 }
}
new Super8App();
