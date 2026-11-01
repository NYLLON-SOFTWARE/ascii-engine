import * as T from 'three';
import { retimeHorseWalk } from './horse-walk';

export const HORSE_WALK_SPEED = 1.1;
export const HORSE_GALLOP_SPEED = 8;
export const HORSE_WALK_RATE = 1.4;
export const HORSE_GALLOP_RATE = 1.65;

const hoofTracks = ['FrontFootL', 'FrontFootR', 'BackFootL', 'BackFootR']
  .map(name => name + '.position');

/** Find the exporter's common stationary tail after the actual walk cycle. */
function movingLoopEnd(clip: T.AnimationClip) {
  const starts: number[] = [];
  for (const name of hoofTracks) {
    const track = clip.tracks.find(track => track.name === name);
    if (!track || track.times.length < 3) return clip.duration;
    const size = track.getValueSize();
    const last = track.times.length - 1;
    let firstHeld = last;
    while (firstHeld > 0) {
      let same = true;
      for (let component = 0; component < size; component++) {
        if (Math.abs(track.values[(firstHeld - 1) * size + component] - track.values[last * size + component]) > 1e-6) {
          same = false;
          break;
        }
      }
      if (!same) break;
      firstHeld--;
    }
    if (firstHeld === last || firstHeld === 0) return clip.duration;
    starts.push(track.times[firstHeld]);
  }
  return Math.max(...starts);
}

function trimAt(clip: T.AnimationClip, end: number) {
  const trimmed = clip.clone();
  trimmed.duration = end;
  trimmed.tracks = clip.tracks.map(track => {
    const copy = track.clone();
    const interpolation = track.getInterpolation();
    const interpolant = interpolation === T.InterpolateDiscrete
      ? track.InterpolantFactoryMethodDiscrete()
      : interpolation === T.InterpolateSmooth
        ? track.InterpolantFactoryMethodSmooth()
        : track.InterpolantFactoryMethodLinear();
    const endpoint = Array.from(interpolant.evaluate(end) as Float32Array);
    const size = track.getValueSize();
    const times: number[] = [];
    const values: number[] = [];
    for (let i = 0; i < track.times.length && track.times[i] < end; i++) {
      times.push(track.times[i]);
      for (let component = 0; component < size; component++) values.push(track.values[i * size + component]);
    }
    // Keep an exact sampled end key even for tracks with sparse keys that span
    // the cut. Merely dropping later keys would change their interpolation.
    times.push(end);
    values.push(...endpoint);
    copy.times = new Float32Array(times);
    copy.values = new Float32Array(values);
    return copy;
  });
  return trimmed;
}

/** Prepare independent runtime clips without modifying the bundled FBX data. */
export function prepareHorseClips(clips: T.AnimationClip[]): {
  idle: T.AnimationClip;
  walk: T.AnimationClip;
  run: T.AnimationClip;
} {
  function required(suffix: string) {
    const clip = clips.find(clip => clip.name.endsWith('|' + suffix));
    if (!clip) throw new Error('Horse asset is missing its ' + suffix + ' animation.');
    return clip;
  }
  const walk = required('Walk');
  // The supplied Walk clip moves for 1.333 s, then repeats that pose until
  // 2.667 s. Removing this padded half stops the horse gliding on fixed legs.
  return {
    idle: required('Idle').clone(),
    walk: retimeHorseWalk(trimAt(walk, movingLoopEnd(walk))),
    run: required('Run').clone()
  };
}
