"use client";

import { Environment, Lightformer, Sky } from "@react-three/drei";
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import type { Agent } from "@/lib/types";
import { MeetingDirector, SeatedAgents } from "./Agents";
import { BuildingMesh } from "./BuildingMesh";
import type { Building } from "./building";
import { Furniture } from "./Furniture";
import { LabelProjector } from "./labels";
import { Player } from "./Player";
import { useOffice } from "./store";

export function OfficeScene({ agents, b }: { agents: Agent[]; b: Building }) {
  const viewFloor = useOffice((s) => s.viewFloor);
  const quality = useOffice((s) => s.quality);
  const shadows = quality !== "rendah";
  const cx = (b.bounds.minX + b.bounds.maxX) / 2;
  const cz = (b.bounds.minZ + b.bounds.maxZ) / 2;

  return (
    <>
      <Sky sunPosition={[60, 45, 80]} turbidity={6} rayleigh={1.4} mieCoefficient={0.004} mieDirectionalG={0.85} />
      <fog attach="fog" args={["#D8E4EE", 70, 190]} />
      <hemisphereLight args={["#F3F7FF", "#C9B9A2", 0.55]} />
      <directionalLight
        position={[cx + 35, 55, cz + 40]}
        intensity={2.2}
        color="#FFF4E0"
        castShadow={shadows}
        shadow-mapSize={quality === "tinggi" ? [4096, 4096] : [2048, 2048]}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-camera-near={10}
        shadow-camera-far={160}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      >
        <object3D attach="target" position={[cx, 0, cz]} />
      </directionalLight>
      {/* Pantulan & cahaya ambien lembut tanpa mengunduh file HDR. */}
      <Environment resolution={128} frames={1}>
        <Lightformer intensity={2.2} position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[30, 30, 1]} color="#FFFFFF" />
        <Lightformer intensity={1.2} position={[-20, 4, 10]} rotation-y={Math.PI / 2} scale={[20, 6, 1]} color="#FFE7C2" />
        <Lightformer intensity={0.8} position={[20, 4, -10]} rotation-y={-Math.PI / 2} scale={[20, 6, 1]} color="#CFE3FF" />
      </Environment>

      <BuildingMesh b={b} viewFloor={viewFloor} />
      <group key={viewFloor}>
        <Furniture b={b} agents={agents} floor={viewFloor} />
        <SeatedAgents agents={agents} b={b} floor={viewFloor} />
      </group>
      <MeetingDirector agents={agents} b={b} />
      <Player agents={agents} b={b} />
      <LabelProjector />

      {quality !== "rendah" && (
        <EffectComposer multisampling={0} enableNormalPass={false}>
          {quality === "tinggi" ? <N8AO aoRadius={1.2} intensity={2.2} distanceFalloff={0.6} halfRes /> : <></>}
          <Bloom luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.6} mipmapBlur />
          <ToneMapping mode={ToneMappingMode.AGX} />
          <Vignette offset={0.25} darkness={0.45} />
          <SMAA />
        </EffectComposer>
      )}
    </>
  );
}
