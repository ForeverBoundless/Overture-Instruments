# Overture Instruments

Overture Instruments is a browser-based collection of free keyboard emulators, available at [overture-instruments.vercel.app](https://overture-instruments.vercel.app).

The project is owned by **Michael Carpiano**, founder and owner of Overture Instruments. It is a product of his mind, developed as an independent creative and technical project for musicians, producers, and anyone who enjoys exploring classic keyboards ideas in the browser.

## Features

- Playable browser-based keyboard interfaces
- On-screen keyboards, pitch wheels, modulation wheels, and expressive controls
- Computer-keyboard note input where supported
- Web MIDI support for compatible external controllers
- Factory preset banks and user preset storage
- Real-time synthesis powered by the Web Audio API
- Instrument-specific signal paths, modulation, envelopes, filters, and visual feedback
- A growing instrument library with dedicated emulator experiences

## Current Instruments

- **Little Phatty Stage Edition**: a monophonic 37-key emulator with dual oscillators, a ladder-style filter, envelopes, modulation, factory presets, user preset storage, computer-keyboard input, and MIDI input (LP Stage II CC map).
- **Sub 37 Bob Moog Tribute Edition**: a mono / two-note paraphonic emulator with dual oscillators, modulation, envelopes, presets, pitch and modulation wheels, a playable 37-key interface, and MIDI input (including the Sub 37 CC map and MIDI-clock arpeggiator sync).
- **Sequential Prophet-10**: a ten-voice, bi-timbral (stack/split) emulation of the Rev4 with an AudioWorklet engine (band-limited oscillators with hard sync, Poly-Mod, Rev 1/2 and Rev 3 filter models, Vintage voice variation), the 200 original factory programs, a faithful front panel, programmer and globals, and full MIDI (CC/NRPN parameter maps, bank select, SysEx program files).
- **Nord C2D**: a red dual-manual organ interface with two independent 37-key manuals and complete drawbar banks, percussion units, stops and couplers, and Leslie-inspired vibrato.
- **Yamaha DX7** (`/html/yamaha-dx7`): six-operator FM in an AudioWorklet - all 32 algorithm topologies (data-driven, with a live algorithm diagram), per-operator 4-rate/4-level envelopes, ratio or fixed frequency, detune, feedback, velocity and rate scaling, global LFO with pitch/amplitude modulation, pitch bend, sustain, 16 voices with voice stealing. Eleven original voices, user voices with JSON import/export.
- **Roland Juno-106** (`/html/roland-juno-106`): six DCO voices (band-limited saw + PWM pulse, sub-oscillator, noise), the four-position HPF, a resonant 4-pole low-pass (TPT ladder model), one ADSR for filter and amplifier, LFO with delay, portamento, and a stereo BBD-style chorus with Off / I / II.
- **Roland TR-808** (`/html/roland-tr-808`): twelve instrument lanes with the original instrument-select variants (tom/conga, rim shot/claves, clap/maracas), every voice synthesized from oscillators, noise and filters, accent, 16/32-step sequencer scheduled on the AudioContext clock (40-300 BPM), pattern memory with JSON export/import, GM drum-note MIDI input and MIDI start/stop/clock transport.
- **Korg MS-20** (`/html/korg-ms-20`): monophonic semi-modular with two VCOs (incl. ring modulation and noise), the high-pass → low-pass filter pair with saturation and self-oscillation, EG1 (delay/attack/release), EG2 (hold/attack/decay/sustain/release), modulation generator, sample & hold, an external signal processor (optional microphone input, local only, envelope follower and trigger - no pitch-to-CV), and a patch panel whose cables genuinely re-route control and audio signals inside the engine.

## OMNI (`/omni`)

A modular instrument designer. Modules: Keyboard & MIDI, Oscillator, Noise, Mixer, Filter, Envelope, LFO, VCA, Audio Output, Step Sequencer, plus instrument-derived Moog Ladder Filter (reusing `js/engine/LadderFilter.js`), MS-20 Dual Filter, Juno Chorus and DX7 FM Voice (reusing the DX7 worklet). Ports carry audio, control voltage (audio-rate AudioParam modulation) or note events; connections are validated for signal type, duplicates, single output module and audio feedback loops. Patches are saved locally (versioned schema 1), exported/imported as JSON, and exported as an SVG schematic. See `js/omni/modules.js`, `js/omni/graph.js`, `js/omni.js`.

Limitations: note handling is monophonic per keyboard module (last note wins); structural edits rebuild the audio graph (a brief gap in sound); CAD export (DXF/STEP) is not implemented - the SVG schematic and the stable module/port ids are the groundwork for it.

## Overture Experiments (`/experiments`)

Four labs sharing one kit (`js/experiments/labs.js`): Oscillator Lab, Filter and Resonance Lab, Envelope Lab and FM Synthesis Lab. Each plays real audio, labels plots as *measured* (AnalyserNode) or *theoretical* (computed from settings), and includes explanations and guided tasks. Audio starts only on Play or a key press.

## Controls

Use the on-screen keyboard or connect a compatible MIDI controller to play. The Prophet-10 receives on all channels by default (selectable in Globals) and supports pitch bend, mod wheel, CC4/7/11/74, sustain, channel and poly pressure, bank select + program change, and its CC/NRPN parameter maps. The Little Phatty and Sub 37 respond to their hardware CC maps. The Nord C2D routes MIDI channel 1 to the upper/Swell manual, channel 2 to the lower/Great manual, and channel 3 to the lower manual when its Great split is enabled.

Audio starts through each instrument's power control. MIDI access may require browser permission and is best supported in Chromium-based browsers.

## Architecture notes

- Static site: HTML, CSS and native ES modules, no bundler. `vercel.json` enables clean URLs (`/html/yamaha-dx7`, `/omni`, `/experiments/oscillator-lab`).
- Shared kit for the newer instruments: `css/panel.css`, `js/shared/panel.js` (sections, knobs, buttons, display, keyboard + wheels + computer keys + MIDI with pending notes, preset bar), `js/shared/presetStore.js` (versioned localStorage, validated JSON import/export), `js/shared/workletEngine.js` (AudioContext + AudioWorklet lifecycle).
- Engines: `js/engine/DX7Processor.js`, `JunoProcessor.js`, `MS20Processor.js`, `Prophet10Processor.js` (AudioWorklets); `TR808Engine.js` (scheduled Web Audio nodes); the original Little Phatty / Sub 37 / Nord engines are unchanged in architecture.
- MIDI: `js/engine/MidiManager.js` decodes all channel-voice messages plus clock/start/stop, bank select, 14-bit CC and RPN/NRPN, and fails gracefully without Web MIDI.
- Local testing: `node harness.mjs` / `node interact.mjs` (Little Phatty smoke/interaction tests). Serve the folder with any static server that maps extensionless URLs to `.html`.

Presets in the newer instruments are original Overture sounds; they are not manufacturer factory data. Each emulation is an independent approximation of the hardware's architecture, not a circuit-level reproduction.

## Legal Notice

Overture Instruments is an independent, unofficial project and has no affiliation with, endorsement from, sponsorship by, or licensing relationship with Moog Music Inc., Roland Corporation, Sequential LLC, Yamaha Corporation, Marion Systems LLC, Focusrite Audio Engineering Limited, KORG INC., or any other manufacturer or brand referenced by the project.

The instruments in this project are independently developed software emulations. They are not original manufacturer software and are not official versions of any referenced instrument.

**Moog®, Roland®, Sequential®, Oberheim®, Novation®, NORD®, KORG® and Yamaha®** are trademarks or registered trademarks of their respective owners. Overture Instruments does not claim ownership of any referenced trademarks, product names, logos, trade dress, or other intellectual property belonging to their respective owners.

Product names and brand references are used for identification and descriptive purposes only.
