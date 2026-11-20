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

## Interface copy and number formatting

Use ordinary decimal numbers for visible numbering and counts. Write `1`, not `01` or `001`, for section numbers, steps, labels, experiment titles, counters and preset or index displays. Do not zero-pad numbers for visual styling with `padStart(..., '0')` or CSS `decimal-leading-zero`. Preserve leading zeroes only when they are part of an external value or format that must be reproduced exactly.

## Working on OMNI

### Documentation is part of every OMNI change

**Every new or changed user-facing OMNI feature must include a documentation update in the same pull request.** Do not leave documentation as a later task. This applies to new modules, controls, parameters, routing behaviour, editor tools, performance/MIDI behaviour, recording, macros, patch storage, import/export formats, shortcuts, workflows, limitations and meaningful interface changes.

The public, section-by-section guide is maintained in `omni/documentation.html`, with its page styles in `css/omni-documentation.css`. Update the relevant section when behaviour changes, add a section and matching navigation link when a new topic needs one, and keep examples and button/menu names aligned with the current interface. Describe what the shipped code does today; do not present planned or partially implemented work as available.

Also update the supporting documentation when relevant:
- Add or revise the module's four-field technical reference in `js/omni/moduleInfo.js` whenever a module is added, renamed or its behaviour changes.
- Update `docs/FRONT-PANEL-STUDIO.md` when the front-panel editor's workflow, controls, data format, preview, validation or export behaviour changes.
- Update the OMNI section and documentation links in `README.md` when the catalogue, scope or major capabilities change.

Documentation changes belong in the same commit series as the implementation and its regression tests. Review the rendered page in both light and dark themes when its layout or styling changes.

Module definitions live in `js/omni/modules.js`; every module must also have a complete entry in `js/omni/moduleInfo.js` containing four substantive fields: `summary`, `circuit`, `use`, and `implementation`. The inspector's information dialog presents these references to users, so they are product documentation as well as source data. Explain real hardware accurately, distinguish historical circuit designs where relevant, and label digital models and approximations as such. Do not describe a Web Audio or worklet implementation as though it were a physical circuit.

`omni.js` validates the reference catalogue against the module registry at startup, and the module-reference test checks that every registered module has all four fields. Add or revise the reference in the same change whenever you add or rename a module. Instrument-derived modules should reuse the relevant Overture engine or worklet where appropriate and state clearly what is reused and what is modelled.

The patch schema and live graph lifecycle live in `js/omni/graph.js`. The physical-style panel editor lives in `js/omni/front-panel.js`; changes to its serialized data must be validated in `validatePatch` and covered by `test/omni-features.test.mjs`. Keep layout coordinates, guides, measurements, geometry metrics, colour values, materials and component bindings bounded and validated. Preserve backwards compatibility for patches without `frontPanel`, and add tests for new component properties and import sanitization. A panel control may call the existing performance or parameter APIs, but must not create a second audio graph. Audio/CV connections must remain cycle-safe. Note generators must attach an absolute `AudioContext` timestamp to scheduled events so native Web Audio nodes and worklets can schedule on the audio clock. Keep the dependency-group order in `js/omni.js` aligned with the destructured module bindings below it; add a regression test when changing that loading sequence.

## Saved data compatibility

Do not silently discard a prior `PresetStore` version. Add an explicit sequential migration when increasing a store version. The store automatically creates a raw backup before migration; migrations should preserve valid user data and fail safely on data they cannot understand.

## Library metadata and cached assets

Update `js/data/instruments.js` when a public library claim changes, including an instrument's name, model, voice mode, preset provenance, or description. This is the canonical source for the library cards, and the browser-contract tests check that every listed instrument has provenance and descriptive metadata.

When adding or renaming versioned browser assets, update the relevant HTML/module references and the service-worker precache list. Bump the service-worker cache name when the cached application shell changes. Keep offline assets and their versioned URLs consistent.

## Pull requests

Describe the user-visible result, affected pages, test command output, and any manual browser/device checks. Do not describe Overture preset collections as manufacturer factory banks unless their provenance has been independently verified.
