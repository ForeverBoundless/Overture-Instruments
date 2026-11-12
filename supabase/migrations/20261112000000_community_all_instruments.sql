-- Expand the live Community table to accept every current Overture emulator.
-- Safe to run on projects that already applied the original Community migration.
alter table public.community_patches
  drop constraint if exists community_patches_instrument_id_check;

alter table public.community_patches
  add constraint community_patches_instrument_id_check check (
    instrument_id is null or instrument_id in (
      'little-phatty',
      'sub-37',
      'prophet-10',
      'nord-c2d',
      'ms-20',
      'juno-106',
      'tr-808',
      'dx7',
      'mellotron-m400',
      'oberheim-eight-voice',
      'hohner-d6',
      'ob-xa',
      'sequential-pro-3',
      'udo-super-8'
    )
  );

alter table public.community_patches
  drop constraint if exists community_record_instrument_consistency;

alter table public.community_patches
  add constraint community_record_instrument_consistency check (
    record_type in ('omni_patch', 'instrument_preset')
    and (instrument_id is null or instrument_id in (
      'little-phatty', 'sub-37', 'prophet-10', 'nord-c2d',
      'ms-20', 'juno-106', 'tr-808', 'dx7', 'mellotron-m400',
      'oberheim-eight-voice', 'hohner-d6', 'ob-xa',
      'sequential-pro-3', 'udo-super-8'
    ))
    and (
      (record_type = 'omni_patch' and instrument_id is null)
      or (record_type = 'instrument_preset' and instrument_id is not null)
    )
  );
