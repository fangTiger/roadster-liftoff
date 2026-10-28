// 改动物理后同步提升 SIM_VERSION，再显式重新生成黄金记录。
import { writeFile } from 'node:fs/promises';
import { buildTrack } from '../../src/race/track/build.js';
import def from '../../src/race/track/data/alpine.js';
import { createSession } from '../../src/race/sim/session.js';
import { autopilot } from '../../src/race/sim/autopilot.js';
import { SIM_VERSION } from '../../src/race/sim/physics.js';
import { stateHash } from '../../src/race/sim/replay.js';
const track=buildTrack(def),session=createSession(track);
for(let i=0;i<43200&&!session.snapshot.race.finished;i++)session.step(autopilot(session.snapshot,track));
const s=session.snapshot;if(!s.race.finished)throw new Error('机器人未在六分钟内完赛，不能生成黄金记录');
const golden={v:SIM_VERSION,lapTimes:s.race.lapTimes,bestLap:s.race.bestLap,hash:stateHash(s)};
await writeFile(new URL('../../src/race/sim/golden.json',import.meta.url),JSON.stringify(golden,null,2)+'\n');
console.log('黄金记录已更新',golden);
