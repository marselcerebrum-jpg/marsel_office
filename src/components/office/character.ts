import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/* ------------------------------------------------------------- penampilan */

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

const SKIN = ["#F7D7C4", "#EFC3A4", "#E0A98A", "#C68B6A", "#A06A4C", "#7A4E36", "#5C3A28"];
const HAIR = ["#1C1714", "#2E2019", "#4A3020", "#6F4526", "#A0672F", "#D4A85A", "#E8D6A8", "#8E9399", "#5B2A2A", "#283A63"];
const PANTS = ["#1F2937", "#273449", "#3A3631", "#2F3B2F", "#3B2F3F", "#4B5563"];
const SHOES = ["#111111", "#3B2416", "#F3F4F6", "#1E293B"];

export type Accessory = "none" | "headset" | "glasses" | "shades" | "tie" | "beret" | "cap" | "hardhat" | "coat" | "visor" | "scarf" | "lanyard";

const DIVISION_ACCESSORIES: Record<string, Accessory[]> = {
  engineering: ["headset", "glasses", "none", "headset", "lanyard"],
  testing: ["glasses", "visor", "headset"],
  design: ["beret", "scarf", "glasses"],
  marketing: ["scarf", "lanyard", "cap"],
  "paid-media": ["tie", "glasses"],
  sales: ["tie", "tie", "lanyard"],
  finance: ["tie", "glasses"],
  security: ["shades", "headset"],
  "game-development": ["cap", "headset", "visor"],
  gis: ["hardhat", "glasses"],
  healthcare: ["coat"],
  academic: ["glasses", "scarf"],
  research: ["glasses"],
  product: ["lanyard", "glasses", "scarf"],
  "project-management": ["tie", "headset", "lanyard"],
  "spatial-computing": ["visor"],
  support: ["headset", "lanyard"],
  specialized: ["tie", "glasses", "scarf", "beret", "lanyard", "headset"],
};

export type CharacterLook = {
  skin: string;
  hair: string;
  hairStyle: number;
  bodyWidth: number;
  height: number;
  accessory: Accessory;
  pants: string;
  shoes: string;
  shirt: string;
  sleeves: "long" | "short";
};

export function lookFor(id: string, division: string, shirt: string): CharacterLook {
  const r = rng(id);
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)];
  return {
    skin: pick(SKIN),
    hair: pick(HAIR),
    hairStyle: Math.floor(r() * 7),
    bodyWidth: 0.9 + r() * 0.28,
    height: 0.94 + r() * 0.12,
    accessory: pick(DIVISION_ACCESSORIES[division] ?? ["none"]),
    pants: pick(PANTS),
    shoes: pick(SHOES),
    shirt,
    sleeves: r() > 0.6 ? "short" : "long",
  };
}

export const PLAYER_LOOK: CharacterLook = {
  skin: "#E0A98A",
  hair: "#1C1714",
  hairStyle: 0,
  bodyWidth: 1,
  height: 1,
  accessory: "none",
  pants: "#1E3A8A",
  shoes: "#F3F4F6",
  shirt: "#F59E0B",
  sleeves: "short",
};

export const RECEPTIONIST_LOOK: CharacterLook = {
  skin: "#C68B6A",
  hair: "#2E2019",
  hairStyle: 3,
  bodyWidth: 0.95,
  height: 0.98,
  accessory: "headset",
  pants: "#1F2937",
  shoes: "#111111",
  shirt: "#0F766E",
  sleeves: "long",
};

/* --------------------------------------------------------------- geometri */

const tmp = new THREE.Color();

