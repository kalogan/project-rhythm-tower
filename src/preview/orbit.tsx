import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Object3D } from 'three';
import { Group } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/** Drop-in orbit/zoom/pan for any preview Canvas. Place inside <Canvas>. */
export function Orbit({ target = [0, 5, 0], autoRotate = false }: { target?: [number, number, number]; autoRotate?: boolean }): null {
  const { camera, gl } = useThree();
  const controls = useMemo(() => new OrbitControls(camera, gl.domElement), [camera, gl]);
  useEffect(() => {
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 1.4;
    controls.target.set(target[0], target[1], target[2]);
    controls.update();
    return () => controls.dispose();
  }, [controls, autoRotate, target]);
  useFrame(() => controls.update());
  return null;
}

/** Spins a built Object3D on a turntable (for the prop gallery). */
export function Turntable({ object, speed = 0.6 }: { object: Object3D; speed?: number }): JSX.Element {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * speed;
  });
  return (
    <group ref={ref}>
      <primitive object={object} />
    </group>
  );
}
