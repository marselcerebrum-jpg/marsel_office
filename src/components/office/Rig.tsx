"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { buildSegments, proportions, sittingPose, standingPose, type CharacterLook, type Pose } from "./character";
import { materials } from "./materials";

export type RigMode = "walk" | "run" | "stand" | "sit";

type Joints = {
  root: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  shoulders: [THREE.Group, THREE.Group];
  elbows: [THREE.Group, THREE.Group];
  hips: [THREE.Group, THREE.Group];
  knees: [THREE.Group, THREE.Group];
};

const lerp = THREE.MathUtils.lerp;

/**
 * Tokoh bersendi. Posisi & arah dunia diatur oleh parent; komponen ini hanya
 * menganimasikan anggota tubuh menuju pose sesuai `mode`.
 */
export function Rig({
  look,
  mode,
  talking = false,
  castShadow = true,
  phase = 0,
}: {
  look: CharacterLook;
  mode: RigMode;
  talking?: boolean;
  castShadow?: boolean;
  phase?: number;
}) {
  const segs = useMemo(() => buildSegments(look), [look]);
  useEffect(() => () => Object.values(segs).forEach((g) => g.dispose()), [segs]);
  const P = useMemo(() => proportions(look), [look]);
  const mat = materials().character;
  const j = useRef<Joints | null>(null);
  const cur = useRef<Pose>(standingPose(look));

  const setRef = (key: string, i?: number) => (g: THREE.Group | null) => {
    if (!g) return;
    j.current ??= {} as Joints;
    const J = j.current as unknown as Record<string, THREE.Group | THREE.Group[]>;
    if (i === undefined) J[key] = g;
    else {
      J[key] ??= [];
      (J[key] as THREE.Group[])[i] = g;
    }
  };

  useFrame(({ clock }, dt) => {
    const J = j.current;
    if (!J?.root) return;
    const t = clock.elapsedTime + phase;
    const target: Pose = mode === "sit" ? sittingPose() : standingPose(look);
    let bob = 0;
    if (mode === "walk" || mode === "run") {
      const w = mode === "run" ? 13 : 8.5;
      const amp = mode === "run" ? 0.9 : 0.6;
      const s = Math.sin(t * w);
      target.hip = [s * amp, -s * amp];
      target.knee = [Math.max(0, -Math.sin(t * w - 0.6)) * amp * 1.4, Math.max(0, Math.sin(t * w - 0.6)) * amp * 1.4];
      target.shoulder = [-s * amp * 0.75, s * amp * 0.75];
      target.elbow = [-0.35 - Math.max(0, s) * 0.3, -0.35 - Math.max(0, -s) * 0.3];
      target.torsoLean = mode === "run" ? -0.18 : -0.05;
      bob = Math.abs(Math.cos(t * w)) * (mode === "run" ? 0.07 : 0.04);
    } else if (mode === "stand") {
      target.shoulder = [Math.sin(t * 1.3) * 0.03, -Math.sin(t * 1.3) * 0.03];
      bob = Math.sin(t * 2) * 0.006;
    } else {
      // Duduk: sedikit bergoyang; saat bicara tangan bergerak & kepala menoleh.
      target.headYaw = Math.sin(t * 0.4) * 0.25;
      if (talking) {
        target.shoulder = [-0.9 + Math.sin(t * 5.2) * 0.25, -0.75 + Math.sin(t * 4.1 + 1) * 0.3];
        target.shoulderOut = [0.35 + Math.sin(t * 3.3) * 0.12, -0.3 - Math.sin(t * 2.7) * 0.15];
        target.elbow = [-1.2 + Math.sin(t * 6) * 0.3, -1.1 + Math.cos(t * 5) * 0.3];
        target.headPitch = -0.05 + Math.sin(t * 7) * 0.06;
        target.headYaw = Math.sin(t * 1.1) * 0.5;
        target.torsoLean = 0.05;
      } else {
        target.shoulder = [-0.55, -0.5];
        target.elbow = [-1.05, -1.1];
        target.shoulderOut = [0.25, -0.25];
      }
    }

    const k = Math.min(1, dt * (mode === "sit" ? 6 : 14));
    const c = cur.current;
    c.hipY = lerp(c.hipY, target.hipY + bob, k);
    c.torsoLean = lerp(c.torsoLean, target.torsoLean, k);
    c.headPitch = lerp(c.headPitch, target.headPitch, k);
    c.headYaw = lerp(c.headYaw, target.headYaw, k);
    for (const i of [0, 1] as const) {
      c.shoulder[i] = lerp(c.shoulder[i], target.shoulder[i], k);
      c.shoulderOut[i] = lerp(c.shoulderOut[i], target.shoulderOut[i], k);
      c.elbow[i] = lerp(c.elbow[i], target.elbow[i], k);
      c.hip[i] = lerp(c.hip[i], target.hip[i], k);
      c.knee[i] = lerp(c.knee[i], target.knee[i], k);
    }

    J.root.position.y = c.hipY;
    J.torso.rotation.x = c.torsoLean;
    J.head.rotation.set(c.headPitch, c.headYaw, 0);
    for (const i of [0, 1] as const) {
      J.shoulders[i].rotation.set(c.shoulder[i], 0, c.shoulderOut[i]);
      J.elbows[i].rotation.x = c.elbow[i];
      J.hips[i].rotation.x = c.hip[i];
      J.knees[i].rotation.x = c.knee[i];
    }
  });

  const m = (geo: THREE.BufferGeometry) => <mesh geometry={geo} material={mat} castShadow={castShadow} />;

  return (
    <group ref={setRef("root")}>
      <group ref={setRef("torso")}>
        {m(segs.torso)}
        <group ref={setRef("head")} position={[0, P.torso - 0.02, 0]}>
          {m(segs.head)}
        </group>
        {([0, 1] as const).map((i) => (
          <group key={i} ref={setRef("shoulders", i)} position={[(i === 0 ? -1 : 1) * P.shoulderW, P.torso - 0.1, 0]}>
            {m(segs.upperArm)}
            <group ref={setRef("elbows", i)} position={[0, -P.upperArm, 0]}>
              {m(segs.lowerArm)}
            </group>
          </group>
        ))}
      </group>
      {([0, 1] as const).map((i) => (
        <group key={i} ref={setRef("hips", i)} position={[(i === 0 ? -1 : 1) * P.hipW, 0, 0]}>
          {m(segs.thigh)}
          <group ref={setRef("knees", i)} position={[0, -P.thigh, 0]}>
            {m(segs.shin)}
          </group>
        </group>
      ))}
    </group>
  );
}
