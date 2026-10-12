"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Agent } from "@/lib/types";
import { FLOOR_H, floorY, step, type Building, type Pos } from "./building";
import { PLAYER_LOOK } from "./character";
import { labelRegistry } from "./labels";
import { Rig, type RigMode } from "./Rig";
import { useOffice } from "./store";

const SPEED = 5;

export function Player({ agents, b }: { agents: Agent[]; b: Building }) {
  const group = useRef<THREE.Group>(null);
  const controls = useRef<OrbitControlsImpl>(null);
  const keys = useRef(new Set<string>());
  const pos = useRef<Pos>({ ...b.spawn, floor: 0, y: 0 });
  const facing = useRef(Math.PI);
  const timers = useRef({ nearby: 0, publish: 0, stuck: 0 });
  const [mode, setMode] = useState<RigMode>("stand");
  const modeRef = useRef<RigMode>("stand");
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    camera.position.set(pos.current.x, 13, pos.current.z + 14);
    controls.current?.target.set(pos.current.x, 1.2, pos.current.z);
    controls.current?.update();
  }, [camera]);

  useEffect(() => {
    const typing = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (typing()) return;
      const k = e.key.toLowerCase();
      if (k === "e" && useOffice.getState().nearTaskDesk) {
        useOffice.getState().openPanel("compose");
        return;
      }
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"].includes(k)) {
        keys.current.add(k);
        if (k.startsWith("arrow")) e.preventDefault();
        useOffice.getState().walkTo(null);
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => keys.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  useFrame(({ clock, camera: cam }, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const st = useOffice.getState();
    const prev = { ...pos.current };

    if (st.teleport) {
      pos.current = { x: st.teleport.x, z: st.teleport.z, floor: st.teleport.floor, y: floorY(st.teleport.floor) };
      st.consumeTeleport();
    }

    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const k = keys.current;
    const move = new THREE.Vector3();
    if (k.has("w") || k.has("arrowup")) move.add(fwd);
    if (k.has("s") || k.has("arrowdown")) move.sub(fwd);
    if (k.has("d") || k.has("arrowright")) move.add(right);
    if (k.has("a") || k.has("arrowleft")) move.sub(right);

    const running = k.has("shift");
    const speed = SPEED * (running ? 1.8 : 1);
    let moving = false;
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed * dt);
      pos.current = step(b, pos.current, move.x, move.z);
      moving = true;
    } else if (st.walkTarget) {
      const t = st.walkTarget;
      // Tujuan di lantai lain: arahkan ke tangga dulu.
      const goal = t.floor === pos.current.floor ? t : { x: b.stairs.x + b.stairs.w / 2, z: pos.current.floor === 0 ? b.stairs.zBottom + 1 : b.stairs.zTop - 1 };
      const dx = goal.x - pos.current.x;
      const dz = goal.z - pos.current.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.15) {
        if (t.floor === pos.current.floor) {
          st.walkTo(null);
          if (st.selectedId) facing.current = Math.PI;
        } else {
          // Sampai di kaki/puncak tangga: pindah lantai seperti naik lift.
          pos.current = { x: goal.x, z: t.floor === 1 ? b.stairs.zTop - 1 : b.stairs.zBottom + 1, floor: t.floor, y: floorY(t.floor) };
        }
      } else {
        const s = Math.min(dist, speed * 1.2 * dt);
        const next = step(b, pos.current, (dx / dist) * s, (dz / dist) * s);
        const progressed = Math.hypot(next.x - pos.current.x, next.z - pos.current.z);
        timers.current.stuck = progressed < s * 0.2 ? timers.current.stuck + dt : 0;
        pos.current = next;
        moving = true;
        if (timers.current.stuck > 0.5) {
          // Terhalang: lompat langsung ke tujuan agar tidak frustrasi.
          pos.current = { x: t.x, z: t.z, floor: t.floor, y: floorY(t.floor) };
          st.walkTo(null);
          timers.current.stuck = 0;
        }
      }
    }

    const ddx = pos.current.x - prev.x;
    const ddz = pos.current.z - prev.z;
    const ddy = pos.current.y - prev.y;
    if (moving && Math.abs(ddx) + Math.abs(ddz) > 1e-4) facing.current = Math.atan2(ddx, ddz);

    // Kamera ikut bergeser (termasuk naik/turun lantai).
    cam.position.x += ddx;
    cam.position.y += ddy;
    cam.position.z += ddz;
    if (controls.current) {
      controls.current.target.x += ddx;
      controls.current.target.y += ddy;
      controls.current.target.z += ddz;
      controls.current.update();
    }

    const nextMode: RigMode = moving ? (running ? "run" : "walk") : "stand";
    if (nextMode !== modeRef.current) {
      modeRef.current = nextMode;
      setMode(nextMode);
    }

    const g = group.current;
    if (g) {
      g.position.set(pos.current.x, pos.current.y, pos.current.z);
      let diff = facing.current - g.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      g.rotation.y += diff * Math.min(1, dt * 12);
    }
    const label = labelRegistry.get("__player");
    if (label) {
      label.pos.set(pos.current.x, pos.current.y + 2.05, pos.current.z);
      label.floorRef.floor = pos.current.floor;
    }

    // Lantai yang ditampilkan mengikuti posisi pemain (di tangga: setengah tinggi).
    const view = pos.current.y > FLOOR_H / 2 ? 1 : 0;
    if (view !== st.viewFloor) st.setViewFloor(view);

    const now = clock.elapsedTime;
    if (now - timers.current.publish > 0.15) {
      timers.current.publish = now;
      st.setPlayerPos({ x: pos.current.x, z: pos.current.z, floor: pos.current.floor });
      const near = pos.current.floor === 0 && Math.hypot(pos.current.x - b.taskDesk.x, pos.current.z - (b.taskDesk.z + 1.2)) < 3.2;
      if (near !== st.nearTaskDesk) st.setNearTaskDesk(near);
    }
    if (now - timers.current.nearby > 0.3) {
      timers.current.nearby = now;
      const near: string[] = [];
      for (const a of agents) {
        const s = b.seats.get(a.id);
        if (s && s.floor === pos.current.floor && (s.x - pos.current.x) ** 2 + (s.z - pos.current.z) ** 2 < 30) near.push(a.id);
      }
      const prevIds = st.nearbyIds;
      if (near.length !== prevIds.length || near.some((id, i) => id !== prevIds[i])) st.setNearby(near);
    }
  });

  return (
    <>
      <OrbitControls
        ref={controls}
        makeDefault
        enablePan={false}
        minDistance={4}
        maxDistance={42}
        maxPolarAngle={Math.PI * 0.44}
        minPolarAngle={0.3}
        enableDamping
        dampingFactor={0.12}
      />
      <group ref={group}>
        <Rig look={PLAYER_LOOK} mode={mode} />
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.42, 0.52, 32]} />
          <meshBasicMaterial color="#F59E0B" transparent opacity={0.85} toneMapped={false} />
        </mesh>
      </group>
    </>
  );
}
