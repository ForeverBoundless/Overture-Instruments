/* Shared hardware-surface kit for the Pro 3 and Super 8 panels.
   Flow layout: controls are DOM children of panel groups (CSS grid/flex), never
   absolutely positioned, so nothing can overlap and the chassis reflows on narrow screens. */
const SVG='http://www.w3.org/2000/svg';
let controlId=0;
export const KEY_TO_SEMI={a:0,w:1,s:2,e:3,d:4,f:5,t:6,g:7,y:8,h:9,u:10,j:11,k:12,o:13,l:14,p:15,';':16,"'":17};
export const midiFromKeyName=name=>{const m=/^([A-G]#?)(-?\d+)$/.exec(name);const names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];return m?(Number(m[2])+1)*12+names.indexOf(m[1]):-1;};
export const noteName=n=>{const names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];return names[n%12]+(Math.floor(n/12)-1);};
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,Number(v)||0));
function node(tag,cls,parent,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;if(parent)parent.appendChild(n);return n;}
function svg(tag,attrs,parent){const n=document.createElementNS(SVG,tag);Object.entries(attrs||{}).forEach(([k,v])=>n.setAttribute(k,String(v)));if(parent)parent.appendChild(n);return n;}

/* ---------- chassis ---------- */
export function createHardwareSurface(root,{id,skin='pro3',programLabel='INITIAL PROGRAM'}){
 root.classList.add('hp-root');
 const stage=node('div','hp-stage hp-'+skin+'-stage',root);
 const info=node('div','hp-info',stage),left=node('div','hp-info-left',info);
 const mark=node('img','hp-overture-mark',left);mark.src='/ui/Logos/OvertureLogo.png';mark.alt='Overture';mark.draggable=false;
 const prog=node('div','hp-info-program',left,programLabel);
 const mid=node('div','hp-info-mid',info),midi=node('span','hp-midi-status',mid,'MIDI: searching…'),status=node('span','hp-status',mid,'');
 const instrument=node('div','hp-instrument hp-'+skin,stage);instrument.dataset.instrument=id;
 return {stage,info,instrument,frame:instrument,program:prog,midi,status,fit(){},scale:()=>1};
}
/* A titled group of controls, laid out as a flex row. */
export function addPanel(parent,{title='',sub='',className='',area=''}={}){
 const s=node('section','hp-group '+className,parent);if(area)s.style.gridArea=area;
 if(title){const head=node('header','hp-group-head',s);node('h2','hp-group-title',head,title);if(sub)node('span','hp-group-sub',head,sub);}
 s.body=node('div','hp-group-body',s);return s;
}
export function addRow(parent,className=''){return node('div','hp-row '+className,parent);}
export function addLabel(parent,text,className=''){return node('div','hp-label '+className,parent,text);}

