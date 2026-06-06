"use client"

import React, { useRef, useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { UploadCloud, X, FileText, CheckCircle2, AlertTriangle, ScanSearch, MousePointerClick } from "lucide-react"
import { LiquidButton } from "@/components/ui/liquid-glass-button"
import { useUploadReady } from "@/components/HeroSection"
import { cn } from "@/lib/utils"
import type { ScanData } from "@/types"

// ── SVG distortion filter ─────────────────────────────────────────────────────
export const GlassFilter: React.FC = () => (
  <svg style={{ display: "none" }} aria-hidden="true">
    <filter id="glass-distortion" x="-10%" y="-10%" width="120%" height="120%" filterUnits="objectBoundingBox">
      <feTurbulence type="fractalNoise" baseFrequency="0.0012 0.005" numOctaves="2" seed="21" result="turb" />
      <feComponentTransfer in="turb" result="mapped">
        <feFuncR type="gamma" amplitude="1" exponent="10" offset="0.5" />
        <feFuncG type="gamma" amplitude="0" exponent="1"  offset="0"   />
        <feFuncB type="gamma" amplitude="0" exponent="1"  offset="0.5" />
      </feComponentTransfer>
      <feGaussianBlur in="turb" stdDeviation="5" result="softMap" />
      <feDisplacementMap in="SourceGraphic" in2="softMap" scale="220" xChannelSelector="R" yChannelSelector="G" />
    </filter>
  </svg>
)

// ── Glass pane — white-background version ─────────────────────────────────────
// On white, glass is defined by its shadow depth + frosted blur.
// Border and top specular stay subtle so nothing looks out of place.
const Glass: React.FC<{ children: React.ReactNode; className?: string; style?: React.CSSProperties }> = ({
  children, className, style,
}) => (
  <div
    className={cn("relative overflow-hidden", className)}
    style={{
      boxShadow: [
        "0 4px 24px rgba(0,0,0,0.06)",
        "0 1px 6px rgba(0,0,0,0.04)",
        "inset 0 1px 0 rgba(255,255,255,0.9)",    // top specular
        "inset 1px 0 0 rgba(255,255,255,0.6)",    // left catch-light
        "inset 0 -1px 0 rgba(0,0,0,0.04)",        // faint bottom
        "inset -1px 0 0 rgba(0,0,0,0.02)",        // faint right
      ].join(", "),
      ...style,
    }}
  >
    {/* Frosted blur — tinted just enough to read as glass on white */}
    <div
      className="absolute inset-0 z-0"
      style={{
        backdropFilter: "blur(24px) saturate(160%) brightness(1.02)",
        WebkitBackdropFilter: "blur(24px) saturate(160%) brightness(1.02)",
      }}
    />
    {/* Near-white frosted tint */}
    <div className="absolute inset-0 z-10 bg-white/[0.75]" />
    {/* Gradient sheen: slightly lighter top-left → transparent bottom-right */}
    <div
      className="absolute inset-0 z-20 pointer-events-none"
      style={{
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.1) 55%, transparent 100%)",
      }}
    />
    {/* Content */}
    <div className="relative z-30">{children}</div>
  </div>
)

// ── Liquid Glass Icon Box ─────────────────────────────────────────────────────
// Clean frosted-glass chip — inset rim shadows + backdrop blur, no distortion
// (distortion filters need large surfaces; they destroy small icons)
const LiquidIconBox: React.FC<{ children: React.ReactNode; size?: number; className?: string }> = ({
  children, size = 44, className = "",
}) => (
  <div
    className={cn("relative flex-shrink-0 rounded-2xl flex items-center justify-center", className)}
    style={{
      width: size, height: size,
      background: "rgba(255,255,255,0.82)",
      backdropFilter: "blur(24px) saturate(180%) brightness(1.03)",
      WebkitBackdropFilter: "blur(24px) saturate(180%) brightness(1.03)",
      boxShadow: [
        // outer lift
        "0 2px 10px rgba(0,0,0,0.08)",
        "0 1px 3px rgba(0,0,0,0.05)",
        // top + left bright rims (specular)
        "inset 0 1px 0 rgba(255,255,255,1)",
        "inset 1px 0 0 rgba(255,255,255,0.85)",
        // bottom + right dark rims (depth)
        "inset 0 -1px 0 rgba(0,0,0,0.07)",
        "inset -1px 0 0 rgba(0,0,0,0.04)",
        // inner vignette — the "glass lens" bubble feel
        "inset 0 0 12px rgba(0,0,0,0.06)",
      ].join(", "),
    }}
  >
    {/* Diagonal specular sheen — top-left corner catch-light */}
    <div
      className="absolute inset-0 rounded-2xl pointer-events-none"
      style={{
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.18) 42%, transparent 100%)",
      }}
    />
    <div className="relative z-10">{children}</div>
  </div>
)

