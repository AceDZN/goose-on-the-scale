// Canvas-generated textures: limestone pavers, wall blocks, awnings, wood, labels and the chalk tag.
import * as THREE from 'three';

const FONT = '"Rubik", "Heebo", system-ui, sans-serif';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function tex(c: HTMLCanvasElement, repeat?: [number, number]): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

/** Warm Jerusalem limestone pavers, irregular rows. */
export function paverTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 1024);
  const r = rand(7);
  g.fillStyle = '#8a7457';
  g.fillRect(0, 0, 1024, 1024);
  let y = 0;
  while (y < 1024) {
    const h = 90 + r() * 60;
    let x = -r() * 80;
    while (x < 1024) {
      const w = 110 + r() * 120;
      const tone = 150 + r() * 38;
      g.fillStyle = `rgb(${tone + 30}, ${tone - 2}, ${tone - 52})`;
      const pad = 5;
      roundRect(g, x + pad, y + pad, w - pad * 2, h - pad * 2, 14);
      g.fill();
      // speckles + worn centre
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(${r() < 0.5 ? '120,95,60' : '255,245,220'},${0.08 + r() * 0.1})`;
        g.beginPath();
        g.arc(x + pad + r() * (w - pad * 2), y + pad + r() * (h - pad * 2), 1 + r() * 4, 0, Math.PI * 2);
        g.fill();
      }
      const grd = g.createRadialGradient(x + w / 2, y + h / 2, 5, x + w / 2, y + h / 2, w * 0.6);
      grd.addColorStop(0, 'rgba(255,240,210,0.18)');
      grd.addColorStop(1, 'rgba(90,60,30,0.12)');
      g.fillStyle = grd;
      roundRect(g, x + pad, y + pad, w - pad * 2, h - pad * 2, 14);
      g.fill();
      x += w;
    }
    y += h;
  }
  return tex(c, [3, 3]);
}

/** Big ashlar blocks for stall walls. */
export function wallTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 1024);
  const r = rand(11);
  g.fillStyle = '#9d8564';
  g.fillRect(0, 0, 1024, 1024);
  const rowH = 128;
  for (let row = 0; row < 8; row++) {
    let x = row % 2 ? -110 : 0;
    while (x < 1024) {
      const w = 180 + r() * 90;
      const tone = 176 + r() * 36;
      g.fillStyle = `rgb(${tone + 26}, ${tone - 4}, ${tone - 52})`;
      roundRect(g, x + 6, row * rowH + 6, w - 12, rowH - 12, 18);
      g.fill();
      for (let i = 0; i < 60; i++) {
        g.fillStyle = `rgba(${r() < 0.6 ? '110,80,45' : '255,245,225'},${0.06 + r() * 0.12})`;
        g.fillRect(x + 8 + r() * (w - 16), row * rowH + 8 + r() * (rowH - 16), 2 + r() * 6, 2 + r() * 4);
      }
      x += w;
    }
  }
  return tex(c, [2, 1]);
}

export function stripeTexture(a: number, b: number, stripes = 8): THREE.CanvasTexture {
  const [c, g] = canvas(512, 64);
  const ca = `#${a.toString(16).padStart(6, '0')}`;
  const cb = `#${b.toString(16).padStart(6, '0')}`;
  for (let i = 0; i < stripes; i++) {
    g.fillStyle = i % 2 ? cb : ca;
    g.fillRect((i * 512) / stripes, 0, 512 / stripes + 1, 64);
  }
  g.fillStyle = 'rgba(0,0,0,0.08)';
  for (let i = 0; i < 512; i += 3) g.fillRect(i, 0, 1, 64);
  return tex(c);
}

export function woodTexture(seed = 3, base = '#8a5a32'): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  const r = rand(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  for (let p = 0; p < 6; p++) {
    const y0 = p * 85;
    g.fillStyle = `rgba(0,0,0,${0.12 + r() * 0.1})`;
    g.fillRect(0, y0, 512, 3);
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = `rgba(${r() < 0.5 ? '60,30,10' : '210,160,110'},${0.15 + r() * 0.15})`;
      g.lineWidth = 1 + r() * 2;
      g.beginPath();
      const yy = y0 + 6 + r() * 76;
      g.moveTo(0, yy);
      g.bezierCurveTo(170, yy + (r() - 0.5) * 12, 340, yy + (r() - 0.5) * 12, 512, yy + (r() - 0.5) * 6);
      g.stroke();
    }
  }
  return tex(c, [1, 1]);
}