/* ---------- controls ---------- */
export function addKnob(parent,{label,min=0,max=1,value=0,step,size:customSize,small=false,accent=false,bipolar=false,onChange=()=>{},formatValue=v=>max>8?String(Math.round(v)):Number(v).toFixed(2),midiId,group=''}){
 const id='hpknob'+(++controlId),size=customSize||(small?40:52);
 const wrap=node('div','hp-knob'+(small?' hp-knob-small':'')+(accent?' hp-knob-accent':'')+(bipolar?' hp-knob-bipolar':''),parent);
 wrap.style.setProperty('--size',size+'px');
 wrap.tabIndex=0;wrap.setAttribute('role','slider');wrap.setAttribute('aria-label',label);wrap.setAttribute('aria-valuemin',min);wrap.setAttribute('aria-valuemax',max);
 const art=svg('svg',{viewBox:'0 0 100 100',class:'hp-knob-art'},wrap),defs=svg('defs',{},art);
 const cap=svg('radialGradient',{id:id+'c',cx:'36%',cy:'28%',r:'80%'},defs);
 [['0%','var(--hp-cap-hi)'],['55%','var(--hp-cap-mid)'],['100%','var(--hp-cap-lo)']].forEach(([o,c])=>svg('stop',{offset:o,'stop-color':c},cap));
 // value arc (drawn from the minimum, or from the centre for bipolar knobs)
 svg('path',{d:arcPath(-135,135,43),class:'hp-knob-track',fill:'none'},art);
 const arc=svg('path',{class:'hp-knob-arc',fill:'none'},art);
 svg('circle',{cx:52,cy:56,r:33,fill:'#000',opacity:.45},art);
 svg('circle',{cx:50,cy:50,r:33,fill:'var(--hp-skirt)'},art);
 svg('circle',{cx:50,cy:50,r:27,fill:'url(#'+id+'c)',stroke:'var(--hp-cap-edge)','stroke-width':1.2},art);
 for(let i=0;i<24;i++){const a=i/24*Math.PI*2;svg('line',{x1:50+Math.cos(a)*27,y1:50+Math.sin(a)*27,x2:50+Math.cos(a)*24.5,y2:50+Math.sin(a)*24.5,stroke:'#000',opacity:.35,'stroke-width':.8},art);}
 const pointer=svg('g',{},art);svg('line',{x1:50,y1:50,x2:50,y2:27,class:'hp-knob-pointer','stroke-linecap':'round'},pointer);
 const val=node('span','hp-knob-value',wrap);const legend=node('span','hp-control-label',wrap,label);legend.title=label;
 let current=clamp(value,min,max),startY=0,startX=0,startValue=0,pid=null;
 const render=()=>{
  const t=(current-min)/(max-min||1),ang=-135+t*270;
  pointer.setAttribute('transform','rotate('+ang+' 50 50)');
  const from=bipolar?0:-135,to=ang;arc.setAttribute('d',Math.abs(to-from)<.5?'':arcPath(Math.min(from,to),Math.max(from,to),43));
  wrap.setAttribute('aria-valuenow',String(current));val.textContent=formatValue(current);
 };
 function arcPath(a0,a1,r){const p=a=>[50+r*Math.sin(a*Math.PI/180),50-r*Math.cos(a*Math.PI/180)];const [x0,y0]=p(a0),[x1,y1]=p(a1);return 'M'+x0.toFixed(2)+' '+y0.toFixed(2)+' A'+r+' '+r+' 0 '+(a1-a0>180?1:0)+' 1 '+x1.toFixed(2)+' '+y1.toFixed(2);}
 const setValue=(next,silent=false)=>{const v=clamp(next,min,max);if(Math.abs(v-current)<1e-8)return;current=v;render();if(!silent)onChange(v);};
 wrap.addEventListener('pointerdown',e=>{if(e.button!==0)return;pid=e.pointerId;wrap.setPointerCapture?.(pid);startY=e.clientY;startX=e.clientX;startValue=current;wrap.classList.add('is-turning');e.preventDefault();});
 wrap.addEventListener('pointermove',e=>{if(pid!==e.pointerId)return;const delta=(startY-e.clientY)+(e.clientX-startX)*.35;setValue(startValue+delta/(small?110:130)*(max-min)*(e.shiftKey?.18:1));});
 const release=e=>{if(pid!==e.pointerId)return;pid=null;wrap.classList.remove('is-turning');};wrap.addEventListener('pointerup',release);wrap.addEventListener('pointercancel',release);
 wrap.addEventListener('wheel',e=>{e.preventDefault();setValue(current+(e.deltaY<0?1:-1)*(step||((max-min)/100))*(e.shiftKey?.1:1));},{passive:false});
 wrap.addEventListener('dblclick',()=>setValue(value));
 wrap.addEventListener('keydown',e=>{const d=step||((max-min)/100);if(e.key==='ArrowUp'||e.key==='ArrowRight'){setValue(current+d);e.preventDefault();}if(e.key==='ArrowDown'||e.key==='ArrowLeft'){setValue(current-d);e.preventDefault();}if(e.key==='Home'){setValue(min);e.preventDefault();}if(e.key==='End'){setValue(max);e.preventDefault();}});
 render();
 wrap.dataset.midiGroup=group;wrap._oiMidi={id:midiId||('HW:'+label),label,group,get:()=>(current-min)/(max-min||1),set:v=>setValue(min+v*(max-min))};
 return {el:wrap,getValue:()=>current,setValue,render};
}

