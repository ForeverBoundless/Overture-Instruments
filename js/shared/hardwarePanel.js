const SVG='http://www.w3.org/2000/svg';
let controlId=0;
export const KEY_TO_SEMI={a:0,w:1,s:2,e:3,d:4,f:5,t:6,g:7,y:8,h:9,u:10,j:11,k:12,o:13,l:14,p:15,';':16,"'":17};
export const midiFromKeyName=name=>{const m=/^([A-G]#?)(-?\d+)$/.exec(name);const names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];return m?(Number(m[2])+1)*12+names.indexOf(m[1]):-1;};
export const noteName=n=>{const names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];return names[n%12]+(Math.floor(n/12)-1);};
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,Number(v)||0));
function node(tag,cls,parent,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;if(parent)parent.appendChild(n);return n;}
function svg(tag,attrs,parent){const n=document.createElementNS(SVG,tag);Object.entries(attrs||{}).forEach(([k,v])=>n.setAttribute(k,String(v)));if(parent)parent.appendChild(n);return n;}
function place(n,x,y){n.style.left=x+'px';n.style.top=y+'px';return n;}

export function createHardwareSurface(root,{id,width,height,skin='pro3',programLabel='INITIAL PROGRAM'}){
 root.classList.add('hp-root');const stage=node('div','hp-stage hp-'+skin+'-stage',root);
 const info=node('div','hp-info',stage),left=node('div','hp-info-left',info);
 const mark=node('img','hp-overture-mark',left);mark.src='/ui/Logos/OvertureLogo.png';mark.alt='Overture';mark.draggable=false;
 const prog=node('div','hp-info-program',left,programLabel);
 const mid=node('div','hp-info-mid',info),midi=node('span','hp-midi-status',mid,'MIDI: searching…'),status=node('span','hp-status',mid,'');
 const frame=node('div','hp-frame',stage),instrument=node('div','hp-instrument hp-'+skin,frame);
 instrument.style.width=width+'px';instrument.style.height=height+'px';instrument.dataset.instrument=id;
 const resize=()=>{
  // Preserve the hardware's proportions and scale to available width only.
  // The document scrolls vertically when the complete chassis is taller than
  // the viewport; the keyboard is never shrunk or clipped to make it fit.
  const availableWidth=Math.max(200,window.innerWidth-32);
  const scale=Math.min(1,availableWidth/width);
  const scaledWidth=Math.round(width*scale*100)/100;
  instrument.style.transform='scale('+scale+')';
  instrument.style.setProperty('--hp-scale',String(scale));
  frame.style.width=scaledWidth+'px';
  frame.style.height=(height*scale)+'px';
  // Keep the info strip and preset/action footer exactly aligned with the
  // scaled chassis. The chassis itself uses a top-left transform origin.
  stage.style.width=scaledWidth+'px';
  stage.style.maxWidth='calc(100vw - 16px)';
  info.style.width=scaledWidth+'px';
 };
 window.addEventListener('resize',resize);requestAnimationFrame(resize);
 return {stage,info,frame,instrument,program:prog,midi,status,fit:resize,scale:()=>instrument.getBoundingClientRect().width/width||1};
}

export function addSection(parent,{x,y,w,h,title,sub='',className=''}){
 const s=node('section','hp-section '+className,parent);Object.assign(s.style,{left:x+'px',top:y+'px',width:w+'px',height:h+'px'});
 const head=node('div','hp-section-head',s);node('span','hp-section-title',head,title);
 if(sub)node('span','hp-section-sub',head,sub);
 node('div','hp-section-inner',s);s.body=s.querySelector('.hp-section-inner');return s;
}
export function addLabel(parent,x,y,text,className=''){const l=node('div','hp-label '+className,parent,text);place(l,x,y);return l;}
export function addRule(parent,x,y,w,cls=''){const r=node('div','hp-rule '+cls,parent);Object.assign(r.style,{left:x+'px',top:y+'px',width:w+'px'});return r;}
export function addLED(parent,x,y,color='red',on=false){const l=node('i','hp-led hp-led-'+color,parent);place(l,x,y);l.classList.toggle('is-on',!!on);return l;}

