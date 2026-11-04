import { hash } from './world';

export type MonkMotion = 'idle' | 'walk' | 'run' | 'ride';
export const MONK_WALK_SPEED = 1.75;

export interface MonkFootstep {
  /** Local +Z displacement from the standing ankle, in meters. */
  forward: number;
  /** Height above the standing ankle, in meters. */
  lift: number;
}

export interface MonkGaitSample {
  left: MonkFootstep;
  right: MonkFootstep;
  /** Alternating arm swing in radians. */
  armSwing: number;
  armAsymmetry: number;
  /** Pelvis travel toward the supporting foot, in metres. */
  weightShift: number;
  shoulderTurn: number;
  /** Vertical pelvis offset from its neutral position, in meters. */
  bob: number;
  /** Forward torso lean, in radians. */
  lean: number;
  /** Delayed lateral cloth rotation, in radians. */
  clothSway: number;
}

interface Gait {
  period: number;
  speed: number;
  excursion: number;
  clearance: number;
  arm: number;
  bob: number;
  lean: number;
  cloth: number;
}

const run: Gait = { period: 0.62, speed: 4.3, excursion: 0.4, clearance: 0.18,
  arm: 0.58, bob: 0.035, lean: 0.15, cloth: 0.09
};

const stepSeconds = 0.36;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

// A smooth timing drift lasts several steps. Each touchdown also has a smaller
// offset of its own. Both are bounded, so any frame can find its step directly.
function strike(beat: number, seed: number) {
  const group = Math.floor(beat / 5);
  const u = beat / 5 - group;
  const drift = mix(hash(group, 0, seed), hash(group + 1, 0, seed), u * u * (3 - 2 * u));
  return beat * stepSeconds + .14 * (drift - .5) + .042 * (hash(beat, 1, seed) - .5);
}

function plant(beat: number, touchdown: number, nextTouchdown: number, seed: number) {
  const release = nextTouchdown + .019 + .012 * hash(beat, 2, seed);
  const reach = MONK_WALK_SPEED * (release - touchdown) / 2 + .012 * (hash(beat, 3, seed) - .5);
  return { release, reach };
}

function walkingPose(time: number, seed: number): MonkGaitSample {
  let beat = Math.floor(time / stepSeconds);
  if (time < strike(beat, seed)) beat--;
  else if (time >= strike(beat + 1, seed)) beat++;
  const previous = strike(beat - 1, seed), start = strike(beat, seed), next = strike(beat + 1, seed);
  const oldPlant = plant(beat - 1, previous, start, seed);
  const support = plant(beat, start, next, seed);
  const landing = plant(beat + 1, next, strike(beat + 2, seed), seed);

  const stance = { forward: support.reach - MONK_WALK_SPEED * (time - start), lift: 0 };
  const swing = Math.max(0, Math.min(1, (time - oldPlant.release) / (next - oldPlant.release)));
  const ease = swing * swing * (3 - 2 * swing);
  // Interpolate between footprints on the ground, then subtract body travel.
  // At each end of swing the sandal has zero ground velocity.
  const footprintGap = MONK_WALK_SPEED * (next - previous) + landing.reach - oldPlant.reach;
  const passing = {
    forward: oldPlant.reach - MONK_WALK_SPEED * (time - previous) + footprintGap * ease,
    lift: (.065 + .047 * hash(beat, 4, seed)) * Math.sin(Math.PI * swing) ** 2
  };
  const leftSupports = beat % 2 === 0;
  const left = leftSupports ? stance : passing;
  const right = leftSupports ? passing : stance;
  const side = leftSupports ? -1 : 1;
  const progress = (time - start) / (next - start);
  const blend = progress * progress * (3 - 2 * progress);
  const pulse = Math.sin(Math.PI * progress);
  const emphasis = mix(hash(beat, 5, seed), hash(beat + 1, 5, seed), blend);
  const twist = (i: number) => .069 + .067 * hash(i, 6, seed);
  return {
    left, right,
    armSwing: (right.forward - left.forward) * (.39 + .13 * emphasis),
    armAsymmetry: .04 + .26 * (emphasis - .5),
    weightShift: side * pulse * (.021 + .016 * hash(beat, 5, seed)),
    shoulderTurn: side * mix(twist(beat), -twist(beat + 1), blend),
    bob: -.013 + (.024 + .010 * emphasis) * pulse ** 2,
    lean: .029 + .014 * emphasis,
    clothSway: -side * (.036 + .018 * emphasis) * Math.sin(Math.PI * progress - .45)
  };
}

function wrap(value: number) {
  return ((value % 1) + 1) % 1;
}

function footstep(phase: number, gait: Gait, contact: number): MonkFootstep {
  if (phase < contact) {
    return { forward: gait.excursion * (1 - 2 * phase / contact), lift: 0 };
  }

  const swing = (phase - contact) / (1 - contact);
  const smooth = swing * swing * swing * (swing * (swing * 6 - 15) + 10);
  return {
    forward: gait.excursion * (2 * smooth - 1),
    lift: gait.clearance * Math.max(0, Math.sin(Math.PI * swing)) ** 1.5
  };
}

/** Sample an absolute animation time without retaining state or moving the root. */
export function sampleMonkGait(time: number, motion: MonkMotion, seed = 0): MonkGaitSample {
  const seconds = Number.isFinite(time) ? time : 0;
  if (motion === 'walk') return walkingPose(seconds, seed);
  if (motion === 'idle' || motion === 'ride') {
    const breath = Math.sin(seconds * Math.PI * 2 / 3.2);
    return {
      left: { forward: 0, lift: 0 },
      right: { forward: 0, lift: 0 },
      armSwing: 0, armAsymmetry: 0, weightShift: 0, shoulderTurn: 0,
      bob: breath * (motion === 'ride' ? 0.003 : 0.006),
      lean: 0,
      clothSway: breath * 0.005
    };
  }

  const gait = run;
  const phase = wrap(seconds / gait.period);
  const contact = 2 * gait.excursion / (gait.speed * gait.period);
  const left = footstep(phase, gait, contact);
  const right = footstep(wrap(phase + 0.5), gait, contact);
  const stepPhase = phase % 0.5;
  // Compress during support and rise in flight. A low pelvis at touchdown
  // keeps the .4 m ankle excursion reachable by the two .46 m leg links.
  const bob = stepPhase < contact
    ? -gait.bob * (0.35 + 0.65 * Math.sin(Math.PI * stepPhase / contact))
    : gait.bob * (-0.35 + 1.35 * Math.sin(Math.PI * (stepPhase - contact) / (0.5 - contact)));

  return {
    left,
    right,
    armSwing: -gait.arm * (left.forward - right.forward) / (2 * gait.excursion),
    armAsymmetry: 0, weightShift: 0, shoulderTurn: 0,
    bob,
    lean: gait.lean,
    clothSway: gait.cloth * Math.sin(phase * Math.PI * 2 - 0.45)
  };
}
