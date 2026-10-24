// Authored stalls. Pure data + a builder for the initial rules state.
import type { Item, Kind, StallState } from './rules.ts';
import type { VendorConfig } from './vendor.ts';

export interface ScaleDef {
  x: number;
  L: Kind[];
  R: Kind[];
  /** Local position of the scale centre inside the stall. */
  pos: { x: number; z: number };
}

export interface VendorDef extends Omit<VendorConfig, 'scalePos'> {
  /** Which scale this vendor watches. */
  scale: number;
  tint: number;
}

export interface StallDef {
  id: string;
  num: number;
  title: string;
  tagline: string;
  /** What the goose is told on arrival. */
  intro: string;
  unknown: 'sack' | 'jar';
  scales: ScaleDef[];
  vendors: VendorDef[];
  supply: Kind[];
  changeBox: boolean;
  shareBoard: boolean;
  /** Chalk tag hint allowed (off on the transfer stall). */
  hint: boolean;
  /** Seesaw needs exactly seesawN × x kilograms. Null on the bonus stall. */
  seesawN: number | null;
  /** Bonus stall: classify rigged scales instead of solving. */
  bonus?: boolean;
  awning: [number, number];
  goods: 'melon' | 'pomegranate' | 'citrus' | 'nuts' | 'pita' | 'olives' | 'spice' | 'rugs';
  curriculum: string;
}

const SCALE_C = { x: 0, z: -0.6 };
const VENDOR_C = { x: 0, z: -3.2 };

const cycle = (away: number[], offset = 0, pos = VENDOR_C, scale = 0, tint = 0xffffff): VendorDef => ({
  away,
  warn: 1.3,
  look: 2.6,
  distract: 4.5,
  offset,
  pos,
  scale,
  tint,
});

