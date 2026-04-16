import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import {
  Environment,
  GizmoHelper,
  GizmoViewport,
  Html,
  OrbitControls,
  PerspectiveCamera,
  SpotLight,
  useGLTF,
} from '@react-three/drei'
import {
  FlipHorizontal2,
  LayoutGrid,
  Maximize2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { PerspectiveCamera as PerspectiveCameraImpl, Vector3 } from 'three'

// Converted to modern PBR to preserve legacy spec/gloss colors in Three.js.
const MODEL_URL = '/3.glb'
const MODEL_EXTENSION = MODEL_URL.split('.').pop()?.toLowerCase() ?? ''
const IS_GLB_MODEL = MODEL_EXTENSION === 'glb'

class CanvasErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="grid min-h-full place-content-center gap-2 bg-[#090b12] p-6 text-center text-[#f4f6ff]">
          <h2 className="m-0 text-xl text-inherit">Scene failed to load</h2>
          <p className="m-0 text-[rgba(244,246,255,0.85)]">{this.state.message}</p>
          <p>
            Confirm the model exists at <code>public{MODEL_URL}</code> and all
            referenced assets are available.
          </p>
        </div>
      )
    }

    return this.props.children
  }
}

type SceneModelProps = {
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: number | [number, number, number]
}

function SceneModel(props: SceneModelProps) {
  const { scene } = useGLTF(MODEL_URL)

  return <primitive object={scene} {...props} />
}

function Loader() {
  return (
    <Html center>
      <div className="whitespace-nowrap rounded-full border border-white/20 bg-[rgba(9,11,18,0.76)] px-4 py-2 text-sm tracking-[0.02em] text-[#eef1ff]">
        Loading 3D scene...
      </div>
    </Html>
  )
}



type AssetCheckState =
  | { status: 'checking' }
  | { status: 'ready' }
  | { status: 'error'; message: string }

type ViewerControls = {
  zoomIn: () => void
  zoomOut: () => void
  reset: () => void
  flip: () => void
}

async function verifyModelAssets(modelUrl: string): Promise<AssetCheckState> {
  const response = await fetch(modelUrl, { cache: 'no-store' })
  if (!response.ok) {
    return {
      status: 'error',
      message: `Could not fetch ${modelUrl} (HTTP ${response.status}).`,
    }
  }

  // GLB is binary and self-contained, so existence check is enough.
  if (modelUrl.toLowerCase().endsWith('.glb')) {
    return { status: 'ready' }
  }

  let gltfJson: {
    buffers?: Array<{ uri?: string }>
    images?: Array<{ uri?: string }>
  }

  try {
    gltfJson = await response.json()
  } catch {
    return {
      status: 'error',
      message: `${modelUrl} is not valid glTF JSON.`,
    }
  }

  const basePath = modelUrl.slice(0, modelUrl.lastIndexOf('/') + 1)
  const referencedUris = [
    ...(gltfJson.buffers ?? []).map((entry) => entry.uri),
    ...(gltfJson.images ?? []).map((entry) => entry.uri),
  ].filter((uri): uri is string => typeof uri === 'string' && !uri.startsWith('data:'))

  const missing: string[] = []
  for (const uri of referencedUris) {
    const target = new URL(uri, window.location.origin + basePath).pathname
    const response = await fetch(target, { method: 'HEAD', cache: 'no-store' })
    if (!response.ok) {
      missing.push(target)
    }
  }

  if (missing.length > 0) {
    return {
      status: 'error',
      message: `Missing referenced assets: ${missing.join(', ')}`,
    }
  }

  return { status: 'ready' }
}

function ViewerTitle({ isImmersive }: { isImmersive: boolean }) {
  if (isImmersive) return null

  return (
    <header className="mb-3 text-left text-[#f4f6ff]">
      <h1 className="m-0 text-[1.45rem] leading-tight font-semibold">Broadmann 3D Viewer</h1>
      <p className="mt-[0.35rem] max-w-[42rem] text-[0.95rem] text-[rgba(244,246,255,0.8)]">
        Interactive neuro model viewer for educational exploration.
      </p>
    </header>
  )
}

