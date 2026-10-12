import * as THREE from "three";

/** Tekstur dibuat di canvas sekali saja (tanpa unduhan aset). */
const cache = new Map<string, THREE.Texture>();

function canvasTexture(key: string, size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void, repeat = 1) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d")!, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  cache.set(key, t);
  return t;
}

function noise(ctx: CanvasRenderingContext2D, s: number, amount: number, alpha = 0.06) {
  for (let i = 0; i < amount; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

export function woodTexture() {
  return canvasTexture("wood", 512, (ctx, s) => {
    const planks = 6;
    const ph = s / planks;
    for (let i = 0; i < planks; i++) {
      const offset = (i % 2) * (s / 2.6);
      for (let k = -1; k < 3; k++) {
        const base = 150 + Math.floor(Math.random() * 30);
        ctx.fillStyle = `rgb(${base + 40}, ${base}, ${base - 55})`;
        ctx.fillRect(offset + k * (s / 1.3), i * ph, s / 1.3 - 2, ph - 2);
        for (let g = 0; g < 14; g++) {
          ctx.strokeStyle = `rgba(90,55,25,${0.05 + Math.random() * 0.08})`;
          ctx.beginPath();
          const y = i * ph + Math.random() * ph;
          ctx.moveTo(offset + k * (s / 1.3), y);
          ctx.bezierCurveTo(offset + k * (s / 1.3) + 80, y + 4, offset + k * (s / 1.3) + 200, y - 4, offset + (k + 1) * (s / 1.3), y);
          ctx.stroke();
        }
      }
      ctx.fillStyle = "rgba(60,35,15,0.5)";
      ctx.fillRect(0, i * ph + ph - 2, s, 2);
    }
    noise(ctx, s, 6000, 0.04);
  }, 1);
}

export function carpetTexture(hex: string) {
  return canvasTexture(`carpet-${hex}`, 256, (ctx, s) => {
    const base = new THREE.Color(hex).lerp(new THREE.Color("#E5E7EB"), 0.78);
    ctx.fillStyle = `#${base.getHexString()}`;
    ctx.fillRect(0, 0, s, s);
    noise(ctx, s, 9000, 0.05);
    // Pola ubin karpet 4x4
    ctx.strokeStyle = "rgba(0,0,0,0.06)";
    ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo((i * s) / 4, 0);
      ctx.lineTo((i * s) / 4, s);
      ctx.moveTo(0, (i * s) / 4);
      ctx.lineTo(s, (i * s) / 4);
      ctx.stroke();
    }
  });
}

export function tileTexture() {
  return canvasTexture("tile", 256, (ctx, s) => {
    ctx.fillStyle = "#E9E7E2";
    ctx.fillRect(0, 0, s, s);
    noise(ctx, s, 4000, 0.035);
    ctx.strokeStyle = "rgba(120,110,100,0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, s / 2 - 2, s / 2 - 2);
    ctx.strokeRect(s / 2 + 1, 1, s / 2 - 2, s / 2 - 2);
    ctx.strokeRect(1, s / 2 + 1, s / 2 - 2, s / 2 - 2);
    ctx.strokeRect(s / 2 + 1, s / 2 + 1, s / 2 - 2, s / 2 - 2);
  });
}

export function grassTexture() {
  return canvasTexture("grass", 256, (ctx, s) => {
    ctx.fillStyle = "#6E9F4E";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 9000; i++) {
      const g = 120 + Math.random() * 60;
      ctx.fillStyle = `rgba(${g * 0.55}, ${g}, ${g * 0.4}, 0.35)`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 1, 2 + Math.random() * 3);
    }
  });
}

export function pavementTexture() {
  return canvasTexture("pave", 256, (ctx, s) => {
    ctx.fillStyle = "#C9C5BD";
    ctx.fillRect(0, 0, s, s);
    noise(ctx, s, 5000, 0.06);
    ctx.strokeStyle = "rgba(90,85,80,0.4)";
    ctx.lineWidth = 2;
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 2; x++) {
        const o = (y % 2) * (s / 4);
        ctx.strokeRect(x * (s / 2) + o, y * (s / 4), s / 2, s / 4);
      }
    }
  });
}

