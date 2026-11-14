/**
 * Canonical routing for Community imports, Contributions and previews.
 * Add each new emulator here and register its patch-aware renderer in instrumentPreview.js.
 * Unit tests ensure the two lists always match.
 */
export const COMMUNITY_INSTRUMENTS = Object.freeze([
  { id: 'little-phatty', name: 'Moog Little Phatty', route: '/html/little-phatty' },
  { id: 'sub-37', name: 'Moog Sub 37', route: '/html/sub37' },
  { id: 'prophet-10', name: 'Sequential Prophet-10', route: '/html/prophet10' },
  { id: 'nord-c2d', name: 'Nord C2D', route: '/html/nord-c2d' },
  { id: 'dx7', name: 'Yamaha DX7', route: '/html/yamaha-dx7' },
  { id: 'juno-106', name: 'Roland Juno-106', route: '/html/roland-juno-106' },
  { id: 'tr-808', name: 'Roland TR-808', route: '/html/roland-tr-808' },
  { id: 'ms-20', name: 'Korg MS-20', route: '/html/korg-ms-20' },
  { id: 'mellotron-m400', name: 'Mellotron M400', route: '/html/mellotron-m400' },
  { id: 'oberheim-eight-voice', name: 'Oberheim Eight Voice', route: '/html/oberheim-eight-voice' },
  { id: 'hohner-d6', name: 'Hohner Clavinet D6', route: '/html/hohner-d6' },
  { id: 'ob-xa', name: 'Oberheim OB-Xa', route: '/html/ob-xa' },
  { id: 'sequential-pro-3', name: 'Sequential Pro 3', route: '/html/sequential-pro-3' },
  { id: 'udo-super-8', name: 'UDO Super 8', route: '/html/udo-super-8' },
]);
export const COMMUNITY_INSTRUMENT_BY_ID = Object.freeze(
  Object.fromEntries(COMMUNITY_INSTRUMENTS.map((instrument) => [instrument.id, instrument])),
);
