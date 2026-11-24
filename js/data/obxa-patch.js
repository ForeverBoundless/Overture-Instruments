export const GLOBAL_DEFAULTS={mode:'full',voiceCount:8,splitPoint:60,unison:false,unisonDetune:.12,bendRange:12,bendNarrow:false,bendOsc2Only:false,master:.7,masterTune:0,hold:false,layerBalance:.5,chordMode:false,portamentoMode:'linear',portamentoOffset:true,transposeDown:false,transposeUp:false,modLowerEnabled:true,modUpperEnabled:true,modPanelLfoRate:.25,modPanelLfoDepth:0,modPanelLfoDepthEnabled:false,modPanelLfoWave:'sine',modPanelLfoOsc1:false,modPanelLfoOsc2:false,voicePan:[-1,-1,-1,-1,1,1,1,1]};
export const LAYER_DEFAULTS={osc1Wave:'saw',osc2Wave:'saw',osc1Range:0,osc1Level:.82,osc2Level:.56,osc2Tune:0,osc2Detune:0,pulseWidth:.5,sync:false,fEnvOsc2:false,osc1Route:true,osc2Route:true,osc2Half:false,noiseRoute:false,cutoff:.53,resonance:.13,filterMode:'24',filterTrack:true,filterEnv:.42,filterAttack:.08,filterDecay:.32,filterSustain:.12,filterRelease:.32,ampAttack:.015,ampDecay:.3,ampSustain:.76,ampRelease:.32,lfoRate:.16,lfoAmount:0,lfoWave:'sine',lfoTarget:'both',lfoOsc1:true,lfoOsc2:true,lfoFilter:false,pulseWidthAmount:0,lfoPulse1:false,lfoPulse2:false,transpose:0,portamento:0};
export const DEF={...GLOBAL_DEFAULTS,...LAYER_DEFAULTS};
export const GLOBAL_KEYS=new Set(Object.keys(GLOBAL_DEFAULTS));
export const LAYER_KEYS=Object.keys(LAYER_DEFAULTS);
const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number(v)||0));
const cleanLayer=(source={})=>{
 const out={...LAYER_DEFAULTS,...source};
 ['osc1Level','osc2Level','pulseWidth','cutoff','resonance','filterEnv','filterAttack','filterDecay','filterSustain','filterRelease','ampAttack','ampDecay','ampSustain','ampRelease','lfoRate','lfoAmount','pulseWidthAmount','portamento'].forEach(k=>out[k]=clamp(out[k],0,1));
 out.osc1Range=Math.round(clamp(out.osc1Range,-2,2));out.osc2Tune=clamp(out.osc2Tune,-1,1);out.osc2Detune=Math.round(clamp(out.osc2Detune,-100,100));out.transpose=Math.round(clamp(out.transpose,-60,60));
 ['osc1Wave','osc2Wave'].forEach(k=>out[k]=out[k]==='pulse'?'pulse':'saw');
 ['fEnvOsc2','sync','osc1Route','osc2Route','osc2Half','noiseRoute','filterTrack','lfoPulse1','lfoPulse2'].forEach(k=>out[k]=!!out[k]);delete out.lfoVca;
 ['lfoOsc1','lfoOsc2','lfoFilter'].forEach(k=>out[k]=source[k]===undefined?(k==='lfoOsc1'?(out.lfoTarget==='osc1'||out.lfoTarget==='both'):k==='lfoOsc2'?(out.lfoTarget==='osc2'||out.lfoTarget==='both'):out.lfoTarget==='filter'):!!source[k]);
 out.filterMode=String(out.filterMode)==='12'?'12':'24';out.lfoWave=['sine','square','s&h'].includes(out.lfoWave)?out.lfoWave:'sine';
 out.lfoTarget=['osc1','osc2','filter','both'].includes(out.lfoTarget)?out.lfoTarget:'both';return out;
};
export const validateOBXAPatch=data=>{
 if(!data||typeof data!=='object')throw new Error('Not an OB-Xa program.');
 const {layerB,...root}=data;const out={...GLOBAL_DEFAULTS,...cleanLayer(root)};
 if(data.mode==='unison'){out.mode='full';out.unison=true;}else out.mode=['full','split','double'].includes(data.mode)?data.mode:'full';
 out.voiceCount=[4,6,8].includes(Number(data.voiceCount))?Number(data.voiceCount):8;out.splitPoint=Math.round(clamp(data.splitPoint??60,36,96));
 out.unison=!!out.unison;out.unisonDetune=clamp(data.unisonDetune??.12,0,1);
 out.bendOsc2Only=!!out.bendOsc2Only;
 const requestedBendRange=data.bendRange===undefined?(data.bendNarrow?2:12):Math.round(clamp(data.bendRange,1,12));
 out.bendRange=requestedBendRange;
 out.voicePan=Array.from({length:8},(_,index)=>clamp(Array.isArray(data.voicePan)?data.voicePan[index]??(index<4?-1:1):(index<4?-1:1),-1,1));
 out.bendNarrow=out.bendRange<=2;out.modPanelLfoDepthEnabled=!!data.modPanelLfoDepthEnabled;out.modPanelLfoRate=clamp(data.modPanelLfoRate??.25,0,1);out.modPanelLfoDepth=clamp(data.modPanelLfoDepth??0,0,1);out.modPanelLfoWave=['sine','saw','square'].includes(data.modPanelLfoWave)?data.modPanelLfoWave:'sine';out.modPanelLfoOsc1=!!data.modPanelLfoOsc1;out.modPanelLfoOsc2=!!data.modPanelLfoOsc2;out.master=clamp(data.master??.7,0,1);out.masterTune=clamp(data.masterTune??0,-1,1);out.hold=!!out.hold;out.transposeDown=!!data.transposeDown;out.transposeUp=!!data.transposeUp;if(out.transposeDown&&out.transposeUp)out.transposeUp=false;out.modLowerEnabled=data.modLowerEnabled!==false;out.modUpperEnabled=data.modUpperEnabled!==false;if(out.mode==='full'){out.modLowerEnabled=true;out.modUpperEnabled=true;}
 const derivedB=layerB||{...out,osc1Wave:'pulse',osc2Wave:'saw',osc2Tune:Math.min(1,out.osc2Tune+.035),cutoff:Math.max(.08,out.cutoff-.07),resonance:Math.min(.9,out.resonance+.04),ampAttack:Math.min(1,out.ampAttack+.025)};
 out.layerB=cleanLayer(derivedB);return out;
};

