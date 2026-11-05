# Contributing to Overture Instruments

Thanks for helping improve Overture. The project is static HTML, CSS, and native ES modules; keep changes small, dependency-light, and usable without a build step.

## Local development

Serve the repository root over HTTP (for example, `python -m http.server 8000`) and open the relevant page. AudioWorklets, Web MIDI, and microphone features need a compatible browser and an appropriate origin.

## Checks

Run `npm test` before opening a pull request. It runs unit coverage for OMNI graph validation and saved-data migration, static browser/PWA contracts, and the existing Little Phatty interaction harness.

The automated suite cannot verify physical MIDI devices, microphone permissions, audible glitches, or browser-specific latency. For audio-facing changes, manually check the affected instrument, note on/off, a saved preset, and a reload in Chrome or Edge.

## Working on OMNI

Module definitions live in `js/omni/modules.js`; every module must also have a complete entry in `js/omni/moduleInfo.js` containing a summary, circuit architecture, practical use, and an explanation of the OMNI implementation. `omni.js` validates this catalogue against the module registry at startup, and the module-reference test checks every entry. Add the reference entry in the same change whenever you add or rename a module. Describe real hardware accurately, and clearly label digital models and approximations rather than presenting them as physical circuits. The patch schema and live graph lifecycle live in `js/omni/graph.js`. Audio/CV connections must remain cycle-safe. Note generators must attach an absolute `AudioContext` timestamp to scheduled events so native Web Audio nodes and worklets can schedule on the audio clock.

## Saved data compatibility

Do not silently discard a prior `PresetStore` version. Add an explicit sequential migration when increasing a store version. The store automatically creates a raw backup before migration; migrations should preserve valid user data and fail safely on data they cannot understand.

## Pull requests

Describe the user-visible result, affected pages, test command output, and any manual browser/device checks. Do not describe Overture preset collections as manufacturer factory banks unless their provenance has been independently verified. Update `js/data/instruments.js` when a public library claim changes.
