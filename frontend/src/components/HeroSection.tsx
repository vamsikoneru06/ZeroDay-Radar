"use client"

import React, { useRef, useState, createContext, useContext } from "react"
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion"
import ContainerScroll from "./ContainerScroll"

// ── Upload-ready context ──────────────────────────────────────────────────────
// Tells GlassUploader whether the device frame has scrolled flat enough
// (scrollYProgress >= 0.75) to allow file interaction.
interface UploadReadyCtxValue {
  isReady: boolean
  scrollToCard: () => void
}

export const UploadReadyCtx = createContext<UploadReadyCtxValue>({
  isReady: true,
  scrollToCard: () => {},
})

export const useUploadReady = () => useContext(UploadReadyCtx)

// ── Floating package badge ────────────────────────────────────────────────────
interface BadgeProps {
  name: string
  version: string
  isVuln: boolean
  posX: string
  posY: string
  depth: number
  delay: number
  smoothX: MotionValue<number>
  smoothY: MotionValue<number>
}

function FloatingBadge({ name, version, isVuln, posX, posY, depth, delay, smoothX, smoothY }: BadgeProps) {
  // Each badge moves at a different depth — creates parallax layers
  const x = useTransform(smoothX, [-1, 1], [-depth * 45, depth * 45])
  const y = useTransform(smoothY, [-1, 1], [-depth * 45, depth * 45])

  return (
    <motion.div
      className="absolute hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/40 bg-white/75 backdrop-blur-md shadow-sm text-xs font-medium text-gray-700 pointer-events-none select-none z-10"
      style={{ left: posX, top: posY, x, y }}
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay, ease: [0.34, 1.56, 0.64, 1] }}
    >
      <span className="font-mono font-semibold text-gray-900">{name}</span>
      <span className="text-gray-400 font-normal">{version}</span>
      <span
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
          isVuln ? "bg-red-400" : "bg-emerald-400"
        }`}
      />
    </motion.div>
  )
}

// ── Radar ping ring ───────────────────────────────────────────────────────────
function RadarPing({ delay }: { delay: number }) {
  return (
    <motion.div
      className="absolute rounded-full border border-indigo-400/15 pointer-events-none"
      style={{
        width: 160,
        height: 160,
        left: "50%",
        top: "40%",
        translateX: "-50%",
        translateY: "-50%",
      }}
      initial={{ scale: 0, opacity: 0.7 }}
      animate={{ scale: [0, 5, 5], opacity: [0.7, 0.15, 0] }}
      transition={{ duration: 4, repeat: Infinity, delay, ease: "easeOut" }}
    />
  )
}

// ── Badge data ────────────────────────────────────────────────────────────────
const BADGES: Omit<BadgeProps, "smoothX" | "smoothY">[] = [
  { name: "numpy",     version: "1.24.2",  isVuln: true,  posX: "5%",  posY: "16%", depth: 0.7, delay: 0.15 },
  { name: "lodash",    version: "4.17.20", isVuln: true,  posX: "78%", posY: "11%", depth: 0.5, delay: 0.25 },
  { name: "requests",  version: "2.31.0",  isVuln: false, posX: "3%",  posY: "60%", depth: 0.6, delay: 0.1  },
  { name: "express",   version: "4.18.2",  isVuln: false, posX: "80%", posY: "56%", depth: 0.9, delay: 0.35 },
  { name: "django",    version: "3.2.0",   isVuln: true,  posX: "10%", posY: "40%", depth: 0.4, delay: 0.2  },
  { name: "react",     version: "16.8.0",  isVuln: false, posX: "73%", posY: "36%", depth: 0.8, delay: 0.3  },
  { name: "pillow",    version: "9.0.0",   isVuln: true,  posX: "86%", posY: "76%", depth: 0.35, delay: 0.4 },
  { name: "axios",     version: "0.21.1",  isVuln: true,  posX: "62%", posY: "84%", depth: 0.55, delay: 0.45 },
]

// ── Hero Section ──────────────────────────────────────────────────────────────
interface HeroSectionProps {
  children: React.ReactNode
}

export default function HeroSection({ children }: HeroSectionProps) {
  const sectionRef = useRef<HTMLDivElement>(null)

  // Tracks ContainerScroll progress: 0 = fully tilted, 1 = flat
  const [scrollProgress, setScrollProgress] = useState(0)
  const isReady = scrollProgress >= 0.72

  function scrollToCard() {
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }

  // Raw mouse position normalised to [-1, 1]
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  // Spring-smoothed values — makes all motion feel physical
  const smoothX = useSpring(mouseX, { stiffness: 55, damping: 18, restDelta: 0.001 })
  const smoothY = useSpring(mouseY, { stiffness: 55, damping: 18, restDelta: 0.001 })

  // Spotlight follows the cursor with a wider radius than mouse offset
  const spotX = useTransform(smoothX, [-1, 1], ["28%", "72%"])
  const spotY = useTransform(smoothY, [-1, 1], ["20%", "60%"])

  // Title block tilts in 3D toward the cursor
  const titleRotateX = useTransform(smoothY, [-1, 1], [6, -6])
  const titleRotateY = useTransform(smoothX, [-1, 1], [-10, 10])

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    mouseX.set((e.clientX - rect.left  - rect.width  / 2) / (rect.width  / 2))
    mouseY.set((e.clientY - rect.top   - rect.height / 2) / (rect.height / 2))
  }

  return (
    <UploadReadyCtx.Provider value={{ isReady, scrollToCard }}>
    <div
      ref={sectionRef}
      onMouseMove={onMouseMove}
      onMouseLeave={() => { mouseX.set(0); mouseY.set(0) }}
      className="relative overflow-hidden bg-white"
    >
      {/* ── Background gradient ──────────────────────────────────────────── */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-violet-50 animate-gradient-xy pointer-events-none" />

      {/* ── Soft vignette ────────────────────────────────────────────────── */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,transparent_60%,rgba(255,255,255,0.8)_100%)] pointer-events-none" />

      {/* ── Mouse-following spotlight ─────────────────────────────────────── */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          left: spotX,
          top: spotY,
          translateX: "-50%",
          translateY: "-50%",
          width: 700,
          height: 700,
          background:
            "radial-gradient(circle, rgba(99,102,241,0.10) 0%, rgba(139,92,246,0.06) 40%, transparent 70%)",
          borderRadius: "50%",
        }}
      />

      {/* ── Radar ping circles ────────────────────────────────────────────── */}
      <RadarPing delay={0} />
      <RadarPing delay={1.3} />
      <RadarPing delay={2.7} />

      {/* ── Floating parallax badges ──────────────────────────────────────── */}
      {BADGES.map(b => (
        <FloatingBadge key={b.name} {...b} smoothX={smoothX} smoothY={smoothY} />
      ))}

      {/* ── ContainerScroll: tilted device frame + upload card ────────────── */}
      <ContainerScroll
        onScrollProgress={setScrollProgress}
        titleComponent={
          <motion.div
            style={{
              rotateX: titleRotateX,
              rotateY: titleRotateY,
              transformStyle: "preserve-3d",
            }}
            className="text-center"
          >
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            >
              {/* Pill badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-200/80 bg-blue-50/80 text-blue-600 text-xs font-semibold mb-6 backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                Powered by OSV.dev
              </div>

              {/* Main headline */}
              <h2 className="text-4xl md:text-[3.75rem] font-extrabold text-gray-900 tracking-tight leading-none mb-5">
                Scan Before
                <br />
                <span className="bg-gradient-to-r from-blue-600 via-indigo-500 to-violet-600 bg-clip-text text-transparent">
                  You Ship
                </span>
              </h2>

              {/* Subheading */}
              <p className="text-base md:text-lg text-gray-500 max-w-xl mx-auto leading-relaxed">
                Upload{" "}
                <code className="text-[0.78em] bg-gray-100 px-1.5 py-0.5 rounded font-mono text-gray-700">
                  requirements.txt
                </code>{" "}
                or{" "}
                <code className="text-[0.78em] bg-gray-100 px-1.5 py-0.5 rounded font-mono text-gray-700">
                  package.json
                </code>{" "}
                to check every dependency against the world's largest open vulnerability database.
              </p>

              {/* Scroll hint */}
              <motion.div
                className="mt-8 flex flex-col items-center gap-1 text-gray-300"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2 }}
              >
                <span className="text-xs tracking-widest uppercase">scroll</span>
                <motion.div
                  className="w-px h-8 bg-gradient-to-b from-gray-300 to-transparent"
                  animate={{ scaleY: [1, 0.4, 1] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                />
              </motion.div>
            </motion.div>
          </motion.div>
        }
      >
        {/* Content rendered inside the "device screen" */}
        <div className="flex items-center justify-center h-full w-full p-4">
          {children}
        </div>
      </ContainerScroll>
    </div>
    </UploadReadyCtx.Provider>
  )
}
