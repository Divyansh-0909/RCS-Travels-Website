// Each bone owns complete SVG artwork. Overlapping parts use separate matrices:
// a hand moving above a trouser leg cannot deform or uncover a hole in that leg.
export const LOOP_SECONDS = 8;

// Rotational strength is in degrees; cycles is the number of motions per loop.
// All pivots use the full reference image's 755 x 731 coordinate system.
export const bones = [
  { name: 'body', pivot: [344, 340], amplitude: 0, phase: 0 },
  { name: 'head', pivot: [356, 164], amplitude: 1.05, phase: 0 },
  { name: 'hair', pivot: [326, 143], amplitude: 4, phase: 10, parent: 1 },
  { name: 'backpack', pivot: [249, 211], amplitude: 1.1, phase: -.8 },
  { name: 'left-leg', pivot: [311, 348], amplitude: 6, phase: 10 },
  // Names describe screen position. Keep the extended arm still.
  { name: 'left-arm', pivot: [281, 182], amplitude: 0, phase: -.3 },
  { name: 'left-forearm', pivot: [192, 367], amplitude: 0, phase: -.55, parent: 5 },
  { name: 'left-hand', pivot: [165, 414], amplitude: 0, phase: -.8, cycles: 2, parent: 6 },
  { name: 'right-leg', pivot: [359, 366], amplitude: 0.5, phase: 1 },
  // The anatomical left hand rests on this thigh; carry its whole arm together.
  { name: 'right-arm', pivot: [403, 203], amplitude: 0, phase: .15, parent: 8 },
  { name: 'right-forearm', pivot: [454, 382], amplitude: 0, phase: -.6, parent: 9 },
  { name: 'right-hand', pivot: [471, 401], amplitude: 0, phase: -.2, cycles: 2, parent: 10 },
  { name: 'right-shoe', pivot: [596, 611], amplitude: 2.8, phase: -.3, parent: 8 },
  { name: 'left-shoe', pivot: [408, 588], amplitude: 2, phase: -.6, parent: 4 },
];

function multiply(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

export function boneTransforms(seconds, overrides = {}) {
  const phase = ((seconds % LOOP_SECONDS) / LOOP_SECONDS) * Math.PI * 2;
  return bones.reduce((matrices, original, index) => {
    const bone = { ...original, ...overrides[original.name] };
    const angle = bone.amplitude * (Math.sin(phase * (bone.cycles ?? 1) + bone.phase) - Math.sin(bone.phase)) * Math.PI / 180;
    const c = Math.cos(angle), s = Math.sin(angle);
    const [x, y] = bone.pivot;
    const local = [c, s, -s, c, x - c * x + s * y, y - s * x - c * y];
    const parent = bone.parent ?? (index === 0 ? null : 0);
    matrices.push(parent === null ? local : multiply(matrices[parent], local));
    return matrices;
  }, []);
}

export function vectorPose(seconds, overrides) {
  const matrices = boneTransforms(seconds, overrides);
  return Object.fromEntries(bones.map((bone, index) => [bone.name, matrices[index]]));
}