/** Cream label with a weight number, for the cast-iron blocks. */
export function weightLabel(value: number): THREE.CanvasTexture {
  const [c, g] = canvas(256, 128);
  g.fillStyle = '#2b2a2c';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#f6efe0';
  g.font = `800 92px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.direction = 'ltr';
  const num = `${value}`;
  g.fillText(num, 112, 70);
  g.font = `700 38px ${FONT}`;
  g.fillText('kg', 112 + g.measureText(num).width / 2 + 52 + (value >= 10 ? 14 : 0), 84);
  return tex(c);
}

export function chalkTexture(text: string, w = 640, h = 200): THREE.CanvasTexture {
  const [c, g] = canvas(w, h);
  drawChalk(g, text, w, h);
  return tex(c);
}

export function drawChalk(g: CanvasRenderingContext2D, text: string, w: number, h: number) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#6b4424';
  roundRect(g, 0, 0, w, h, 26);
  g.fill();
  g.fillStyle = '#26302c';
  roundRect(g, 16, 16, w - 32, h - 32, 16);
  g.fill();
  const grd = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 1.6);
  grd.addColorStop(0, 'rgba(255,255,255,0.08)');
  grd.addColorStop(1, 'rgba(0,0,0,0.15)');
  g.fillStyle = grd;
  g.fillRect(16, 16, w - 32, h - 32);
  g.fillStyle = '#f4f1e8';
  g.direction = 'ltr';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 96;
  g.font = `600 ${size}px ${FONT}`;
  while (g.measureText(text).width > w - 70 && size > 30) {
    size -= 4;
    g.font = `600 ${size}px ${FONT}`;
  }
  g.fillText(text, w / 2, h / 2 + 4);
}

/** Hebrew sign: cream board with dark text (RTL). */
export function signTexture(lines: string[], w = 512, h = 256, bg = '#f3e6c4', fg = '#2b2016'): THREE.CanvasTexture {
  const [c, g] = canvas(w, h);
  g.fillStyle = '#7a4d27';
  roundRect(g, 0, 0, w, h, 24);
  g.fill();
  g.fillStyle = bg;
  roundRect(g, 12, 12, w - 24, h - 24, 16);
  g.fill();
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.direction = 'rtl';
  const size = Math.min(84, (h - 40) / lines.length - 6);
  g.font = `800 ${size}px ${FONT}`;
  lines.forEach((ln, i) => g.fillText(ln, w / 2, h / 2 + (i - (lines.length - 1) / 2) * (size + 8)));
  return tex(c);
}

/** Round soft glow for string-light bulbs and sparkles. */
export function glowTexture(color = '255,214,140'): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grd.addColorStop(0, `rgba(${color},1)`);
  grd.addColorStop(0.25, `rgba(${color},0.6)`);
  grd.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return tex(c);
}

export function featherTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 128);
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.ellipse(32, 64, 18, 58, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#d8d8d8';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(32, 8);
  g.lineTo(32, 124);
  g.stroke();
  return tex(c);
}

/** Speech-bubble icon above the vendor (♪, ?, !, z). */
export function bubbleTexture(symbol: string, fill: string, fg = '#1d3b3a'): THREE.CanvasTexture {
  const [c, g] = canvas(128, 140);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.beginPath();
  g.arc(66, 64, 56, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = fill;
  g.beginPath();
  g.arc(64, 60, 56, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(50, 108);
  g.lineTo(64, 136);
  g.lineTo(78, 108);
  g.fill();
  g.fillStyle = fg;
  g.font = `900 78px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(symbol, 64, 64);
  return tex(c);
}

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
