import * as T from 'three';

const feet = [
  { name: 'BackFootL', contact: 0, stance: 0.63 },
  { name: 'FrontFootL', contact: 0.25, stance: 0.64 },
  { name: 'BackFootR', contact: 0.5, stance: 0.63 },
  { name: 'FrontFootR', contact: 0.75, stance: 0.64 }
] as const;

const wrap = (phase: number) => ((phase % 1) + 1) % 1;

function sampler(track: T.KeyframeTrack) {
  switch (track.getInterpolation()) {
    case T.InterpolateDiscrete: return track.InterpolantFactoryMethodDiscrete();
    case T.InterpolateSmooth: return track.InterpolantFactoryMethodSmooth();
    default: return track.InterpolantFactoryMethodLinear();
  }
}

/**
 * Keep the authored hoof paths but give the walk four evenly spaced contacts
 * and overlapping stance phases. Run this before baking the limb IK, so the
 * upper/lower leg rotations follow the retimed hoof controls.
 *
 * The source threshold is in FBX track units (about 8 mm at game scale), not
 * world metres. The .63/.64 duty factors approximate measured walking support;
 * exact quarter-cycle contacts are a deliberate simplification for this rig.
 */
export function retimeHorseWalk(source: T.AnimationClip): T.AnimationClip {
  if (!(source.duration > 0)) throw new Error('Horse walk must have a positive duration.');
  const replacements = new Map<string, T.KeyframeTrack>();
  const steps = Math.max(2, Math.ceil(source.duration * 60));
  // Explicit contact/lift keys keep the stance flat even when an event falls
  // between the 60 Hz samples. Include both loop endpoints.
  const times = [...new Set([
    ...Array.from({ length: steps + 1 }, (_, i) => source.duration * i / steps),
    ...feet.flatMap(foot => [foot.contact, wrap(foot.contact + foot.stance)])
      .map(phase => phase * source.duration)
  ])].sort((a, b) => a - b);

  for (const foot of feet) {
    const positionName = foot.name + '.position';
    const track = source.tracks.find(track => track.name === positionName);
    if (!track || track.getValueSize() !== 3) throw new Error('Horse walk is missing ' + positionName);
    const positionSampler = sampler(track);
    const samplePosition = (phase: number) => Array.from(positionSampler.evaluate(wrap(phase) * source.duration) as Float32Array);
    const scanSteps = Math.max(240, Math.ceil(source.duration * 240));
    const scan = Array.from({ length: scanSteps }, (_, i) => samplePosition(i / scanSteps)[1]);
    const ground = Math.min(...scan);
    const threshold = ground + 0.03;
    const contacts: number[] = [], lifts: number[] = [];
    for (let i = 0; i < scanSteps; i++) {
      const a = scan[i], b = scan[(i + 1) % scanSteps];
      if ((a > threshold) === (b > threshold)) continue;
      // Find the crossing on the original interpolant, rather than rounding
      // the source contact time to the scanning frame rate.
      let lo = i / scanSteps, hi = (i + 1) / scanSteps;
      for (let j = 0; j < 20; j++) {
        const mid = (lo + hi) / 2;
        if ((samplePosition(mid)[1] > threshold) === (a > threshold)) lo = mid;
        else hi = mid;
      }
      (a > threshold ? contacts : lifts).push(wrap((lo + hi) / 2));
    }
    if (contacts.length !== 1 || lifts.length !== 1) {
      throw new Error('Horse walk needs one stance interval for ' + foot.name);
    }
    const sourceContact = contacts[0], sourceLift = lifts[0];
    const sourceStance = wrap(sourceLift - sourceContact);
    const sourceSwing = 1 - sourceStance;
    const liftPosition = samplePosition(sourceLift);
    const contactPosition = samplePosition(sourceContact);
    const liftHeight = liftPosition[1];
    const contactHeight = contactPosition[1];
    const quaternionTrack = source.tracks.find(track => track.name === foot.name + '.quaternion');
    const quaternionSampler = quaternionTrack && sampler(quaternionTrack);
    const positions: number[] = [], quaternions: number[] = [];

    for (const time of times) {
      const phase = wrap(time / source.duration - foot.contact);
      const stance = phase <= foot.stance + 1e-10;
      const swingPhase = stance ? 0 : (phase - foot.stance) / (1 - foot.stance);
      const sourcePhase = stance
        ? sourceContact + phase / foot.stance * sourceStance
        : sourceLift + swingPhase * sourceSwing;
      const position = samplePosition(sourcePhase);
      // A planted hoof retreats steadily relative to a steadily moving body.
      // The exported control eases across stance, which otherwise makes it
      // visibly skate even when average stride travel matches ground speed.
      if (stance) {
        position[0] = T.MathUtils.lerp(contactPosition[0], liftPosition[0], phase / foot.stance);
        position[2] = T.MathUtils.lerp(contactPosition[2], liftPosition[2], phase / foot.stance);
      }
      // Lower the contact band onto the floor. Subtract its endpoint baseline
      // throughout swing as well, so plant/lift never introduce a vertical pop.
      position[1] = stance ? ground : ground + Math.max(0,
        position[1] - T.MathUtils.lerp(liftHeight, contactHeight, swingPhase));
      positions.push(...position);
      if (quaternionSampler) {
        const rotation = Array.from(quaternionSampler.evaluate(wrap(sourcePhase) * source.duration) as Float32Array);
        const previous = quaternions.length - 4;
        if (previous >= 0 && rotation.reduce((dot, value, i) => dot + value * quaternions[previous + i], 0) < 0) {
          for (let i = 0; i < rotation.length; i++) rotation[i] = -rotation[i];
        }
        quaternions.push(...rotation);
      }
    }
    replacements.set(positionName, new T.VectorKeyframeTrack(positionName, times, positions));
    if (quaternionTrack) {
      replacements.set(quaternionTrack.name, new T.QuaternionKeyframeTrack(quaternionTrack.name, times, quaternions));
    }
  }
  const result = source.clone();
  result.tracks = source.tracks.map(track => replacements.get(track.name) ?? track.clone());
  return result;
}
