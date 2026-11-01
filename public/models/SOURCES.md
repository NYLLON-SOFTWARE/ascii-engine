# Glyph Valley actor assets

Downloaded 2026-10-31 from the creator's official itch.io pages. These assets are distributed by Quaternius under CC0 1.0 Universal, as declared on both the pack pages and itch.io distribution pages. The Google Drive download links on the pack pages were temporarily quota-limited; the equivalent official itch.io distributions supplied these files.

## Knight and equipment

- Author: Quaternius
- Pack: Animated Knight Pack (July 2018)
- Official pack: https://quaternius.com/packs/knightcharacter.html
- Official distribution: https://quaternius.itch.io/lowpoly-animated-knight
- Source archive: `Knight Character Animated by Quaternius.zip`
- Downloaded FBX files: `KnightCharacter.fbx` → `knight.fbx`, `Helmet2.fbx` → `helmet.fbx`, `ShoulderPads.fbx` → `shoulder-pads.fbx`, `Sword.fbx` → `sword.fbx`.

Recommended clips: `HumanArmature|Idle`, `HumanArmature|Walking`, `HumanArmature|Run`. Additional sword, jump, death and roll clips are preserved. There is no authored riding clip: a seated riding pose must be layered onto the rig. Equipment is unbound static geometry and must be attached/positioned to the desired bone.

## Horse

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
- Models use large source units. Normalize using a bounding box rather than assuming meters. Unscaled knight height is about 558.73 units; horse height is about 690.58 units.
- Three.js reports that some source vertices contain more than four skinning weights and discards additional weights. This is the loader's standard behavior; inspect animation silhouettes in the renderer.
- Exact file digests, source bounds, sizes and animation durations are recorded in `manifest.json`.
- License: https://creativecommons.org/publicdomain/zero/1.0/
