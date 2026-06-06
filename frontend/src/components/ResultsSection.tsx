import { useRef, useEffect, useState } from "react"
import { motion, useInView, useScroll, useTransform, useSpring } from "framer-motion"
import { ShieldCheck, ShieldAlert, Shield, FileText, TrendingUp } from "lucide-react"
import { LiquidGlassCard } from "@/components/ui/liquid-weather-glass"
import VulnerableCard from "./VulnerableCard"
import SafeSection from "./SafeSection"
import type { ScanData, DependencyResult, Vulnerability } from "@/types"

// ── Helpers ───────────────────────────────────────────────────────────────────
const SEV_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]

function getWorst(vulns: Vulnerability[]): string | null {
  for (const s of SEV_ORDER) if (vulns.some(v => v.severity === s)) return s
  return null
}

function sortResults(rs: DependencyResult[]): DependencyResult[] {
  return [...rs].sort((a, b) => {
    if (a.is_vulnerable !== b.is_vulnerable) return a.is_vulnerable ? -1 : 1
    if (a.is_vulnerable && b.is_vulnerable) {
      const ai = SEV_ORDER.indexOf(getWorst(a.vulnerabilities) ?? "")
      const bi = SEV_ORDER.indexOf(getWorst(b.vulnerabilities) ?? "")
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    }
    return 0
  })
}

function getRisk(data: ScanData) {
  if (data.vulnerable_count === 0)
    return { label: "All Safe",    Icon: ShieldCheck, ring: "bg-emerald-50 border-emerald-200 text-emerald-700" }
  const all = data.results.flatMap(r => r.vulnerabilities)
  if (all.some(v => v.severity === "CRITICAL"))
    return { label: "Critical Risk", Icon: ShieldAlert, ring: "bg-red-50 border-red-200 text-red-700" }
  if (all.some(v => v.severity === "HIGH"))
    return { label: "High Risk",     Icon: ShieldAlert, ring: "bg-orange-50 border-orange-200 text-orange-700" }
  if (all.some(v => v.severity === "MEDIUM"))
    return { label: "Medium Risk",   Icon: Shield,      ring: "bg-amber-50 border-amber-200 text-amber-700" }
  return   { label: "Low Risk",      Icon: Shield,      ring: "bg-blue-50 border-blue-200 text-blue-700" }
}

// ── Animated count-up ─────────────────────────────────────────────────────────
function CountUp({ to, delay = 0 }: { to: number; delay?: number }) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })

  useEffect(() => {
    if (!inView) return
    let cancelled = false                          // guards against unmount mid-animation
    const timeout = setTimeout(() => {
      if (to === 0) { setCount(0); return }
      let frame = 0
      const total = 35
      const tick = () => {
        if (cancelled) return                      // component unmounted — stop the loop
        frame++
        setCount(Math.round(to * Math.min(frame / total, 1)))
        if (frame < total) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, delay * 1000)
    return () => { clearTimeout(timeout); cancelled = true }   // cancel both timer + rAF
  }, [inView, to, delay])

  return <span ref={ref}>{count}</span>
}

// ── Stat chip ─────────────────────────────────────────────────────────────────
function StatCard({ value, label, valueClass, delay }: {
  value: number; label: string; valueClass: string; delay: number
}) {
  const ref    = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.5 })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24, scale: 0.88 }}
      animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ duration: 0.5, delay, ease: [0.34, 1.56, 0.64, 1] }}
    >
      <LiquidGlassCard
        draggable={false}
        shadowIntensity="sm"
        glowIntensity="xs"
        borderRadius="14px"
        className="bg-white/90"
      >
        <div className="flex flex-col items-center justify-center px-6 py-6">
          <span className={`text-4xl font-extrabold tabular-nums leading-none ${valueClass}`}>
            <CountUp to={value} delay={delay} />
          </span>
          <span className="text-[0.62rem] font-semibold uppercase tracking-widest text-gray-400 mt-2">
            {label}
          </span>
        </div>
      </LiquidGlassCard>
    </motion.div>
  )
}

