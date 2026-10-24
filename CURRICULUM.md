# Curriculum map — אווז על המאזניים

Source of truth: Workbook (math.workbook.co.il). Grade-8 modules are snapshotted in `reports/math-games-2026-10-24/curriculum/` of the Idea Plotter repo; grade-7 modules were read through the Workbook MCP (`get_curriculum_content`) on 2026-10-24. Every route below exists in Workbook's catalog; none is invented.

## Core idea and wording

Workbook's grade-7 introduction already frames an equation as a balance: *"נוח לחשוב על משוואות כמו על מאזניים. כל צעד שנעשה בהמשך הפרק יצטרך לשמור על האיזון, ולא רק 'להעביר דברים מצד לצד'."* ([מושג המשוואה](https://math.workbook.co.il/grade-7/chapter-6/equation-concept)). The grade-8 module [חזרה והעמקה במשוואות ממעלה ראשונה](https://math.workbook.co.il/grade-8/chapter-4/equation-deepening) defines a פעולה שקולה as one done to both אגפים in the same way, with no multiplying/dividing by zero.

The game turns that sentence into the stealth rule: the vendor only catches you when the scale is tipped, so the only safe way to change a scale is to do the same thing to both pans quickly.

| Game object | Math meaning | Hebrew term used in the UI |
|---|---|---|
| Left pan / right pan | left / right side of the equation (written left-to-right, as in Workbook's `2x + 3 = 11` example) | הכף השמאלית / הכף הימנית; אגף in the caught message rule |
| Identical sacks (jars on stall 7) | the unknown `x`; identical objects = the same value | שק / צנצנת (נעלם) |
| Iron blocks 1/2/5/10 kg | constants | משקולת |
| Helium balloon | −1 | בלון הליום (−1 ק״ג) |
| Balloon tied to a 1 kg block | zero pair, `1 + (−1) = 0` (מספרים נגדיים) | בלון קשור למשקולת 1 (שווה 0) |
| Change box | rewriting a constant as an equal sum (value-preserving) | קופת עודף |
| Share board ÷k | dividing both sides by k ≠ 0 (keep one of k equal groups on each pan) | לוח חלוקה |
| Seesaw load = n·x | substituting the found value back (הצבה) | נדנדה |
| Chalk tag (optional, logged hint) | the current equation, live, in an LTR isolate | שלט גיר |

## Stalls → modules → skill

| # | Stall | Equation | Skill practised | Workbook modules |
|---|---|---|---|---|
| 1 | דוכן האבטיחים | `x + 3 = 7` | subtract the same constant from both sides | [g7 משוואות x+b=c](https://math.workbook.co.il/grade-7/chapter-6/equations-x-plus-b), [g8 equation-deepening](https://math.workbook.co.il/grade-8/chapter-4/equation-deepening) |
| 2 | דוכן הרימונים | `2x + 1 = 9` | equal rewriting of a constant (change box), then divide both sides by 2 | [g7 משוואות ax+b=c](https://math.workbook.co.il/grade-7/chapter-6/equations-ax-plus-b), [g7 משוואות ax=c](https://math.workbook.co.il/grade-7/chapter-6/equations-ax), g8 equation-deepening |
| 3 | דוכן ההדרים | `3x + 2 = x + 8` | unknown on both sides: remove `x` from both | [g7 משוואות עם נעלם בשני אגפים](https://math.workbook.co.il/grade-7/chapter-6/equations-one-variable), g8 equation-deepening |
| 4 | דוכן הפיצוחים | `2x + 5 = 17` | subtract, then division needs equal groups (10 → 5+5) | g7 equations-ax-plus-b, g8 equation-deepening |
| 5 | דוכן הבלונים והפיתות | `3x − 2 = x + 6` | negative constants; add the same to both sides; zero pairs | [g7 מספרים נגדיים](https://math.workbook.co.il/grade-7/chapter-7/opposite-numbers), [g7 משוואות עם מספרים שליליים](https://math.workbook.co.il/grade-7/chapter-7/equations-with-negatives), g8 equation-deepening |
| 6 | שני מוכרי הזיתים | `4x + 3 = 2x + 15` | multi-step plan under time pressure (two watchers) | g7 equations-one-variable, g8 equation-deepening |
| 7 | דוכן התבלינים (transfer) | `5x − 4 = 2x + 11` | all of the above, new props (jars), no chalk tag, faster vendor, ÷3 | g8 equation-deepening |
| 8 | בונוס: המאזניים המכושפים | `x + 2 = x + 2`, `x + 3 = x + 5` | after removing the unknown from both sides, a true statement means infinitely many solutions, a false one means none | [g8 אין פתרון ואינסוף פתרונות](https://math.workbook.co.il/grade-8/chapter-4/no-and-infinite-solutions), g7 equation-concept ("לא לכל משוואה יש פתרון יחיד") |

Optional context only: [g8 שאלות מילוליות במשוואות](https://math.workbook.co.il/grade-8/chapter-4/word-problems-equations) — the seesaw ("משקל של 2 שקים") is a tiny word problem; no level depends on it.

## What the game deliberately does and does not claim

- Equivalent operations are taught through consequence (tipping is seen, the vendor reacts, the stall resets to the last balanced state with an explanation of what changed on each pan). There is no answer box.
- When a caught move involved sacks on only one side, the message states the difference with `x` (e.g. "כבדה יותר ב־x ק״ג") so getting caught never reveals the hidden value.
- Only positive divisors 2–5 exist on the share board; dividing by zero is impossible by construction.
- A physical balance can also be solved by guessing and substituting (e.g. on stall 7 once you suspect `x = 5`, swapping a jar for a 5 kg block keeps balance). That is valid reasoning (הצבה/בדיקת פתרון) and is not blocked; the solver tests record that the intended equivalent-operation route exists within two unbalanced actions on every stall.
- Automation verifies the math and the rules, not learning. See PLAYTEST.md.
