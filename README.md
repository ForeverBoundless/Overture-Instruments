# Overture Instruments

### Sound without limits.

**Free, browser-based keyboard, synthesizer and other emulators, built to make expressive instruments and the technology behind them more accessible to everyone.**

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

- **Little Phatty Stage Edition**: a monophonic 37-key emulator with dual oscillators, a ladder-style filter, envelopes, modulation, factory presets, user preset storage, computer-keyboard input, and MIDI input.
- **Sub 37 Bob Moog Tribute Edition**: a mono / two-note paraphonic emulator with dual oscillators, modulation, envelopes, presets, pitch and modulation wheels, and a playable 37-key interface.
- **Sequential Prophet-10**: a ten-voice polyphonic analog synthesizer emulator with Web MIDI note input, pitch bend, mod wheel, aftertouch, sustain, and program changes.
- **Nord C2D**: a red dual-manual organ interface with two independent 37-key manuals and complete drawbar banks, percussion units, stops and couplers, and Leslie-inspired vibrato.

## Controls

Use the on-screen keyboard or connect a compatible MIDI controller to play. The Prophet-10 accepts MIDI notes on all channels plus pitch bend, mod wheel, aftertouch, sustain, and program changes. The Nord C2D routes MIDI channel 1 to the upper/Swell manual, channel 2 to the lower/Great manual, and channel 3 to the lower manual when its Great split is enabled.

Audio starts through each instrument's power control. MIDI access may require browser permission and is best supported in Chromium-based browsers.

## Upcoming Emulators

The launcher is designed to grow into a broader collection of browser-based keyboard emulators. Future instruments are planned with inspiration from the brands currently represented on the launcher page, including:

- Moog
- Roland
- Sequential
- Oberheim
- Nord
- Novation
- Korg

These are prospective additions to the library, not announcements of official products or collaborations.

## Legal Notice

Overture Instruments is an independent, unofficial project and has no affiliation with, endorsement from, sponsorship by, or licensing relationship with Moog Music Inc., Roland Corporation, Sequential LLC, Marion Systems LLC, Focusrite Audio Engineering Limited, KORG INC., or any other manufacturer or brand referenced by the project.

The instruments in this project are independently developed software emulations. They are not original manufacturer software and are not official versions of any referenced instrument.

**Moog®, Roland®, Sequential®, Oberheim®, Novation®, NORD® and KORG®** are trademarks or registered trademarks of their respective owners. Overture Instruments does not claim ownership of any referenced trademarks, product names, logos, trade dress, or other intellectual property belonging to their respective owners.

Product names and brand references are used for identification and descriptive purposes only.