export const OBXA_PROGRAM_GROUPS=['A','B','C','D','AB','AC','AD','BC','BD','CD','ABC','ABD','ACD','BCD','ABCD'];
export const OBXA_PROGRAM_COUNT=120;
export const OBXA_SPLIT_PROGRAM_COUNT=8;
export const OBXA_DOUBLE_PROGRAM_COUNT=8;
export const obxaProgramSlotId=(groupIndex,programNumber)=>{
 const group=Math.max(0,Math.min(14,Math.trunc(Number(groupIndex))||0));
 const program=Math.max(1,Math.min(8,Math.trunc(Number(programNumber))||1));
 return `program:${group}:${program}`;
};
export const obxaSpecialProgramSlotId=(mode,programNumber)=>{
 if(!['split','double'].includes(mode))throw new Error('OB-Xa special programs must be SPLIT or DOUBLE.');
 const program=Math.max(1,Math.min(8,Math.trunc(Number(programNumber))||1));
 return `${mode}:${program}`;
};
export const validateOBXAProgramRecord=data=>{
 if(!data||typeof data!=='object'||!data.patch)throw new Error('Not an OB-Xa hardware program.');
 const patch=validateOBXAPatch(data.patch);
 const kind=patch.mode==='split'?'split':patch.mode==='double'?'double':'sound';
 return {kind,patch};
};
