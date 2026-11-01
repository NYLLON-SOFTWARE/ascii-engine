export interface RiderStrideState {
  /** Normalized times of the horse's actual animation actions. */
  walkPhase: number;
  runPhase: number;
  /** Effective mixer weights, including the current gait crossfade. */
  walkWeight: number;
  runWeight: number;
}

export interface RiderPose {
  /** Pelvis displacement relative to the saddle, in metres. */
  seatLift: number;
  seatForward: number;
  /** Pelvis rotations in radians. Positive pitch leans toward local +Z. */
  pelvisPitch: number;
  pelvisRoll: number;
  /** Torso/head rotations in radians; head pitch is relative to the torso. */
  lean: number;
  torsoRoll: number;
  headPitch: number;
  clothSway: number;
}

const tau = Math.PI * 2;
const phase = (value: number) => Number.isFinite(value) ? ((value % 1) + 1) % 1 : 0;
const weight = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

/**
 * Pose the rider from the horse's animation clock, not a second oscillator.
 *
 * The bundled Torso track has walk troughs at phase 0/.5 and gallop troughs
 * around .22–.34, with its gallop crest at 0. The light seat peaks at .40,
 * just after the low saddle interval, and settles as the saddle rises. This absorbs
 * some of the horse's movement rather than stacking a bounce on top of it.
 * The amplitudes are a stylized light seat, not measured human joint angles.
 */
export function sampleRiderMotion(state: RiderStrideState): RiderPose {
  const w = phase(state.walkPhase) * tau;
  const r = phase(state.runPhase) * tau;
  let walkWeight = weight(state.walkWeight);
  let runWeight = weight(state.runWeight);
  // A transient or invalid mixer state must not double the rider's movement.
  const total = Math.max(1, walkWeight + runWeight);
  walkWeight /= total;
  runWeight /= total;

  const walk: RiderPose = {
    seatLift: 0.006 + 0.006 * Math.cos(w * 2),
    seatForward: 0.007 * Math.sin(w * 2 - 0.25),
    pelvisPitch: 0.018 * Math.sin(w * 2 - 0.3),
    pelvisRoll: 0.015 * Math.sin(w),
    lean: 0.045 + 0.008 * Math.sin(w * 2 - 0.6),
    torsoRoll: -0.006 * Math.sin(w - 0.22),
    headPitch: -0.018 - 0.006 * Math.sin(w * 2 - 0.6),
    clothSway: 0.012 * Math.sin(w - 0.45)
  };
  const gallopRock = Math.sin(r - tau * 0.10);
  const gallopLean = 0.055 * Math.sin(r - tau * 0.12);
  const run: RiderPose = {
    seatLift: 0.05 + 0.025 * Math.cos(r - tau * 0.40),
    seatForward: 0.018 + 0.016 * Math.sin(r - tau * 0.16),
    pelvisPitch: 0.045 * gallopRock,
    pelvisRoll: 0.012 * Math.sin(r + 0.35),
    lean: 0.32 + gallopLean,
    torsoRoll: -0.007 * Math.sin(r + 0.1),
    headPitch: -0.12 - 0.65 * gallopLean,
    clothSway: 0.025 * Math.sin(r - 0.65)
  };
  const result = {} as RiderPose;
  for (const key of Object.keys(walk) as (keyof RiderPose)[]) {
    result[key] = (walk[key] * walkWeight + run[key] * runWeight) || 0;
  }
  return result;
}