export function addFader(parent,{x,y,label,min=0,max=1,value=0,height=92,width=32,orientation='vertical',small=false,onChange=()=>{},formatValue=v=>Number(v).toFixed(2),midiId,group=''}){
 const vertical=orientation==='vertical',wrap=node('div','hp-fader '+(vertical?'hp-fader-vertical':'hp-fader-horizontal')+(small?' hp-fader-small':''),parent);
 const totalW=vertical?width:height,totalH=vertical?height:width;
 const footprint=vertical?Math.max(totalW,Math.min(24,width*1.4)):totalW;
 Object.assign(wrap.style,{left:(x-footprint/2)+'px',top:(y-totalH/2)+'px',width:footprint+'px',height:(totalH+(vertical?38:30))+'px'});
 if(vertical)wrap.style.setProperty?.('--hp-fader-track-height',height+'px');
 const track=node('div','hp-fader-track',wrap),scale=node('div','hp-fader-scale',track);
 for(let i=0;i<=10;i++)node('i','hp-fader-tick',scale);
 const cap=node('div','hp-fader-cap',track);node('div','hp-fader-cap-line',cap);
 const legend=node('span','hp-control-label hp-fader-label',wrap,label),valueEl=node('span','hp-fader-value',wrap);
 legend.title=label;
 let current=clamp(value,min,max),pid=null;
 const render=()=>{const t=(current-min)/(max-min||1);cap.style.top=(100-t*100)+'%';wrap.setAttribute('aria-valuenow',String(current));valueEl.textContent=formatValue(current);};
 const setValue=(v,silent=false)=>{const n=clamp(v,min,max);if(Math.abs(n-current)<1e-8)return;current=n;render();if(!silent)onChange(n);};
 const move=e=>{if(e.pointerId!==pid)return;const rect=track.getBoundingClientRect();setValue(min+(1-clamp((e.clientY-rect.top)/(rect.height||1)))*(max-min));};
 wrap.addEventListener('pointerdown',e=>{if(e.button!==0)return;pid=e.pointerId;wrap.setPointerCapture?.(pid);move(e);wrap.classList.add('is-moving');e.preventDefault();});
 wrap.addEventListener('pointermove',move);
 const up=e=>{if(e.pointerId!==pid)return;pid=null;wrap.classList.remove('is-moving');};wrap.addEventListener('pointerup',up);wrap.addEventListener('pointercancel',up);
 wrap.tabIndex=0;wrap.setAttribute('role','slider');wrap.setAttribute('aria-label',label);wrap.setAttribute('aria-valuemin',min);wrap.setAttribute('aria-valuemax',max);
 wrap.addEventListener('keydown',e=>{const d=(max-min)/100;if(e.key==='ArrowUp'||e.key==='ArrowRight'){setValue(current+d);e.preventDefault();}if(e.key==='ArrowDown'||e.key==='ArrowLeft'){setValue(current-d);e.preventDefault();}});
 render();wrap._oiMidi={id:midiId||('HW:'+label),label,group,get:()=>(current-min)/(max-min||1),set:v=>setValue(min+v*(max-min))};
 return {el:wrap,getValue:()=>current,setValue};
}

