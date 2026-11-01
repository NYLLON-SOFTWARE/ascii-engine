export type MonkMotion = 'idle' | 'walk' | 'run' | 'ride';

export interface MonkFootstep {
  /** Local +Z displacement from the standing ankle, in meters. */
  forward: number;
  /** Height above the standing ankle, in meters. */
  lift: number;
}

export interface MonkGaitSample {
  left: MonkFootstep;
  right: MonkFootstep;
  /** Forward swing of the left arm, in radians. The right arm uses its inverse. */
  armSwing: number;
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

// The contact interval follows travel / speed, so a planted ankle moves
// backwards at the same rate as the player moves forwards. The .72 s walk
// leaves a brief double-support phase at 1.75 m/s. Running has a flight phase.
const gaits: Record<'walk' | 'run', Gait> = {
  walk: { period: 0.72, speed: 1.75, excursion: 0.32, clearance: 0.08,
    arm: 0.28, bob: 0.015, lean: 0.035, cloth: 0.045 },
  run: { period: 0.62, speed: 4.3, excursion: 0.4, clearance: 0.18,
    arm: 0.58, bob: 0.035, lean: 0.15, cloth: 0.09 }
};

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
export function sampleMonkGait(time: number, motion: MonkMotion): MonkGaitSample {
  const seconds = Number.isFinite(time) ? time : 0;
  if (motion === 'idle' || motion === 'ride') {
    const breath = Math.sin(seconds * Math.PI * 2 / 3.2);
    return {
      left: { forward: 0, lift: 0 },
      right: { forward: 0, lift: 0 },
      armSwing: 0,
      bob: breath * (motion === 'ride' ? 0.003 : 0.006),
      lean: 0,
      clothSway: breath * 0.005
    };
  }

  const gait = gaits[motion];
  const phase = wrap(seconds / gait.period);
  const contact = 2 * gait.excursion / (gait.speed * gait.period);
  const left = footstep(phase, gait, contact);
  const right = footstep(wrap(phase + 0.5), gait, contact);
  let bob = -gait.bob * Math.cos(phase * Math.PI * 4);

  if (motion === 'run') {
    const stepPhase = phase % 0.5;
    // Compress during support and rise in flight. A low pelvis at touchdown
    // keeps the .4 m ankle excursion reachable by the two .46 m leg links.
    bob = stepPhase < contact
      ? -gait.bob * (0.35 + 0.65 * Math.sin(Math.PI * stepPhase / contact))
      : gait.bob * (-0.35 + 1.35 * Math.sin(Math.PI * (stepPhase - contact) / (0.5 - contact)));
  }

  return {
    left,
    right,
    armSwing: -gait.arm * (left.forward - right.forward) / (2 * gait.excursion),
    bob,
    lean: gait.lean,
    clothSway: gait.cloth * Math.sin(phase * Math.PI * 2 - 0.45)
  };
}