// ── Scroll progress bar (attached to summary card bottom edge) ────────────────
function ScrollProgressBar({ containerRef }: { containerRef: React.RefObject<HTMLElement | null> }) {
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end end"],
  })
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 30 })

  return (
    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-100 overflow-hidden">
      <motion.div
        className="h-full bg-gradient-to-r from-blue-400 via-indigo-400 to-violet-400 origin-left"
        style={{ scaleX }}
      />
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ResultsSection({ data }: { data: ScanData }) {
  const sorted             = sortResults(data.results)
  const vulnerableResults  = sorted.filter(r => r.is_vulnerable)
  const safeResults        = sorted.filter(r => !r.is_vulnerable)
  const safeCount          = data.dependency_count - data.vulnerable_count
  const risk               = getRisk(data)
  const sectionRef         = useRef<HTMLElement>(null)

  // Header animation trigger
  const headerRef    = useRef<HTMLDivElement>(null)
  const headerInView = useInView(headerRef, { once: true, amount: 0.3 })

  return (
    <section ref={sectionRef as React.RefObject<HTMLElement>} className="space-y-5">

      {/* ── Summary header ─────────────────────────────────── */}
      <div ref={headerRef}>
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={headerInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <LiquidGlassCard
            draggable={false}
            shadowIntensity="sm"
            glowIntensity="xs"
            borderRadius="16px"
            className="bg-white/90 relative overflow-hidden"
          >
            {/* Scroll depth bar */}
            <ScrollProgressBar containerRef={sectionRef as React.RefObject<HTMLElement | null>} />

            <div className="px-6 py-5">
              {/* Title + risk pill */}
              <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
                <div className="flex items-center gap-3">
                  <motion.div
                    initial={{ rotate: -20, opacity: 0, scale: 0.6 }}
                    animate={headerInView ? { rotate: 0, opacity: 1, scale: 1 } : {}}
                    transition={{ delay: 0.15, type: "spring", stiffness: 220 }}
                  >
                    <TrendingUp className="w-4 h-4 text-gray-400" />
                  </motion.div>
                  <motion.h2
                    className="text-base font-bold text-gray-900"
                    initial={{ opacity: 0, x: -10 }}
                    animate={headerInView ? { opacity: 1, x: 0 } : {}}
                    transition={{ delay: 0.1, duration: 0.35 }}
                  >
                    Scan Report
                  </motion.h2>
                  <motion.span
                    initial={{ opacity: 0, scale: 0.6, x: -8 }}
                    animate={headerInView ? { opacity: 1, scale: 1, x: 0 } : {}}
                    transition={{ delay: 0.25, type: "spring", stiffness: 260 }}
                    className={`inline-flex items-center gap-1.5 text-[0.67rem] font-bold tracking-wide px-2.5 py-1 rounded-full border ${risk.ring}`}
                  >
                    <risk.Icon size={10} />
                    {risk.label}
                  </motion.span>
                </div>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={headerInView ? { opacity: 1 } : {}}
                  transition={{ delay: 0.3 }}
                  className="flex items-center gap-1.5 text-xs text-gray-400 font-mono"
                >
                  <FileText size={11} />
                  {data.filename} · {data.ecosystem}
                </motion.div>
              </div>

              {/* Stat chips — staggered pop-up */}
              <div className="grid grid-cols-3 gap-3">
                <StatCard value={data.dependency_count} label="Packages"   valueClass="text-gray-800"    delay={0.15} />
                <StatCard value={data.vulnerable_count} label="Vulnerable" valueClass="text-red-500"     delay={0.25} />
                <StatCard value={safeCount}             label="Safe"        valueClass="text-emerald-500" delay={0.35} />
              </div>
            </div>
          </LiquidGlassCard>
        </motion.div>
      </div>

      {/* ── All clear ────────────────────────────────────────── */}
      {data.vulnerable_count === 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.93 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          <LiquidGlassCard draggable={false} shadowIntensity="sm" glowIntensity="xs" borderRadius="16px" className="bg-white/90">
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <motion.div
                initial={{ scale: 0, rotate: -30 }}
                whileInView={{ scale: 1, rotate: 0 }}
                viewport={{ once: true }}
                transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
              >
                <ShieldCheck className="w-12 h-12 text-emerald-400 mb-4" />
              </motion.div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">All Clear</h3>
              <p className="text-sm text-gray-400">No known vulnerabilities found.</p>
            </div>
          </LiquidGlassCard>
        </motion.div>
      )}

      {/* ── Vulnerable package cards ──────────────────────────
          Each card flips up from bottom with 3-D perspective.
          Row-level stagger happens inside VulnerableCard via useInView.
      ────────────────────────────────────────────────────── */}
      {vulnerableResults.map((result, i) => (
        <motion.div
          key={`${result.dependency.name}@${result.dependency.version}`}
          initial={{ opacity: 0, y: 64, rotateX: 14, scale: 0.96 }}
          whileInView={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{
            duration: 0.6,
            delay: i * 0.05,
            ease: [0.22, 1, 0.36, 1],
          }}
          style={{ transformPerspective: 900, transformOrigin: "top center" }}
        >
          <VulnerableCard result={result} />
        </motion.div>
      ))}

      {/* ── Safe section ─────────────────────────────────────── */}
      {safeResults.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-20px" }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <SafeSection results={safeResults} />
        </motion.div>
      )}

    </section>
  )
}
