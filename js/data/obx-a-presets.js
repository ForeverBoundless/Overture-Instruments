const preset=(name,patch)=>({name,data:patch});
const base={osc1Wave:'saw',osc2Wave:'saw',osc1Range:0,fEnvOsc2:false,osc1Route:true,osc2Route:true,osc2Half:false,noiseRoute:false,filterTrack:true,osc1Level:.82,osc2Level:.56,osc2Tune:0,pulseWidth:.5,sync:false,cutoff:.53,resonance:.13,filterMode:'24',filterEnv:.42,filterAttack:.08,filterDecay:.32,filterSustain:.12,filterRelease:.32,ampAttack:.015,ampDecay:.3,ampSustain:.76,ampRelease:.32,lfoRate:.16,lfoAmount:0,lfoWave:'sine',lfoTarget:'both',bendRange:2,bendOsc2Only:false,master:.7,mode:'poly',splitPoint:60,unisonDetune:.12};
export const OBXA_PRESETS=[
preset('OB Brass',{...base,osc2Tune:.012,cutoff:.6,resonance:.2,filterEnv:.75,filterAttack:.02,filterDecay:.27,filterSustain:.32,ampAttack:.015,ampDecay:.26,ampSustain:.8}),
preset('Warm Poly',{...base,osc2Tune:.008,cutoff:.47,resonance:.08,filterEnv:.26,ampAttack:.13,ampDecay:.42,ampSustain:.78,ampRelease:.52}),
preset('OB Strings',{...base,osc2Wave:'pulse',osc2Tune:.025,pulseWidth:.43,cutoff:.48,resonance:.07,filterEnv:.14,ampAttack:.3,ampDecay:.46,ampSustain:.84,ampRelease:.7,lfoRate:.13,lfoAmount:.08,lfoTarget:'pulse'}),
preset('Sync Lead',{...base,osc2Wave:'pulse',sync:true,osc2Tune:.15,cutoff:.68,resonance:.33,filterEnv:.35,ampAttack:.004,ampDecay:.2,ampSustain:.65,ampRelease:.18}),
preset('Hollow Motion',{...base,osc1Wave:'pulse',osc2Wave:'pulse',pulseWidth:.32,cutoff:.58,resonance:.48,filterMode:'12',lfoRate:.31,lfoAmount:.38,lfoTarget:'filter',ampAttack:.04,ampSustain:.7}),
preset('F-ENV Sweep',{...base,osc2Wave:'triangle',fEnvOsc2:true,osc2Tune:.04,cutoff:.61,resonance:.28,filterEnv:.58,ampAttack:.01,ampDecay:.34,ampSustain:.58}),
preset('Soft Brass',{...base,osc2Tune:.01,cutoff:.55,resonance:.11,filterEnv:.66,filterAttack:.04,filterDecay:.4,filterSustain:.35,ampAttack:.05,ampDecay:.38,ampSustain:.7}),
preset('Dark Sequence',{...base,osc1Wave:'pulse',pulseWidth:.41,osc2Tune:-.02,cutoff:.32,resonance:.4,filterEnv:.64,filterDecay:.18,filterSustain:.05,ampAttack:.003,ampDecay:.26,ampSustain:.55}),
preset('Dream Machine',{...base,osc2Wave:'triangle',osc2Tune:.018,cutoff:.42,resonance:.09,filterMode:'12',ampAttack:.52,ampDecay:.7,ampSustain:.82,ampRelease:.88,lfoRate:.12,lfoAmount:.055}),
preset('Unison Bass',{...base,mode:'unison',osc2Wave:'pulse',osc2Tune:.035,cutoff:.38,resonance:.42,filterEnv:.82,ampAttack:.003,ampDecay:.21,ampSustain:.56,ampRelease:.15}),
preset('Lyle Mays Ensemble',{
 ...base,mode:'full',voiceCount:8,unison:true,unisonDetune:.38,
 osc1Wave:'saw',osc2Wave:'saw',osc1Level:.82,osc2Level:.68,osc2Tune:.006,
 cutoff:.64,resonance:.06,filterMode:'12',filterTrack:true,filterEnv:.14,
 filterAttack:.13,filterDecay:.58,filterSustain:.2,filterRelease:.62,
 ampAttack:.16,ampDecay:.6,ampSustain:.82,ampRelease:.68,
 lfoRate:.12,lfoAmount:.025,lfoWave:'sine',lfoOsc1:true,lfoOsc2:true,
 lfoFilter:false,pulseWidthAmount:0,lfoPulse1:false,lfoPulse2:false,master:.72
})
];
