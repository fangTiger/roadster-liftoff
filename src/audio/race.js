// 音效只消费快照；事件游标防止渲染重复播放，墙声与接触声各限制为每 0.2 秒一次。
export function createRaceAudio(audio) {
  let seen = 0, countdown, finished = false, wallStep = -Infinity, contactStep = -Infinity;
  return {
    reset() { seen = 0; countdown = undefined; finished = false; wallStep = contactStep = -Infinity; },
    update(snapshot, bits, dt) {
      const { car: c, race: r, events } = snapshot;
      const speed = Math.hypot(c.vx, c.vz), lateral = Math.abs(c.vx * Math.cos(c.yaw) - c.vz * Math.sin(c.yaw));
      audio.update(dt, { speedKmh: speed * 3.6, throttle: !r.frozen && !r.finished && (bits & 1) ? 1 : 0, brake: bits & 2 ? 1 : 0, jet: !!(bits & 16) && c.fuel > 0 && !r.frozen && !r.finished, boost: c.boostTime > 0 ? 1 : 0, tireSlip: c.grounded ? Math.max(c.drifting ? .7 : 0, Math.min(1, lateral / 12)) : 0 });
      const count = r.frozen ? Math.ceil(r.countdown) : 0;
      if (count !== countdown) { if (count > 0) audio.event('raceBeep'); else if (countdown > 0) audio.event('raceGo'); countdown = count; }
      for (; seen < events.length; seen++) {
        const e = events[seen];
        if (e.type === 'wall' && e.step - wallStep >= 24) { audio.event('raceWall'); wallStep = e.step; }
        if (e.type === 'contact' && e.step - contactStep >= 24) { audio.event('raceContact', { impact: e.impact }); contactStep = e.step; }
        if (['boost', 'counterBoost', 'driftBoost'].includes(e.type)) audio.event('raceBoost');
        if (e.type === 'lap') audio.event('raceLap');
        if (e.type === 'coin') audio.event('coin');
      }
      if (r.finished && !finished) { audio.event('raceFinish'); finished = true; }
    },
  };
}