function part(
  geo: THREE.BufferGeometry,
  color: string,
  pos: [number, number, number],
  rot: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
) {
  const g = geo.index ? geo : geo.toNonIndexed(); // semua primitif di bawah sudah terindeks
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(...scale),
  );
  g.applyMatrix4(m);
  tmp.set(color);
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([tmp.r, tmp.g, tmp.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

const sphere = (r: number, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 4, 10);
const cyl = (rt: number, rb: number, h: number, seg = 14) => new THREE.CylinderGeometry(rt, rb, h, seg);
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const torus = (r: number, t: number, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, 6, 18, arc);

const shade = (hex: string, f: number) => "#" + new THREE.Color(hex).multiplyScalar(f).getHexString();
const merge = (parts: THREE.BufferGeometry[]) => {
  const m = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  m.computeBoundingSphere();
  return m;
};

/** Ukuran tubuh (meter) yang dipakai rig dan pose statis. */
export function proportions(look: CharacterLook) {
  const s = look.height;
  return {
    thigh: 0.42 * s,
    shin: 0.42 * s,
    torso: 0.56 * s,
    upperArm: 0.3 * s,
    lowerArm: 0.3 * s,
    hipW: 0.1 * look.bodyWidth,
    shoulderW: 0.24 * look.bodyWidth,
    headR: 0.2,
  };
}

export type Segments = {
  head: THREE.BufferGeometry; // pivot: pangkal leher
  torso: THREE.BufferGeometry; // pivot: pinggul
  upperArm: THREE.BufferGeometry; // pivot: bahu, memanjang ke -Y
  lowerArm: THREE.BufferGeometry; // pivot: siku
  thigh: THREE.BufferGeometry; // pivot: pinggul
  shin: THREE.BufferGeometry; // pivot: lutut
};

export function buildSegments(look: CharacterLook): Segments {
  const P = proportions(look);
  const bw = look.bodyWidth;
  const shirt = look.accessory === "coat" ? "#F5F7FA" : look.shirt;
  const sleeve = look.sleeves === "short" && look.accessory !== "coat" ? look.skin : shirt;

  /* kepala */
  const hr = P.headR;
  const hy = 0.1 + hr; // pusat kepala di atas pivot leher
  const head: THREE.BufferGeometry[] = [
    part(cyl(0.065, 0.075, 0.14), look.skin, [0, 0.05, 0]),
    part(sphere(hr, 20, 16), look.skin, [0, hy, 0], undefined, [1, 1.06, 0.98]),
    // telinga
    part(sphere(0.045, 8, 6), look.skin, [-hr * 0.98, hy, 0], undefined, [0.6, 1, 1]),
    part(sphere(0.045, 8, 6), look.skin, [hr * 0.98, hy, 0], undefined, [0.6, 1, 1]),
    // hidung
    part(sphere(0.03, 8, 6), shade(look.skin, 0.92), [0, hy - 0.02, hr * 0.97]),
    // mulut
    part(capsule(0.012, 0.05), "#7A2E2A", [0, hy - 0.085, hr * 0.92], [0, 0, Math.PI / 2]),
  ];
  for (const side of [-1, 1]) {
    head.push(part(sphere(0.036, 10, 8), "#FFFFFF", [side * 0.072, hy + 0.025, hr * 0.88], undefined, [1, 1.15, 0.6]));
    head.push(part(sphere(0.021, 8, 6), "#1E1B18", [side * 0.072, hy + 0.022, hr * 0.92], undefined, [1, 1.1, 0.6]));
    head.push(part(box(0.065, 0.014, 0.02), shade(look.hair, 0.9), [side * 0.074, hy + 0.085, hr * 0.92], [0, 0, side * -0.12]));
  }

  const hair = look.hair;
  const cap = (sy: number, yo = 0.04, zo = -0.02) => part(sphere(hr * 1.06, 20, 12), hair, [0, hy + yo, zo], undefined, [1, sy, 1.02]);
  switch (look.hairStyle) {
    case 0:
      head.push(cap(0.78));
      break;
    case 1: // jambul
      head.push(cap(0.74));
      head.push(part(sphere(0.12, 12, 8), hair, [0.03, hy + 0.17, 0.08], undefined, [1.3, 0.7, 1]));
      break;
    case 2: // panjang
      head.push(cap(0.82));
      head.push(part(capsule(0.17, 0.18), hair, [0, hy - 0.12, -0.08], undefined, [1.25, 1, 0.75]));
      break;
    case 3: // cepol
      head.push(cap(0.8));
      head.push(part(sphere(0.085, 12, 8), hair, [0, hy + 0.2, -0.14]));
      break;
    case 4: // tipis / botak samping
      head.push(part(sphere(hr * 1.03, 20, 12), hair, [0, hy - 0.01, -0.05], undefined, [1.02, 0.62, 0.92]));
      break;
    case 5: // keriting
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        head.push(part(sphere(0.075, 10, 8), hair, [Math.cos(a) * 0.15, hy + 0.12, Math.sin(a) * 0.15 - 0.03]));
      }
      head.push(part(sphere(0.1, 10, 8), hair, [0, hy + 0.19, -0.02]));
      break;
    default: // ekor kuda
      head.push(cap(0.8));
      head.push(part(capsule(0.06, 0.22), hair, [0, hy - 0.02, -0.24], [0.5, 0, 0]));
  }

  switch (look.accessory) {
    case "headset":
      head.push(part(torus(hr * 1.08, 0.016, Math.PI), "#2B2B2B", [0, hy + 0.01, 0]));
      for (const side of [-1, 1]) head.push(part(cyl(0.05, 0.05, 0.05), "#2B2B2B", [side * hr * 1.05, hy, 0], [0, 0, Math.PI / 2]));
      head.push(part(capsule(0.008, 0.14), "#2B2B2B", [-0.16, hy - 0.08, 0.1], [1.2, 0, 0.3]));
      break;
    case "glasses":
      for (const side of [-1, 1]) head.push(part(torus(0.045, 0.008), "#1F1F1F", [side * 0.072, hy + 0.024, hr * 0.97]));
      head.push(part(box(0.04, 0.008, 0.008), "#1F1F1F", [0, hy + 0.03, hr * 0.98]));
      break;
    case "shades":
      head.push(part(box(0.26, 0.06, 0.02), "#0B0B0B", [0, hy + 0.024, hr * 0.96]));
      break;
    case "beret":
      head.push(part(cyl(0.19, 0.21, 0.06, 18), shade(look.shirt, 0.65), [0.03, hy + 0.18, 0], [0, 0, -0.25]));
      break;
    case "cap":
      head.push(part(sphere(hr * 1.08, 18, 10, ), look.shirt, [0, hy + 0.06, 0], undefined, [1, 0.62, 1]));
      head.push(part(cyl(0.13, 0.13, 0.02, 18), look.shirt, [0, hy + 0.06, 0.19], [0.15, 0, 0], [1, 1, 0.8]));
      break;
    case "hardhat":
      head.push(part(sphere(hr * 1.12, 18, 10), "#F5C518", [0, hy + 0.07, 0], undefined, [1, 0.7, 1]));
      head.push(part(cyl(0.27, 0.27, 0.02, 20), "#F5C518", [0, hy + 0.05, 0]));
      break;
    case "visor":
      head.push(part(box(0.3, 0.08, 0.05), "#22D3EE", [0, hy + 0.025, hr * 0.92]));
      break;
  }

  /* badan (pivot pinggul) */
  const t = P.torso;
  const torso: THREE.BufferGeometry[] = [
    part(capsule(0.15 * bw, t - 0.2), shirt, [0, t / 2, 0], undefined, [1.25, 1, 0.82]),
    part(sphere(0.155 * bw, 14, 10), look.pants, [0, 0.02, 0], undefined, [1.15, 0.7, 0.85]),
  ];
  if (look.accessory === "coat") {
    torso.push(part(box(0.06, t * 0.75, 0.02), look.shirt, [0, t * 0.55, 0.14 * bw]));
    torso.push(part(box(0.38 * bw, 0.18, 0.28), "#F5F7FA", [0, 0.02, 0], undefined, [1, 1, 1]));
  }
  if (look.accessory === "tie") {
    torso.push(part(box(0.06, t * 0.55, 0.02), shade(look.shirt, 0.4), [0, t * 0.6, 0.145 * bw]));
    torso.push(part(box(0.18, 0.04, 0.04), "#FFFFFF", [0, t - 0.04, 0.1 * bw]));
  }
  if (look.accessory === "scarf") torso.push(part(torus(0.12, 0.04), "#F1EDE3", [0, t - 0.02, 0], [Math.PI / 2, 0, 0]));
  if (look.accessory === "lanyard") {
    torso.push(part(torus(0.11, 0.008, Math.PI), "#2563EB", [0, t - 0.12, 0.08 * bw], [0, 0, Math.PI]));
    torso.push(part(box(0.07, 0.09, 0.01), "#FFFFFF", [0, t * 0.45, 0.15 * bw]));
  }

  /* lengan & kaki */
  const upperArm = [
    part(capsule(0.055, P.upperArm - 0.06), sleeve === look.skin ? shirt : sleeve, [0, -P.upperArm / 2, 0]),
  ];
  if (sleeve === look.skin) upperArm.push(part(capsule(0.048, P.upperArm * 0.35), look.skin, [0, -P.upperArm * 0.78, 0]));
  const lowerArm = [
    part(capsule(0.048, P.lowerArm - 0.08), sleeve, [0, -P.lowerArm / 2, 0]),
    part(sphere(0.055, 10, 8), look.skin, [0, -P.lowerArm - 0.02, 0], undefined, [0.85, 1, 0.7]),
  ];
  const thigh = [part(capsule(0.075, P.thigh - 0.08), look.pants, [0, -P.thigh / 2, 0])];
  const shin = [
    part(capsule(0.065, P.shin - 0.08), look.pants, [0, -P.shin / 2, 0]),
    part(capsule(0.055, 0.12), look.shoes, [0, -P.shin - 0.01, 0.05], [Math.PI / 2, 0, 0], [1.15, 1, 0.8]),
  ];

  return {
    head: merge(head),
    torso: merge(torso),
    upperArm: merge(upperArm),
    lowerArm: merge(lowerArm),
    thigh: merge(thigh),
    shin: merge(shin),
  };
}

/* ------------------------------------------------------------------- pose */

export type Pose = {
  hipY: number;
  torsoLean: number;
  headPitch: number;
  headYaw: number;
  shoulder: [number, number]; // rotasi X lengan atas (kiri, kanan); negatif = ke depan
  shoulderOut: [number, number]; // rotasi Z (menjauh dari badan)
  elbow: [number, number];
  hip: [number, number]; // rotasi X paha; negatif = ke depan
  knee: [number, number]; // rotasi X tulang kering; positif = menekuk ke belakang
};

export function sittingPose(): Pose {
  return {
    hipY: 0.5,
    torsoLean: -0.05,
    headPitch: 0.08,
    headYaw: 0,
    shoulder: [-0.5, -0.5],
    shoulderOut: [0.08, -0.08],
    elbow: [-0.95, -0.95],
    hip: [-Math.PI / 2, -Math.PI / 2],
    knee: [Math.PI / 2, Math.PI / 2],
  };
}

export function standingPose(look: CharacterLook): Pose {
  const P = proportions(look);
  return {
    hipY: P.thigh + P.shin + 0.06,
    torsoLean: 0,
    headPitch: 0,
    headYaw: 0,
    shoulder: [0, 0],
    shoulderOut: [0.1, -0.1],
    elbow: [-0.15, -0.15],
    hip: [0, 0],
    knee: [0, 0],
  };
}

/** Matriks tiap segmen untuk pose tertentu (ruang lokal tokoh). Dipakai pose statis. */
export function poseMatrices(look: CharacterLook, pose: Pose) {
  const P = proportions(look);
  const M = (pos: THREE.Vector3, rot: THREE.Euler) => new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot), new THREE.Vector3(1, 1, 1));
  const root = M(new THREE.Vector3(0, pose.hipY, 0), new THREE.Euler(0, 0, 0));
  const torso = root.clone().multiply(M(new THREE.Vector3(), new THREE.Euler(pose.torsoLean, 0, 0)));
  const head = torso.clone().multiply(M(new THREE.Vector3(0, P.torso - 0.02, 0), new THREE.Euler(pose.headPitch, pose.headYaw, 0)));
  const out: { seg: keyof Segments; m: THREE.Matrix4 }[] = [
    { seg: "torso", m: torso },
    { seg: "head", m: head },
  ];
  ([0, 1] as const).forEach((i) => {
    const side = i === 0 ? -1 : 1;
    const shoulder = torso.clone().multiply(M(new THREE.Vector3(side * P.shoulderW, P.torso - 0.1, 0), new THREE.Euler(pose.shoulder[i], 0, pose.shoulderOut[i])));
    const elbow = shoulder.clone().multiply(M(new THREE.Vector3(0, -P.upperArm, 0), new THREE.Euler(pose.elbow[i], 0, 0)));
    const hip = root.clone().multiply(M(new THREE.Vector3(side * P.hipW, 0, 0), new THREE.Euler(pose.hip[i], 0, 0)));
    const knee = hip.clone().multiply(M(new THREE.Vector3(0, -P.thigh, 0), new THREE.Euler(pose.knee[i], 0, 0)));
    out.push({ seg: "upperArm", m: shoulder }, { seg: "lowerArm", m: elbow }, { seg: "thigh", m: hip }, { seg: "shin", m: knee });
  });
  return out;
}