export function addButton(parent,{label='',value=false,toggle=true,led='red',onChange=()=>{},midiId,group=''}){
 const holder=node('div','hp-btn',parent),wrap=node('button','hp-button',holder);wrap.type='button';
 node('span','hp-button-led hp-button-led-'+led,wrap);
 if(label){const l=node('span','hp-button-label',holder,label);l.title=label;}
 let current=!!value;wrap.tabIndex=0;wrap.setAttribute('aria-label',label||'Switch');
 const render=()=>{wrap.classList.toggle('is-on',current);wrap.setAttribute('aria-pressed',String(current));};
 const setValue=(v,silent=false)=>{const n=!!v;if(n===current)return;current=n;render();if(!silent)onChange(n);};
 wrap.addEventListener('click',()=>{if(toggle)setValue(!current);else onChange(true);});
 render();wrap._oiMidi={id:midiId||('HW:'+label),label,group,get:()=>current?1:0,set:v=>setValue(v>=.5)};
 return {el:wrap,holder,getValue:()=>current,setValue};
}

/* Labelled drop-down. options may be values or {value,label}. */
export function addSelect(parent,{label,options,value,onChange=()=>{},midiId,group='',optionLabels,wide=false}){
 const wrap=node('label','hp-select'+(wide?' hp-select-wide':''),parent);node('span','hp-control-label',wrap,label);
 const select=node('select','',wrap);select.setAttribute('aria-label',label);
 options.forEach((v,i)=>{const o=node('option','',select,String(optionLabels?.[i]??v).toUpperCase());o.value=String(v);});
 select.value=String(value);
 const pick=()=>options.find(o=>String(o)===select.value);
 select.addEventListener('change',()=>onChange(pick()));
 const control={el:select,holder:wrap,getValue:()=>pick(),setValue:v=>{select.value=String(v);}};
 select._oiMidi={id:midiId||('HW:'+label),label,group,get:()=>{const i=options.findIndex(o=>String(o)===select.value);return Math.max(0,i)/(options.length-1||1);},set:t=>{const i=Math.round(clamp(t)*(options.length-1));select.value=String(options[i]);onChange(options[i]);}};
 return control;
}

export function addSlider(parent,{label,min=0,max=1,step=.001,value=0,onChange=()=>{},midiId,group=''}){
 const wrap=node('label','hp-slider',parent);node('span','hp-control-label',wrap,label);
 const input=node('input','',wrap);input.type='range';input.min=String(min);input.max=String(max);input.step=String(step);input.value=String(value);input.setAttribute('aria-label',label);
 input.addEventListener('input',()=>onChange(Number(input.value)));
 input._oiMidi={id:midiId||('HW:'+label),label,group,get:()=>(Number(input.value)-min)/(max-min||1),set:t=>{const v=min+clamp(t)*(max-min);input.value=String(v);onChange(v);}};
 return {el:input,holder:wrap,getValue:()=>Number(input.value),setValue:v=>{input.value=String(v);}};
}

export function addDisplay(parent,{brand='',skin='amber'}={}){
 const d=node('div','hp-display hp-display-'+skin,parent);
 if(brand)node('span','hp-display-brand',d,brand);const main=node('strong','hp-display-main',d,'INIT');const sub=node('small','hp-display-sub',d,'PROGRAM 001');
 return {el:d,set:(a,b='')=>{main.textContent=a;sub.textContent=b;},main,sub};
}

