# Playtest log — what was verified, and what wasn't

Date: 2026-10-24. Tester: the builder (automation + screenshots). **No child or teacher has played it yet.** Automation can show the rules are correct and the screens render; it cannot show the game is fun or that anyone learns from it.

## Automated

- `npm test`: 22 tests pass (rules, solver, vendor cycle). Highlights:
  - each stall starts balanced and only its hidden `x` balances it (x = 0…20 checked);
  - every stall has a **safe** solution (never more than 2 unbalanced actions in a row) with a fixed par: 7 / 8 / 9 / 8 / 13 / 12 / 27 actions;
  - stalls 2 and 4 can't be solved safely without the change box; stalls 2–6 can't be solved safely without the share board;
  - wrong moves produce the advertised consequence (remove 2 kg from one pan → left lighter by 2 with the change named; balloon removed + 1 kg removed on the other side → left heavier by 2, not balanced);
  - the share board explains its refusals (balloons on a pan, sack count, total not divisible, block too big);
  - rigged scales: `x + 2 = x + 2` balances for every x, `x + 3 = x + 5` for none, and both classify correctly after reduction;
  - vendor: the warning never catches, honk from behind distracts, honk from the scale side starts the turn, two offset vendors leave a ≥ 2.5 s shared window.
- In-browser **autosolve** (`window.__debug.autosolve(i)`) drives the real game controller through the solver's moves on every stall (goose teleported to each spot): all 7 stalls reached `phase: solved` with the correct `x` (4, 4, 3, 6, 4, 6, 5) and 0 catches. The first run of stall 7 failed and exposed a real bug: E at the supply crate always handed over the last block (a 2 kg), so a player couldn't pick a 1 kg block to tie to a balloon. Fixed (E takes the block nearest the beak; supply blocks are clickable) and re-verified.

## In a real browser (built-in browser pane + Chrome tab)

- Title screen over the live 3D scene; Hebrew logo, play / stall select / how-to, medallions with stars, key chips.
- Stall 1 full run by script: two pair-removals → solved card `x = 4` → vendor celebrates → chalk tag shows `x = 4` → seesaw loaded with 4 × 2 kg (catapult pose: goose on the lowered end) → launch → perfect → 3-star result panel.
- Caught flow: took 1 kg from the left pan only and waited → vendor turned (? wind-up), spun to face the camera with the red "!", meter "קישטה!", feathers + shake, card "נתפסת!" explaining per pan what changed and which side is heavier; stall restored to the last balanced state.
- Short launch (6 kg vs 8) → tomato-crate splat message with the load vs. the target.
- Rendered and looked at: stall 2 (Tripo sacks, change box, ÷ plates), stall 5 (balloons, supply crate), stall 6 (two Tripo vendors with offset humming), stall 7 (Tripo paprika jars, hint disabled), bonus (sleeping vendor "z", stamp plates, early-stamp refusal, golden feather on `2 = 2`).
- Phone landscape 844×390 with touch layout (`?touch`): joystick, action/honk/jump cluster as in mockup 3, beak and objective pills moved off the goose, chalk tag in frame.
- Tripo models confirmed loaded in gameplay: `__models` reports goose, vendor (clips `angry_01`, `sing_01`, `idle`, `look_around`), sack, jar.
- Console: no errors during these runs.

## Performance (measured, not estimated)

`__debug.bench(120)` renders 120 frames synchronously. Chrome tab in the background, 1728×780 CSS px at DPR 2, on a machine also running two other builders' dev servers:

| Scene | before batching | after |
|---|---|---|
| Stall 7 (heaviest) | 129 ms/frame, 903 draw calls, 404k tris | ≈ 37 ms/frame, ≈ 320 calls, 214k tris |
| Stall 1 | — | ≈ 16.7 ms/frame, 241 calls, 142k tris |

An adaptive pixel ratio steps resolution down (2 → 1) if the live frame rate stays under 45 fps for 3 s. Real-device FPS on a school laptop or phone was **not** measured.

Bundle: JS 761 kB (203 kB gzip), CSS 17 kB, fonts ≈ 150 kB, models 2.5 MB; `dist/` ≈ 3.4 MB.

## Known limits

- Timing feel (vendor windows 4.5–8 s, 1.2–1.3 s warning) was tuned by reasoning and the solver's par, not by watching players. Stall 6 and 7 may be too hard or too easy.
- A player can find `x` by guessing and substituting (a jar for a 5 kg block once you suspect 5). That's mathematically valid and not blocked; it's documented in CURRICULUM.md.
- The goose's Tripo rig is non-humanoid, so Tripo's animation presets/AI motions don't apply; its neck is animated in code and the body waddles rigidly.
- The vendor has no `sit` clip (Tripo's retarget queue was taking ~20 min per preset); on the bonus stall he naps standing (`idle` + a "z" bubble).
- The built-in browser pane auto-pauses when hidden (by design); tests use `?test`.