/** Kursi kantor (pivot di lantai, menghadap +Z). */
export function chairGeometry(color = "#3F4652") {
  return merge([
    part(box(0.56, 0.08, 0.52), color, [0, 0.46, 0.04]),
    part(box(0.54, 0.62, 0.07), color, [0, 0.86, -0.24], [-0.08, 0, 0]),
    part(cyl(0.035, 0.035, 0.36), "#9CA3AF", [0, 0.25, 0.04]),
    ...[0, 1, 2, 3, 4].map((i) => {
      const a = (i / 5) * Math.PI * 2;
      return part(box(0.05, 0.04, 0.32), "#6B7280", [Math.sin(a) * 0.15, 0.06, 0.04 + Math.cos(a) * 0.15], [0, a, 0]);
    }),
  ]);
}

/** Tokoh duduk di kursi, digabung jadi satu geometri (untuk ratusan agen di meja). */
export function seatedStaticGeometry(look: CharacterLook, withChair = true) {
  const segs = buildSegments(look);
  const parts: THREE.BufferGeometry[] = [];
  for (const { seg, m } of poseMatrices(look, sittingPose())) parts.push(segs[seg].clone().applyMatrix4(m));
  if (withChair) parts.push(chairGeometry());
  Object.values(segs).forEach((g) => g.dispose());
  return merge(parts);
}

/** Dipakai furnitur: primitif ber-warna-vertex yang digabung jadi satu geometri. */
export { part as makePart, merge as mergeParts, box as boxGeo, cyl as cylGeo, sphere as sphereGeo, capsule as capsuleGeo };
