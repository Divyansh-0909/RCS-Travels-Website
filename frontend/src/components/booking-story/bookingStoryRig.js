export const LOOP_SECONDS = 8;
export const CAMERA_END = .2;
export const clamp = value => Math.min(1, Math.max(0, value));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

// Screen centers, in the authored SVG's coordinate system. K03 shares K04's
// exact phone/grip geometry, at .38 scale and a (550,274) translation.
export const views = [
  { name: 'standing', anchor: [581, 266], height: 118, pivot: [500, 365], hair: [414, 220] },
  { name: 'side', anchor: [647, 360], height: 158, pivot: [550, 515], hair: [413, 245] },
  { name: 'shoulder', anchor: [622.96, 385.72], height: 194.56, pivot: [564, 520], hair: [420, 260] },
];

const keys = [
  { at: 0, anchor: [690, 285], height: 114 },
  { at: .34, anchor: [740, 362], height: 190 },
  { at: .66, anchor: [770, 408], height: 310 },
  { at: 1, anchor: [880, 420], height: 650 },
];

export function cameraPose(value) {
  const progress = clamp(value);
  const index = Math.min(2, keys.findIndex((key, i) => i < 3 && progress <= keys[i + 1].at));
  const start = keys[index], end = keys[index + 1];
  const t = smooth((progress - start.at) / (end.at - start.at));
  const anchor = [mix(start.anchor[0], end.anchor[0], t), mix(start.anchor[1], end.anchor[1], t)];
  const height = mix(start.height, end.height, t);
  // A matched dissolve happens around the side and shoulder keys. These are
  // newly drawn angles; the full character is never rotated as a flat sheet.
  const side = smooth((progress - .24) / .10);
  const shoulder = smooth((progress - .56) / .10);
  const final = smooth((progress - .86) / .14);
  const weights = [1 - side, side * (1 - shoulder), shoulder * (1 - final)];
  const transforms = views.map(view => {
    const scale = height / view.height;
    return `translate(${anchor[0] - view.anchor[0] * scale} ${anchor[1] - view.anchor[1] * scale}) scale(${scale})`;
  });
  const scale = height / 512;
  return { progress, anchor, height, weights, transforms, phone: `translate(${anchor[0] - 192 * scale} ${anchor[1] - 294 * scale}) scale(${scale})`, phoneOpacity: shoulder };
}

export function storyState(value) {
  const progress = clamp(value);
  const camera = clamp(progress / CAMERA_END);
  const position = clamp((progress - CAMERA_END) / (1 - CAMERA_END)) * 4;
  const step = Math.min(3, Math.floor(position + 1e-9));
  return { progress, camera, step, phase: clamp(position - step), reading: progress >= CAMERA_END };
}

// Rotation limits are degrees and can be edited independently. Holding-arm
// groups include the sleeve, wrist, grip AND phone, so the phone cannot slip.
export const motion = {
  'hair-back': { degrees: 1.1, phase: 0 },
  'hair-lock': { degrees: 1.7, phase: .4 },
  head: { degrees: .25, phase: .2 },
  backpack: { degrees: .45, phase: -.3 },
  'holding-arm': { degrees: .45, phase: .6 },
  'resting-arm': { degrees: .65, phase: -.3 },
};

export function jointPose(joint, seconds, viewIndex, strength = 1) {
  const setting = motion[joint === 'phone-grip' ? 'holding-arm' : joint];
  if (!setting) return '';
  const view = views[viewIndex];
  const pivot = joint === 'phone-grip' ? [36.8421052632, 647.368421053] : joint.startsWith('hair') || joint === 'head' ? view.hair : joint === 'holding-arm' ? view.pivot : [380, 350];
  const phase = (seconds % LOOP_SECONDS) / LOOP_SECONDS * Math.PI * 2;
  const angle = setting.degrees * strength * (Math.sin(phase + setting.phase) - Math.sin(setting.phase));
  return `rotate(${angle.toFixed(5)} ${pivot.join(' ')})`;
}