export function addKnob(parent,{x,y,label,min=0,max=1,value=0,step,size:customSize,small=false,accent=false,bipolar=false,onChange=()=>{},formatValue=v=>max>8?String(Math.round(v)):Number(v).toFixed(2),midiId,group=''}){
 const id='hpknob'+(++controlId),size=customSize|| (small?58:72),wrap=node('div','hp-knob'+(small?' hp-knob-small':'')+(accent?' hp-knob-accent':'')+(bipolar?' hp-knob-bipolar':''),parent);
 Object.assign(wrap.style,{left:(x-size/2)+'px',top:(y-size/2)+'px',width:size+'px',height:(size+22)+'px'});
 wrap.tabIndex=0;wrap.setAttribute('role','slider');wrap.setAttribute('aria-label',label);wrap.setAttribute('aria-valuemin',min);wrap.setAttribute('aria-valuemax',max);
 const art=svg('svg',{viewBox:'0 0 100 100',class:'hp-knob-art'},wrap),defs=svg('defs',{},art);
 const grad=svg('radialGradient',{id:id+'g',cx:'38%',cy:'30%',r:'75%'},defs);
 [['0%','#62666a'],['42%','#33373b'],['100%','#111417']].forEach(([o,c])=>svg('stop',{offset:o,'stop-color':c},grad));
 const rim=svg('linearGradient',{id:id+'r',x1:'0',y1:'0',x2:'1',y2:'1'},defs);
 [['0%','#f4f2ec'],['25%','#8b8d8f'],['50%','#3d4145'],['76%','#a9abad'],['100%','#4b4e50']].forEach(([o,c])=>svg('stop',{offset:o,'stop-color':c},rim));
 for(let i=0;i<=10;i++){const a=(-138+i*27)*Math.PI/180;const major=i%2===0;svg('line',{x1:50+Math.sin(a)*(major?40:42),y1:50-Math.cos(a)*(major?40:42),x2:50+Math.sin(a)*47,y2:50-Math.cos(a)*47,stroke:accent?'#d97a43':'#c9cdd0','stroke-width':major?1.8:1,opacity:major?.9:.55},art);}
 svg('circle',{cx:51.5,cy:54,r:34,fill:'#000',opacity:.55},art);
 svg('circle',{cx:50,cy:50,r:32,fill:'url(#'+id+'r)',stroke:'#090b0d','stroke-width':1.8},art);
 svg('circle',{cx:50,cy:50,r:28.5,fill:'url(#'+id+'g)',stroke:'#080a0c','stroke-width':1.2},art);
 for(let i=0;i<28;i++){const a=i/28*Math.PI*2;svg('line',{x1:50+Math.cos(a)*29,y1:50+Math.sin(a)*29,x2:50+Math.cos(a)*31.5,y2:50+Math.sin(a)*31.5,stroke:'#0a0c0e','stroke-width':.7,opacity:.8},art);}
 const pointer=svg('g',{},art);svg('line',{x1:50,y1:48,x2:50,y2:22,stroke:'#f5f3e9','stroke-width':2.5,'stroke-linecap':'round'},pointer);
 svg('circle',{cx:50,cy:50,r:5,fill:'#697075',stroke:'#9da2a4','stroke-width':.7},art);
 const val=node('span','hp-knob-value',wrap);const legend=node('span','hp-control-label',wrap,label);
 let current=clamp(value,min,max),startY=0,startX=0,startValue=0,pid=null;
 const render=()=>{const t=(current-min)/(max-min||1);pointer.setAttribute('transform','rotate('+(-138+t*276)+' 50 50)');wrap.setAttribute('aria-valuenow',String(current));val.textContent=formatValue(current);};
 const setValue=(next,silent=false)=>{const v=clamp(next,min,max);if(Math.abs(v-current)<1e-8)return;current=v;render();if(!silent)onChange(v);};
 wrap.addEventListener('pointerdown',e=>{if(e.button!==0)return;pid=e.pointerId;wrap.setPointerCapture?.(pid);startY=e.clientY;startX=e.clientX;startValue=current;wrap.classList.add('is-turning');e.preventDefault();});
 wrap.addEventListener('pointermove',e=>{if(pid!==e.pointerId)return;const scale=wrap.parentElement?.closest('.hp-instrument')?.getBoundingClientRect().width/(Number(wrap.parentElement?.closest('.hp-instrument')?.style.width.replace('px',''))||1)||1;const delta=((startY-e.clientY)+(e.clientX-startX)*.35)/(scale||1);const sensitivity=e.shiftKey?.18:1;setValue(startValue+delta/(small?110:130)*(max-min)*sensitivity);});
 const release=e=>{if(pid!==e.pointerId)return;pid=null;wrap.classList.remove('is-turning');};wrap.addEventListener('pointerup',release);wrap.addEventListener('pointercancel',release);
 wrap.addEventListener('wheel',e=>{e.preventDefault();setValue(current+(e.deltaY<0?1:-1)*(step||((max-min)/100))*(e.shiftKey?.1:1));},{passive:false});
 wrap.addEventListener('dblclick',()=>setValue(value));
 wrap.addEventListener('keydown',e=>{const d=step||((max-min)/100);if(e.key==='ArrowUp'||e.key==='ArrowRight'){setValue(current+d);e.preventDefault();}if(e.key==='ArrowDown'||e.key==='ArrowLeft'){setValue(current-d);e.preventDefault();}if(e.key==='Home'){setValue(min);e.preventDefault();}if(e.key==='End'){setValue(max);e.preventDefault();}});
 render();
 wrap.dataset.midiGroup=group;wrap._oiMidi={id:midiId||('HW:'+label),label,group,get:()=> (current-min)/(max-min||1),set:v=>setValue(min+v*(max-min))};
 return {el:wrap,getValue:()=>current,setValue,render};
}

