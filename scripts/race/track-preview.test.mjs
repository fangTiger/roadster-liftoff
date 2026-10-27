import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
test('预览命令生成包含地形与标记的 RGBA 俯视 PNG',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'race-preview-'));
  try {
    const path=join(dir,'preview.png');execFileSync(process.execPath,['scripts/race/track-preview.mjs',path]);
    const data=await readFile(path),meta=await sharp(data).metadata();
    assert.equal(meta.format,'png');assert.ok(meta.width>1200&&meta.height>1200);
    const {data:pixels}=await sharp(data).raw().toBuffer({resolveWithObject:true});
    assert.ok(new Set(Array.from({length:1000},(_,i)=>pixels[i*997])).size>30);
  } finally {await rm(dir,{recursive:true,force:true});}
});
