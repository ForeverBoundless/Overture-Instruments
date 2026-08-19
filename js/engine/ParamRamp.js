export const EPSILON = 1e-6;

export function setImmediate(param, value, ctx) {
  if (!param) return;
  const now = ctx?.currentTime ?? 0;

  if (typeof param.setValueAtTime === 'function') {
    param.setValueAtTime(value, now);
    return;
  }

  if (typeof param.value === 'number') {
    param.value = value;
  }
}

export function glideTo(param, target, seconds, ctx) {
  if (!param) return;
  const now = ctx?.currentTime ?? 0;
  const safeSec = Math.max(seconds ?? 0, 0.0001);

  if (typeof param.cancelScheduledValues === 'function') {
    param.cancelScheduledValues(now);
  }

  if (typeof param.setTargetAtTime === 'function') {
    param.setTargetAtTime(target, now, safeSec);
    return;
  }

  if (typeof param.setValueAtTime === 'function') {
    param.setValueAtTime(target, now);
    return;
  }

  if (typeof param.value === 'number') {
    param.value = target;
  }
}
