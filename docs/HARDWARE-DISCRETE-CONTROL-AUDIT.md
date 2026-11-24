# Hardware Discrete-Control Audit

This change removes native HTML dropdowns from the 14 library instrument emulators. Discrete parameters are now presented with controls that reflect the relevant instrument's interaction model: detented rotary selectors, pushbutton banks, switches, data-entry controls, or a clearly marked Overture-only setting.

The Overture patch browser is separate from each instrument's original panel. It uses numbered patch-bank buttons and a readout; it is an application feature, not a claim about the original instrument's programmer.

## Instrument-by-instrument decisions

| Emulator | Hardware reference and control mapping |
|---|---|
| Hohner D6 Clavinet | The original uses physical register tabs and pickup controls, so those remain switches rather than a list. The shared Overture preset browser is now an eight-position button bank. [D6 owner's manual](https://www.clavinet.com/d6man.php) |
| Korg MS-20 | VCO waveform and octave-footage choices use detented rotary selectors, matching the original's discrete oscillator controls. The pitch-bend range is not an MS-20 front-panel control, so it is labelled **OVERTURE BEND RANGE**. [Korg MS-20 manual](https://cdn.korg.com/jp/support/download/files/cb8c3656d384f78f99b4ff56cff25fe0.pdf) |
| Moog Little Phatty Stage Edition | Preset selection is a readout with step controls, reflecting the PRESET function and VALUE encoder workflow rather than a browser list. [Stage Edition manual](https://www.manualslib.com/manual/807793/Moog-Stage-Edition.html?page=19) |
| Mellotron M400 | Tracks A/B/C use a three-choice track selector. The frame library is explicitly labelled as an **Overture tape-frame load simulation**: the real M400's frame is physically changed, not selected from a front-panel menu. [Mellotron mechanism overview](https://www.normleete.co.uk/mellotron/how-it-works/) |
| Nord C2D | Organ model and rotary-speaker speed are cycling pushbutton controls. Crosstalk and key click are marked as Sound Menu values rather than dedicated panel switches. [Nord C2D manual](https://www.bax-shop.nl/downloads/products/MW-NORDC2D/nord_c2d_handleiding.pdf) |
| Oberheim OB-Xa | Oscillator waveform, filter-pole, LFO-shape and keyboard-mode choices use button controls. The programmer uses combinable A/B/C/D group keys and 1–8 program buttons; Split and Double memory have separate buttons. Voice count and the additional glide-style choice are marked as Overture engine options. [OB-Xa owner's manual](https://manualzz.com/doc/6363139/oberheim-ob-xa-polyphonic-synthesizer-owners-manual) |
| Oberheim Eight Voice | The SEM VCOs do not have a saw/pulse waveform selector. Each voice has separate saw and pulse mixer levels, so the false waveform dropdowns are replaced with those four mixer controls per SEM voice. Legacy patches are migrated to preserve their former single-wave setting. Filter response remains a detented selector; Overture-only LFO routing and bend-range choices are labelled accordingly. [SEM VCO reference](https://docs.cherryaudio.com/cherry-audio/instruments/eight-voice/vco) |
| Sequential Prophet-10 Rev4 | Existing front-panel program, layer, and modulation selections use the model's dedicated buttons and indicators. The Overture preset browser is separate from the Prophet's hardware controls. [Prophet-10 User's Guide](https://sequential.com/wp-content/uploads/2021/02/Prophet-10-Users-Guide-1.4.pdf) |
| Roland Juno-106 | DCO range is a 16'/8'/4' button bank; PWM source and VCA ENV/GATE use switch-style buttons; HPF is a detented four-position selector. Bend sensitivity is represented with a continuous DCO bend-sensitivity knob. [Roland technical specifications](https://support.roland.com/hc/en-us/articles/201966419-JUNO-106-Technical-Specifications) · [Owner's manual](https://cdn.roland.com/assets/media/pdf/JUNO-106_OM.pdf) |
| Roland TR-808 | Its instrument, mode, pattern and step choices are already represented by dedicated buttons and switches. The shared Overture patch/pattern browser uses numbered buttons rather than a select menu. [Roland TR-808 specifications](https://support.roland.com/hc/en-us/articles/201963539-TR-808-Technical-Specifications) |
| Sequential Pro 3 | Program selection uses a detented encoder-style control. The modulation matrix's extensive source and destination lists use rotary soft-knob controls, matching the manual's SOURCE/DESTINATION and soft-knob workflow; they are not rendered as huge banks of buttons. [Pro 3 User's Guide](https://sequential.com/wp-content/uploads/2021/02/Pro-3-Users-Guide-1.2.pdf) |
| Moog Sub 37 | Discrete oscillator, LFO and modulation choices use detented rotary selectors. Preset browsing is kept separate in the Overture patch browser. [Sub 37 manual](https://cdn.inmusicbrands.com/Moog/BackOffice/SUB_37_MANUAL_v1.1_0.pdf) |
| UDO Super 8 | DDS waveform selection uses pushbutton banks, reflecting the W1–W16 keys and WAVE channel selection. Performance modes, unison, filter drive/key tracking, modulation source and sequencer/arp modes use button-style choices; numerical ranges remain detented selectors. [Super 8 owner's manual](https://files.kraftmusic.com/media/ownersmanual/UDO_Audio_Super_8_Owners_Manual.pdf) |
| Yamaha DX7 | Algorithm, LFO waveform and bend-range editing use the DX7-style data-entry slider and increment/decrement buttons, not rotary front-panel controls. [DX7 owner's manual](https://medias.audiofanzine.com/files/yamaha-dx7-owners-manual-476371.pdf) |

## Shared implementation

- The common panel selector now renders a detented rotary control with a value readout and step buttons.
- Hardware-panel selectors use a detented encoder-style control and support dynamic option lists.
- Dedicated button-bank and data-entry helpers cover instruments whose originals use those mechanisms.
- The shared Overture preset browser uses eight numbered buttons per bank and preserves local-preset and Community-preset selection.
- Instrument entry points, relevant stylesheets, and the offline shell cache were versioned together.

## Scope notes

This audit targets discrete-choice UI and keeps numeric controls, sound-engine behavior, and unrelated instrument features unchanged, except for the Oberheim Eight Voice mixer representation and the Juno-106 bend-sensitivity control needed to make those choices match the hardware more closely. Any setting labelled **Overture** or **simulation** is an application extension rather than an original front-panel control.