// ── Types ─────────────────────────────────────────────────────────────────────
interface ScannedFile {
  id: string; file: File; progress: number
  status: "scanning" | "completed" | "error"
}

interface GlassUploaderProps {
  onScanComplete: (data: ScanData) => void
  onScanError:    (message: string) => void
  apiBase?: string
}

const VALID = ["requirements.txt", "package.json"]

// ── Component ─────────────────────────────────────────────────────────────────
const GlassUploader: React.FC<GlassUploaderProps> = ({
  onScanComplete, onScanError, apiBase = "http://127.0.0.1:8080",
}) => {
  const { isReady, scrollToCard } = useUploadReady()

  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [scanned,     setScanned]     = useState<ScannedFile | null>(null)
  const [isDragging,  setDragging]    = useState(false)
  const [showHint,    setShowHint]    = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Trigger "scroll to reveal" and briefly show the hint tooltip
  function requestScroll() {
    scrollToCard()
    setShowHint(true)
    setTimeout(() => setShowHint(false), 2000)
  }

  useEffect(() => {
    if (!scanned || scanned.status !== "scanning" || scanned.progress >= 90) return
    const t = setInterval(() =>
      setScanned(p => p?.status === "scanning" && p.progress < 90
        ? { ...p, progress: Math.min(p.progress + 7, 90) } : p), 280)
    return () => clearInterval(t)
  }, [scanned])

  function pick(file: File) {
    if (!VALID.includes(file.name)) {
      onScanError(`"${file.name}" is not supported. Upload requirements.txt or package.json.`)
      return
    }
    setPendingFile(file); setScanned(null)
  }

  async function scan() {
    if (!pendingFile) return
    const entry: ScannedFile = {
      id: `${pendingFile.name}-${Date.now()}`, file: pendingFile, progress: 0, status: "scanning",
    }
    setScanned(entry); setPendingFile(null)

    const fd = new FormData()
    fd.append("file", pendingFile)
    try {
      const res  = await fetch(`${apiBase}/scan`, { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || `Error ${res.status}`)
      setScanned(p => p ? { ...p, progress: 100, status: "completed" } : p)
      onScanComplete(data)
    } catch (err) {
      const msg = err instanceof TypeError
        ? "Can't reach backend. Start uvicorn on port 8080."
        : (err as Error).message
      setScanned(p => p ? { ...p, status: "error" } : p)
      onScanError(msg)
    }
  }

  const fmt = (b: number) => b < 1024 ? `${b} B` : `${(b / 1024).toFixed(1)} KB`

  return (
    <div className="w-full max-w-md mx-auto">
      <GlassFilter />

      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
      >
        {/* ── Main glass card ───────────────────────────────────────────── */}
        <Glass className="rounded-3xl border border-black/[0.06]">
          <div className="px-6 pt-6 pb-6 space-y-4">

            {/* Header */}
            <div className="flex items-center gap-3">
              <LiquidIconBox size={44}>
                <UploadCloud className="w-5 h-5 text-gray-500" />
              </LiquidIconBox>
              <div>
                <p className="text-[0.92rem] font-semibold text-gray-900 leading-tight">
                  Scan Dependencies
                </p>
                <p className="text-[0.72rem] text-gray-400 mt-0.5">
                  <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono text-gray-600">requirements.txt</code>
                  {" "}or{" "}
                  <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono text-gray-600">package.json</code>
                </p>
              </div>
            </div>

            {/* Drop zone — gated: scrolls to card if not yet flat */}
            <div className="relative">
              <div
                onDragEnter={e => { e.preventDefault(); if (!isReady) { requestScroll(); return } setDragging(true) }}
                onDragLeave={e => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false) }}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault()
                  if (!isReady) { requestScroll(); return }
                  setDragging(false)
                  const f = e.dataTransfer.files[0]; if (f) pick(f)
                }}
                onClick={() => { if (!isReady) { requestScroll(); return } inputRef.current?.click() }}
                className={cn(
                  "relative rounded-2xl border-2 border-dashed p-7 flex flex-col items-center gap-2 transition-all duration-200",
                  isReady ? "cursor-pointer" : "cursor-not-allowed",
                  isDragging
                    ? "border-blue-300 bg-blue-50/60"
                    : isReady
                    ? "border-gray-200 hover:border-gray-300 hover:bg-gray-50/60"
                    : "border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/30",
                )}
              >
                {isDragging && (
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="absolute inset-0 rounded-2xl pointer-events-none"
                    style={{ boxShadow: "inset 0 0 20px rgba(59,130,246,0.06)" }}
                  />
                )}
                <input
                  ref={inputRef} type="file" accept=".json,.txt" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) pick(f) }}
                />
                <LiquidIconBox size={58} className="pointer-events-none mb-1">
                  <UploadCloud className={cn("w-7 h-7", isReady ? "text-gray-400" : "text-indigo-400")} />
                </LiquidIconBox>
                <p className="text-sm font-semibold text-gray-700">Drop your file here</p>
                <p className="text-xs text-gray-400">or click to browse</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[0.65rem] bg-gray-100 border border-gray-200 rounded-md px-2 py-0.5 font-mono text-gray-500">
                    package.json
                  </span>
                  <span className="text-gray-300 text-xs">·</span>
                  <span className="text-[0.65rem] bg-gray-100 border border-gray-200 rounded-md px-2 py-0.5 font-mono text-gray-500">
                    requirements.txt
                  </span>
                </div>
              </div>

              {/* Scroll hint tooltip — flashes when card is not yet flat */}
              <AnimatePresence>
                {showHint && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.95 }}
                    className="absolute inset-0 flex items-center justify-center rounded-2xl pointer-events-none z-10"
                    style={{ background: "rgba(238,242,255,0.92)", backdropFilter: "blur(4px)" }}
                  >
                    <div className="flex flex-col items-center gap-2 text-indigo-600">
                      <MousePointerClick size={20} />
                      <span className="text-xs font-semibold">Scroll down to unlock</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Selected file chip */}
            <AnimatePresence>
              {pendingFile && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4 }}
                >
                  <Glass className="rounded-xl border border-black/[0.06]">
                    <div className="flex items-center gap-3 px-4 py-2.5">
                      <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="flex-1 text-[0.82rem] font-mono font-medium text-gray-700 truncate">
                        {pendingFile.name}
                      </span>
                      <span className="text-[0.7rem] text-gray-400 flex-shrink-0">{fmt(pendingFile.size)}</span>
                      <button
                        onClick={e => { e.stopPropagation(); setPendingFile(null) }}
                        className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </Glass>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Scan CTA — LiquidButton */}
            <LiquidButton
              size="lg"
              disabled={!pendingFile || scanned?.status === "scanning"}
              onClick={scan}
              className="w-full text-gray-800 font-semibold tracking-wide"
            >
              <span className="flex items-center justify-center gap-2">
                <ScanSearch className="size-[15px] flex-shrink-0 text-gray-500" />
                <span>{scanned?.status === "scanning" ? "Scanning…" : "Scan Dependencies"}</span>
              </span>
            </LiquidButton>
          </div>

          {/* Scan progress row */}
          <AnimatePresence>
            {scanned && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mx-6 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
                <div className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <Glass className="rounded-xl flex-shrink-0 border border-black/[0.06]">
                      <div className="w-10 h-10 flex items-center justify-center text-[0.6rem] font-bold text-gray-400 tracking-wider">
                        {scanned.file.name.endsWith(".json") ? "JSON" : "TXT"}
                      </div>
                    </Glass>
                    <div className="flex-1 min-w-0">
                      <p className="text-[0.82rem] font-mono font-medium text-gray-700 truncate">
                        {scanned.file.name}
                      </p>
                      <div className="flex items-center gap-1.5 text-[0.7rem] mt-0.5">
                        <span className="text-gray-400">{fmt(scanned.file.size)}</span>
                        <span className="text-gray-300">·</span>
                        <span className={cn({
                          "text-blue-500":   scanned.status === "scanning",
                          "text-emerald-500": scanned.status === "completed",
                          "text-red-500":    scanned.status === "error",
                        })}>
                          {scanned.status === "scanning"   ? "Scanning…"
                           : scanned.status === "completed" ? "Completed"
                           : "Error"}
                        </span>
                      </div>
                      {scanned.status === "scanning" && (
                        <div className="mt-1.5 h-1 w-full rounded-full bg-gray-100 overflow-hidden">
                          <motion.div
                            className="h-full rounded-full bg-gradient-to-r from-blue-400 to-indigo-400"
                            animate={{ width: `${scanned.progress}%` }}
                            transition={{ duration: 0.3 }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      {scanned.status === "completed" && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                      {scanned.status === "error"     && <AlertTriangle className="w-5 h-5 text-red-400"    />}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Glass>
      </motion.div>
    </div>
  )
}

export default GlassUploader
