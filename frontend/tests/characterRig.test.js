import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bones, boneTransforms, LOOP_SECONDS, vectorPose } from '../src/components/hero/characterRig.js';

const transform = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const still = Object.fromEntries(bones.map(bone => [bone.name, { amplitude: 0 }]));
const identity = [1, 0, 0, 1, 0, 0];
const closeMatrix = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

test('the reference pose and the end of the loop preserve every layer coordinate', () => {
  for (const seconds of [0, LOOP_SECONDS]) {
    for (const matrix of boneTransforms(seconds)) assert.ok(closeMatrix(matrix, identity));
  }
});

test('wrist tuning leaves the leg fixed, while the resting hand follows its thigh', () => {
  const handOnly = vectorPose(1, { ...still, 'right-hand': { amplitude: 12, phase: 0 } });
  assert.ok(!closeMatrix(handOnly['right-hand'], identity));
  for (const bone of bones.filter(bone => bone.name !== 'right-hand')) {
    assert.ok(closeMatrix(handOnly[bone.name], identity), `${bone.name} followed the hand`);
  }
  const legOnly = vectorPose(2, { ...still, 'right-leg': { amplitude: 4, phase: 0 } });
  assert.ok(!closeMatrix(legOnly['right-leg'], identity));
  assert.ok(closeMatrix(legOnly['right-hand'], legOnly['right-leg']));
  assert.ok(closeMatrix(legOnly['right-forearm'], legOnly['right-leg']));
  assert.ok(closeMatrix(legOnly['right-arm'], legOnly['right-leg']));
  assert.ok(closeMatrix(legOnly['left-hand'], identity));
  assert.ok(closeMatrix(legOnly['right-leg'], legOnly['right-shoe']), 'shoe follows its own leg');
});

test('arms carry their hands while the two arms and two legs remain independent', () => {
  const pose = vectorPose(2, { ...still, 'left-arm': { amplitude: 5, phase: 0 } });
  assert.ok(!closeMatrix(pose['left-arm'], identity));
  assert.ok(closeMatrix(pose['left-arm'], pose['left-forearm']));
  assert.ok(closeMatrix(pose['left-arm'], pose['left-hand']));
  for (const name of ['right-arm', 'right-forearm', 'right-hand', 'left-leg', 'right-leg']) {
    assert.ok(closeMatrix(pose[name], identity));
  }
});

test('all layers stay rigid throughout the loop, including facial details', () => {
  const a = [375, 90], b = [410, 115];
  for (let t = 0; t <= LOOP_SECONDS; t += LOOP_SECONDS / 64) {
    for (const matrix of boneTransforms(t)) {
      assert.ok(matrix.every(Number.isFinite));
      assert.ok(Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2] - 1) < 1e-9);
      assert.ok(Math.abs(distance(transform(matrix, a), transform(matrix, b)) - distance(a, b)) < 1e-9);
    }
  }
});

test('the animation loop meets with continuous position and velocity', () => {
  const step = 1e-4;
  const start = boneTransforms(0), end = boneTransforms(LOOP_SECONDS);
  const before = boneTransforms(LOOP_SECONDS - step), after = boneTransforms(step);
  for (const [i, bone] of bones.entries()) {
    const point = [bone.pivot[0] + 50, bone.pivot[1] + 50];
    const a = transform(start[i], point), z = transform(end[i], point);
    const p = transform(before[i], point), n = transform(after[i], point);
    assert.ok(distance(a, z) < 1e-9);
    assert.ok(Math.hypot((n[0] - a[0]) / step - (a[0] - p[0]) / step,
      (n[1] - a[1]) / step - (a[1] - p[1]) / step) < .003);
  }
});

test('the shipped illustration contains vector paths and separately owned hand and leg surfaces', () => {
  const svg = readFileSync(new URL('../src/assets/hero-section-illustration/character-vector.svg', import.meta.url), 'utf8');
  assert.doesNotMatch(svg, /<(?:image|clipPath|foreignObject|script)\b|data:image|\.webp|\.png/);
  const joints = [...svg.matchAll(/data-joint="([^"]+)"/g)].map(match => match[1]);
  for (const bone of bones) assert.ok(joints.includes(bone.name), `missing ${bone.name} artwork`);
  assert.ok(svg.indexOf('data-layer="rear-leg"') < svg.indexOf('data-layer="right-hand"'));
  assert.match(svg, /<g id="rear-trouser" data-joint="right-leg"[^>]*>\s*<path fill="#0078FC" d="[^\"]+Z"/);
});
