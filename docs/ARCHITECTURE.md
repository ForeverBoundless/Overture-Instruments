# Architecture notes

## Shared application layers

- `js/engine/`: reusable synthesis primitives and instrument-specific engines/worklets.
- `js/shared/`: theme, MIDI mapping, panel controls, browser storage, PWA registration, audio capture, and MIDI take/export utilities.
- `js/data/`: factory/original Overture sound data and canonical public instrument metadata.
- `js/omni/`: OMNI's module catalogue, patch schema, templates, validation, and live graph.

## OMNI lifecycle

`LiveGraph.build()` snapshots a patch, queues the request, and gives it a monotonically increasing generation. If a module creation awaits (for example, an AudioWorklet load) and a newer patch supersedes it, the obsolete build is disposed without replacing the active graph. A successful build reconciles modules by id/type/parameters: unchanged instances survive, changed modules are prepared before commit, and only edges adjacent to replaced modules (or explicitly changed edges) are disconnected/recreated. A failed or superseded preparation is disposed without changing the active graph.

Audio and CV edges become Web Audio connections. Note edges are JavaScript event routes, but sequencers, clocks, arpeggiators, random generators, and note echo dispatch their events immediately with absolute `AudioContext` times. Native modules use those times for AudioParam automation, while the DX7 worklet queues note messages to target sample frames.

## Persistence

`PresetStore` stores `{ version, items }` in `localStorage`. It validates every item, limits imports and library size, and provides single-item and library-level JSON exchange. When a store version is upgraded, it writes a timestamped raw backup before applying an explicitly supplied migration chain. OMNI currently migrates its prior v1 store to v2 without changing patch schema.

## Offline behaviour

The web manifest and service worker provide an installable shell and cache same-origin pages/assets as they are used. Navigation is network-first, with cached pages as fallback, so deployed content updates normally while already-visited pages remain available offline.


## OMNI performance capture

`AudioRecorder` connects an `AudioNode` in parallel to a `MediaStreamAudioDestinationNode`; this leaves the audible output path intact. The browser's `MediaRecorder` chooses the available container/codec, and the UI chooses the file extension from the resulting MIME type.

`LiveGraph` reports note events at sound-producing destination modules, rather than at the keyboard input. This captures events after OMNI note processors (sequencer, clock, arpeggiator, chord, transpose and echo) have transformed them; object-identity deduplication prevents the same event from being recorded twice when it fans out to multiple sound modules. Scheduled event timestamps are retained against the AudioContext clock. `MidiRecorder` writes a format-0 Standard MIDI File with 480 PPQ, 120 BPM tempo metadata, per-channel note-on/off, CC, pitch bend, channel/poly aftertouch and program-change messages. It is clocked by the active audio context and closes held notes when a take ends or audio powers down.

## Offline asset coverage

The versioned service-worker app shell precaches application CSS and ES modules (including AudioWorklet processors), instrument and experiment navigation routes, fonts, logos and project images. Other same-origin GET assets are cached on first successful use. Navigation is network-first and falls back to cached content when offline.


## Advanced OMNI controls

Patch schema v2 adds a backward-compatible `macros` array. Each of up to eight macros has a normalized value and up to sixteen bindings to numeric module parameters. Binding bounds are validated against the destination parameter; logarithmic targets (for example filter cutoff) are interpolated logarithmically. Macro values are available to the existing MIDI mapping provider.

The editor's group selection/copy/move operations work on module ids and preserve internal edges when copying a group. Graph reconciliation keeps unaffected module instances and note-clock modules alive through structural edits when their own type and parameters have not changed.

## Community library and trust boundary

The community prototype uses Supabase Auth (email OTP), a `community_patches` table, and the `community-previews` Storage bucket. The browser contains only the publishable/anon key; the SQL migration enables RLS, limits write/delete access to each authenticated owner, restricts writable columns so download counts and timestamps cannot be changed by clients, and increments download counts through a narrowly scoped security-definer function. Instrument data is stored with a record type and instrument identifier; instrument pages still validate imported JSON with their own schemas. Audio previews are public by design and should not be used for private recordings.


Unlisted records are excluded from ordinary anonymous table reads. Direct-link access uses the narrowly scoped `get_community_patch_by_id(uuid)` function, which returns only the item matching the supplied UUID when it is public/unlisted or owned by the current user. The discovery feed queries public rows only.
