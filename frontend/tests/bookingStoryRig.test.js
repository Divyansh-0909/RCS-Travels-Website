import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraPose, jointPose, storyState, views, LOOP_SECONDS } from '../src/components/booking-story/bookingStoryRig.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const numbers = transform => transform.match(/-?\d+(?:\.\d+)?/g).map(Number);

test('shoulder artwork and final phone agree at every phone corner through the reveal', () => {
    for (const progress of [.56, .6, .66, .8, .86, .93, 1]) {
        const pose = cameraPose(progress);
        const [x, y, scale] = numbers(pose.transforms[2]);
        const [px, py, phoneScale] = numbers(pose.phone);
        for (const [a, b] of [[82, 32], [331, 46], [302, 556], [52, 543]]) {
            near(x + (550 + a * .38) * scale, px + a * phoneScale);
            near(y + (274 + b * .38) * scale, py + b * phoneScale);
        }
    }
});

test('camera and booking steps are deterministic in either scroll direction', () => {
    const progress = Array.from({ length: 201 }, (_, i) => i / 200);
    const forward = progress.map(value => [cameraPose(storyState(value).camera), storyState(value)]);
    const backward = [...progress].reverse().map(value => [cameraPose(storyState(value).camera), storyState(value)]).reverse();
    assert.deepEqual(forward, backward);
    assert.deepEqual(cameraPose(.34).weights, [0, 1, 0]);
    assert.deepEqual(cameraPose(.66).weights, [0, 0, 1]);
    for (const [value, step] of [[.2, 0], [.4, 1], [.6, 2], [.8, 3], [1, 3]]) assert.equal(storyState(value).step, step);
    assert.equal(storyState(-1).progress, 0);
    assert.equal(storyState(2).progress, 1);
});

test('phone transform is identical throughout all four reading stages', () => {
    const expected = cameraPose(1).phone;
    for (const value of [.2, .32, .45, .6, .72, .9, 1]) assert.equal(cameraPose(storyState(value).camera).phone, expected);
});

test('joint movement loops without drift and keeps the phone on the same wrist pivot', () => {
    for (let view = 0; view < 3; view++) {
        for (const joint of ['hair-back', 'hair-lock', 'head', 'holding-arm', 'resting-arm']) {
            assert.equal(jointPose(joint, 0, view), jointPose(joint, LOOP_SECONDS, view));
            near(numbers(jointPose(joint, 2, view, 0))[0], 0);
        }
    }
    const arm = numbers(jointPose('holding-arm', 2, 2));
    const grip = numbers(jointPose('phone-grip', 2, 2));
    near(arm[0], grip[0]);
    near(550 + grip[1] * .38, views[2].pivot[0]);
    near(274 + grip[2] * .38, views[2].pivot[1]);
    assert.equal(jointPose('shirt', 2, 0), '');
});
