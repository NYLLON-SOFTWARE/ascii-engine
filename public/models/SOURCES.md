# Glyph Valley actor assets

The current player character is an original procedural novice monk. The horse uses a Quaternius FBX. Knight and equipment files from the previous prototype are retained for provenance and are no longer loaded by the runtime.

The FBX assets were downloaded 2026-10-31 from the creator's official itch.io pages. Quaternius distributes those assets under CC0 1.0 Universal, as declared on both the pack pages and itch.io distribution pages. The Google Drive download links on the pack pages were temporarily quota-limited; the equivalent official itch.io distributions supplied these files.

## Novice monk — current player

- Source: original Three.js geometry in [`src/monk.ts`](../../src/monk.ts). No external player model or sprite sheet is loaded.
- Appearance: matte clay-colored robe, crossed linen collar, sash, shaved head, trousers, and sandals. Split lower-robe panels respond to the legs and riding pose.
- Animation: deterministic idle, walk, run, and riding samples from [`src/monk-gait.ts`](../../src/monk-gait.ts), with foot targets, two-link leg inverse kinematics, opposing arm swings, and cloth motion.
- Movement: walking at 1.75 m/s and running at 4.3 m/s. The default scene starts on foot.
- Rendering: the procedural monk enters the existing actor color/depth capture and glyph reconstruction pipeline. Mounted monk and horse are captured together.

## Knight and equipment — archived prototype

- Author: Quaternius
- Pack: Animated Knight Pack (July 2018)
- Official pack: https://quaternius.com/packs/knightcharacter.html
- Official distribution: https://quaternius.itch.io/lowpoly-animated-knight
- Source archive: `Knight Character Animated by Quaternius.zip`
- Downloaded FBX files: `KnightCharacter.fbx` → `knight.fbx`, `Helmet2.fbx` → `helmet.fbx`, `ShoulderPads.fbx` → `shoulder-pads.fbx`, `Sword.fbx` → `sword.fbx`.

The previous prototype used `HumanArmature|Idle`, `HumanArmature|Walking`, and `HumanArmature|Run`. Additional sword, jump, death, and roll clips are preserved in the source file. The pack contains no authored riding clip. Equipment is unbound static geometry. These files are retained unchanged as historical assets; no knight, helmet, shoulder pads, or sword is loaded in the current game.

## Horse — current mount

- Author: Quaternius
- Pack: Farm Animal Pack (June 2018)
- Official pack: https://quaternius.com/packs/farmanimal.html
- Official distribution: https://quaternius.itch.io/lowpoly-animated-animals
- Source archive: `Farm Animals Animated by Quaternius.zip`
- Downloaded file: `FBX/Horse.fbx` → `horse.fbx`.

Clips: `Armature|Idle`, `Armature|WalkSlow`, `Armature|Walk`, `Armature|Run`, `Armature|Jump`, `Armature|Death`. The horse's head points toward positive Z in its imported rest pose.

## Technical notes

- All five files successfully parsed with Three.js `FBXLoader` on 2026-10-31.
- Materials use embedded solid colors; there are no external textures to resolve.
- The FBX models use large source units. The active horse model is normalized from its bounding box to approximately 1.9 m in height. Its unscaled height is about 690.58 units. The archived knight is about 558.73 source units tall.
- Three.js reports that some source vertices contain more than four skinning weights and discards additional weights. This is the loader's standard behavior; inspect animation silhouettes in the renderer.
- Exact file digests, source bounds, sizes and animation durations are recorded in `manifest.json`.
- License: https://creativecommons.org/publicdomain/zero/1.0/
