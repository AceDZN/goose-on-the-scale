# Assets — אווז על המאזניים

All character/prop models were generated in **Tripo Studio** (https://studio.tripo3d.ai/workspace/generate/) in the user's Chrome on 2026-10-24, HD Model, model "H3.1 – Best Quality", text-to-3D. Generation budget: 4 of the allowed 5 generations used. No credits were bought; no plan was upgraded (one "Upgrade for more concurrent tasks" pop-up was closed).

Credits: the balance read **3805** before the first generation. The account is shared with two other builders working at the same moment, so the header balance can't be split per builder. Costs shown by Tripo for this game's own actions: 4 × generation 45 = 180; vendor retopology 35; vendor auto-rig 20; goose retopology 35; goose auto-rig 20; goose AI walk animation 20; preset animations (sing_01, look_around, idle, angry_01) showed no change in the balance. Total ≈ 310 credits.

Everything math-critical (the scale, beam, pans, chains, dial, weight blocks and their numbers, balloons, zero-pairs, change box, share board, seesaw, stamp plates) is **procedural Three.js geometry** in `src/world.ts`, so values are exact. Floor, walls, awnings, shelves, spice cones, crates and lights are procedural too, with canvas textures in `src/textures.ts`. Fonts: Rubik via `@fontsource/rubik` (bundled). Sounds: synthesized WebAudio in `src/audio.ts`. Nothing is fetched at runtime.

## Models

| File in `public/models/` | Tripo task | Prompt (abridged) | Processing | Result |
|---|---|---|---|---|
| `goose.glb` | `0803e98e-78bb-47fb-b4c6-98f71022d6c4` | "A mischievous cartoon white domestic goose standing on two orange webbed feet, long curved neck…, stylized chunky game character…, hand-painted toon texture, full body, side-facing neutral pose, no base" | Tripo retopology (triangles, 20k target → 18,469 faces), Tripo auto-rig "Other" (23 joints incl. a 6-bone neck chain); exported GLB with skeleton; `scripts/optimize-model.mjs` (WebP 1024, meshopt). A Tripo AI-animation walk prompt was generated (20 credits) but Tripo then refused to apply it: "This motion can only be applied to a humanoid rig", so no goose clip is shipped. | 733 KB |
| `vendor.glb` | `02b4622e-1182-4298-a568-550aad213a49` | "A friendly chubby middle-aged Jerusalem market vendor man, cartoon stylized…, big bushy black mustache, flat tweed cap, rolled-up sleeves on a blue and white striped shirt, brown leather apron…, T-pose with arms straight out…" (T-Pose toggle on) | Tripo retopology (18,648 faces), auto-rig Humanoid / Mixamo skeleton, preset animations `sing_01`, `look_around`, `idle`, `angry_01`, exported "in place" with skeleton; optimize script (no simplification needed) | 1.5 MB |
| `sack.glb` | `1043563b-511b-4363-9f6b-998863cf9994` | "A plump closed burlap sack tied at the top with a thick rope bow, coarse woven jute texture…, cartoon stylized game prop…, sitting upright, no base" | optimize script: sloppy simplify 979,978 → 24,588 triangles (regular simplification is blocked by Tripo's UV seams), WebP 512, meshopt | 240 KB |
| `jar.glb` | `91e0993d-8b25-416c-9d60-534a5920d853` | "A chunky glass spice jar with a hammered brass dome lid, filled with bright orange-red paprika powder, a small handwritten paper label tied with string…" | optimize script: 987,562 → 18,525 triangles, WebP 512, meshopt | 215 KB |

The original Tripo exports are kept out of git in `assets-src/` (≈31 MB each). SHA-256 of the originals:

- `goose-scale-sack.glb` — `b39acc157af3b5568d3e89fcf0682daea143080a2545665e753f8c3f2bbde5fb`
- `goose-scale-jar.glb` — `e3f50c5412bc372ab737f7e84cdd58adc596926b531704b7b6c826f2e003b0b6`
- `goose-scale-goose-rigged.glb` — `9ad3dd91193a9ec1319ee794449839a1a6cd180478c244f82c9cf56c541bea2c`
- `goose-scale-vendor.glb` — `1e4d9081807209dd3d2a6e76783abc7e41b92dd62df05d3b2f766151aff9a66f`

Reproduce an optimized file: `node scripts/optimize-model.mjs assets-src/<file>.glb public/models/<name>.glb <targetTris> <textureSize>`.

## How the models are used

- Goose: the player. The Tripo skinned mesh; its neck bones (`Head_0..3`) are driven in code (bob per step, stretch on a honk, wobble when stunned) and the body gets a rigid waddle, hop and spin. Tripo's preset and AI motions only retarget onto humanoid rigs.
- Vendor: one per stall (two on stall 6, the second tinted). Clips are crossfaded by attention state: `sing_01` = humming with back turned (safe), `look_around` = the "?" wind-up and the distracted look, `idle` = watching, `angry_01` = shooing. The body turn itself is procedural so its timing matches the pure-TS attention cycle exactly.
- Sack / jar: every unknown on every scale is a clone of the same model, so identical objects visibly mean the same `x`.
- Colliders are simple circles/boxes in `src/layout.ts`; generated geometry is never used for collision or math.

## Mockups (design reference, not shipped in the game)

`docs/mockups/*.jpg` were generated with ChatGPT image generation in the user's Chrome (conversation "Create Gameplay Screenshot", 2026-10-24) from prompts describing the intended HUD and scenes: stall-1 gameplay, the "caught" moment, the phone layout with the seesaw, and the title screen. Downloaded PNGs were converted to JPEG (quality 85). The title mockup misspells the game's name (אוז); the game uses אווז.