export function addFader(parent,{x,y,label,min=0,max=1,value=0,height=92,width=32,orientation='vertical',small=false,onChange=()=>{},formatValue=v=>Number(v).toFixed(2),midiId,group=''}){
 const vertical=orientation==='vertical',wrap=node('div','hp-fader '+(vertical?'hp-fader-vertical':'hp-fader-horizontal')+(small?' hp-fader-small':''),parent);
 const totalW=vertical?width:height,totalH=vertical?height:width;
 Object.assign(wrap.style,{left:(x-totalW/2)+'px',top:(y-totalH/2)+'px',width:totalW+'px',height:(totalH+(vertical?24:22))+'px'});
 const track=node('div','hp-fader-track',wrap),scale=node('div','hp-fader-scale',track);
 for(let i=0;i<=10;i++)node('i','hp-fader-tick',scale);
 const cap=node('div','hp-fader-cap',track),pointer=node('div','hp-fader-cap-line',cap);
 const legend=node('span','hp-control-label hp-fader-label',wrap,label),valueEl=node('span','hp-fader-value',wrap);
 let current=clamp(value,min,max),pid=null,start=0,startValue=0;
 const render=()=>{const t=(current-min)/(max-min||1);if(vertical)cap.style.top=(100-t*100)+'%';else cap.style.left=(t*100)+'%';wrap.setAttribute('aria-valuenow',String(current));valueEl.textContent=formatValue(current);};
 const setValue=(v,silent=false)=>{const n=clamp(v,min,max);if(Math.abs(n-current)<1e-8)return;current=n;render();if(!silent)onChange(n);};
 const move=e=>{if(e.pointerId!==pid)return;const rect=track.getBoundingClientRect();const scaleFactor=track.closest('.hp-instrument')?.getBoundingClientRect().width/(Number(track.closest('.hp-instrument')?.style.width.replace('px',''))||1)||1;const t=vertical?1-clamp((e.clientY-rect.top)/(rect.height||1),0,1):clamp((e.clientX-rect.left)/(rect.width||1),0,1);setValue(min+t*(max-min));};
 wrap.addEventListener('pointerdown',e=>{if(e.button!==0)return;pid=e.pointerId;wrap.setPointerCapture?.(pid);move(e);wrap.classList.add('is-moving');e.preventDefault();});
 wrap.addEventListener('pointermove',move);
 const up=e=>{if(e.pointerId!==pid)return;pid=null;wrap.classList.remove('is-moving');};wrap.addEventListener('pointerup',up);wrap.addEventListener('pointercancel',up);
 wrap.tabIndex=0;wrap.setAttribute('role','slider');wrap.setAttribute('aria-label',label);wrap.setAttribute('aria-valuemin',min);wrap.setAttribute('aria-valuemax',max);
 wrap.addEventListener('keydown',e=>{const d=(max-min)/100;if(e.key==='ArrowUp'||e.key==='ArrowRight'){setValue(current+d);e.preventDefault();}if(e.key==='ArrowDown'||e.key==='ArrowLeft'){setValue(current-d);e.preventDefault();}});
 render();wrap._oiMidi={id:midiId||('HW:'+label),label,group,get:()=> (current-min)/(max-min||1),set:v=>setValue(min+v*(max-min))};
 return {el:wrap,getValue:()=>current,setValue};
}

