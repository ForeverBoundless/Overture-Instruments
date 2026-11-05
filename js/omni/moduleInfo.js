/**
 * OMNI module reference.
 *
 * Every live module type must have a specific entry here. Keep the circuitry
 * grounded in the real hardware principle where one exists, and distinguish
 * digital implementations and simulations from physical analogue circuits.
 */
export const MODULE_INFO = {
  "keyboard": {
    "summary": "A performance input that turns played keys and MIDI messages into note events and a velocity control signal.",
    "circuit": "A physical keyboard commonly scans a matrix of switches. Velocity-sensitive keybeds often use two contacts per key and measure the time between their closures; the interval estimates how quickly the key was pressed. A microcontroller converts that scan into MIDI note-on, note-off, velocity, and controller messages.",
    "use": "The keyboard is the front end of a synthesizer. Its note number determines pitch, note-on opens a voice or envelope, note-off releases it, and velocity can control loudness, brightness, or other parameters.",
    "implementation": "OMNI emits note events and a velocity CV output. The octave-shift control transposes the notes before they reach connected sound modules; no physical keybed or MIDI electrical interface is simulated inside this block."
  },
  "oscillator": {
    "summary": "The main periodic sound source. Its waveform and frequency form the raw material that filters, amplifiers, and effects shape.",
    "circuit": "An analogue voltage-controlled oscillator repeatedly charges and discharges a timing capacitor. Comparators or transistor stages turn that motion into ramp, triangle, pulse, or square waves; an exponential converter translates a pitch voltage into a frequency change. Pulse-width circuitry changes the duty cycle of a rectangular wave.",
    "use": "Oscillators provide the fundamental pitch and harmonic content of a synthesizer. Sawtooth and pulse waves are rich in harmonics, while a sine wave contains only its fundamental and a triangle wave has a softer harmonic spectrum.",
    "implementation": "OMNI generates the selected waveform with Web Audio oscillator nodes and shapes pulse width with a second phase-related oscillator path. Note events set pitch; control voltage can bend pitch, and glide smooths changes between notes."
  },
  "noise": {
    "summary": "A source of non-periodic sound with no fixed musical pitch, useful for percussion, breath, wind, and texture.",
    "circuit": "Analogue noise generators often amplify random voltage from a reverse-biased semiconductor junction or a transistor. White noise has roughly equal energy per hertz; pink noise is shaped so that each octave carries similar energy, requiring a frequency-dependent filter.",
    "use": "Noise can supply the snare and cymbal portion of a drum sound, add breath to a wind patch, or provide a broad spectrum for filtering and modulation experiments.",
    "implementation": "OMNI creates a random-noise buffer and offers white or pink spectral colour plus level control. This is generated digitally rather than by a physical noisy junction."
  },
  "mixer": {
    "summary": "Combines several audio signals into one bus while setting the contribution of each input.",
    "circuit": "A classic analogue mixer uses one input resistor per channel feeding an operational-amplifier summing node, with a feedback resistor setting the overall gain. Faders or voltage-controlled amplifiers set each channel level; practical mixers also add input buffering, headroom management, and output stages.",
    "use": "A mixer combines oscillators, noise, sub-oscillators, and processed signals before they reach a filter, amplifier, or output. Balancing sources changes both loudness and the combined harmonic spectrum.",
    "implementation": "OMNI sums between two and eight audio inputs with independent level controls. The channel-count setting changes the available input jacks; it does not model a particular console or its analogue noise and saturation."
  },
  "filter": {
    "summary": "Removes or emphasizes parts of an incoming sound's frequency spectrum.",
    "circuit": "Analogue synthesizer filters are built from frequency-selective networks using resistors, capacitors, and active devices such as transistors or operational transconductance amplifiers. A low-pass passes frequencies below its cutoff, a high-pass passes frequencies above it, and a band-pass emphasizes a region around its centre frequency; feedback raises resonance.",
    "use": "Filtering changes a sound's brightness, body, and movement. A filter envelope can make a note start bright and darken, while an LFO can create repeated sweeps.",
    "implementation": "OMNI uses a digital biquad filter with low-pass, high-pass, and band-pass modes. The cutoff CV input modulates its frequency; resonance controls the filter's Q rather than reproducing one named vintage circuit."
  },
  "envelope": {
    "summary": "A four-stage amplitude or control-voltage shape that follows a note's gate: attack, decay, sustain, and release.",
    "circuit": "Classic envelope generators use timed charging and discharging paths around capacitors. Switches or transistors select the attack, decay, and release currents; a comparator or gate circuit detects key release. The resulting voltage is routed to a VCA, filter cutoff, or another destination.",
    "use": "ADSR envelopes determine how a note evolves. A short attack and decay suit plucked sounds; a slow attack and long release suit pads and evolving textures. The sustain control sets the held level, not a duration.",
    "implementation": "OMNI schedules an ADSR-shaped CV when a note gate arrives. Its output is a control signal; connect it to a VCA gain input or a filter's cutoff modulation input to hear the envelope shape."
  },
  "lfo": {
    "summary": "A low-frequency oscillator that produces a repeating control signal rather than an audible pitched voice.",
    "circuit": "Analogue LFOs commonly use an integrator and a threshold-switching comparator, or a timer/oscillator circuit, to create a repeating voltage. Additional shaping converts the core ramp or triangle into square and other waveforms. Rates are usually below the normal musical audio range.",
    "use": "An LFO moves a parameter repeatedly: pitch for vibrato, amplitude for tremolo, filter cutoff for wah-like motion, or stereo position for panning. Rate sets speed and depth sets how far the destination moves.",
    "implementation": "OMNI provides sine, triangle, sawtooth, and square control waveforms from a digital oscillator. Its CV output can be connected to compatible pitch, filter, or gain inputs."
  },
  "vca": {
    "summary": "A voltage-controlled amplifier: it changes an audio signal's level in response to a control voltage.",
    "circuit": "A synthesizer VCA uses a gain-controllable device such as an OTA, transistor pair, or FET. The control path converts a CV into gain while the audio path passes through the amplifier. The response curve and control feedthrough affect how cleanly the VCA opens and closes.",
    "use": "A VCA is the usual destination for an amplitude envelope. It can also be used as a tremolo stage, a CV-controlled level, or a dynamically controlled audio gate.",
    "implementation": "OMNI multiplies the input audio by a gain derived from the initial level and incoming CV. Connect an envelope or LFO to Gain CV to automate the signal level."
  },
  "output": {
    "summary": "The final audio destination for a patch, with a level control and output protection.",
    "circuit": "A hardware synthesizer's output stage typically buffers the signal with an amplifier, blocks unwanted DC, and drives a line-level output. Real equipment may add a headphone driver, balanced-output stage, protection, and deliberate analogue coloration.",
    "use": "The output stage feeds a mixer, amplifier, audio interface, or headphones. Keeping adequate headroom prevents overload and gives the rest of the signal chain room to move.",
    "implementation": "OMNI routes the patch to the browser's master audio destination and applies the module's level control plus the engine's output safeguards. It represents the endpoint of the patch, not a specific manufacturer's output circuit."
  },
  "sequencer": {
    "summary": "A repeating row of stored note steps that plays a programmed phrase at a selected tempo.",
    "circuit": "An analogue step sequencer uses a clock, a counter or shift register, and a bank of potentiometers or stored voltage values. Each clock pulse advances the active step and generates a gate; digital sequencers replace the storage and timing logic with software while retaining the same musical workflow.",
    "use": "Sequencers create repeating bass lines, arpeggiated patterns, and rhythmic note sequences without holding keys. Step pitch, gate length, and tempo determine the pattern's contour and feel.",
    "implementation": "OMNI advances through programmed note steps on an audio-clock-based schedule and emits note events with timed note-off events. It is a digital sequencer, not a recreation of a particular analogue sequencer's circuitry."
  },
  "ladder": {
    "summary": "A resonant low-pass filter based on the transistor-ladder architecture associated with classic Moog synthesizers.",
    "circuit": "The classic Moog ladder uses four cascaded transistor differential-pair stages, with the output fed back to the input. Each stage contributes a low-pass pole; together they produce a steep response approaching 24 dB per octave. Increasing feedback raises resonance and can drive the ladder toward self-oscillation. Nonlinear transistor behaviour contributes characteristic saturation.",
    "use": "The ladder removes upper harmonics as its cutoff falls, producing the familiar dark-to-bright sweep used for basses, leads, and percussive synth tones. Resonance emphasizes the cutoff region; drive adds harmonic density.",
    "implementation": "OMNI uses its LadderFilter DSP engine to model the ladder response and its nonlinear character. The cutoff CV input modulates the filter, while slope selects the simulated roll-off; the browser is not running discrete transistor stages."
  },
  "ms20filter": {
    "summary": "A dual high-pass and low-pass filter inspired by the Korg MS-20 signal path.",
    "circuit": "The MS-20 places a resonant high-pass section before a resonant low-pass section, allowing the low end and high end to be shaped independently. The original instrument appeared with two filter-circuit revisions: early units used the discrete Korg-35 design, while later units used OTA-based circuitry. They have different response and distortion characteristics.",
    "use": "The high-pass stage can thin a sound before the low-pass stage removes brightness. Driving either resonance creates pronounced peaks, so the two controls can shape a narrow, nasal, or sharply moving spectrum.",
    "implementation": "OMNI models the serial HPF-to-LPF arrangement with digital filter stages and separate cutoff and peak controls. It is an approximation of the MS-20 filter behaviour, not a component-level simulation of both historical circuit revisions."
  },
  "junoChorus": {
    "summary": "A stereo chorus inspired by the ensemble effect in Roland Juno synthesizers.",
    "circuit": "The classic Juno chorus is based on bucket-brigade delay lines. A clock moves analogue samples through a chain of storage capacitors; varying the clock changes the delay time. Low-frequency modulation creates small pitch and timing variations, and offset left/right paths produce stereo width. The BBD signal path needs filtering to manage clock noise and bandwidth.",
    "use": "Chorus makes a single synthesizer voice sound broader and gently detuned, like several slightly different performances. The Juno's I and II settings use different modulation patterns and depths; combining them produces a denser effect.",
    "implementation": "OMNI recreates the Juno-style stereo modulation in DSP with Off, I, and II modes. It does not contain physical BBD chips, their clock noise, or their analogue filtering."
  },
  "fmVoice": {
    "summary": "A six-operator FM voice based on the Yamaha DX7's digital synthesis architecture.",
    "circuit": "The DX7 is a digital instrument, not an analogue VCO/filter synthesizer. Six sine-wave operators are connected in one of 32 algorithms: some operators modulate the phase of others, while carrier operators contribute directly to the output. Feedback can route an operator back into itself. Modulation changes the spectrum and creates sidebands.",
    "use": "FM can produce electric pianos, bells, mallets, metallic tones, evolving pads, and complex inharmonic sounds. Operator frequency ratios and modulation levels determine the timbre; envelopes make the spectrum change over a note.",
    "implementation": "OMNI loads the DX7 voice engine and preset data, with controls for voice, algorithm, feedback, modulator level scaling, and output level. It is a software FM voice rather than a transistor-level DX7 circuit."
  },
  "semSynth": {
    "summary": "An eight-voice polyphonic synthesizer inspired by the Oberheim SEM and Eight Voice instruments.",
    "circuit": "An SEM voice is built around two voltage-controlled oscillators, a mixer, a two-pole state-variable filter, an amplifier, and envelope and modulation circuits. The state-variable filter provides a continuous sweep between low-pass, band-pass, and high-pass responses, with notch available in the original SEM design. The Eight Voice combined eight SEM voice modules with polyphonic keyboard and voice-allocation circuitry.",
    "use": "The SEM architecture is known for rounded dual-oscillator sounds and a filter that can move between response types rather than switching only between fixed modes. Eight independently allocated voices allow chords and overlapping notes.",
    "implementation": "OMNI uses its Eight Voice worklet to model an eight-voice SEM-style instrument, including oscillator, filter, envelope, and modulation behaviour. The module is a DSP recreation; it does not contain eight physical SEM circuit boards."
  },
  "mellotron": {
    "summary": "A tape-playback instrument voice inspired by the Mellotron's mechanically triggered tape strips.",
    "circuit": "A Mellotron key mechanism presses a tape strip against a playback head while a capstan pulls it past the head at a controlled speed. Each key has a recorded strip with a finite playing length; releasing the key lets a spring return the tape. The head's preamplifier and output circuitry amplify the magnetic playback signal. Pitch changes with tape speed.",
    "use": "The original instrument brings recorded strings, choir, flutes, and other acoustic performances under the keyboard. Its finite tape length, mechanical response, and recorded performance give it a different feel from a conventional synthesizer oscillator.",
    "implementation": "OMNI triggers sampled tape recordings through its Mellotron processor, with playback and frame-selection controls. It reproduces the tape-voice behaviour in software; no tape transport or magnetic playback head is present."
  },
  "subOsc": {
    "summary": "A lower-pitched oscillator that reinforces the fundamental and low-frequency weight of a patch.",
    "circuit": "Many analogue sub-oscillators divide the main VCO's frequency with a flip-flop or other binary divider. A divide-by-two stage produces a tone one octave below; another stage can produce two octaves below. The divider commonly outputs a square wave, independent of the main oscillator's waveform.",
    "use": "A sub-oscillator thickens basses and gives leads more body. Because it is locked to the main pitch, it reinforces the note without needing a separately played keyboard part.",
    "implementation": "OMNI generates a sine or square sub voice from the incoming note, one or two octaves down. It is a dedicated digital oscillator path rather than a literal divider connected to another module's VCO."
  },
  "supersaw": {
    "summary": "A bank of detuned sawtooth oscillators mixed together to create a wide, dense sound.",
    "circuit": "A supersaw is a digital oscillator technique rather than a traditional analogue circuit. Several sawtooth oscillators run at slightly different frequencies; their beating creates a moving cluster of partials. The classic Roland JP-8000 implementation used a seven-saw arrangement with a central reference and detuned voices.",
    "use": "The combined oscillators create the thick, animated sound often used for trance leads, pads, and stacked chords. More voices and wider detuning increase density but can blur pitch and consume more headroom.",
    "implementation": "OMNI layers one to seven digitally generated sawtooth voices and spreads their tuning around the played note. This is a configurable supersaw-style bank, not a bit-for-bit JP-8000 clone."
  },
  "additive": {
    "summary": "Builds a tone by adding sine-wave partials, each with its own level.",
    "circuit": "Additive synthesis follows the Fourier view that complex periodic sounds can be represented as sums of sine waves. A digital instrument generates individual partials and multiplies each by an amplitude value before summing them. Harmonic partials are integer multiples of the fundamental; inharmonic partials use other ratios.",
    "use": "Changing the levels of the harmonics changes the waveform's tone colour. This is the principle behind drawbar organs and additive synthesizers, and it is useful for building organ tones, bells, and precisely controlled spectra.",
    "implementation": "OMNI supplies eight independently adjustable harmonic levels and sums their oscillators into one audio output. The octave and pitch-modulation controls act on the resulting additive voice."
  },
  "pluck": {
    "summary": "A plucked-string voice that creates a pitched decay from a short burst of noise.",
    "circuit": "The Karplus–Strong method is a digital feedback delay line. A short noise burst excites a buffer whose length sets the pitch; each pass through a low-pass filter and feedback loop removes energy, especially at high frequencies. This approximates the repeated reflections and losses of a vibrating string.",
    "use": "It produces plucked, struck, and string-like sounds without a sample of a real instrument. A high feedback value lengthens the decay; the low-pass damping controls how quickly the tone loses brightness.",
    "implementation": "OMNI excites a tuned delay-line model on incoming notes. Sustain controls feedback and brightness sets the damping cutoff; the result is a synthetic physical-model voice."
  },
  "drum": {
    "summary": "A compact synthesized drum voice with selectable kick, snare, hi-hat, and tom sounds.",
    "circuit": "Analogue drum machines often combine short envelope generators, oscillators, resonant filters, and noise sources. A kick uses a low oscillator with a fast downward pitch sweep; a snare combines a pitched body with filtered noise; a hi-hat uses metallic inharmonic components or noise; a tom uses a pitched resonator with a decaying envelope.",
    "use": "A trigger starts one drum event. Tune and decay adjust the pitch and length of the selected voice, allowing the module to provide basic electronic percussion inside a larger patch.",
    "implementation": "OMNI synthesizes each drum type with digital oscillators, noise, filters, and envelopes. The block models common drum-machine sound-building techniques rather than reproducing a particular drum machine's analogue circuit."
  },
  "fmPair": {
    "summary": "A two-operator frequency-modulation voice with one modulator shaping one carrier.",
    "circuit": "In FM synthesis, a modulator oscillator changes the carrier's instantaneous frequency or phase. The amount of modulation sets the sideband energy; the frequency ratio between the operators determines whether the resulting partials are harmonic or inharmonic. A digital implementation calculates this relationship directly.",
    "use": "Two-operator FM is a compact way to create bell tones, metallic attacks, nasal timbres, and bright digital basses. It is simpler to patch than a larger multi-operator FM network.",
    "implementation": "OMNI uses a carrier and modulator oscillator with ratio and modulation-index controls. A CV input can move the index over time, changing brightness while the note is held."
  },
  "delay": {
    "summary": "Repeats an incoming audio signal after a controllable time, with feedback for multiple echoes.",
    "circuit": "Hardware delays have used tape loops, bucket-brigade delay lines, and digital memory. A delay stores recent samples and reads them back later; a feedback path sends some of the delayed output around again. Filtering the loop progressively darkens repeats, as tape and many analogue delays do.",
    "use": "Delay creates discrete echoes, rhythmic repetitions, and a sense of space. Time sets the gap between repeats, feedback sets how many are heard, and mix balances the dry signal with the delayed one.",
    "implementation": "OMNI uses a digital delay line with a filtered feedback path and a mix stage. Its time CV input modulates delay time; large or rapid changes can alter the pitch of the delayed signal."
  },
  "reverb": {
    "summary": "Creates the dense pattern of reflections heard when sound continues in a room after its source stops.",
    "circuit": "Spring and plate reverbs use mechanical transducers and vibrating metal elements. Digital reverbs instead combine delay lines, all-pass sections, and feedback networks to create many closely spaced reflections; damping reduces high-frequency energy over time to imitate absorption by room surfaces.",
    "use": "Reverb places a dry sound in an apparent acoustic space and lengthens its decay. Size controls the perceived decay scale, damping controls how quickly high frequencies fade, and mix controls the amount of ambience.",
    "implementation": "OMNI generates a stereo digital reverberation network with size, damping, and wet/dry controls. It does not model the physical transducers of a spring or plate unit."
  },
  "distortion": {
    "summary": "Adds harmonics by driving audio through a nonlinear transfer curve.",
    "circuit": "Analogue distortion can come from overdriving tube or transistor gain stages, or from clipping diodes that limit the voltage swing. Soft clipping rounds the waveform; hard clipping cuts it more abruptly. Wavefolding reflects the waveform back on itself, creating additional harmonics through a different nonlinearity.",
    "use": "Distortion adds grit, sustain, and harmonic density. It can make a quiet source more prominent or radically change its timbre; tone filtering shapes the added high-frequency energy.",
    "implementation": "OMNI applies selectable digital transfer curves for soft clip, hard clip, wavefold, and tube-style saturation, followed by tone and level controls. The tube option is a model, not a physical valve stage."
  },
  "bitcrusher": {
    "summary": "Reduces digital resolution to create stepped, aliased, or deliberately lo-fi sound.",
    "circuit": "A digital converter represents amplitude with a finite number of bits and time with a finite sample rate. Lower bit depth increases quantization error; lowering the effective sample rate holds each sample for longer and can introduce aliasing. Early digital samplers made these limits part of their sound.",
    "use": "Bit reduction adds grain and harshness, while sample-rate reduction creates rough high-frequency folds and a more obviously stepped texture. It is common in lo-fi effects and retro game-style sound design.",
    "implementation": "OMNI quantizes samples to the selected bit depth and shapes the signal before output. The block is a digital effect; it does not emulate a specific vintage converter's analogue input or reconstruction filters."
  },
  "compressor": {
    "summary": "Automatically reduces gain when an audio signal rises above a chosen level.",
    "circuit": "A compressor has a level detector, an envelope or RMS measurement circuit, and a variable-gain element. The detector compares signal level with a threshold; attack and release set how quickly gain reduction follows changes. Analogue designs may use a VCA, FET, optocoupler, or variable-mu tube stage.",
    "use": "Compression controls peaks and reduces dynamic range. A high ratio and fast attack can restrain transients, while slower timing can preserve an initial attack; make-up gain restores the average output level after reduction.",
    "implementation": "OMNI uses a digital dynamics processor with threshold, ratio, attack, release, and make-up gain controls. Those controls describe compressor behaviour, not a specific analogue compressor topology."
  },
  "eq3": {
    "summary": "A three-band equalizer for broad low-, mid-, and high-frequency tone shaping.",
    "circuit": "An analogue three-band EQ combines low- and high-shelving networks with a peaking midrange filter. Active op-amp stages provide gain or attenuation around each frequency region. Digital EQs implement comparable frequency responses with cascaded filter coefficients.",
    "use": "The low shelf adjusts bass weight, the mid band changes the body or presence of a sound, and the high shelf adds or removes brilliance. Broad bands are useful for correcting a patch without redesigning its source.",
    "implementation": "OMNI uses digital shelf and peaking filters. The mid-frequency control moves the centre of the mid band; the three gain controls set boost or cut."
  },
  "ringMod": {
    "summary": "Multiplies two audio signals to create sum- and difference-frequency components.",
    "circuit": "A classic ring modulator uses a balanced four-quadrant multiplier, often built from diode rings or an analogue multiplier IC. Multiplication suppresses much of the original carrier content and produces sidebands at the sum and difference of the input frequencies. The name comes from the ring arrangement in early diode circuits.",
    "use": "Ring modulation creates metallic, bell-like, clangorous, and inharmonic sounds. It is different from ordinary amplitude modulation because the balanced multiplier can suppress the unmodulated carrier.",
    "implementation": "OMNI multiplies the input by either an internal oscillator or a second audio input, with a wet-level control. The digital multiplier reproduces the signal relationship, not a diode-ring circuit's electrical behaviour."
  },
  "formant": {
    "summary": "A bank of resonant peaks that emphasizes vowel-like spectral shapes.",
    "circuit": "Human vowel sounds are shaped by resonances of the vocal tract called formants. A formant filter approximates these with several band-pass resonators at chosen centre frequencies and bandwidths. Analogue vocoders and speech synthesizers use filter banks or resonant networks to impose these spectral peaks on a source.",
    "use": "Changing the resonant peaks from one vowel position to another makes a synthesizer sound more vocal. It works especially well with harmonically rich oscillators, noise, and other broad-spectrum sources.",
    "implementation": "OMNI uses three resonant frequency bands for five vowel settings and accepts a CV input for vowel movement. It is a fixed-formant effect, not a complete speech synthesizer or a physical vocal-tract model."
  },
  "panner": {
    "summary": "Places a mono signal between the left and right channels of a stereo output.",
    "circuit": "A hardware panner is usually a pair of controlled gain stages feeding left and right buses. An equal-power pan law adjusts the two gains so that perceived loudness remains more consistent as the signal moves across the stereo field.",
    "use": "Panning separates sounds in a stereo mix and can create movement when controlled by an LFO or envelope. The centre position is shared by both channels; the ends place the signal fully left or right.",
    "implementation": "OMNI uses a stereo panner with a pan CV input and adjustable modulation depth. It controls channel gains rather than physically moving a sound source."
  },
  "phaser": {
    "summary": "A moving series of phase shifts creates the notches that give a phaser its sweeping character.",
    "circuit": "Analogue phasers use cascaded all-pass filter stages. Each stage changes phase over a frequency range while keeping amplitude relatively flat; mixing the shifted signal with the dry signal creates frequency cancellations. An LFO sweeps the all-pass poles, moving the notches. Feedback can deepen the resonant peaks between them.",
    "use": "Phasing adds a hollow, swirling movement to sustained tones, chords, and guitars. More stages create more notches; rate sets sweep speed, depth sets excursion, and mix sets the strength of the effect.",
    "implementation": "OMNI builds a digital all-pass phaser with selectable stage count and an internal LFO. The stages approximate the classic analogue signal path without reproducing a particular pedal's components."
  },
  "tremolo": {
    "summary": "A repeating variation in amplitude, controlled by a low-frequency oscillator.",
    "circuit": "A tremolo circuit can use a VCA or an optically controlled attenuator driven by an LFO. The LFO waveform determines the shape of the volume change: a sine gives a smooth swell, while a square wave switches more abruptly between levels.",
    "use": "Tremolo produces pulsing or throbbing volume changes. It is an amplitude effect, unlike vibrato, which changes pitch.",
    "implementation": "OMNI applies a waveform-controlled gain to the audio input. Rate sets the pulse speed, depth sets the amount of level variation, and shape selects the LFO waveform."
  },
  "comb": {
    "summary": "A short delay with feedback that creates a regularly spaced series of resonant peaks and notches.",
    "circuit": "A feedforward or feedback comb filter combines a signal with a delayed copy. The delay time determines the spacing between resonances; feedback controls how strongly the pattern rings. A damping filter limits high-frequency energy in the feedback loop.",
    "use": "Tuned comb filters can make a source ring like a string, tube, or resonant object. Changing the delay time moves the resonant frequencies; tracking the delay to a played note keeps the ringing pitch related to the keyboard.",
    "implementation": "OMNI uses a feedback delay network with frequency, feedback, and damping controls. The note input can tune the resonator to incoming pitch; it is a digital resonator, not a physical tube or string."
  },
  "crossfader": {
    "summary": "Blends two audio sources by changing their relative gain.",
    "circuit": "A crossfader is built from two variable-gain paths controlled in opposite directions. A linear law keeps the sum of the gains constant; an equal-power law uses a curved relationship to keep perceived loudness more even when the sources are uncorrelated.",
    "use": "Crossfading moves smoothly between two oscillators, textures, or effect returns. A control voltage can automate the blend, making it useful for morphing between timbres.",
    "implementation": "OMNI applies complementary gain to inputs A and B and accepts a position CV. The position control determines which source dominates; the block is a digital gain crossfade."
  },
  "sampleHold": {
    "summary": "Samples a changing or random voltage at intervals and holds each value until the next trigger.",
    "circuit": "An analogue sample-and-hold uses an electronic switch to charge a capacitor to the input voltage, then isolates it so the voltage remains approximately constant. A buffer prevents the capacitor from discharging too quickly; real circuits have droop, switching transients, and finite acquisition time.",
    "use": "A sample-and-hold turns a smooth or random source into stepped modulation. Applied to oscillator pitch it creates random-note patterns; applied to filter cutoff it produces stepped timbral changes.",
    "implementation": "OMNI generates a random value at the selected rate and holds it between updates. Depth, smoothing, and bipolar range set the CV behaviour; the module does not simulate capacitor droop or switch charge injection."
  },
  "cvUtil": {
    "summary": "Combines two control voltages with independent scaling and a final offset.",
    "circuit": "A common analogue CV utility is an op-amp summing amplifier with attenuator or inverter stages on its inputs. Positive gain raises a signal, negative gain inverts it, and a fixed reference voltage adds an offset. These functions are often combined in a modular synthesizer's utility section.",
    "use": "CV mixing lets an envelope and LFO jointly control a filter, or lets a keyboard tracking signal be shifted and scaled before it reaches an oscillator. It is the control-voltage equivalent of an audio mixer.",
    "implementation": "OMNI multiplies each CV input by its amount, adds the two results, then applies an offset. Negative amounts invert a modulation source; values outside the normal 0-to-1 range allow amplification."
  },
  "slew": {
    "summary": "Limits how quickly a control voltage can rise or fall, smoothing abrupt changes into a glide.",
    "circuit": "A basic slew limiter is an RC low-pass or an integrator with controlled charge and discharge currents. More sophisticated designs use separate rise and fall settings. In synthesizers, the same idea appears in portamento circuits and lag processors.",
    "use": "Slew smooths stepped random voltages, softens parameter changes, and creates portamento when applied to pitch CV. Longer time constants make changes more gradual.",
    "implementation": "OMNI smooths the incoming CV with a configurable time constant. It is a digital lag processor, not an analogue capacitor whose response changes with component tolerances."
  },
  "envFollower": {
    "summary": "Measures the changing loudness of an audio signal and converts it into a control voltage.",
    "circuit": "An analogue envelope follower rectifies the input so both waveform polarities become positive, then smooths the result with a capacitor and resistor. The attack and release time constants determine how closely the output follows rapid changes in level.",
    "use": "An envelope follower lets one sound control another: a kick can move a filter, a drum loop can pump a synth's volume, or a microphone signal can drive a modulation input.",
    "implementation": "OMNI extracts a smoothed amplitude envelope from the incoming audio and outputs it as CV. Sensitivity scales the detected level and speed sets the response time."
  },
  "arEnv": {
    "summary": "A simple attack-release envelope that can be triggered by notes or run repeatedly.",
    "circuit": "An AR envelope generator uses a gate or trigger to start a timed voltage rise, then a decay or release path returns the voltage to zero. Capacitor charging and discharging currents set the slopes; a loop or retrigger circuit can start another cycle automatically.",
    "use": "AR envelopes are useful for plucks, percussion, repeated modulation, and simple one-shot control shapes. They are less flexible than ADSR because there is no separately adjustable sustain level.",
    "implementation": "OMNI generates an attack and release CV on each gate. In loop mode it repeats the cycle without note triggers; the output can control a VCA or filter."
  },
  "lfo2": {
    "summary": "An LFO with an additional DC offset and a gate-controlled fade-in of its modulation depth.",
    "circuit": "The underlying LFO uses the same oscillator principle as other modulation generators. A separate envelope or gain stage scales its output from zero to the selected depth after a gate arrives; an offset adds a steady control voltage to the moving waveform.",
    "use": "Fade-in prevents modulation from appearing at full strength immediately after a note begins. Offset lets the modulation move around a raised or lowered baseline, useful for filter and pitch modulation.",
    "implementation": "OMNI combines a digital waveform, depth ramp, and constant offset. A note gate retriggers the fade; the output is a CV signal."
  },
  "clock": {
    "summary": "A tempo-based trigger source that emits evenly spaced note or gate events.",
    "circuit": "A hardware clock may use a relaxation oscillator, timer IC, or microcontroller. A divider or counter derives rhythmic subdivisions from the master pulse; gate-shaping logic sets how long each output remains active.",
    "use": "A clock synchronizes sequencers, arpeggiators, and rhythmic modulation. Tempo sets the pulse rate, while division selects the rhythmic spacing between note events.",
    "implementation": "OMNI schedules events against the Web Audio clock, using tempo, beat division, note number, and gate length. It outputs timed note events rather than an electrical trigger voltage."
  },
  "euclid": {
    "summary": "Generates a rhythm by distributing a chosen number of hits as evenly as possible across a repeating step cycle.",
    "circuit": "The Euclidean rhythm algorithm is a digital pattern-generation method, not a particular analogue circuit. A counter advances through the steps and a rule based on the step and hit counts decides whether to emit a trigger. Rotation shifts the resulting pattern's starting point.",
    "use": "Euclidean patterns produce evenly distributed rhythms found in many musical traditions. Changing the number of steps and hits moves between sparse and dense patterns without programming every step by hand.",
    "implementation": "OMNI computes the hit positions for each step and emits note triggers on the selected note. Tempo and gate length determine timing; rotate shifts the pattern."
  },
  "randomNotes": {
    "summary": "Creates a probabilistic stream of notes, optionally constrained to a musical scale and range.",
    "circuit": "Random note generators in hardware use a noise source followed by sample-and-hold and quantization, or a digital pseudo-random number generator. A quantizer maps the random value to allowed pitch steps; a clock determines when a new value is chosen.",
    "use": "Random sequences add variation to a repeating patch. Scale and root keep notes within a tonal collection, range controls register, and density determines how often a step produces a note.",
    "implementation": "OMNI uses a digital random generator, scale lookup, and tempo scheduler to emit note events. It is deterministic only to the extent of its current random sequence; it does not produce an analogue noise voltage."
  },
  "arpeggiator": {
    "summary": "Cycles through held notes in a selected order, turning a chord into a repeating note pattern.",
    "circuit": "A hardware arpeggiator stores the notes currently held, advances a counter on each clock tick, and selects the next note according to an order rule. Digital instruments implement the note memory and order logic in firmware; the clock and gate generator set the rhythm.",
    "use": "Arpeggiators create repeating up, down, up-down, or random patterns from a held chord. Octave range expands the note pool and gate length controls note overlap.",
    "implementation": "OMNI tracks incoming held notes and schedules the chosen note order at the selected tempo and division. It emits note events for downstream oscillators or instrument voices."
  },
  "chord": {
    "summary": "Turns each incoming note into several simultaneous notes at programmable semitone intervals.",
    "circuit": "A chord generator is normally a digital note-processing function rather than an audio circuit. A processor receives a MIDI note number, adds stored interval values, and sends the resulting note events to separate voice channels. Older analogue systems achieved related results with pitch-voltage circuitry and multiple oscillators, but accurate interval generation is easier in digital control logic.",
    "use": "The module creates fixed-interval chords from single-note input. Each output is a separate voice, so downstream sound modules can use different timbres or levels for each chord tone.",
    "implementation": "OMNI adds up to seven programmable intervals to each incoming MIDI note and exposes one note output per active voice. Its interval settings are in semitones and can span more than two octaves."
  },
  "noteUtil": {
    "summary": "Processes note data by transposing pitch and changing note velocity before forwarding it.",
    "circuit": "This is a digital control function rather than an analogue audio circuit. A MIDI processor edits note-number and velocity fields in incoming note messages, then forwards the modified message while preserving note-on and note-off timing.",
    "use": "Transpose shifts a part into another register or key. Velocity scaling changes how strongly a downstream voice responds, while fixed velocity makes every note use the same dynamic level.",
    "implementation": "OMNI applies the transpose and velocity settings to incoming note events. Because the module handles event data rather than audio, connect it between a note source and a sound-producing module."
  },
  "noteEcho": {
    "summary": "Repeats note events after timed intervals, with optional velocity decay and pitch changes.",
    "circuit": "A note echo is a digital event scheduler. It stores the incoming note and schedules later note-on and note-off messages using a timer or clock. Each repeat can update velocity and pitch before it is sent; it does not create echoes by delaying an audio waveform.",
    "use": "Note echo creates repeated phrases that retrigger a synthesizer voice. Velocity decay makes later notes softer, while pitch-per-repeat can create rising or falling sequences.",
    "implementation": "OMNI schedules additional note events from each incoming note, using the selected delay, repeat count, velocity decay, and interval shift. Connect its note output to an oscillator or instrument voice."
  }
};

export function assertModuleInfoCoverage(moduleCatalogue) {
  const types = Object.keys(moduleCatalogue || {});
  const missing = types.filter((type) => {
    const page = MODULE_INFO[type];
    return !page || !['summary', 'circuit', 'use', 'implementation'].every((field) => typeof page[field] === 'string' && page[field].trim());
  });
  const stale = Object.keys(MODULE_INFO).filter((type) => !Object.prototype.hasOwnProperty.call(moduleCatalogue || {}, type));
  if (missing.length || stale.length) {
    const problems = [];
    if (missing.length) problems.push(`missing documentation: ${missing.join(', ')}`);
    if (stale.length) problems.push(`unknown module documentation: ${stale.join(', ')}`);
    throw new Error(`OMNI module reference is incomplete (${problems.join('; ')}). Add or remove entries in js/omni/moduleInfo.js with the module catalogue.`);
  }
  return true;
}