export function addKeyboard(parent,{firstNote=36,count=37,onNoteOn=()=>{},onNoteOff=()=>{},onAftertouch=()=>{},keyColor='amber',labels=true}){
 const bed=node('div','hp-keybed hp-keybed-'+keyColor,parent);
 const white=[],blackPitchClasses=new Set([1,3,6,8,10]);
 for(let n=firstNote;n<firstNote+count;n++){if(!blackPitchClasses.has(n%12))white.push(n);}
 const ww=100/white.length,keyMap=new Map(),pointers=new Map();
 const create=(n,isBlack)=>{const k=node('button','hp-key '+(isBlack?'hp-key-black':'hp-key-white'),bed);k.type='button';k.tabIndex=-1;k.dataset.note=String(n);k.dataset.keyName=noteName(n);k.setAttribute('aria-label',noteName(n));if(labels&&!isBlack&&n%12===0)node('span','hp-key-mark',k,noteName(n));k.addEventListener('contextmenu',e=>e.preventDefault());keyMap.set(n,k);return k;};
 white.forEach((n,i)=>{const k=create(n,false);k.style.left=(i*ww)+'%';k.style.width=ww+'%';});
 for(let n=firstNote;n<firstNote+count;n++){
  if(!blackPitchClasses.has(n%12))continue;const wi=white.indexOf(n-1);if(wi<0)continue;
  const k=create(n,true),bw=ww*.6;k.style.left=((wi+1)*ww-bw/2)+'%';k.style.width=bw+'%';
 }
 const hit=e=>{const found=document.elementFromPoint(e.clientX,e.clientY)?.closest?.('.hp-key');return found&&bed.contains(found)?Number(found.dataset.note):null;};
 const velocity=(e,n)=>{const r=keyMap.get(n)?.getBoundingClientRect();if(!r)return .8;return clamp(.38+((e.clientY-r.top)/(r.height||1))*.62,.05,1);};
 const setActive=(n,on)=>{const k=keyMap.get(Number(n));if(k)k.classList.toggle('active',!!on);};
 bed.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;e.preventDefault();bed.setPointerCapture?.(e.pointerId);
  const n=hit(e);if(n===null)return;pointers.set(e.pointerId,{note:n,startY:e.clientY});setActive(n,true);onNoteOn(n,velocity(e,n));
 });
 bed.addEventListener('pointermove',e=>{
  const state=pointers.get(e.pointerId);if(!state)return;const n=hit(e);
  if(n!==null&&n!==state.note){setActive(state.note,false);onAftertouch(state.note,0);onNoteOff(state.note);pointers.set(e.pointerId,{note:n,startY:e.clientY});setActive(n,true);onNoteOn(n,velocity(e,n));return;}
  const rect=keyMap.get(state.note)?.getBoundingClientRect();
  onAftertouch(state.note,e.pointerType==='pen'&&e.pressure>0?clamp(e.pressure):clamp(.18+((e.clientY-state.startY)/Math.max(1,(rect?.height||120)*.72))));
 });
 const up=e=>{const state=pointers.get(e.pointerId);if(!state)return;pointers.delete(e.pointerId);setActive(state.note,false);onAftertouch(state.note,0);onNoteOff(state.note);};
 bed.addEventListener('pointerup',up);bed.addEventListener('pointercancel',up);
 return {el:bed,setActive,has:n=>keyMap.has(Number(n)),keyMap,notes:[...keyMap.keys()]};
}

export function addWheel(parent,{label,min=0,max=1,value=0,height=96,onChange=()=>{},spring=false,midiId}){
 const wrap=node('div','hp-wheel-wrap',parent);wrap.style.setProperty('--h',height+'px');
 const slot=node('div','hp-wheel-slot',wrap),track=node('div','hp-wheel-track',slot),cap=node('div','hp-wheel-cap',track);wrap.tabIndex=0;wrap.setAttribute('role','slider');wrap.setAttribute('aria-label',label);wrap.setAttribute('aria-valuemin',min);wrap.setAttribute('aria-valuemax',max);
 for(let i=0;i<9;i++)node('i','hp-wheel-ridge',cap);
 node('span','hp-control-label',wrap,label);
 let current=clamp(value,min,max),pid=null;
 const render=()=>{cap.style.top=(100-(current-min)/(max-min||1)*100)+'%';wrap.setAttribute('aria-valuenow',String(current));};
 const setValue=(v,silent=false)=>{const n=clamp(v,min,max);if(Math.abs(n-current)<1e-6)return;current=n;render();if(!silent)onChange(n);};
 const move=e=>{if(pid!==e.pointerId)return;const r=slot.getBoundingClientRect();setValue(min+(1-clamp((e.clientY-r.top)/(r.height||1)))*(max-min));};
 slot.addEventListener('pointerdown',e=>{if(e.button!==0)return;pid=e.pointerId;slot.setPointerCapture?.(pid);move(e);e.preventDefault();});slot.addEventListener('pointermove',move);
 const release=e=>{if(e.pointerId!==pid)return;pid=null;if(spring)setValue(spring===true?0:spring);};slot.addEventListener('pointerup',release);slot.addEventListener('pointercancel',release);
 wrap.addEventListener('keydown',e=>{const step=(max-min)*.02;if(e.key==='ArrowUp'||e.key==='ArrowRight'){setValue(current+step);e.preventDefault();}else if(e.key==='ArrowDown'||e.key==='ArrowLeft'){setValue(current-step);e.preventDefault();}});
 wrap._oiMidi={id:midiId||('HW:'+label),label,group:'PERFORMANCE',get:()=>(current-min)/(max-min||1),set:v=>setValue(min+v*(max-min))};
 render();return {el:wrap,getValue:()=>current,setValue};
}