/** Layar monitor: UI kode/dashboard bergaya, warna aksen per divisi. */
export function screenTexture(accent: string, variant: number) {
  return canvasTexture(`screen-${accent}-${variant}`, 128, (ctx, s) => {
    ctx.fillStyle = "#0F172A";
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, s, 12);
    ctx.globalAlpha = 0.9;
    if (variant % 3 === 0) {
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = i % 4 === 0 ? accent : "#94A3B8";
        ctx.fillRect(8 + (i % 3) * 6, 20 + i * 8, 20 + Math.random() * 70, 3);
      }
    } else if (variant % 3 === 1) {
      for (let i = 0; i < 6; i++) {
        const h = 15 + Math.random() * 70;
        ctx.fillStyle = i % 2 ? accent : "#38BDF8";
        ctx.fillRect(12 + i * 18, s - 12 - h, 12, h);
      }
    } else {
      ctx.fillStyle = "#1E293B";
      ctx.fillRect(8, 20, s - 16, 40);
      ctx.fillStyle = accent;
      ctx.fillRect(8, 66, (s - 16) * 0.6, 6);
      ctx.fillStyle = "#94A3B8";
      for (let i = 0; i < 5; i++) ctx.fillRect(8, 80 + i * 8, 40 + Math.random() * 60, 3);
    }
  });
}

/** Papan nama/logo teks di canvas. */
export function textTexture(key: string, text: string, opts: { bg: string; fg: string; w?: number; h?: number; font?: string }) {
  const w = opts.w ?? 1024;
  const h = opts.h ?? 256;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = opts.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = opts.fg;
  ctx.font = opts.font ?? `bold ${Math.round(h * 0.45)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

/* ----------------------------------------------------------- material umum */

let shared: ReturnType<typeof makeShared> | null = null;

function makeShared() {
  return {
    character: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 }),
    paint: new THREE.MeshStandardMaterial({ color: "#F4F2EE", roughness: 0.92 }),
    exterior: new THREE.MeshStandardMaterial({ color: "#E7E2DA", roughness: 0.85 }),
    trim: new THREE.MeshStandardMaterial({ color: "#3F3F46", roughness: 0.5, metalness: 0.6 }),
    glass: new THREE.MeshStandardMaterial({
      color: "#BFE3F2",
      roughness: 0.05,
      metalness: 0.1,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }),
    windowGlass: new THREE.MeshStandardMaterial({
      color: "#9CC7DD",
      roughness: 0.08,
      metalness: 0.3,
      transparent: true,
      opacity: 0.45,
      emissive: "#A7D3EA",
      emissiveIntensity: 0.25,
      depthWrite: false,
    }),
    metal: new THREE.MeshStandardMaterial({ color: "#9CA3AF", roughness: 0.35, metalness: 0.8 }),
    darkPlastic: new THREE.MeshStandardMaterial({ color: "#1F2937", roughness: 0.45 }),
    lightPlastic: new THREE.MeshStandardMaterial({ color: "#E5E7EB", roughness: 0.5 }),
    deskWood: new THREE.MeshStandardMaterial({ color: "#C9A27A", roughness: 0.55 }),
    deskLeg: new THREE.MeshStandardMaterial({ color: "#2F3540", roughness: 0.4, metalness: 0.5 }),
    leaf: new THREE.MeshStandardMaterial({ color: "#3F8F4A", roughness: 0.8 }),
    pot: new THREE.MeshStandardMaterial({ color: "#E8E2D6", roughness: 0.7 }),
    fabric: new THREE.MeshStandardMaterial({ color: "#475569", roughness: 0.95 }),
  };
}

export function materials() {
  shared ??= makeShared();
  return shared;
}

/* ------------------------------------------------------------- logo brand */

let logoTex: THREE.Texture | null = null;

/** Logo Agent Desk (PNG transparan) untuk dinding lobby dan papan nama. */
export function logoTexture() {
  if (!logoTex) {
    logoTex = new THREE.TextureLoader().load("/brand/agent-desk-logo.png");
    logoTex.colorSpace = THREE.SRGBColorSpace;
    logoTex.anisotropy = 8;
  }
  return logoTex;
}

export const BRAND = { navy: "#06304A", orange: "#F07A06", yellow: "#FDB943" };