export const STALLS: StallDef[] = [
  {
    id: 'melon',
    num: 1,
    title: 'דוכן האבטיחים',
    tagline: 'x + 3 = 7',
    intro: 'מה יש בשק? הורידו אותו דבר משתי הכפות — רק כשהמוכר לא מסתכל!',
    unknown: 'sack',
    scales: [{ x: 4, L: ['sack', 'w2', 'w1'], R: ['w2', 'w2', 'w2', 'w1'], pos: SCALE_C }],
    vendors: [cycle([7, 6, 7.5])],
    supply: [],
    changeBox: false,
    shareBoard: false,
    hint: true,
    seesawN: 2,
    awning: [0xd8452f, 0xfff4dc],
    goods: 'melon',
    curriculum: 'https://math.workbook.co.il/grade-8/chapter-4/equation-deepening',
  },
  {
    id: 'two-sacks',
    num: 2,
    title: 'דוכן הרימונים',
    tagline: '2x + 1 = 9',
    intro: 'שני שקים זהים. אין כאן משקולת של 1 בצד ימין… קופת העודף פורטת משקולת לקטנות בלי לשנות את המשקל.',
    unknown: 'sack',
    scales: [{ x: 4, L: ['sack', 'sack', 'w1'], R: ['w5', 'w2', 'w2'], pos: SCALE_C }],
    vendors: [cycle([6.5, 5.5, 7])],
    supply: [],
    changeBox: true,
    shareBoard: true,
    hint: true,
    seesawN: 2,
    awning: [0x2f7d4a, 0xfff4dc],
    goods: 'pomegranate',
    curriculum: 'https://math.workbook.co.il/grade-8/chapter-4/equation-deepening',
  },
  {
    id: 'both-pans',
    num: 3,
    title: 'דוכן ההדרים',
    tagline: '3x + 2 = x + 8',
    intro: 'שקים בשתי הכפות! שק מול שק — אפשר להוריד אחד מכל צד.',
    unknown: 'sack',
    scales: [{ x: 3, L: ['sack', 'sack', 'sack', 'w2'], R: ['sack', 'w2', 'w2', 'w2', 'w1', 'w1'], pos: SCALE_C }],
    vendors: [cycle([6, 5, 6.5])],
    supply: [],
    changeBox: true,
    shareBoard: true,
    hint: true,
    seesawN: 2,
    awning: [0xe39b1b, 0xfff4dc],
    goods: 'citrus',
    curriculum: 'https://math.workbook.co.il/grade-8/chapter-4/equation-deepening',
  },
  {
    id: 'change-box',
    num: 4,
    title: 'דוכן הפיצוחים',
    tagline: '2x + 5 = 17',
    intro: 'משקולת של 10 ק״ג לא מתחלקת לשתי קבוצות של 6… אבל אפשר לפרוט אותה.',
    unknown: 'sack',
    scales: [{ x: 6, L: ['sack', 'sack', 'w5'], R: ['w10', 'w5', 'w1', 'w1'], pos: SCALE_C }],
    vendors: [cycle([5.5, 6.5, 5])],
    supply: [],
    changeBox: true,
    shareBoard: true,
    hint: true,
    seesawN: 2,
    awning: [0x7b3fa0, 0xfff4dc],
    goods: 'nuts',
    curriculum: 'https://math.workbook.co.il/grade-8/chapter-4/equation-deepening',
  },
  {
    id: 'balloons',
    num: 5,
    title: 'דוכן הבלונים והפיתות',
    tagline: '3x − 2 = x + 6',
    intro: 'בלון הליום מושך את הכף למעלה: הוא שווה −1 ק״ג. בלון ומשקולת של 1 על אותה כף = 0.',
    unknown: 'sack',
    scales: [{ x: 4, L: ['sack', 'sack', 'sack', 'balloon', 'balloon'], R: ['sack', 'w2', 'w2', 'w1', 'w1'], pos: SCALE_C }],
    vendors: [cycle([6, 5.5, 6.5])],
    supply: ['w1', 'w1', 'w1', 'w1'],
    changeBox: true,
    shareBoard: true,
    hint: true,
    seesawN: 2,
    awning: [0x1f6fb2, 0xfff4dc],
    goods: 'pita',
    curriculum: 'https://math.workbook.co.il/grade-8/chapter-4/equation-deepening',
  },
  {
    id: 'two-vendors',
    num: 6,
    title: 'שני מוכרי הזיתים',
    tagline: '4x + 3 = 2x + 15',
    intro: 'שני מוכרים שומרים על אותם מאזניים, כל אחד בקצב שלו. חפשו את הרגע ששניהם עסוקים.',
    unknown: 'sack',
    scales: [
      {
        x: 6,
        L: ['sack', 'sack', 'sack', 'sack', 'w2', 'w1'],
        R: ['sack', 'sack', 'w5', 'w5', 'w2', 'w1', 'w1', 'w1'],
        pos: SCALE_C,
      },
    ],
    vendors: [cycle([7, 6, 8], 0, { x: -2.6, z: -3.2 }, 0, 0xffffff), cycle([6.5, 7.5, 6], 3.4, { x: 2.6, z: -3.2 }, 0, 0xc9e3ff)],
    supply: [],
    changeBox: true,
    shareBoard: true,
    hint: true,
    seesawN: 2,
    awning: [0x5f7a2a, 0xfff4dc],
    goods: 'olives',
    curriculum: 'https://math.workbook.co.il/grade-8/chapter-4/equation-deepening',
  },
  {
    id: 'spice',
    num: 7,
    title: 'דוכן התבלינים',
    tagline: 'צנצנות במקום שקים',
    intro: 'בלי שלט גיר הפעם. המוכרת זריזה. צנצנות זהות — אותו נעלם.',
    unknown: 'jar',
    scales: [{ x: 5, L: ['jar', 'jar', 'jar', 'jar', 'jar', 'balloon', 'balloon', 'balloon', 'balloon'], R: ['jar', 'jar', 'w10', 'w1'], pos: SCALE_C }],
    vendors: [{ ...cycle([5, 4.5, 5.5]), warn: 1.2, look: 2.4 }],
    supply: ['w1', 'w1', 'w1', 'w1', 'w2', 'w2'],
    changeBox: true,
    shareBoard: true,
    hint: false,
    seesawN: 2,
    awning: [0xb5341f, 0xf2c14e],
    goods: 'spice',
    curriculum: 'https://math.workbook.co.il/grade-8/chapter-4/equation-deepening',
  },
  {
    id: 'rigged',
    num: 8,
    title: 'בונוס: המאזניים המכושפים',
    tagline: 'אינסוף פתרונות / אין פתרון',
    intro: 'המוכרים נמנמים. אחד המאזניים מאוזן תמיד, והשני לעולם לא. הורידו אותו דבר משני האגפים — ואז החתימו כל אחד.',
    unknown: 'sack',
    scales: [
      { x: 3, L: ['sack', 'w2'], R: ['sack', 'w1', 'w1'], pos: { x: -2.6, z: -0.6 } },
      { x: 3, L: ['sack', 'w2', 'w1'], R: ['sack', 'w5'], pos: { x: 2.6, z: -0.6 } },
    ],
    vendors: [{ ...cycle([9]), asleep: true }],
    supply: [],
    changeBox: false,
    shareBoard: false,
    hint: true,
    seesawN: null,
    bonus: true,
    awning: [0xc89b2c, 0x2a2a6a],
    goods: 'rugs',
    curriculum: 'https://math.workbook.co.il/grade-8/chapter-4/no-and-infinite-solutions',
  },
];

export function buildStall(def: StallDef): StallState {
  let nextId = 1;
  const mk = (kind: Kind): Item => ({ id: nextId++, kind });
  const scales = def.scales.map((sc) => ({ x: sc.x, L: sc.L.map(mk), R: sc.R.map(mk) }));
  const supply = def.supply.map(mk);
  return { scales, ground: [], supply, sky: [], seesaw: [], beak: null, nextId };
}

export function vendorConfig(def: StallDef, i: number): VendorConfig {
  const v = def.vendors[i];
  const sc = def.scales[v.scale].pos;
  return { ...v, scalePos: sc };
}
