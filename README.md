# Overture Instruments

### Sound without limits.

**Free, browser-based instrument emulators and creative tools for anyone who wants to explore sound.**

[Open Overture Instruments](https://overture-instruments.vercel.app/) · [Instrument library](https://overture-instruments.vercel.app/library) · [OMNI](https://overture-instruments.vercel.app/omni) · [Experiments](https://overture-instruments.vercel.app/experiments) · [Source code](https://github.com/ForeverBoundless/Overture-Instruments)

---

## About the project

Overture Instruments is an independent creative and technical project founded and developed by **Michael Carpiano**. It brings synthesizers, keyboards, organs, rhythm machines, and sound-design tools into the web browser. The software is free to use, and the source code is publicly available so people can inspect it, learn from it, adapt it, and contribute to its development.

Specialised musical hardware and commercial software can be expensive. Overture explores a more accessible approach: build interactive software versions of distinctive instruments, then let people play them and experiment with their controls without needing to own the original equipment. The project also goes beyond emulation through **Overture OMNI**, a modular instrument-design workspace, and **Overture Experiments**, a set of hands-on sound laboratories.

Overture is a work in progress. Its models are independently implemented in software and aim to capture useful parts of each instrument's architecture and behaviour; they are not claims of exact electrical or sonic duplication of the original hardware.

## Project principles

- **Access:** The tools are free to use in a compatible browser. You do not need an account, a paid subscription, or the original instrument to begin exploring.
- **Open development:** The source is public. The project is designed to be inspectable and learnable, not a closed collection of black boxes.
- **Instrument-specific design:** Each emulator has its own controls and audio implementation. A semi-modular synthesizer, FM synthesizer, drum machine, and dual-manual organ should not all behave like the same generic keyboard.
- **Learning by listening:** Changing a waveform, filter, envelope, modulation route, or signal connection should produce an audible result that helps explain what the control does.
- **Independent implementation:** Overture is an unofficial project. It does not distribute the manufacturers' original instrument software, and it is not affiliated with or endorsed by the referenced companies.

## What's included

| Area | What it does |
| --- | --- |
| **Instrument library** | Eight browser-based instruments, each with its own interface and sound engine. |
| **OMNI** | A modular workspace for assembling an instrument from sound sources, processors, modulation, and performance modules. Patches can be played, saved locally, and exported as JSON or SVG schematics. |
| **Experiments** | Eight interactive laboratories for learning about waveforms, filters, envelopes, FM, harmonics, beats, time-based effects, and modulation. |
| **Performance input** | On-screen keyboards and computer-keyboard controls where implemented, plus Web MIDI input for compatible controllers. MIDI features differ by instrument. |
| **Sound design** | Oscillators, filters, envelopes, LFOs, modulation, instrument-specific processing, and preset or pattern management where supported. |

---

## Instrument library

The current library contains eight instrument emulators. The sound-generation models are implemented in Overture's JavaScript audio code; the interface and feature set vary by instrument.

### Moog Little Phatty Stage Edition

A 37-key monophonic synthesizer focused on two-oscillator subtractive synthesis. Its signal path combines two oscillators and a noise source with a mixer, ladder-style filter, amplitude and filter envelopes, LFO modulation, glide, pitch bend, and a master output stage. Oscilloscope and spectrum displays provide visual feedback while you shape a sound. The interface includes a 100-entry program collection and user-preset management, including saving, renaming, deleting, importing, and exporting patches.

### Moog Sub 37 Bob Moog Tribute Edition

A 37-key mono / two-note paraphonic performance synthesizer with two main oscillators, sub-oscillator and noise mixing, a resonant ladder-style filter, two LFOs, two modulation busses, and extended DAHDSR envelopes. It also includes an arpeggiator, a 64-step sequencer, glide, pitch and modulation controls, and a 256-slot program interface. The current program data includes generated parameter recipes; the slot count should not be interpreted as 256 verified copies of original factory patches.

### Sequential Prophet-10 Rev4

A ten-voice polyphonic synthesizer emulation with a dual-oscillator architecture, voice allocation, filter and amplifier envelopes, Poly-Mod and Wheel Mod, tuning variation, glide, pitch bend, modulation, velocity and aftertouch response. Performance features include chord memory and unison, stack, and split modes. The user interface exposes 400 program slots across its banks, along with instrument settings and MIDI program handling. The number of slots is not a guarantee that every program is an authenticated reproduction of an original hardware patch.

### Nord C2D

A dual-manual organ with two 37-key manuals and independent registrations. Four sound models cover tonewheel-style B3, VX-style and Farfisa-style combo organs, and a pipe-organ model. Controls include drawbars, percussion and vibrato, rotary-speaker-inspired modulation, pipe stops and couplers, tremulant, pedal-related settings, and registration controls. MIDI channel routing supports separate manual performance: channel 1 controls the upper/Swell manual, channel 2 the lower/Great manual, and channel 3 can play the lower manual when its split is enabled.

### Yamaha DX7

A 16-voice, six-operator FM synthesizer. Rather than building its sound around a conventional subtractive filter, it uses six sine-wave operators that can modulate one another through 32 algorithm topologies. The interface exposes each operator's frequency mode, level, feedback-related settings, and four-rate/four-level envelope, with an algorithm diagram to show the selected routing. LFO modulation, velocity response, pitch bend, modulation wheel, aftertouch, and sustain are also supported. The library currently supplies 11 original Overture voices rather than claiming to reproduce the DX7's entire historical sound library.

### Roland Juno-106

A six-voice DCO polysynth model with saw and pulse waveforms, pulse-width modulation, a sub-oscillator, noise, a four-position high-pass filter, a resonant low-pass filter, and an envelope that shapes filter and amplifier behaviour. Stereo chorus modes I and II are included. The page provides 11 original Overture patches and browser-local patch storage.

### Roland TR-808

A rhythm machine whose percussion is synthesized in real time rather than played from a library of recorded drum samples. The instrument includes bass drum, snare, toms or congas, rim shot or claves, hand clap or maracas, cowbell, cymbal, open hat, closed hat, and accent controls. Its sequencer supports 16- or 32-step patterns, tempo from 40 to 300 BPM, accented steps, pattern memory, and MIDI clock transport. It can also respond to supported General MIDI drum-note input. The included pattern collection consists of original Overture patterns.

### Korg MS-20

A monophonic semi-modular synthesizer with two oscillators, ring modulation, a high-pass filter followed by a low-pass filter, two envelope generators, a modulation generator, sample and hold, portamento, and a patch panel whose cables change signal routing. Its External Signal Processor accepts audio input and includes envelope-related processing and a pitch-tracking path. When explicitly enabled, microphone input can be analysed for a clear, sustained voiced fundamental and converted to pitch CV, which can then be patched to the oscillator pitch input. This is monophonic pitch tracking, not speech recognition; results depend on the input signal and tracking conditions. The library includes 10 original Overture patches and user patch management.

### Preset and program counts

Counts shown in the interface describe the current application data and program slots. They do not automatically mean that every entry is an exact or verified copy of a manufacturer's original factory preset. Where a collection is labelled as an original Overture patch, voice, or pattern, it is a configuration created for this project.

---

## Overture OMNI

**OMNI is a browser-based modular instrument designer.** Instead of starting with a finished instrument panel, you assemble a sound system from functional modules and connect their inputs and outputs on a patch canvas.

The current catalogue contains more than 40 module types grouped around performance, sources, processing, modulation, instrument-specific modules, and output. Examples include:

- **Sound sources:** oscillators, noise, sub-oscillator, supersaw, additive oscillator, plucked-string voice, drum voice, and FM sources.
- **Processing:** mixers, filters, amplifiers, delay, reverb, distortion, bitcrushing, compression, EQ, ring modulation, phasing, panning, crossfading, and resonators.
- **Modulation and control:** ADSR and AR envelopes, LFOs, sample and hold, CV mixing and offset, slew limiting, and envelope following.
- **Performance and sequencing:** keyboard and MIDI input, step sequencing, clocks and triggers, Euclidean rhythm, random melody, arpeggiation, chords, note transposition and velocity processing, and note echo.
- **Instrument-derived modules:** models inspired by the Moog ladder filter, MS-20 dual filter, Juno chorus, and DX7 FM voice.

OMNI distinguishes between **audio**, **CV (control-voltage/audio-rate control)**, and **note-event** connections. Connection checks prevent incompatible port types and block unsupported audio/CV feedback loops. The live graph is built with the Web Audio API, while selected instrument-derived modules reuse Overture's audio engines.

You can add, move, duplicate, and remove modules; connect or disconnect ports; edit module parameters; play the patch from the on-screen keyboard or a compatible MIDI controller; and map MIDI CCs to available controls. OMNI also includes starter patches and a preset store.

Patches can be saved in the browser, imported or exported as JSON, and exported as an SVG schematic. **Native CAD export is a future development goal, not a current feature.** The SVG schematic export is an early step toward making patch designs easier to document and potentially use in other tools.

[Open OMNI](https://overture-instruments.vercel.app/omni)

---

## Overture Experiments

Overture Experiments is a collection of eight small, hands-on sound laboratories in the spirit of interactive science simulations. Each lab encourages you to change a small number of parameters, hear what happens, and connect the result to a visual representation of the signal. No musical background or MIDI controller is required.

| Experiment | Concepts explored |
| --- | --- |
| **Oscillator Lab** | Sine, triangle, square, and sawtooth waveforms; frequency, amplitude, pitch, and spectrum. |
| **Filter and Resonance Lab** | Low-pass, high-pass, and band-pass filtering; cutoff, resonance, filter response, and modulation. |
| **Envelope Lab** | Attack, decay, sustain, and release, with the envelope display tied to the parameters shaping the sound. |
| **FM Synthesis Lab** | Carrier and modulator relationships, frequency ratios, modulation depth, and sidebands. |
| **Harmonics Lab** | Additive synthesis using eight sine-wave components and the relationship between partials and waveform shape. |
| **Beats and Tuning Lab** | Beating between close frequencies, detuning, tuning by ear, and roughness. |
| **Echo and Reverb Lab** | Delay time, feedback, wet/dry mix, and the decay of a simulated acoustic space. |
| **Modulation (LFO) Lab** | Using a low-frequency oscillator for vibrato, tremolo, and filter movement. |

The labs run directly in the browser. Audio starts in response to a user action such as pressing Play or playing a key. Visualisations are based on measured audio where marked as measured; theoretical plots are calculated from the relevant parameters.

[Explore Experiments](https://overture-instruments.vercel.app/experiments)

---

## Technical architecture

Overture is a static front-end web application built mainly with **HTML, CSS, and native JavaScript ES modules**. There is no framework build step or package installation required for the current site structure.

### Audio

The **Web Audio API** provides audio contexts, nodes, routing, filtering, gain control, and analysis. Instruments with more specialised processing use **AudioWorklet** processors to run their synthesis code in the browser's audio rendering thread. Other engines use native Web Audio nodes or a combination of the two. These are independent software models, with instrument-specific trade-offs and approximations.

The codebase includes reusable oscillator, mixer, filter, envelope, LFO, glide, and voice components, as well as dedicated engines and processors for models such as the MS-20, DX7, Juno-106, TR-808, Prophet-10, Sub 37, and Nord C2D. The UI is built from reusable controls for keyboards, knobs, wheels, displays, scopes, and spectrum views.

### MIDI

A shared MIDI input layer uses the browser's **Web MIDI API** where supported. Depending on the instrument, it can handle note events, pitch bend, modulation, sustain, aftertouch, program changes, continuous controllers, and MIDI clock. Hot-plugged devices are rescanned while the application is open. Not every instrument uses every message; consult the controls on its page for the implemented set.

A shared MIDI mapping interface lets users assign compatible physical MIDI CCs to supported knobs and sliders. These mappings are saved per instrument in browser storage.

### Presets and saved data

Reusable preset storage is built around browser `localStorage`. Supported pages can save, load, rename, delete, import, or export patches and patterns, depending on the instrument. OMNI patches, TR-808 patterns, and shared MIDI assignments also use browser-local storage. The exact controls differ between pages.

### Visual and site layer

The main pages use hand-authored HTML and CSS, with module scripts for page behaviour. Shared CSS and JavaScript provide site navigation, contact UI, performance controls, MIDI mapping, and preset utilities. Some typography is loaded from Google Fonts, and the deployed pages include Vercel Web Analytics scripts.

---

## Running the project locally

The project is served as static files. You do not need Node.js, npm, a bundler, or a build command to run the site in a local development session.

1. Clone the repository and move into it:

   ```bash
   git clone https://github.com/ForeverBoundless/Overture-Instruments.git
   cd Overture-Instruments
   ```

2. Start a local HTTP server from the repository root. For example, with Python installed:

   ```bash
   python -m http.server 8000
   ```

   On Windows installations where the Python launcher is available, `py -m http.server 8000` can be used instead.

3. Open [http://localhost:8000](http://localhost:8000) in a modern desktop browser.

Serve the project over HTTP rather than opening the files directly with `file://`. ES modules and AudioWorklet processors need an appropriate local or secure context. Microphone input and Web MIDI also depend on browser support and permission settings.

### Using an instrument

Open the library, select an instrument, and use its power or audio control to start the audio engine. You can then play with the on-screen keyboard or use the computer-keyboard mapping where available. To use an external controller, connect it before or during the session and grant MIDI access if the browser asks. Supported controls vary by instrument.

### Deployment

The repository includes a `vercel.json` configuration with `cleanUrls` enabled. The site is structured for static hosting on Vercel; the current project does not require a build command or generated output directory. For another static host, preserve the directory structure and make sure routes resolve to their corresponding `.html` pages.

## Repository structure

```text
.
├── index.html                 # Home page and project overview
├── about.html                 # Project background and founder story
├── library.html               # Instrument library shell
├── omni.html                  # OMNI modular workspace shell
├── experiments.html           # Experiments index
├── html/                      # Individual instrument page documents
├── experiments/               # Individual experiment route documents
├── css/                       # Site, library, instrument, OMNI and lab styles
├── js/
│   ├── engine/                # Audio engines, processors, MIDI and envelopes
│   ├── data/                  # Presets, programs, patterns, tuning and algorithms
│   ├── shared/                # Shared panel, MIDI map, storage, navigation utilities
│   ├── omni/                  # OMNI module catalogue, graph and templates
│   ├── experiments/           # Shared implementation for the eight sound labs
│   └── *.js                   # Page-level instrument and site controllers
├── ui/                        # Reusable controls, fonts, logos and images
├── LICENSE                    # MIT license with third-party-materials scope notes
├── README.md
└── vercel.json                # Clean URL configuration
```

The root also contains browser-interaction and harness scripts used for development workflows. They are not needed to serve the site as a static application.

## Browser support and practical notes

Use a recent desktop version of **Chrome or Microsoft Edge** for the most complete experience, particularly for Web MIDI and AudioWorklet features. Other modern browsers may support much of the Web Audio functionality, but MIDI support varies by browser, operating system, and device.

- **Start audio with a user gesture.** Browsers commonly prevent audio from starting until you press an instrument's power control or interact with its keyboard.
- **Grant permissions when prompted.** External MIDI access and the MS-20 microphone input require explicit browser permission.
- **Use HTTPS or localhost for device features.** Microphone input, Web MIDI, and AudioWorklet support are subject to secure-context restrictions.
- **Expect hardware differences.** Latency, CPU load, audio output, and the response of software models depend on the browser and computer.
- **Back up patches you care about.** Browser-local storage is tied to the current browser profile and site origin. Clearing site data or changing devices does not transfer saved patches automatically; export files where the relevant page supports it.

## Privacy and local data

Instrument sound generation, MIDI handling, and the storage mechanisms described above run in the browser. Overture does not require an account to use the library. Saved patches, patterns, and MIDI assignments that use `localStorage` remain in that browser profile unless you export them or clear the site's data.

The MS-20's microphone function is opt-in and requests access only when enabled. The input is connected to the in-browser audio engine for external-signal processing and pitch tracking; the instrument implementation does not include an upload step for the microphone signal. As noted above, the public site also loads external fonts and includes Vercel Web Analytics, so this should not be read as a claim that every network request made while visiting the website is local.

## Current limitations and future work

Overture is an evolving project, and its instruments do not all have identical feature sets. Sound engines are approximations, MIDI messages and preset controls differ by page, and browser behaviour affects latency and device access. Overture is currently a browser application, not a native desktop instrument or a VST/AU plug-in.

Areas for continued development include refining the sound and response of existing emulators, expanding the instrument library, growing OMNI's catalogue and patching workflow, and adding more learning experiments. Native CAD export for OMNI is a longer-term goal; current exports are JSON patches and SVG schematics.

## Contributing and feedback

Bug reports, feature ideas, documentation improvements, and code contributions are welcome through the [GitHub repository](https://github.com/ForeverBoundless/Overture-Instruments). When reporting an issue, include the page or instrument, browser and operating system, the steps that reproduce the problem, and whether it affects keyboard input, MIDI, sound generation, saved data, or the interface.

For code changes, keep the static-file structure intact unless a larger architectural change is intentional. Test the affected page through a local HTTP server and check both on-screen/computer-keyboard input and MIDI behaviour where relevant. Avoid describing a feature as universal when it only exists on selected instrument pages.

## License, trademarks, and third-party materials

Original software source code and associated documentation authored for Overture Instruments are covered by the **MIT License**; see [`LICENSE`](LICENSE) for the exact terms and scope.

The repository also references third-party brand names, logos, fonts, product names, and other materials. These may be subject to separate copyright, trademark, or licence terms. The MIT license does **not** automatically grant permission to reuse those assets. Check the terms for any third-party material before redistributing it or incorporating it into another project.

Overture Instruments is independent and unofficial. It is not affiliated with, endorsed by, sponsored by, or licensed by Moog Music, Roland, Sequential, Nord, Yamaha, Korg, Oberheim, Novation, or any other manufacturer referenced by the project. Product and company names are used for identification and descriptive purposes; all trademarks remain the property of their respective owners.

---

**Built by Michael Carpiano.** Sound without limits.