export function addTouchStrip(parent,{height=96,value=0,onChange=()=>{},label='TOUCH'}){
 const wrap=node('div','hp-touch-wrap',parent);wrap.style.setProperty('--h',height+'px');wrap.tabIndex=0;wrap.setAttribute('role','slider');wrap.setAttribute('aria-label',label);wrap.setAttribute('aria-valuemin','0');wrap.setAttribute('aria-valuemax','1');
 const rail=node('div','hp-touch-rail',wrap),levels=node('div','hp-touch-levels',rail),dot=node('i','hp-touch-dot',rail);for(let i=0;i<9;i++)node('i','hp-touch-led',levels);
 node('span','hp-control-label',wrap,label);
 let current=clamp(value),pid=null;
 const render=()=>{dot.style.top=((1-current)*100)+'%';wrap.setAttribute('aria-valuenow',String(current));};
 const setValue=(v,silent=false)=>{current=clamp(v);render();if(!silent)onChange(current);};
 const move=e=>{if(pid!==e.pointerId)return;const r=rail.getBoundingClientRect();setValue(1-clamp((e.clientY-r.top)/(r.height||1)));};
 rail.addEventListener('pointerdown',e=>{pid=e.pointerId;rail.setPointerCapture?.(pid);move(e);e.preventDefault();});rail.addEventListener('pointermove',move);const up=e=>{if(e.pointerId!==pid)return;pid=null;};rail.addEventListener('pointerup',up);rail.addEventListener('pointercancel',up);
 wrap.addEventListener('keydown',e=>{const step=e.shiftKey?.1:.02;if(e.key==='ArrowUp'||e.key==='ArrowRight'){setValue(current+step);e.preventDefault();}else if(e.key==='ArrowDown'||e.key==='ArrowLeft'){setValue(current-step);e.preventDefault();}});
 wrap._oiMidi={id:'HW:'+label,label,group:'PERFORMANCE',get:()=>current,set:v=>setValue(v)};
 render();return {el:wrap,getValue:()=>current,setValue};
}

export function bindComputerKeyboard({noteOn,noteOff,start=48,velocity=.82}){
 const held=new Map(),typing=e=>['INPUT','TEXTAREA','SELECT'].includes(e.target?.tagName);
 const down=e=>{if(typing(e)||e.ctrlKey||e.metaKey||e.altKey||e.repeat)return;const semi=KEY_TO_SEMI[e.key.toLowerCase()];if(semi===undefined||held.has(e.key))return;e.preventDefault();const n=start+semi;held.set(e.key,n);noteOn(n,velocity);};
 const up=e=>{if(!held.has(e.key))return;const n=held.get(e.key);held.delete(e.key);noteOff(n);};
 const blur=()=>{held.forEach(n=>noteOff(n));held.clear();};
 window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);
 return {held,dispose(){window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);blur();}};
}