export function addButton(parent,{x,y,label='',value=false,toggle=true,kind='square',size=27,led='red',onChange=()=>{},midiId,group=''}){
 const wrap=node('button','hp-button hp-button-'+kind,parent);wrap.type='button';
 Object.assign(wrap.style,{left:(x-size/2)+'px',top:(y-size/2)+'px',width:size+'px',height:size+'px'});
 const face=node('span','hp-button-face',wrap),window_=node('span','hp-button-window',face),ledEl=node('i','hp-button-led hp-button-led-'+led,window_);
 if(label){const l=node('span','hp-button-label',wrap.parentElement,label);place(l,x,y+size*.64);}
 let current=!!value;wrap.tabIndex=0;wrap.setAttribute('role','slider');wrap.setAttribute('aria-label',label||'Switch');wrap.setAttribute('aria-valuemin','0');wrap.setAttribute('aria-valuemax','1');
 const render=()=>{wrap.classList.toggle('is-on',current);wrap.setAttribute('aria-pressed',String(current));wrap.setAttribute('aria-valuenow',current?'1':'0');};const setValue=(v,silent=false)=>{const n=!!v;if(n===current)return;current=n;render();if(!silent)onChange(n);};
 wrap.addEventListener('click',()=>{if(toggle)setValue(!current);else onChange(true);});
 render();wrap._oiMidi={id:midiId||('HW:'+label),label,group,get:()=>current?1:0,set:v=>setValue(v>=.5)};
 return {el:wrap,getValue:()=>current,setValue};
}

export function addDisplay(parent,{x,y,w=180,h=48,brand='',skin='amber'}){
 const d=node('div','hp-display hp-display-'+skin,parent);Object.assign(d.style,{left:x+'px',top:y+'px',width:w+'px',height:h+'px'});
 if(brand)node('span','hp-display-brand',d,brand);const main=node('strong','hp-display-main',d,'INIT');const sub=node('small','hp-display-sub',d,'PROGRAM 001');return {el:d,set:(a,b='')=>{main.textContent=a;sub.textContent=b;},main,sub};
}

