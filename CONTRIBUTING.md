# Contributing to Overture Instruments

Thanks for helping improve Overture. The project is static HTML, CSS, and native ES modules; keep changes small, dependency-light, and usable without a build step.

## Local development

Serve the repository root over HTTP (for example, `python -m http.server 8000`) and open the relevant page. AudioWorklets, Web MIDI, and microphone features need a compatible browser and an appropriate origin.

## Checks

Run `npm test` before opening a pull request. It runs three groups of checks:

- `test:unit`: OMNI graph validation, saved-data migrations, audio and MIDI recording, and the Mellotron and Eight Voice audio processors.
- `test:browser`: static browser/PWA contracts, canonical instrument metadata, OMNI feature checks, and complete technical-reference coverage for the OMNI module catalogue.
- `test:smoke`: the existing browser interaction harness.

The automated suite cannot verify physical MIDI devices, microphone permissions, audible glitches, or browser-specific latency. For audio-facing changes, manually check the affected instrument, note-on and note-off behaviour, a saved preset, and a reload in Chrome or Edge. For the Mellotron, listen for clean note starts and releases and check that tape-style playback ends as expected. For the Eight Voice, check voice allocation, tuning, filter modes, and note release. For visual changes, inspect both light and dark themes and a narrow viewport.

## Working on OMNI

Module definitions live in `js/omni/modules.js`; every module must also have a complete entry in `js/omni/moduleInfo.js` containing four substantive fields: `summary`, `circuit`, `use`, and `implementation`. The inspector's information dialog presents these references to users, so they are product documentation as well as source data. Explain real hardware accurately, distinguish historical circuit designs where relevant, and label digital models and approximations as such. Do not describe a Web Audio or worklet implementation as though it were a physical circuit.

`omni.js` validates the reference catalogue against the module registry at startup, and the module-reference test checks that every registered module has all four fields. Add or revise the reference in the same change whenever you add or rename a module. Instrument-derived modules should reuse the relevant Overture engine or worklet where appropriate and state clearly what is reused and what is modelled.

The patch schema and live graph lifecycle live in `js/omni/graph.js`. Audio/CV connections must remain cycle-safe. Note generators must attach an absolute `AudioContext` timestamp to scheduled events so native Web Audio nodes and worklets can schedule on the audio clock. Keep the dependency-group order in `js/omni.js` aligned with the destructured module bindings below it; add a regression test when changing that loading sequence.

## Saved data compatibility

Do not silently discard a prior `PresetStore` version. Add an explicit sequential migration when increasing a store version. The store automatically creates a raw backup before migration; migrations should preserve valid user data and fail safely on data they cannot understand.

## Library metadata and cached assets

Update `js/data/instruments.js` when a public library claim changes, including an instrument's name, model, voice mode, preset provenance, or description. This is the canonical source for the library cards, and the browser-contract tests check that every listed instrument has provenance and descriptive metadata.

When adding or renaming versioned browser assets, update the relevant HTML/module references and the service-worker precache list. Bump the service-worker cache name when the cached application shell changes. Keep offline assets and their versioned URLs consistent.

## Pull requests

Describe the user-visible result, affected pages, test command output, and any manual browser/device checks. Do not describe Overture preset collections as manufacturer factory banks unless their provenance has been independently verified.