function ToolButton({ label, onClick, icon }: { label: string; onClick: () => void; icon: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-lg border border-white/20 bg-[rgba(12,16,28,0.72)] text-[#eef3ff] transition hover:border-[rgba(177,201,255,0.55)] hover:bg-[rgba(22,28,44,0.82)]"
    >
      {icon}
    </button>
  )
}

function Toolbar({
  isImmersive,
  onToggleImmersive,
  controls,
}: {
  isImmersive: boolean
  onToggleImmersive: () => void
  controls: ViewerControls
}) {
  return (
    <div className="absolute inset-x-3 top-3 z-20 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <ToolButton
          label="Zoom in"
          onClick={controls.zoomIn}
          icon={<ZoomIn size={16} />}
        />
        <ToolButton
          label="Zoom out"
          onClick={controls.zoomOut}
          icon={<ZoomOut size={16} />}
        />
        <ToolButton
          label="Reset position"
          onClick={controls.reset}
          icon={<RotateCcw size={16} />}
        />
        <ToolButton
          label="Flip position"
          onClick={controls.flip}
          icon={<FlipHorizontal2 size={16} />}
        />
      </div>

      <ToolButton
        label={isImmersive ? 'Exit fullscreen card layout' : 'Enter fullscreen card layout'}
        onClick={onToggleImmersive}
        icon={
          isImmersive ? (
            <LayoutGrid size={16} />
          ) : (
            <Maximize2 size={16} />
          )
        }
      />
    </div>
  )
}

function SceneViewport({
  controlsRef,
  cameraRef,
}: {
  controlsRef: React.MutableRefObject<OrbitControlsImpl | null>
  cameraRef: React.MutableRefObject<PerspectiveCameraImpl | null>
}) {
  return (
    <Canvas shadows dpr={[1, 2]} gl={{ antialias: true }}>
      <color attach="background" args={['#07080f']} />
      <fog attach="fog" args={['#07080f', 14, 30]} />
      <PerspectiveCamera ref={cameraRef} makeDefault position={[6.2, 3.6, 7.2]} fov={40} />

      <ambientLight intensity={0.2} />
      <hemisphereLight args={['#6f8fff', '#0f0a19', 0.35]} />
      <directionalLight
        castShadow
        position={[6, 9, 5]}
        intensity={1}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <SpotLight
        castShadow
        position={[-7, 10, 10]}
        angle={0.34}
        distance={34}
        attenuation={7}
        anglePower={8}
        intensity={36}
        color="#e4ebff"
        penumbra={0.35}
        target-position={[0, 2, 0]}
      />
      <SpotLight
        castShadow
        position={[8, 8, -6]}
        angle={0.28}
        distance={32}
        attenuation={8}
        anglePower={9}
        intensity={22}
        color="#bf9cff"
        penumbra={0.42}
        target-position={[0, 1.8, 0]}
      />

      <Suspense fallback={<Loader />}>
        <SceneModel scale={1} position={[0, -1.2, 0]} rotation={[0, Math.PI * 0.22, 0]} />
        <Environment preset="city" />
      </Suspense>

      <mesh rotation-x={-Math.PI / 2} position={[0, -1.3, 0]} receiveShadow>
        <planeGeometry args={[50, 50]} />
        <shadowMaterial opacity={0.34} />
      </mesh>

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        target={[0, 2, 0]}
        minPolarAngle={0.55}
        maxPolarAngle={1.68}
        minDistance={2.4}
        maxDistance={13}
        zoomSpeed={0.95}
        rotateSpeed={0.9}
        panSpeed={0.75}
      />

      <GizmoHelper alignment="bottom-left" margin={[92, 92]}>
        <GizmoViewport axisColors={['#ff6b7a', '#7dff95', '#75a8ff']} labelColor="#f2f5ff" />
      </GizmoHelper>
    </Canvas>
  )
}

function ProjectSidebar({ isImmersive }: { isImmersive: boolean }) {
  return (
    <aside
      className={`h-full min-h-0 min-w-0 overflow-hidden transition-[opacity,transform,max-width] duration-300 ease-out max-[820px]:max-w-none ${
        isImmersive ? 'max-w-0 translate-x-5 opacity-0' : 'max-w-[300px]'
      }`}
      aria-hidden={isImmersive}
    >
      <div className="h-full overflow-auto box-border rounded-[18px] border border-white/10 bg-linear-to-b from-[rgba(16,19,31,0.95)] to-[rgba(9,10,18,0.96)] p-4 text-[#eef2ff]">
        <h2 className="m-0 mb-3 text-base text-[#f3f6ff]">Areas</h2>
        <ul className="m-0 grid gap-[0.55rem] pl-[1.05rem]">
          {/* <li className="text-[0.92rem] leading-[1.35] text-[rgba(231,237,255,0.92)]">
            Interactive neuro model viewer for educational exploration.
          </li>
          <li className="text-[0.92rem] leading-[1.35] text-[rgba(231,237,255,0.92)]">
            Production-style lights, shadows, and orientation gizmo.
          </li>
          <li className="text-[0.92rem] leading-[1.35] text-[rgba(231,237,255,0.92)]">
            Immersive full-width mode for distraction-free analysis.
          </li>
          <li className="text-[0.92rem] leading-[1.35] text-[rgba(231,237,255,0.92)]">
            Robust model asset preflight checks for safer loading.
          </li>
          <li className="text-[0.92rem] leading-[1.35] text-[rgba(231,237,255,0.92)]">
            Responsive UI layout tuned for desktop and tablet.
          </li> */}
        </ul>
      </div>
    </aside>
  )
}

function App() {
  const [assetCheck, setAssetCheck] = useState<AssetCheckState>({ status: 'checking' })
  const [isImmersive, setIsImmersive] = useState(false)
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const cameraRef = useRef<PerspectiveCameraImpl | null>(null)

  useEffect(() => {
    let active = true

    verifyModelAssets(MODEL_URL)
      .then((result) => {
        if (active) setAssetCheck(result)
      })
      .catch((error: unknown) => {
        if (!active) return
        const message =
          error instanceof Error ? error.message : 'Unexpected error while checking assets.'
        setAssetCheck({ status: 'error', message })
      })

    return () => {
      active = false
    }
  }, [])

  const controlActions: ViewerControls = {
    zoomIn: () => {
      const controls = controlsRef.current
      const camera = cameraRef.current
      if (!controls || !camera) return
      const target = controls.target.clone()
      const nextOffset = camera.position.clone().sub(target).multiplyScalar(0.85)
      camera.position.copy(target.add(nextOffset))
      controls.update()
    },
    zoomOut: () => {
      const controls = controlsRef.current
      const camera = cameraRef.current
      if (!controls || !camera) return
      const target = controls.target.clone()
      const nextOffset = camera.position.clone().sub(target).multiplyScalar(1.18)
      camera.position.copy(target.add(nextOffset))
      controls.update()
    },
    reset: () => {
      const controls = controlsRef.current
      const camera = cameraRef.current
      if (!controls || !camera) return
      camera.position.set(6.2, 3.6, 7.2)
      controls.target.set(0, 2, 0)
      controls.update()
    },
    flip: () => {
      const controls = controlsRef.current
      const camera = cameraRef.current
      if (!controls || !camera) return
      const target = controls.target.clone()
      const offset = camera.position.clone().sub(target)
      offset.applyAxisAngle(new Vector3(0, 1, 0), Math.PI)
      camera.position.copy(target.add(offset))
      controls.update()
    },
  }

  return (
    <main className="fixed inset-0 h-screen w-full overflow-hidden bg-[#06070d]">
      <div
        className={`box-border grid h-full transition-all duration-[420ms] ease-out ${
          isImmersive
            ? 'grid-cols-[minmax(0,1fr)_0] gap-0 p-0'
            : 'grid-cols-[minmax(0,1fr)_minmax(0,300px)] gap-[14px] p-[14px]'
        } max-[820px]:grid-cols-1`}
      >
        <section className="flex h-full min-h-0 min-w-0 flex-col gap-3 cursor-pointer ">
          <ViewerTitle isImmersive={isImmersive} />
          <div
            className={`relative min-h-0 flex-1 overflow-hidden bg-[#07080f] ${
              isImmersive ? 'rounded-none border-none' : 'rounded-[18px] border border-white/10'
            }`}
          >
            <Toolbar
              isImmersive={isImmersive}
              onToggleImmersive={() => setIsImmersive((value) => !value)}
              controls={controlActions}
            />

            {assetCheck.status === 'checking' && (
              <div className="grid min-h-full place-content-center gap-2 bg-[#090b12] p-6 text-center text-[#f4f6ff]">
                <h2 className="m-0 text-xl text-inherit">Checking model files...</h2>
                <p className="m-0 text-[rgba(244,246,255,0.85)]">
                  Validating {MODEL_URL}
                  {!IS_GLB_MODEL ? ' and referenced binary/texture assets.' : '.'}
                </p>
              </div>
            )}

            {assetCheck.status === 'error' && (
              <div className="grid min-h-full place-content-center gap-2 bg-[#090b12] p-6 text-center text-[#f4f6ff]">
                <h2 className="m-0 text-xl text-inherit">Scene failed to load</h2>
                <p className="m-0 text-[rgba(244,246,255,0.85)]">{assetCheck.message}</p>
                <p>
                  {IS_GLB_MODEL ? (
                    <>Place the file exactly at <code>public{MODEL_URL}</code>.</>
                  ) : (
                    <>
                      Add missing files under <code>public/</code> exactly as referenced by
                      <code> scene.gltf</code>.
                    </>
                  )}
                </p>
              </div>
            )}

            {assetCheck.status === 'ready' && (
              <CanvasErrorBoundary>
                <SceneViewport controlsRef={controlsRef} cameraRef={cameraRef} />
              </CanvasErrorBoundary>
            )}
          </div>
        </section>

        <ProjectSidebar isImmersive={isImmersive} />
      </div>
    </main>
  )
}

useGLTF.preload(MODEL_URL)

export default App