export function addKeyboard(parent,{x,y,w,h,firstNote=36,count=37,onNoteOn=()=>{},onNoteOff=()=>{},onAftertouch=()=>{},keyColor='amber',labels=true}){
 const bed=node('div','hp-keybed hp-keybed-'+keyColor,parent);Object.assign(bed.style,{left:x+'px',top:y+'px',width:w+'px',height:h+'px'});
 const white=[],black=[],noteToMidi=n=>n;
 for(let n=firstNote;n<firstNote+count;n++){if(![1,3,6,8,10].includes(n%12))white.push(n);}
 const ww=100/white.length,offset={1:.62,3:.78,6:.58,8:.70,10:.84};
 const keyMap=new Map(),pointers=new Map(),active=new Map();
 const create=(n,isBlack)=>{const k=node('button','hp-key '+(isBlack?'hp-key-black':'hp-key-white'),bed);k.type='button';k.dataset.note=String(n);k.dataset.keyName=noteName(n);k.setAttribute('aria-label',noteName(n));if(labels&&!isBlack&&n%12===0)node('span','hp-key-mark',k,noteName(n));k.addEventListener('contextmenu',e=>e.preventDefault());keyMap.set(n,k);return k;};
 white.forEach((n,i)=>{const k=create(n,false);k.style.left=(i*ww)+'%';k.style.width=ww+'%';});
 for(let n=firstNote;n<firstNote+count;n++){const pc=n%12;if(![1,3,6,8,10].includes(pc))continue;const wi=white.indexOf(n-1);if(wi<0)continue;const k=create(n,true);k.style.left='calc('+(wi+offset[pc])*ww+'% - '+(ww*.29)+'%)';k.style.width=(ww*.58)+'%';}
 const hit=e=>{const found=document.elementFromPoint(e.clientX,e.clientY)?.closest?.('.hp-key');return found&&bed.contains(found)?Number(found.dataset.note):null;};
 const velocity=(e,n)=>{const k=keyMap.get(n),r=k?.getBoundingClientRect();if(!r)return .8;return clamp(.38+((e.clientY-r.top)/(r.height||1))*.62,.05,1);};
 const setActive=(n,on)=>{const k=keyMap.get(Number(n));if(k){k.classList.toggle('active',!!on);if(on)active.set(Number(n),true);else active.delete(Number(n));}};
 bed.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;e.preventDefault();bed.setPointerCapture?.(e.pointerId);
  const n=hit(e);if(n===null)return;
  pointers.set(e.pointerId,{note:n,startY:e.clientY});setActive(n,true);
  onNoteOn(n,velocity(e,n));
 });
 bed.addEventListener('pointermove',e=>{
  const state=pointers.get(e.pointerId);if(!state)return;
  const n=hit(e);
  if(n!==null&&n!==state.note){
   setActive(state.note,false);onAftertouch(state.note,0);onNoteOff(state.note);
   pointers.set(e.pointerId,{note:n,startY:e.clientY});setActive(n,true);onNoteOn(n,velocity(e,n));
   return;
  }
  const key=keyMap.get(state.note),rect=key?.getBoundingClientRect();
  const pressure=e.pointerType==='pen'&&e.pressure>0
    ?clamp(e.pressure)
    :clamp(.18+((e.clientY-state.startY)/Math.max(1,(rect?.height||h)*.72)),0,1);
  onAftertouch(state.note,pressure);
 });
 const up=e=>{
  const state=pointers.get(e.pointerId);if(!state)return;
  pointers.delete(e.pointerId);setActive(state.note,false);onAftertouch(state.note,0);onNoteOff(state.note);
 };
 bed.addEventListener('pointerup',up);bed.addEventListener('pointercancel',up);
 return {el:bed,setActive,has:n=>keyMap.has(Number(n)),keyMap,notes:[...keyMap.keys()]};
}

export function addWheel(parent,{x,y,label,min=0,max=1,value=0,height=105,onChange=()=>{},spring=false,midiId}){
 const wrap=node('div','hp-wheel-wrap',parent);Object.assign(wrap.style,{left:(x-21)+'px',top:y+'px',width:'42px',height:(height+25)+'px'});
 const slot=node('div','hp-wheel-slot',wrap),track=node('div','hp-wheel-track',slot),cap=node('div','hp-wheel-cap',track);wrap.tabIndex=0;wrap.setAttribute('role','slider');wrap.setAttribute('aria-label',label);wrap.setAttribute('aria-valuemin',min);wrap.setAttribute('aria-valuemax',max);
 for(let i=0;i<9;i++)node('i','hp-wheel-ridge',cap);
 node('span','hp-control-label hp-wheel-label',wrap,label);
 let current=clamp(value,min,max),pid=null;
 const render=()=>{cap.style.top=(100-(current-min)/(max-min||1)*100)+'%';wrap.setAttribute('aria-valuenow',String(current));};
 const setValue=(v,silent=false)=>{const n=clamp(v,min,max);if(Math.abs(n-current)<1e-6)return;current=n;render();if(!silent)onChange(n);};
 const move=e=>{if(pid!==e.pointerId)return;const r=slot.getBoundingClientRect();const scale=slot.closest('.hp-instrument')?.getBoundingClientRect().width/(Number(slot.closest('.hp-instrument')?.style.width.replace('px',''))||1)||1;const t=1-clamp((e.clientY-r.top)/(r.height||1),0,1);setValue(min+t*(max-min));};
 slot.addEventListener('pointerdown',e=>{if(e.button!==0)return;pid=e.pointerId;slot.setPointerCapture?.(pid);move(e);e.preventDefault();});slot.addEventListener('pointermove',move);
 const release=e=>{if(e.pointerId!==pid)return;pid=null;if(spring)setValue(0);};slot.addEventListener('pointerup',release);slot.addEventListener('pointercancel',release);
 wrap.addEventListener('keydown',e=>{const step=(max-min)*.02;if(e.key==='ArrowUp'||e.key==='ArrowRight'){setValue(current+step);e.preventDefault();}else if(e.key==='ArrowDown'||e.key==='ArrowLeft'){setValue(current-step);e.preventDefault();}else return;});
 wrap._oiMidi={id:midiId||('HW:'+label),label,group:'PERFORMANCE',get:()=> (current-min)/(max-min||1),set:v=>setValue(min+v*(max-min))};
 render();return {el:wrap,getValue:()=>current,setValue};
}

