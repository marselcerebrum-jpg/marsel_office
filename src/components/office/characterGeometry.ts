import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** PRNG kecil yang deterministik per agen, agar tokoh selalu sama di setiap kunjungan. */
function rng(seedText: string) {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SKIN = ["#F5D0B5", "#E8B48F", "#D29A6E", "#B07B53", "#8D5A3B", "#6B4128"];
const HAIR = ["#1F1A17", "#3B2A20", "#5A3B26", "#8C5A2B", "#C99A4A", "#E6D3A3", "#9AA0A6", "#7A2E2E", "#2F3E66"];
const PANTS = ["#2D3748", "#374151", "#1F2937", "#3F3A35", "#334155"];

export type Accessory = "none" | "headset" | "glasses" | "shades" | "tie" | "beret" | "cap" | "hardhat" | "coat" | "visor" | "scarf";

const DIVISION_ACCESSORIES: Record<string, Accessory[]> = {
  engineering: ["headset", "glasses", "none", "headset"],
  testing: ["glasses", "visor", "headset"],
  design: ["beret", "scarf", "glasses"],
  marketing: ["scarf", "none", "cap"],
  "paid-media": ["tie", "glasses"],
  sales: ["tie", "tie", "none"],
  finance: ["tie", "glasses"],
  security: ["shades", "headset"],
  "game-development": ["cap", "headset", "visor"],
  gis: ["hardhat", "glasses"],
  healthcare: ["coat"],
  academic: ["glasses", "scarf"],
  research: ["glasses"],
  product: ["none", "glasses", "scarf"],
  "project-management": ["tie", "headset"],
  "spatial-computing": ["visor"],
  support: ["headset", "none"],
  specialized: ["tie", "glasses", "scarf", "beret", "none", "headset"],
};

export type CharacterLook = {
  skin: string;
  hair: string;
  hairStyle: number;
  bodyWidth: number;
  height: number;
  accessory: Accessory;
  pants: string;
  shirt: string;
};

export function lookFor(id: string, division: string, shirt: string): CharacterLook {
  const r = rng(id);
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)];
  return {
    skin: pick(SKIN),
    hair: pick(HAIR),
    hairStyle: Math.floor(r() * 6),
    bodyWidth: 0.85 + r() * 0.35,
    height: 0.92 + r() * 0.16,
    accessory: pick(DIVISION_ACCESSORIES[division] ?? ["none"]),
    pants: pick(PANTS),
    shirt,
  };
}

const tmpColor = new THREE.Color();

function part(geo: THREE.BufferGeometry, color: string, pos: [number, number, number], rot?: [number, number, number], scale?: [number, number, number]) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  // Semua part harus punya atribut yang sama agar bisa digabung.
  g.deleteAttribute("uv");
  const m = new THREE.Matrix4();
  m.compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot ?? [0, 0, 0]))),
    new THREE.Vector3(...(scale ?? [1, 1, 1])),
  );
  g.applyMatrix4(m);
  tmpColor.set(color);
  const count = g.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, seg = 6) => new THREE.CylinderGeometry(rt, rb, h, seg);
const ico = (r: number, detail = 1) => new THREE.IcosahedronGeometry(r, detail);

function darken(hex: string, f: number) {
  return "#" + new THREE.Color(hex).multiplyScalar(f).getHexString();
}

/**
 * Tokoh duduk menghadap +Z. Titik asal di lantai, di tengah kursi.
 * `seated: false` membuat pose berdiri (dipakai avatar pemain dan potret profil).
 */
