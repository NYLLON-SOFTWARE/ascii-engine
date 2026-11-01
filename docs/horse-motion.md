# Horse motion research and rig repair

The bundled Quaternius horse is a stylized, low-poly animal. Its skeleton is much simpler than equine anatomy. These references guide the animation; the result is not a biomechanical simulation.

## What was wrong

The FBX has separate hoof controls and deforming leg chains. In its walking clip, a front hoof moves about 0.7 m fore/aft after scaling the animal to 1.9 m tall. The endpoint of the corresponding leg chain barely moves. Translating a skinned hoof without solving the joints above it stretches the lower leg and leaves the upper leg stiff.

An earlier repair removed a stationary tail from the Walk clip. That fixed the pause but did not reconnect the limb. Tests that checked only hoof movement missed the problem.

## Research informing the correction

| Reference | Relevant observation | Animation consequence |
| --- | --- | --- |
| [Hodson, Clayton & Lanovaz, 2000: forelimb kinematics](https://pubmed.ncbi.nlm.nih.gov/10952376/) | Upper-arm rotation moves the entire forelimb forward and backward. Scapular and forearm motion lift and lower the distal limb. Swing flexion precedes extension for landing. | Rotate the connected upper and lower leg to follow the hoof, with folding during swing and extension toward contact. |
| [Hodson, Clayton & Lanovaz, 2001: hindlimb kinematics](https://pubmed.ncbi.nlm.nih.gov/11191608/) | Hip motion protracts/retracts the whole limb. Stifle and hock flex together during swing. | Preserve the hind leg's distinct bend direction and move its upper segment as part of each step. |
| [University of Minnesota veterinary anatomy: Designed for Running](https://vanat.ahc.umn.edu/run/) | Forelimbs are straighter; hind limbs are more angular. The horse's reciprocal apparatus links stifle and hock motion. | Do not apply an identical bend direction to all four legs. Fit the solve to this rig's rest pose and segment lengths. |
| [Renders & Vincelette, 2022: gait measurements, Table 3](https://www.intechopen.com/chapters/83285) | The measured walk uses four separate beats, with support throughout the cycle. Timing varies with speed and the individual animal. | Review contact order and support as well as joint movement. A walking horse should not acquire a gallop-like flight phase. |

The papers provide motion relationships, not a ready-made animation for this mesh. In particular, the FBX does not have a separate deforming bone for every anatomical joint, so its two-link visible leg chains are an approximation.

## Runtime implementation

- Remove the source Walk clip's frozen second half, then retain its original swing paths while retiming contacts to left hind, left front, right hind, right front. Contacts are evenly spaced for this stylized rig; hind stance occupies 63% of a cycle and fore stance 64%.
- Keep stance hooves at ground height and move them backward at a constant rate relative to the body. The available 0.62–0.67 m stance sweep fits the game's relaxed 1.1 m/s walk and approximately 0.95-second cycle. These values are chosen for this small model's proportions, not copied as universal horse measurements.
- Solve the upper and lower deforming bones toward each hoof target, with different fore/hind bend directions and fixed segment lengths. Bake the result into animation tracks during loading.
- After animation blending, attach each weighted hoof control to its connected leg endpoint. Linear position blending and quaternion blending otherwise briefly separate the hoof from the leg during gait changes.
- Keep the rider attached to the animated saddle and retain the glyph/depth capture pipeline. The underlying FBX stays unchanged.

The source Run animation supplies the gallop's timing, body motion and hoof paths; the connected-limb correction applies to it too. There is no force simulation, uneven-terrain foot placement, or full anatomical joint model. Speed and support timing have been calibrated for the walking mode; galloping remains a stylized authored motion.

## Verification

Tests load the actual FBX and inspect the deforming skeleton, rather than checking only its hoof controls. They cover proximal rotation, fixed segment lengths, fore/hind bend directions, four-beat contact order, overlapping support, constant stance retreat, source preservation, loop boundaries, off-key interpolation and animation crossfades.

At game scale, the corrected walk retains at least two grounded hooves throughout the sampled cycle. Its stance retreat is approximately 1.04–1.11 m/s against 1.1 m/s forward motion, leaving about 0–4 cm of planting drift per stance. The body is lowered by a stable 7.9 cm while walking so the short foreleg chains can reach the full hoof path; this avoids shortening the stride or introducing an extra bounce.

Side-on captures of the underlying mesh were inspected before and after the repair. In-browser checks also cover the final glyph rendering, mounted movement, walking/galloping transitions, stopping, pause preservation and repeated mounting/dismounting. The [README animation](screenshots/horse-gallop.gif) is recorded gameplay using keyboard input.

## Rider response

The novice's mounted pose uses the actual horse animation phases and blend weights. Galloping adds a modest forward lean, pelvic rocking, a 2.5–7.5 cm rise relative to the saddle, and partial head stabilization. The rise is timed against the bundled saddle trajectory to soften its vertical movement. Walking uses a smaller sway and seat movement.

The pelvis remains aligned to the animated saddle with explicit relative offsets. Hand and foot targets compensate for those offsets and pelvis/chest rotation; the elbows and knees bend to accommodate the movement. This keeps the monk from moving as one rigid figure. The [Walker et al. 2016 galloping study](https://pubmed.ncbi.nlm.nih.gov/27622974/) informed that relationship: riders' feet followed the horse while pelvic motion differed by direction. The novice's pose angles and movement amplitudes are artistic choices fitted to this model.

The rider sampler has no separate animation clock. It uses the same gait crossfade as the horse, preserves a frozen frame, and clears its offsets on dismount or a reference reset. Tests check its motion against the actual FBX saddle, along with stable hand/foot targets and the pose lifecycle.
