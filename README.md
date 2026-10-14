# Overture Instruments

### Sound without limits.

**Free, browser-based keyboard and synthesizer emulators, built to make expressive instruments and the technology behind them more accessible to everyone.**

[**Open Overture Instruments**](https://overture-instruments.vercel.app/) · [**Browse the source code**](https://github.com/ForeverBoundless/Overture-Instruments)

---

## Table of Contents

- [1. About the Project](#1-about-the-project)
- [2. Project Philosophy](#2-project-philosophy)
- [3. Current Instrument Library](#3-current-instrument-library)
- [4. Instrument Details](#4-instrument-details)
- [5. Technical Architecture](#5-technical-architecture)
- [6. Audio Synthesis and Signal Processing](#6-audio-synthesis-and-signal-processing)
- [7. Input, MIDI, and Performance Controls](#7-input-midi-and-performance-controls)
- [8. Presets and Data Persistence](#8-presets-and-data-persistence)
- [9. User Interface and Visualization](#9-user-interface-and-visualization)
- [10. Browser Compatibility](#10-browser-compatibility)
- [11. Running the Project Locally](#11-running-the-project-locally)
- [12. Deployment and URL Routing](#12-deployment-and-url-routing)
- [13. Repository Structure](#13-repository-structure)
- [14. Testing and Development](#14-testing-and-development)
- [15. Privacy and Data Storage](#15-privacy-and-data-storage)
- [16. Current Limitations](#16-current-limitations)
- [17. Future Development](#17-future-development)
- [18. Contributing and Feedback](#18-contributing-and-feedback)
- [19. Copyright and Licensing](#19-copyright-and-licensing)
- [20. Trademarks and Manufacturer Independence](#20-trademarks-and-manufacturer-independence)
- [21. Third-Party Materials and Attributions](#21-third-party-materials-and-attributions)
- [22. Project Ownership](#22-project-ownership)

---

## 1. About the Project

**Overture Instruments** is an independent creative and technical project founded and developed by **Michael Carpiano**. It brings playable keyboard instruments into the browser, combining custom-designed interfaces with independently implemented audio engines, musical controls, and sound-shaping systems.

Electronic instruments have influenced music across countless genres, but access to specialised hardware and commercial software can be expensive. Overture Instruments explores a different approach: recreating aspects of the experience of playing and programming these instruments in software that can be accessed through a web browser.

The project currently includes four instrument experiences: a monophonic analogue-style synthesizer, a dual-oscillator paraphonic synthesizer, a ten-voice polyphonic synthesizer, and a dual-manual organ. Each instrument has its own interface and implementation, reflecting the differences between synthesizer and organ architectures rather than forcing every instrument into one generic interface.

The project is also intended to grow beyond conventional emulation. Future plans include **OMNI**, a proposed modular instrument-design environment, and **Overture Experiments**, a collection of interactive sound and synthesis learning tools.

### What Overture Instruments provides

- **Browser-based playability:** Explore instruments without installing a conventional desktop synthesizer application.
- **Independently implemented synthesis:** Produce sound in real time using the browser's Web Audio API.
- **Instrument-specific controls:** Work with oscillators, filters, envelopes, modulation, drawbars, percussion, and other controls appropriate to each instrument.
- **MIDI integration:** Use compatible external controllers on instrument pages that implement Web MIDI input.
- **Preset exploration:** Experiment with program collections and, where implemented, save or manage personal presets.
- **Visual feedback:** Explore graphical interfaces, control readouts, and audio visualizations alongside the sound.
- **A public development repository:** Inspect the source code, follow the project's evolution, and provide feedback through GitHub.

Overture Instruments is designed primarily as an interactive musical environment. It is not currently a conventional VST, Audio Unit, or other native DAW plug-in, nor is it intended to replace every physical instrument in every professional context.

The goal is to make the instruments and the ideas behind them easier to explore, regardless of whether someone owns the original hardware.

## 2. Project Philosophy

Overture Instruments is guided by a simple principle:

> Great musical tools should be accessible to anyone who wants to explore sound.

### Accessibility through software

A browser-based implementation eliminates the need to purchase the original instrument simply to begin experimenting with its basic concepts. A compatible browser and an audio output are enough to get started, while a MIDI controller can provide a more familiar playing experience.

### Faithful ideas, independent implementation

The project takes inspiration from the architectures, controls, and musical characteristics of established instruments. Each emulator is developed as its own software implementation rather than distributing the original manufacturer's instrument software.

The level of detail differs between models. Some functions involve comparatively direct parameter mappings, while others require approximations of analogue circuitry, organ tone generation, modulation behaviour, or performance logic.

The objective is to make each experience musically useful and recognisable, while continuing to improve its sound, response, and usability.

### Learning through interaction

The controls are not merely decorative representations of hardware. They provide a way to explore the relationships between synthesis parameters and audible results.

Changing oscillator waveforms, adjusting a filter, modifying an envelope, or routing an LFO can demonstrate how an instrument produces and shapes sound. Planned educational tools will develop this idea further.

### An evolving project

Overture Instruments is an ongoing project. The available emulators, interface designs, audio models, and development priorities may change over time. Planned features are not necessarily implemented, complete, or scheduled for a specific release.

---

## 3. Current Instrument Library

The current library contains four principal emulators.

| Instrument | Voice architecture | Keyboard | Program collection | Principal features |
|---|---|---|---|---|
| Little Phatty Stage Edition | Monophonic | 37 keys | 100-entry collection | Dual oscillators, ladder-style filter, modulation, glide, presets, audio visualization |
| Sub 37 Bob Moog Tribute Edition | Monophonic or two-note paraphonic | 37 keys | 256 program slots | Dual oscillators, two LFOs, dual modulation busses, DAHDSR envelopes, arpeggiator, step sequencer |
| Sequential Prophet-10 Rev4 | Ten-voice polyphonic | 61-key interface | 400 advertised program slots across factory and user banks | Polyphony, Poly-Mod, Wheel Mod, chord memory, split and unison modes, aftertouch |
| Nord C2D | Dual-manual organ | Two 37-key manuals | Four sound models | Tonewheel-style organ, drawbars, pipe-organ stops, couplers, percussion, vibrato, rotary effect |

*Program counts describe the current application interface and its data structures. They do not imply that every program is a verified reproduction of an original manufacturer's factory preset.*

### Choosing an instrument

- **Little Phatty:** Start here to explore a focused monophonic synthesizer, oscillator mixing, filter sweeps, modulation, and expressive lead or bass sounds.
- **Sub 37:** Explore a more elaborate monophonic and paraphonic architecture, with multiple modulation sources, extended envelopes, and sequencing-oriented performance controls.
- **Prophet-10:** Explore chords, layered or split keyboard configurations, polyphonic playing, unison, and more complex modulation.
- **Nord C2D:** Explore organ sound generation, drawbar registration, multiple organ models, and the interaction between two manuals.

The instruments are designed to be distinct experiences. Control availability, MIDI behaviour, preset management, and the degree of hardware-inspired modelling vary by implementation.

---

## 4. Instrument Details

### 4.1 Little Phatty Stage Edition

The Little Phatty emulator is a monophonic synthesizer built around a dedicated audio engine and a hardware-inspired control panel.

Its signal path combines two oscillators and a noise source, a mixer, a ladder-style filter, envelopes, modulation, and a master output stage.

**Synthesis and performance features include:**

- Two independently adjustable oscillators.
- Oscillator waveform shaping and level control.
- Oscillator detuning and frequency-ratio controls.
- Noise generation and mixing.
- A custom ladder-style filter with cutoff, resonance, and drive controls.
- Separate amplitude and filter envelopes.
- LFO-based modulation of pitch, filter cutoff, pulse width, oscillator mix, and amplitude.
- Glide and monophonic note-priority handling.
- Pitch-bend and modulation wheels.
- Velocity-sensitive note triggering.
- A master output stage with saturation and limiting.
- A 100-entry preset collection.
- User preset management, including saving, renaming, deletion, JSON import/export, and last-session restoration.
- An oscilloscope and frequency-spectrum visualization.

The application combines its own synthesis code with reusable interface components. Its signal path is implemented in the `js/engine/` directory, while `js/engine/app.js` assembles the instrument interface and connects controls to the audio engine.

The Little Phatty page also implements computer-keyboard note input and Web MIDI integration.

The oscillator and filter models are software approximations intended to provide useful musical behaviour. They should not be interpreted as a claim that the browser implementation is electrically or sonically identical to physical analogue circuitry.

### 4.2 Sub 37 Bob Moog Tribute Edition

The Sub 37 emulator uses a dedicated `Sub37Engine` instead of simply reusing the Little Phatty's performance architecture.

That distinction matters because the model supports two modulation busses, two LFOs, extended envelope behaviour, and a two-note paraphonic operating mode.

**Implemented systems include:**

- Two principal oscillators with adjustable parameters.
- Sub-oscillator and noise mixing.
- Oscillator tuning and octave-related controls.
- A ladder-style filter with adjustable slope, resonance, and drive.
- Two LFOs and configurable modulation busses.
- A modulation wheel that scales modulation behaviour.
- Separate amplitude and filter envelopes using delay, attack, hold, decay, sustain, and release stages.
- Monophonic and two-note paraphonic operation.
- Glide, pitch bend, and sustain handling.
- An arpeggiator.
- A 64-step sequencer interface.
- A 37-key on-screen keyboard and computer-keyboard note mapping.
- A collection of 256 program slots.

The arpeggiator and sequencer are managed by the instrument's application code, which schedules note events and drives the sequencer interface.

The current preset source contains program names and algorithmically generated parameter recipes. Consequently, these entries should be regarded as the project's own generated parameter configurations, not as verified, exact copies of all 256 original hardware patches.

**MIDI note input should not currently be assumed to work on this page.** Although the interface includes MIDI-oriented wording, the current Sub 37 entry script does not import the shared MIDI manager used by the Little Phatty, Prophet-10, and Nord C2D pages. This integration remains an implementation detail to verify or complete.

### 4.3 Sequential Prophet-10 Rev4

The Prophet-10 emulator uses a dedicated polyphonic engine supporting multiple simultaneous voices and a broader set of keyboard-playing modes.

Rather than treating the instrument as a single monophonic signal chain, the engine creates and manages individual voices, handles note allocation, and applies shared instrument settings across the active voices.

**Key systems include:**

- Ten-voice polyphonic operation.
- Dual-oscillator voice architecture.
- Oscillator waveform and octave controls.
- Oscillator synchronization and pulse-related settings.
- A software-modelled filter and envelope system.
- Poly-Mod and Wheel Mod controls.
- LFO-based modulation.
- Pitch bend and modulation-wheel response.
- Velocity and aftertouch routing.
- Sustain and note-hold behaviour.
- Unison, voice-stack, and keyboard-split options.
- Chord Memory functionality.
- Glide and note-priority behaviour.
- Adjustable tuning and vintage-style voice variation.
- Program switching and a factory/user program interface.
- Web MIDI support.

The Prophet-10 application imports the shared `MidiManager` and provides callbacks for translating MIDI events into engine operations. Its MIDI integration supports note events, pitch bend, modulation wheel, channel aftertouch, sustain, and program changes through the shared input layer, with the application handling the controls relevant to the instrument.

The current data source defines 200 factory-program templates and creates a corresponding set of user programs. The interface advertises 400 program slots across the two banks. These slots are not 400 independently verified reproductions of original factory sounds.

### 4.4 Nord C2D

The Nord C2D emulator takes a different approach from the synthesizers. Rather than centring its sound generation on a conventional subtractive synthesizer voice, it models organ-style harmonic structures and related performance behaviour.

It provides two independent manuals, each with its own configuration, alongside a dedicated organ engine.

**Implemented sound models:**

- **B3:** A tonewheel-organ-inspired model.
- **VX:** A model based on the characteristic harmonic structure of VX-style combo organs.
- **Farf:** A model based on Farfisa-style combo organs.
- **Pipe:** A pipe-organ-inspired model with stops and couplers.

**Principal features include:**

- Two 37-key manuals, corresponding to Swell and Great.
- Nine drawbar controls per manual.
- Independent drawbar configurations and banks.
- Percussion settings for applicable organ models.
- Vibrato controls.
- Rotary-speaker-inspired modulation.
- Pipe-organ stops and couplers.
- A tremulant control for the pipe-organ model.
- Pedal-related drawbar and bass settings.
- Great-manual split behaviour.
- Adjustable drive, reverb, and crosstalk-related characteristics.
- Organ registration and program controls.
- Web MIDI note input and channel-based manual routing.

The engine models organ harmonics through partials, with model-specific frequency ratios and amplitudes. Additional processing simulates selected characteristics such as leakage, key click, rotary modulation, and reverberation.

The MIDI implementation routes channel 1 to the upper/Swell manual and channel 2 to the lower/Great manual. Channel 3 can also route to the lower manual when the Great split is enabled.

---

## 5. Technical Architecture

Overture Instruments is currently a **client-side web application built primarily with HTML, CSS, and native JavaScript ES modules**.

There is no conventional application framework or build pipeline declared in the repository. The deployed website consists of static HTML entry points, stylesheets, JavaScript modules, and supporting assets, with audio synthesis performed by the browser.

### 5.1 HTML entry points

HTML files define each page's document structure, load the appropriate stylesheets, and import the entry-point JavaScript module.

The home page, information page, library, and individual instruments have separate entry points. Instrument-specific pages do not need to load every engine and control system used by every other model.

### 5.2 CSS styling

The `css/` directory contains both shared styles and instrument-specific styles.

Shared styles handle recurring elements, including keyboard controls, knobs, and library presentation. Individual stylesheet files define the visual character of each instrument, allowing the interfaces to use different layouts, colours, control proportions, and display treatments.

### 5.3 JavaScript ES modules

JavaScript modules divide the application into smaller systems with distinct responsibilities.

For example, the Little Phatty page imports its audio engine, MIDI manager, preset manager, and reusable interface components. The Sub 37, Prophet-10, and Nord C2D pages use their respective engine and application modules.

Native ES modules also make it possible to share utilities without introducing a separate bundling step.

### 5.4 Audio engine separation

Each instrument uses a dedicated main engine:

| Module | Purpose |
|---|---|
| `js/engine/AudioEngine.js` | Little Phatty audio context, signal path, modulation, glide, and monophonic performance behaviour |
| `js/engine/Sub37Engine.js` | Sub 37 oscillator, modulation-bus, filter, envelope, and monophonic/paraphonic logic |
| `js/engine/Prophet10Engine.js` | Prophet-10 voice allocation, polyphony, voice modes, tuning, and modulation |
| `js/engine/NordC2DEngine.js` | Dual-manual organ sound generation, drawbars, partials, registration, and organ effects |

Shared synthesis utilities and individual application scripts connect those engines to the interfaces.

### 5.5 Separation of concerns

The overall design separates four broad responsibilities:

1. **Presentation:** HTML, CSS, and reusable interface components.
2. **Input:** On-screen keyboard events, computer-keyboard events, MIDI messages, and control interaction.
3. **Synthesis and performance logic:** Note management, oscillators, envelopes, filters, modulation, and output processing.
4. **Data and persistence:** Program definitions, preset state, and browser-local storage.

This organisation makes it possible to modify a particular instrument's sound generation without necessarily redesigning the entire website.

It also allows interface components to be reused where appropriate, while preserving instrument-specific controls and behaviours.

---

## 6. Audio Synthesis and Signal Processing

### 6.1 The Web Audio API

The synthesizers use the browser's **Web Audio API** to create and connect audio-processing nodes. The audio engines use native browser audio primitives such as oscillators, gain stages, filters, waveshapers, analysers, and dynamics processors.

The exact signal path varies by instrument.

A simplified representation of the Little Phatty's principal voice is:

```text
Oscillator 1 ─┐
Oscillator 2 ─┼─> Mixer ─> Ladder-style filter ─> Amplitude stage ─> Output
Noise source ─┘                   ↑                    ↑
                            Filter envelope       Amp envelope
                                   ↑
                                  LFO
```

This is a conceptual overview, not a complete diagram of every modulation connection or output-processing stage.

### 6.2 Oscillator modelling

`js/engine/Oscillator.js` implements oscillator behaviour using native `OscillatorNode` instances and custom waveform processing.

Among its techniques are:

- Custom periodic waveforms for different oscillator shapes.
- Crossfading between oscillator waveforms to implement continuous shape changes.
- Multiple oscillator paths for pulse-width modulation.
- Detuning and small random frequency offsets to introduce variation.
- Slow drift to make oscillator behaviour less perfectly static.

These techniques provide additional control over oscillator behaviour without requiring an external synthesizer library.

### 6.3 Filter modelling

`js/engine/LadderFilter.js` implements the project's ladder-style filter system.

The filter model provides controls for cutoff, resonance, and drive, and integrates with the engine's envelope and modulation routing.

The intention is to reproduce important musical characteristics of resonant subtractive synthesis, including changes in timbre as cutoff, resonance, and modulation are adjusted.

The result is an independent software model. It is not a component-level simulation of the original manufacturer's physical circuitry.

### 6.4 Envelopes

The shared engine includes different envelope implementations for different musical requirements.

`Envelope.js` implements attack, decay, sustain, and release stages by scheduling changes to Web Audio `AudioParam` values.

`DAHDSREnvelope.js` extends that model with delay and hold stages, and supports a looping mode used by the Sub 37 implementation.

Audio parameter automation is important because the browser's audio-processing timeline is separate from ordinary page animation. Scheduling parameter changes directly allows note envelopes to proceed without depending on regular interface repaint timing.

### 6.5 Low-frequency oscillators

`LFO.js` implements a low-frequency modulation source with configurable waveform, rate, fade-in, and retrigger behaviour.

Supported waveform options include triangle, square, sine, sawtooth, reverse sawtooth, and sample-and-hold-style modulation.

Because native oscillator nodes do not directly provide every required LFO behaviour, some functions use scheduled parameter changes and custom processing.

LFOs can modulate selected synthesis parameters through gain stages that determine the depth of modulation.

### 6.6 Glide and note handling

`Glide.js` provides pitch-transition behaviour, while the instrument engines determine when glide should occur.

The Little Phatty engine includes a held-note stack for last-note-priority behaviour. The Sub 37 has its own two-note paraphonic handling, while the Prophet-10 manages individual polyphonic voices.

This engine-specific logic is important because note priority, retriggering, and voice allocation influence the performance feel of a synthesizer as much as its raw oscillator sound.

### 6.7 Output processing

Output processing differs between instruments.

The Little Phatty engine includes a soft-saturation stage and a dynamics processor intended to reduce harsh digital clipping. The Nord engine includes additional effects processing for its organ-oriented signal path, including drive and reverberation.

These are safeguards and sound-shaping stages, not a guarantee that every browser, audio device, or configuration will be free of audible distortion under every possible condition.

---

## 7. Input, MIDI, and Performance Controls

### 7.1 On-screen keyboard

The reusable keyboard component in `ui/Keyboard.js` provides a playable visual keybed.

It supports mouse and touch interaction, note-event callbacks, and visual highlighting. Application-level code can also activate keys in response to computer-keyboard and MIDI input.

The component primarily handles interface interaction. It does not generate sound itself.

### 7.2 Computer-keyboard input

Several instrument pages map physical computer keys to musical notes, allowing a player to test sounds without an external controller.

The mapping uses familiar note-row patterns, including keys assigned to natural notes and intervening accidentals. Exact mappings and supported performance controls depend on the individual instrument page.

A computer keyboard is useful for exploration, but it is not equivalent to a full-size piano keyboard in range, velocity sensitivity, or simultaneous key handling.

### 7.3 Web MIDI

The shared MIDI input implementation is contained in `js/engine/MidiManager.js`.

It uses the browser's Web MIDI API to request MIDI access and listen for messages from connected input devices. It also monitors device changes so that newly connected controllers can be detected without restarting the page.

The common input layer handles MIDI message types including:

- Note On and Note Off.
- Pitch bend.
- Control Change.
- Program Change.
- Channel aftertouch.
- Sustain, modulation-wheel, and volume controls.
- All Notes Off messages.

The application determines which messages have meaning for a specific instrument and translates them into the relevant engine operations.

Web MIDI is **not uniformly implemented across all four instruments**. The Little Phatty, Prophet-10, and Nord C2D currently connect to the shared MIDI manager. The current Sub 37 page still requires MIDI integration to be added or verified.

### 7.4 MIDI channel routing

The Nord C2D uses MIDI channel numbers to distinguish manual input:

| MIDI channel | Behaviour |
|---|---|
| 1 | Upper/Swell manual |
| 2 | Lower/Great manual |
| 3 | Lower/Great manual when the Great split is enabled |

Other instruments have their own MIDI handling and voice-management behaviour.

### 7.5 Expressive controls

The shared interface includes pitch and modulation wheels. Their interaction models differ according to their purpose.

The pitch wheel returns to its centre position after release. The modulation wheel holds its position until another input changes it.

These controls can receive input from mouse interaction and, on the relevant pages, from computer-keyboard or MIDI events.

---

## 8. Presets and Data Persistence

Preset data is stored in JavaScript modules under `js/data/`, while engine and application modules implement the behaviour needed to load, display, modify, and retain program settings.

Preset functionality is instrument-specific rather than a single uniform system.

### Little Phatty

`js/data/presets.js` contains the 100-entry program collection.

`PresetManager.js` applies parameter patches to the active engine and provides user-preset operations including saving, renaming, deleting, importing, and exporting JSON. It also stores information about the most recently selected program source and identifier.

User preset data and last-session information are stored using `localStorage`.

### Sub 37

`js/data/sub37Presets.js` defines 256 program slots and constructs their parameter configurations from recipes based on musical characteristics and preset names.

The current implementation should not be described as containing a verified, bit-for-bit reproduction of all original factory patch data. Its preset-generation approach is part of the project's software implementation.

Preset saving and persistence should be assessed separately from the Little Phatty's more developed preset manager.

### Prophet-10

`js/data/prophet10Presets.js` defines the factory-program templates and functions for cloning program objects and creating a corresponding user bank.

The Prophet-10 application maintains user-program state in browser storage. The interface's advertised total includes both factory and user program slots.

### Nord C2D

The Nord C2D organ uses its own model, manual, drawbar, and registration state.

Its programming model is structurally different from that of the subtractive synthesizers because a registration may consist of drawbar values, organ-model selection, percussion settings, manual-specific settings, and other organ controls.

### Browser-local storage

`localStorage` provides persistence for data that the application chooses to save. In practical terms, this means that stored presets belong to the browser's local storage area for the relevant site origin.

They are not automatically synchronised between devices or browsers, and clearing the browser's site data may remove them.

Export and import options are available only where the particular instrument implements them.

---

## 9. User Interface and Visualization

Overture Instruments has a visual design system built around instrument-specific interfaces, shared interaction components, and a common brand identity.

### Shared components

The `ui/` directory contains reusable interface modules, including:

| Component | Responsibility |
|---|---|
| `ui/Keyboard.js` | Virtual keyboard rendering and note interaction |
| `ui/Knob.js` | Rotary parameter controls with value feedback |
| `ui/Wheel.js` | Pitch and modulation wheel interfaces |
| `ui/OLEDDisplay.js` | Instrument-style parameter and preset readout |
| `ui/Scope.js` | Time-domain audio waveform visualization |
| `ui/Spectrum.js` | Frequency-domain spectrum visualization |

Other components and helpers support additional displays and instrument-specific controls.

### Knob interaction

The shared rotary knob component provides hardware-inspired interaction, including dragging, wheel-based adjustments, and reset behaviour. It is built around a button-based control with keyboard interaction and slider semantics.

Individual instrument pages can define their own parameter ranges, value formatting, and change handlers without rebuilding the underlying visual control.

### Oscilloscope and spectrum analyzer

The Little Phatty interface includes two forms of audio visualization.

The oscilloscope uses time-domain analyser data to display the shape of the output waveform. The spectrum analyzer uses frequency-domain analyser data to show how energy is distributed across frequencies.

These visualizations supplement the audio output. They are not a substitute for a calibrated measurement system.

### Visual identity

The project uses custom stylesheets, local branding assets, and shared typography. Some interface pages also load web fonts and Material Symbols through external services.

Instrument-specific styling is deliberately retained rather than forcing all emulators into an identical visual template.

---

## 10. Browser Compatibility

Overture Instruments depends on the browser's support for modern JavaScript modules, the Web Audio API, and the relevant interaction APIs.

### General requirements

A modern desktop browser is recommended. A compatible audio output device is also required to hear the synthesizers and organ.

For MIDI input, use a browser and operating environment that support the Web MIDI API. Chromium-based browsers are a practical starting point, although support can vary with browser version, operating system, and device configuration.

### Secure contexts and permissions

Web MIDI access may require a secure browser context and explicit permission. The deployed website uses HTTPS, and `localhost` is generally treated as a secure context for development.

A browser that lacks Web MIDI support can still use the on-screen keyboard and other implemented local controls.

### Audio activation

Browsers commonly prevent web pages from starting audio automatically. Open the instrument page and activate its power control to initialise the audio engine.

If no sound is heard, verify browser permissions, operating-system output selection, master volume, and whether the audio context has successfully started.

### Mobile devices

Some pages provide touch interaction through their on-screen controls, but the project is primarily designed around desktop-style instrument interfaces. Layout, performance, MIDI connectivity, and simultaneous touch interaction may vary on mobile devices.

---

## 11. Running the Project Locally

The project is designed to serve as a static website. The repository does not currently declare a conventional package-manager workflow or mandatory compilation step.

### Requirements

- Git, if you want to clone the repository.
- A modern browser with JavaScript modules and Web Audio API support.
- A local static web server for development.
- Node.js only if you intend to work with the included `.mjs` development and test-harness scripts.

### Step 1: Clone the repository

```bash
git clone https://github.com/ForeverBoundless/Overture-Instruments.git
cd Overture-Instruments
```

### Step 2: Start a local web server

For example, with Python installed:

```bash
python -m http.server 8000
```

This serves the repository's files from the project root.

### Step 3: Open the site

Navigate to:

```text
http://localhost:8000/
```

The browser will load `index.html` as the homepage.

Because the deployed configuration uses Vercel's clean-URL handling, a basic local static server will not necessarily resolve every extensionless route used by the deployed site. For direct local testing, use the explicit HTML filenames where needed, for example:

```text
http://localhost:8000/about.html
http://localhost:8000/library.html
http://localhost:8000/html/little-phatty.html
http://localhost:8000/html/sub37.html
http://localhost:8000/html/prophet10.html
http://localhost:8000/html/nord-c2d.html
```

The instrument launch links and navigation may require a local routing configuration equivalent to the production clean-URL behaviour.

**Do not rely on opening the HTML files directly through `file://`.** Module imports and browser security restrictions can prevent the application from loading correctly. Use a local HTTP server instead.

### Step 4: Activate the instrument

Open a supported instrument page and activate its power control. This initial interaction allows the instrument to create and resume its audio context according to the browser's autoplay rules.

If you intend to use a MIDI controller, connect it before or after opening the page and grant MIDI permission when requested. MIDI functionality remains dependent on the particular instrument implementation.

---

## 12. Deployment and URL Routing

The live site is deployed on [Vercel](https://vercel.com/) at:

**https://overture-instruments.vercel.app/**

The repository's `vercel.json` enables clean URLs:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "cleanUrls": true
}
```

With this configuration, `.html` filenames can be exposed through extensionless URLs on the deployed site.

Examples include:

| Page | Deployed route |
|---|---|
| Homepage | `/` |
| About | `/about` |
| Instrument library | `/library` |
| Little Phatty | `/html/little-phatty` |
| Sub 37 | `/html/sub37` |
| Prophet-10 | `/html/prophet10` |
| Nord C2D | `/html/nord-c2d` |

The root HTML files, the `html/` directory, and the extensionless URLs should be kept consistent when changing page structure or navigation.

The current implementation is a static web project, so a deployment normally serves the site's files and client-side modules rather than compiling a separate backend application.

External fonts, the Material Web button module used by the library, and Vercel Insights are loaded by pages that reference them. Those integrations may depend on their respective external services being reachable.

---

## 13. Repository Structure

The following is a simplified guide to the principal files and directories in the current repository.

```text
Overture-Instruments/
│
├── index.html
│   └── Main homepage
│
├── about.html
│   └── About page
│
├── library.html
│   └── Root-level instrument-library entry point
│
├── html/
│   ├── library.html
│   ├── little-phatty.html
│   ├── sub37.html
│   ├── prophet10.html
│   └── nord-c2d.html
│
├── css/
│   ├── home.css
│   ├── about.css
│   ├── library.css
│   ├── keyboard.css
│   ├── knobs.css
│   ├── little-phatty.css
│   ├── sub37.css
│   ├── prophet10.css
│   └── nord-c2d.css
│
├── js/
│   ├── home.js
│   ├── about.js
│   ├── library.js
│   ├── launcher-components.js
│   │
│   ├── data/
│   │   ├── presets.js
│   │   ├── sub37Presets.js
│   │   └── prophet10Presets.js
│   │
│   └── engine/
│       ├── app.js
│       ├── AudioEngine.js
│       ├── Sub37Engine.js
│       ├── Prophet10Engine.js
│       ├── NordC2DEngine.js
│       ├── Voice.js
│       ├── Oscillator.js
│       ├── Mixer.js
│       ├── LadderFilter.js
│       ├── Envelope.js
│       ├── DAHDSREnvelope.js
│       ├── LFO.js
│       ├── Glide.js
│       ├── Noise.js
│       ├── ParamRamp.js
│       ├── MidiManager.js
│       └── PresetManager.js
│
├── ui/
│   ├── Keyboard.js
│   ├── Knob.js
│   ├── Wheel.js
│   ├── OLEDDisplay.js
│   ├── Scope.js
│   ├── Spectrum.js
│   ├── Logos/
│   └── fonts and supporting assets
│
├── tmp/
│   └── Reference and intermediate page images
│
├── harness-setup.mjs
├── harness.mjs
├── interact.mjs
├── vercel.json
├── .gitignore
└── README.md
```

The diagram omits some supporting files and represents the broad structure, not the complete recursive file tree.

### Where to make changes

**Homepage and site navigation:** Start with `index.html`, `css/home.css`, and `js/home.js`.

**About page:** Work in `about.html`, `css/about.css`, and `js/about.js`.

**Library launcher:** Start with `library.html`, `html/library.html`, `css/library.css`, `js/library.js`, and `js/launcher-components.js`. Confirm which wrapper is used by the route you are modifying.

**Synthesizer audio:** Start with the applicable engine in `js/engine/`, then trace how the instrument's application script applies control changes.

**Instrument interface:** Inspect the specific JavaScript entry point and stylesheet for that model.

**Preset definitions:** Inspect the appropriate module under `js/data/`.

**Shared interaction controls:** Start in `ui/` before creating a duplicate component for an existing interaction pattern.

**Deployment routing:** Inspect `vercel.json` and confirm that navigation links resolve correctly on the deployed site.

---

## 14. Testing and Development

Overture Instruments contains development harness scripts intended to exercise parts of the application outside a full browser session.

The repository includes:

- `harness-setup.mjs`, which provides simplified browser and Web Audio API shims.
- `harness.mjs`, which attempts a construction-oriented smoke test.
- `interact.mjs`, which contains assertions for selected instrument behaviours.

These scripts should be treated as development utilities rather than as proof of comprehensive browser or audio-engine testing.

**Maintenance note:** The current harness scripts appear to reference `./js/app.js`, whereas the active Little Phatty application module is located at `js/engine/app.js`. Their import paths should be corrected and the scripts revalidated before they are relied on as working tests.

### Suggested development checks

Before committing a change, verify the following as applicable:

1. The modified page loads without missing HTML, CSS, image, or JavaScript module requests.
2. The browser console does not report uncaught exceptions.
3. The instrument starts after its power control is activated.
4. Notes can be triggered and released without stuck notes or unexpected sustained audio.
5. Relevant parameters modify the intended sound.
6. Presets apply correctly, and browser-local persistence behaves as expected.
7. MIDI input works on the instrument page that implements it.
8. Navigation works both in local development and on the deployed extensionless routes.
9. Layouts remain usable at different viewport sizes.

Audio changes warrant particular care because a visual control can move correctly even when the corresponding audio parameter is not connected to the intended signal path.

---

## 15. Privacy and Data Storage

The current repository is primarily client-side. Its visible code does not define an application backend, account system, or remote database for instrument presets.

The Little Phatty and Prophet-10 implementations use browser-local storage for relevant preset and program information. This data is associated with the browser and site origin, not a central user account.

The deployed pages also include the Vercel Insights script. Its handling of analytics information is separate from local preset storage and should be understood through Vercel's current documentation and policies.

External services referenced by the site include Google Fonts and the Material Web module loaded by the library launcher. A browser may contact those services when loading the relevant pages.

This README does not make broader claims about every form of data processed by the hosting platform, browser, network, or external service.

---

## 16. Current Limitations

Overture Instruments is an evolving project, and some limitations are inherent to its current implementation.

### Sound accuracy

The instruments use software models to recreate selected characteristics of synthesizer and organ architectures. Results depend on the quality of those models, browser audio behaviour, processing resources, and output hardware.

The emulators are not guaranteed to be acoustically identical to the original physical instruments.

### Feature parity

Not all instrument pages implement the same control set, MIDI integrations, program-management features, or persistence behaviour. A control visible in an interface should not be assumed to have identical functionality across all models.

### MIDI availability

Web MIDI support depends on the browser and environment. The current implementation also varies by instrument, so the presence of a MIDI-related label does not by itself establish that a page accepts MIDI input.

### Preset fidelity

Preset counts refer to application data and program slots. Some preset collections use generated parameter recipes, and the current implementation should not be represented as a comprehensive, verified copy of each manufacturer's original factory data.

### Browser and device variation

Audio output, latency, maximum practical polyphony, and interface responsiveness can differ between browsers and devices. The project has not been established as a replacement for dedicated low-latency hardware or a professional native plug-in workflow.

### Planned tools

OMNI and Overture Experiments are presented as developing concepts. Their presence on the site does not mean their full interactive functionality is already available.

---

## 17. Future Development

The long-term direction of Overture Instruments extends beyond the four existing emulators.

### Expansion of the instrument library

The launcher is designed to support additional keyboard, synthesizer, and organ experiences. Potential areas of exploration include instruments associated with Moog, Roland, Sequential, Oberheim, Nord, Novation, and Korg.

These names describe areas of future interest, not announced manufacturer partnerships, official collaborations, or guaranteed release schedules.

### OMNI: A modular instrument designer

OMNI is a planned tool for building a more personalised instrument interface.

The intended concept is to combine controls and components inspired by different emulated instruments, arrange them into a custom layout, and adjust the resulting instrument's appearance and character.

Future development may include:

- Modular control and component selection.
- A configurable instrument layout.
- Customisable colours, arrangement, and visual presentation.
- Integration with suitable emulated instrument parameters.
- More advanced instrument-design and configuration workflows.
- Planned CAD compatibility, including the ability to create detailed schematics and export or port suitable designs into professional CAD software.

These capabilities are prospective. A complete working modular editor and CAD export pipeline should not be assumed to exist in the current version.

### Overture Experiments

Overture Experiments is planned as a set of small interactive sound labs that make synthesis concepts easier to understand through direct experimentation.

Potential subjects include:

- Oscillator waveforms and frequency.
- Harmonics and spectrum.
- Filters, resonance, and cutoff.
- Amplitude and filter envelopes.
- Modulation and LFO behaviour.
- Interactions between sound sources and synthesis parameters.

The objective is to connect what users see on the screen to what they hear, supporting both independent exploration and educational settings.

### Audio-engine development

The existing codebase provides a foundation for further work on:

- More accurate and expressive sound models.
- Improved performance and resource management.
- Additional MIDI integrations and more consistent input behaviour.
- Better preset editing and persistence.
- More complete instrument-specific functionality.
- Improved compatibility and interface accessibility.

The specific scope and timing of these developments remain subject to the project's ongoing work.

---

## 18. Contributing and Feedback

Overture Instruments welcomes thoughtful feedback, technical discussion, and ideas for making the project more musically useful and accessible.

Useful contributions can include bug reports, reproducible examples of unexpected behaviour, sound-model observations, suggestions for instrument controls, interface improvements, accessibility feedback, and documentation corrections.

### Reporting a problem

When reporting a problem, include:

- The instrument or page involved.
- The browser and operating system.
- The steps required to reproduce the issue.
- What happened and what you expected to happen.
- Relevant console errors, if available.
- Whether the problem concerns sound generation, input, presets, interface behaviour, or routing.

Do not include passwords, private account information, or other sensitive material in a public issue.

### Proposing a change

For larger changes, describe the problem being solved and how the proposed solution fits the project's existing architecture. Instrument-specific modifications should generally remain within the relevant instrument engine or application module unless the behaviour genuinely belongs in a shared component.

Before submitting code, review the repository's current licensing terms. Public repository access alone does not establish permission to redistribute or relicense someone else's work.

**The repository's MIT licence applies only to material within its stated scope. No separate contributor licence agreement is specified here; contributors should identify third-party material and ensure they have the necessary rights to submit their contributions.**

---

## 19. Copyright and Licensing

Copyright and licensing are important to Overture Instruments because the repository combines original software, interface artwork, program data, typography, and references to existing commercial instruments.

### Licence for original project code

The repository now includes a **[MIT License](LICENSE)**. The licence applies to original software source code and associated software documentation authored for Overture Instruments, except where a file contains a different copyright or licence notice.

Subject to the conditions in the `LICENSE` file, the MIT License permits use, copying, modification, merging, publication, distribution, sublicensing, and sale of copies of the covered Software. The copyright notice and permission notice must be included in copies or substantial portions of the covered Software. The Software is provided without warranty, as described in the licence.

The applicable terms are set out in full in the root-level `LICENSE` file. Read that file rather than relying on this summary.

### Copyright ownership

Original project code, documentation, interface designs, and other original material remain subject to the rights of their respective authors and rights holders. The project licence identifies Michael Carpiano as the copyright holder for the original material within the scope defined by the `LICENSE` file. A file with a distinct copyright or licence notice may be subject to different terms.

### Third-party material and exclusions

The MIT License does **not** automatically grant rights to third-party materials that may be present in, bundled with, or referenced by the repository. These may include manufacturer logos, trademarks, product names, fonts, manual pages, screenshots, reference images, and other artwork. Such materials remain subject to the rights and terms of their respective owners.

A public repository, and an MIT licence covering original code, should not be interpreted as permission to redistribute every asset in the project. Before reusing or republishing a page, image, font, logo, or other third-party material, identify the applicable rights and licence terms.

### No implied trademark or endorsement rights

The MIT License does not grant rights to use third-party trademarks or to imply that Overture Instruments is affiliated with, endorsed by, sponsored by, or licensed by a manufacturer. Manufacturer names and marks remain the property of their respective owners.

### Contributions and separate notices

Contributors should ensure that they have the rights needed to submit any code, documentation, or assets they contribute. Any existing copyright and licence notices should be preserved, and third-party assets should be identified rather than presumed to be covered by the project licence. The repository does not specify a separate contributor licence agreement.

This section is a practical summary, not legal advice. The complete licence text and any notices accompanying individual files govern the applicable terms.

---

## 20. Trademarks and Manufacturer Independence

Overture Instruments is an independent project. It is not affiliated with, endorsed by, sponsored by, or licensed by Moog Music Inc., Roland Corporation, Sequential, Oberheim, Nord, Novation, KORG INC., or any other manufacturer referenced by the project.

Instrument names appear to identify the hardware architectures and models that inspired particular emulation projects. They do not indicate that the software is official manufacturer software.

The following names, among others, belong to their respective owners:

- **Moog**
- **Roland**
- **Sequential**
- **Oberheim**
- **Nord / NORD**
- **Novation**
- **Korg / KORG**

The use of these names is descriptive and identifies the instruments or brands being referenced. Overture Instruments does not claim ownership of those trademarks, logos, product names, or proprietary designs.

The emulators are independent software projects and are not substitutes for official manufacturer products, support, or documentation.

---

## 21. Third-Party Materials and Attributions

The repository uses or references several categories of third-party material and services.

### Typography

The pages load fonts and symbols from Google Fonts, including Figtree, DM Mono, and Material Symbols. The repository also includes local font files, including Futura Book and Inter Variable.

Each font or typeface should be used according to its applicable licence. The fact that a font is bundled locally does not by itself establish permission to redistribute it.

### Material Web

The library launcher dynamically imports the Material Web filled-button component from the `@material/web` package through `esm.sh`.
This is an external dependency used to enhance the library's launch controls. Its use and redistribution are subject to the applicable package licence and terms.

### Manufacturer logos

Manufacturer-logo images are present in `ui/Logos/`. These are distinct from the original Overture Instruments logo and should not be assumed to be owned by the project.

Use of those images must respect the applicable rights and permissions of the relevant trademark owners.

### Reference material

The repository contains page images under `tmp/pdfs/`. If these are rendered pages from manufacturer manuals or other copyrighted reference documents, their inclusion in a publicly distributed repository requires separate review. They should not be assumed to be covered by a licence for original Overture Instruments code.

### Hosting and analytics

The deployed website uses Vercel hosting and includes Vercel Insights script references. These services remain subject to their own documentation and terms.

### General attribution principle

Third-party materials remain subject to their respective rights and licences. An attribution, disclaimer, or trademark notice does not itself grant permission to redistribute a work.

---

## 22. Project Ownership

**Overture Instruments is founded and owned by Michael Carpiano.**

It is an independent creative and technical project developed around the belief that musical instruments, synthesis, and experimentation should be more accessible.

The project brings together web development, sound synthesis, user-interface design, instrument research, and musical curiosity in an evolving browser-based library.

The ambition is not simply to reproduce the appearance of existing instruments. It is to make it possible for more people to explore their controls, understand their architectures, and use them as starting points for musical creation.

**Overture Instruments**

*The legends, faithfully reimagined. Completely free to explore.*

[Website](https://overture-instruments.vercel.app/) · [GitHub repository](https://github.com/ForeverBoundless/Overture-Instruments)

---

*Copyright in original Overture Instruments material remains with its respective rights holders. Third-party trademarks, software, artwork, fonts, and reference materials remain subject to their own rights and applicable licences.*