export function buildCharacterGeometry(look: CharacterLook, seated = true): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const bw = look.bodyWidth;
  const s = look.height;
  const hipY = seated ? 0.62 : 0.85 * s;
  const torsoH = 0.56 * s;
  const torsoY = hipY + torsoH / 2 + 0.04;
  const shoulderY = hipY + torsoH;
  const headY = shoulderY + 0.3;
  const shirt = look.accessory === "coat" ? "#F4F6F8" : look.shirt;

  // Kaki
  for (const side of [-1, 1]) {
    const lx = side * 0.11 * bw;
    if (seated) {
      parts.push(part(box(0.17, 0.15, 0.46), look.pants, [lx, hipY, 0.2]));
      parts.push(part(box(0.15, hipY - 0.06, 0.15), look.pants, [lx, (hipY - 0.06) / 2 + 0.05, 0.42]));
      parts.push(part(box(0.17, 0.08, 0.26), "#1A1A1A", [lx, 0.04, 0.48]));
    } else {
      parts.push(part(box(0.16, hipY - 0.06, 0.16), look.pants, [lx, (hipY - 0.06) / 2 + 0.06, 0]));
      parts.push(part(box(0.17, 0.08, 0.26), "#1A1A1A", [lx, 0.04, 0.05]));
    }
  }

  // Badan
  parts.push(part(cyl(0.2 * bw, 0.23 * bw, torsoH, 7), shirt, [0, torsoY, 0]));
  if (look.accessory === "coat") {
    parts.push(part(box(0.06, torsoH * 0.8, 0.02), look.shirt, [0, torsoY, 0.21 * bw]));
  }
  if (look.accessory === "tie") {
    parts.push(part(box(0.07, torsoH * 0.7, 0.03), darken(look.shirt, 0.45), [0, torsoY + 0.02, 0.215 * bw]));
  }
  if (look.accessory === "scarf") {
    parts.push(part(cyl(0.2 * bw, 0.21 * bw, 0.1, 8), "#F4F1E8", [0, shoulderY + 0.02, 0]));
  }

  // Lengan: lengan atas turun, lengan bawah ke depan (mengetik)
  for (const side of [-1, 1]) {
    const ax = side * (0.26 * bw);
    parts.push(part(box(0.11, 0.3, 0.12), shirt, [ax, shoulderY - 0.15, 0]));
    if (seated) {
      parts.push(part(box(0.1, 0.1, 0.32), shirt, [ax, shoulderY - 0.32, 0.14]));
      parts.push(part(box(0.09, 0.08, 0.09), look.skin, [ax, shoulderY - 0.32, 0.33]));
    } else {
      parts.push(part(box(0.1, 0.26, 0.11), shirt, [ax, shoulderY - 0.42, 0]));
      parts.push(part(box(0.09, 0.09, 0.09), look.skin, [ax, shoulderY - 0.6, 0]));
    }
  }

  // Leher + kepala
  parts.push(part(cyl(0.07, 0.08, 0.08, 6), look.skin, [0, shoulderY + 0.04, 0]));
  parts.push(part(ico(0.24, 1), look.skin, [0, headY, 0]));
  // Mata dan mulut
  for (const side of [-1, 1]) {
    parts.push(part(box(0.05, 0.06, 0.02), "#1B1B1B", [side * 0.085, headY + 0.03, 0.225]));
  }
  parts.push(part(box(0.08, 0.02, 0.02), "#8A3B32", [0, headY - 0.08, 0.215]));

  // Rambut
  const hair = look.hair;
  switch (look.hairStyle) {
    case 0: // pendek rapi
      parts.push(part(ico(0.255, 1), hair, [0, headY + 0.06, -0.03], undefined, [1, 0.7, 1]));
      break;
    case 1: // jabrik
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        parts.push(part(new THREE.ConeGeometry(0.08, 0.2, 4), hair, [Math.cos(a) * 0.12, headY + 0.24, Math.sin(a) * 0.12 - 0.02]));
      }
      parts.push(part(ico(0.25, 1), hair, [0, headY + 0.07, -0.03], undefined, [1, 0.6, 1]));
      break;
    case 2: // panjang
      parts.push(part(ico(0.26, 1), hair, [0, headY + 0.05, -0.03], undefined, [1, 0.75, 1]));
      parts.push(part(box(0.46, 0.42, 0.14), hair, [0, headY - 0.14, -0.15]));
      break;
    case 3: // cepol
      parts.push(part(ico(0.255, 1), hair, [0, headY + 0.06, -0.03], undefined, [1, 0.7, 1]));
      parts.push(part(ico(0.11, 0), hair, [0, headY + 0.2, -0.2]));
      break;
    case 4: // botak samping
      parts.push(part(ico(0.25, 1), hair, [0, headY - 0.02, -0.06], undefined, [1.02, 0.55, 0.9]));
      break;
    default: // keriting
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        parts.push(part(ico(0.1, 0), hair, [Math.cos(a) * 0.16, headY + 0.14, Math.sin(a) * 0.16 - 0.04]));
      }
      parts.push(part(ico(0.12, 0), hair, [0, headY + 0.24, -0.02]));
  }

  // Aksesori kepala
  switch (look.accessory) {
    case "headset":
      parts.push(part(new THREE.TorusGeometry(0.26, 0.025, 4, 10, Math.PI), "#2B2B2B", [0, headY + 0.02, 0], [0, 0, 0]));
      for (const side of [-1, 1]) parts.push(part(box(0.06, 0.12, 0.12), "#2B2B2B", [side * 0.26, headY, 0]));
      parts.push(part(box(0.02, 0.02, 0.18), "#2B2B2B", [-0.24, headY - 0.08, 0.1]));
      break;
    case "glasses":
      for (const side of [-1, 1]) parts.push(part(new THREE.TorusGeometry(0.055, 0.012, 4, 8), "#222", [side * 0.085, headY + 0.03, 0.24]));
      break;
    case "shades":
      parts.push(part(box(0.3, 0.07, 0.03), "#0E0E0E", [0, headY + 0.03, 0.235]));
      break;
    case "beret":
      parts.push(part(cyl(0.24, 0.26, 0.07, 9), darken(look.shirt, 0.7), [0.03, headY + 0.2, 0], [0, 0, -0.25]));
      break;
    case "cap":
      parts.push(part(cyl(0.25, 0.26, 0.12, 8), look.shirt, [0, headY + 0.17, 0]));
      parts.push(part(box(0.3, 0.03, 0.18), look.shirt, [0, headY + 0.12, 0.25]));
      break;
    case "hardhat":
      parts.push(part(ico(0.27, 1), "#F5C518", [0, headY + 0.1, 0], undefined, [1, 0.65, 1]));
      parts.push(part(cyl(0.32, 0.32, 0.03, 10), "#F5C518", [0, headY + 0.06, 0]));
      break;
    case "visor":
      parts.push(part(box(0.38, 0.1, 0.06), "#22D3EE", [0, headY + 0.03, 0.22]));
      break;
  }

  // Kursi (hanya untuk pose duduk)
  if (seated) {
    parts.push(part(box(0.62, 0.1, 0.58), "#4A4F57", [0, 0.5, 0.06]));
    parts.push(part(box(0.62, 0.7, 0.08), "#4A4F57", [0, 0.9, -0.24]));
    parts.push(part(cyl(0.04, 0.04, 0.45, 5), "#2E3238", [0, 0.25, 0.06]));
    parts.push(part(cyl(0.28, 0.28, 0.04, 5), "#2E3238", [0, 0.03, 0.06]));
  }

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}
