# Architecture notes

## Shared application layers

- `js/engine/`: reusable synthesis primitives and instrument-specific engines/worklets.
- `js/shared/`: theme, MIDI mapping, panel controls, browser storage, and PWA registration.
- `js/data/`: factory/original Overture sound data and canonical public instrument metadata.
- `js/omni/`: OMNI's module catalogue, patch schema, templates, validation, and live graph.

## OMNI lifecycle

`LiveGraph.build()` snapshots a patch, queues the request, and gives it a monotonically increasing generation. If a module creation awaits (for example, an AudioWorklet load) and a newer patch supersedes it, the obsolete build is disposed without replacing the active graph. Only a fully prepared current graph replaces the previous graph.

Audio and CV edges become Web Audio connections. Note edges are JavaScript event routes, but sequencers, clocks, arpeggiators, random generators, and note echo dispatch their events immediately with absolute `AudioContext` times. Native modules use those times for AudioParam automation, while the DX7 worklet queues note messages to target sample frames.

## Persistence

`PresetStore` stores `{ version, items }` in `localStorage`. It validates every item, limits imports and library size, and provides single-item and library-level JSON exchange. When a store version is upgraded, it writes a timestamped raw backup before applying an explicitly supplied migration chain. OMNI currently migrates its prior v1 store to v2 without changing patch schema.

## Offline behaviour

The web manifest and service worker provide an installable shell and cache same-origin pages/assets as they are used. Navigation is network-first, with cached pages as fallback, so deployed content updates normally while already-visited pages remain available offline.
