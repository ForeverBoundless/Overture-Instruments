# Architecture notes

## Shared application layers

- `js/engine/`: reusable synthesis primitives and instrument-specific engines/worklets.
- `js/shared/`: theme, MIDI mapping, panel controls, browser storage, PWA registration, audio capture, and MIDI take/export utilities.
- `js/data/`: factory/original Overture sound data and canonical public instrument metadata.
- `js/omni/`: OMNI's module catalogue, patch schema, templates, validation, and live graph.

## OMNI lifecycle

`LiveGraph.build()` snapshots a patch, queues the request, and gives it a monotonically increasing generation. If a module creation awaits (for example, an AudioWorklet load) and a newer patch supersedes it, the obsolete build is disposed without replacing the active graph. Only a fully prepared current graph replaces the previous graph.

Audio and CV edges become Web Audio connections. Note edges are JavaScript event routes, but sequencers, clocks, arpeggiators, random generators, and note echo dispatch their events immediately with absolute `AudioContext` times. Native modules use those times for AudioParam automation, while the DX7 worklet queues note messages to target sample frames.

## Persistence

`PresetStore` stores `{ version, items }` in `localStorage`. It validates every item, limits imports and library size, and provides single-item and library-level JSON exchange. When a store version is upgraded, it writes a timestamped raw backup before applying an explicitly supplied migration chain. OMNI currently migrates its prior v1 store to v2 without changing patch schema.

## Offline behaviour

The web manifest and service worker provide an installable shell and cache same-origin pages/assets as they are used. Navigation is network-first, with cached pages as fallback, so deployed content updates normally while already-visited pages remain available offline.


## OMNI performance capture

`AudioRecorder` connects an `AudioNode` in parallel to a `MediaStreamAudioDestinationNode`; this leaves the audible output path intact. The browser's `MediaRecorder` chooses the available container/codec, and the UI chooses the file extension from the resulting MIME type.

`MidiRecorder` captures on-screen/computer keyboard and external MIDI note-on/note-off events using a monotonic clock. It writes a single-track Standard MIDI File (format 0) with 480 PPQ and a 120 BPM tempo meta event. This take currently does not include OMNI's internal sequencer-generated notes, MIDI controller automation, pitch bend, or sustain events.

## Offline asset coverage

The versioned service-worker app shell precaches application CSS and ES modules (including AudioWorklet processors), instrument and experiment navigation routes, fonts, logos and project images. Other same-origin GET assets are cached on first successful use. Navigation is network-first and falls back to cached content when offline.