export function addTouchStrip(parent,{x,y,w=25,h=120,value=0,onChange=()=>{},label='TOUCH'}){
 const wrap=node('div','hp-touch-wrap',parent);Object.assign(wrap.style,{left:(x-w/2)+'px',top:y+'px',width:w+'px',height:(h+23)+'px'});wrap.tabIndex=0;wrap.setAttribute('role','slider');wrap.setAttribute('aria-label',label);wrap.setAttribute('aria-valuemin','0');wrap.setAttribute('aria-valuemax','1');
 const rail=node('div','hp-touch-rail',wrap),levels=node('div','hp-touch-levels',rail),dot=node('i','hp-touch-dot',rail);for(let i=0;i<9;i++)node('i','hp-touch-led',levels);
 node('span','hp-control-label hp-touch-label',wrap,label);
 let current=clamp(value),pid=null;
 const render=()=>{dot.style.top=((1-current)*100)+'%';wrap.setAttribute('aria-valuenow',String(current));};
 const setValue=(v,silent=false)=>{current=clamp(v);render();if(!silent)onChange(current);};
 const move=e=>{if(pid!==e.pointerId)return;const r=rail.getBoundingClientRect();setValue(1-clamp((e.clientY-r.top)/(r.height||1),0,1));};
 rail.addEventListener('pointerdown',e=>{pid=e.pointerId;rail.setPointerCapture?.(pid);move(e);e.preventDefault();});rail.addEventListener('pointermove',move);const up=e=>{if(e.pointerId!==pid)return;pid=null;};rail.addEventListener('pointerup',up);rail.addEventListener('pointercancel',up);
 wrap.addEventListener('keydown',e=>{const step=e.shiftKey?.1:.02;if(e.key==='ArrowUp'||e.key==='ArrowRight'){setValue(current+step);e.preventDefault();}else if(e.key==='ArrowDown'||e.key==='ArrowLeft'){setValue(current-step);e.preventDefault();}});
 wrap._oiMidi={id:'HW:'+label,label,group:'PERFORMANCE',get:()=>current,set:v=>setValue(v)};
 return {el:wrap,getValue:()=>current,setValue};
}

export function bindComputerKeyboard({noteOn,noteOff,start=48,velocity=.82}){
 const held=new Map(),typing=e=>['INPUT','TEXTAREA','SELECT'].includes(e.target?.tagName);
 const down=e=>{if(typing(e)||e.ctrlKey||e.metaKey||e.altKey||e.repeat)return;const semi=KEY_TO_SEMI[e.key.toLowerCase()];if(semi===undefined||held.has(e.key))return;e.preventDefault();const n=start+semi;held.set(e.key,n);noteOn(n,velocity);};
 const up=e=>{if(!held.has(e.key))return;const n=held.get(e.key);held.delete(e.key);noteOff(n);};
 const blur=()=>{held.forEach(n=>noteOff(n));held.clear();};
 window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);
 return {held,dispose(){window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);blur();}};
}
