import { useState, useRef } from "react"
import { motion, AnimatePresence, useInView } from "framer-motion"
import { ChevronDown, ChevronRight, ExternalLink, ShieldAlert, ShieldX, Shield, Info, type LucideIcon } from "lucide-react"
import { LiquidGlassCard } from "@/components/ui/liquid-weather-glass"
import type { DependencyResult, Vulnerability } from "@/types"

// ── Severity config ───────────────────────────────────────────────────────────
const SEV_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"] as const
type SevKey = typeof SEV_ORDER[number]

const SEV: Record<SevKey, {
  label: string; text: string; mutedText: string
  bg: string; border: string; bar: string; dot: string
  headerFrom: string; bodyBg: string; bodyBorder: string
  Icon: LucideIcon
}> = {
  CRITICAL: {
    label: "Critical",
    text: "text-red-600", mutedText: "text-red-500",
    bg: "bg-red-50", border: "border-red-200",
    bar: "bg-red-500", dot: "bg-red-500",
    headerFrom: "from-red-50/90",
    bodyBg: "bg-red-50/60", bodyBorder: "border-red-100",
    Icon: ShieldX,
  },
  HIGH: {
    label: "High",
    text: "text-orange-600", mutedText: "text-orange-500",
    bg: "bg-orange-50", border: "border-orange-200",
    bar: "bg-orange-500", dot: "bg-orange-500",
    headerFrom: "from-orange-50/90",
    bodyBg: "bg-orange-50/60", bodyBorder: "border-orange-100",
    Icon: ShieldAlert,
  },
  MEDIUM: {
    label: "Medium",
    text: "text-amber-600", mutedText: "text-amber-500",
    bg: "bg-amber-50", border: "border-amber-200",
    bar: "bg-amber-400", dot: "bg-amber-500",
    headerFrom: "from-amber-50/90",
    bodyBg: "bg-amber-50/60", bodyBorder: "border-amber-100",
    Icon: Shield,
  },
  LOW: {
    label: "Low",
    text: "text-sky-600", mutedText: "text-sky-500",
    bg: "bg-sky-50", border: "border-sky-200",
    bar: "bg-sky-500", dot: "bg-sky-500",
    headerFrom: "from-sky-50/90",
    bodyBg: "bg-sky-50/60", bodyBorder: "border-sky-100",
    Icon: Info,
  },
  UNKNOWN: {
    label: "Unknown",
    text: "text-gray-500", mutedText: "text-gray-400",
    bg: "bg-gray-100", border: "border-gray-200",
    bar: "bg-gray-400", dot: "bg-gray-400",
    headerFrom: "from-gray-50/70",
    bodyBg: "bg-gray-50", bodyBorder: "border-gray-100",
    Icon: Info,
  },
}

function normSev(s: string | null): SevKey {
  const u = (s || "UNKNOWN").toUpperCase()
  return SEV_ORDER.includes(u as SevKey) ? (u as SevKey) : "UNKNOWN"
}

function worstSev(vulns: Vulnerability[]): SevKey {
  for (const s of SEV_ORDER) if (vulns.some(v => normSev(v.severity) === s)) return s
  return "UNKNOWN"
}

// ── Badges ────────────────────────────────────────────────────────────────────
function SevBadge({ severity }: { severity: string | null }) {
  const c = SEV[normSev(severity)]
  return (
    <span className={`inline-flex items-center gap-1 text-[0.62rem] font-bold tracking-widest px-2 py-0.5 rounded-md border ${c.text} ${c.bg} ${c.border}`}>
      <span className={`w-1 h-1 rounded-full ${c.dot}`} />
      {c.label.toUpperCase()}
    </span>
  )
}

function EcoBadge({ eco }: { eco: string }) {
  const map: Record<string, string> = {
    pypi: "bg-blue-50 text-blue-700 border-blue-200",
    npm:  "bg-amber-50 text-amber-700 border-amber-200",
  }
  const cls = map[eco.toLowerCase()] ?? "bg-gray-100 text-gray-600 border-gray-200"
  return (
    <span className={`text-[0.6rem] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${cls}`}>
      {eco}
    </span>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────────
const INITIAL = 5

export default function VulnerableCard({ result }: { result: DependencyResult }) {
  const { dependency: dep, vulnerabilities } = result
  const [showAll, setShowAll] = useState(false)
  const [openId,  setOpenId]  = useState<string | null>(null)

  // Header ref for scan-beam trigger
  const headerRef = useRef<HTMLDivElement>(null)
  const headerInView = useInView(headerRef, { once: true, amount: 0.5 })

  const ws      = worstSev(vulnerabilities)
  const cfg     = SEV[ws]
  const visible = showAll ? vulnerabilities : vulnerabilities.slice(0, INITIAL)
  const hidden  = vulnerabilities.length - INITIAL

  // Severity breakdown counts
  const counts = SEV_ORDER.reduce<Record<string, number>>((a, s) => {
    const n = vulnerabilities.filter(v => normSev(v.severity) === s).length
    if (n) a[s] = n
    return a
  }, {})

  return (
    <LiquidGlassCard
      draggable={false}
      shadowIntensity="sm"
      glowIntensity="xs"
      borderRadius="16px"
      className="bg-white/90 overflow-hidden"
    >
      {/* ── Severity accent strip ───────────────────────────── */}
      <motion.div
        className={`absolute left-0 top-0 bottom-0 w-1 ${cfg.dot} z-40 rounded-l-2xl origin-top`}
        initial={{ scaleY: 0 }}
        animate={headerInView ? { scaleY: 1 } : {}}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      />

      {/* ── Scan beam — sweeps top→bottom when card enters view ─ */}
      <motion.div
        className={`absolute inset-x-0 top-0 h-0.5 pointer-events-none z-50`}
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${
            ws === "CRITICAL" ? "#ef4444" : ws === "HIGH" ? "#f97316" : ws === "MEDIUM" ? "#f59e0b" : ws === "LOW" ? "#0ea5e9" : "#94a3b8"
          } 50%, transparent 100%)`,
        }}
        initial={{ y: 0, opacity: 0.9 }}
        animate={headerInView ? { y: "6000%", opacity: 0 } : {}}
        transition={{ duration: 1.1, ease: "linear", delay: 0.1 }}
      />

      <div className="pl-4">
        {/* ── Coloured header ─────────────────────────────── */}
        <div
          ref={headerRef}
          className={`bg-gradient-to-r ${cfg.headerFrom} to-transparent px-4 pt-5 pb-4`}
        >
          {/* Package meta row */}
          <motion.div
            className="flex items-center justify-between gap-4 flex-wrap"
            initial={{ opacity: 0, y: -10 }}
            animate={headerInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <cfg.Icon size={15} className={cfg.text} />
              <span className="font-mono text-[0.95rem] font-bold text-gray-900">{dep.name}</span>
              <span className="text-[0.75rem] font-mono text-gray-400 bg-white/70 border border-gray-200 px-2 py-0.5 rounded">
                {dep.version}
              </span>
              <EcoBadge eco={dep.ecosystem} />
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-gray-400">
                {vulnerabilities.length} {vulnerabilities.length === 1 ? "vulnerability" : "vulnerabilities"}
              </span>
              <SevBadge severity={ws} />
            </div>
          </motion.div>

          {/* Severity breakdown bar */}
          <div className="flex items-center gap-3 mt-3">
            <div className="flex-1 flex h-1.5 rounded-full overflow-hidden gap-[2px] bg-black/[0.04]">
              {SEV_ORDER.filter(s => counts[s]).map((s, i) => (
                <motion.div
                  key={s}
                  className={`h-full ${SEV[s].bar}`}
                  initial={{ width: 0 }}
                  animate={headerInView ? { width: `${(counts[s] / vulnerabilities.length) * 100}%` } : {}}
                  transition={{ duration: 0.7, ease: "easeOut", delay: 0.3 + i * 0.08 }}
                  title={`${counts[s]} ${s}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              {SEV_ORDER.filter(s => counts[s]).map(s => (
                <span key={s} className={`text-[0.62rem] font-semibold ${SEV[s].text}`}>
                  {counts[s]}&thinsp;{s.toLowerCase()}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mx-4 h-px bg-gray-100" />

        {/* ── Vuln rows — staggered scroll entrance ─────────── */}
        <div>
          {visible.map((vuln, i) => {
            const isOpen = openId === vuln.id
            const vc     = SEV[normSev(vuln.severity)]

            return (
              <motion.div
                key={vuln.id}
                initial={{ opacity: 0, y: 18, scale: 0.98 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{
                  duration: 0.45,
                  delay: i * 0.07,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="group border-b border-gray-50 last:border-b-0"
              >
                {/* Row header */}
                <div
                  className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-gray-50/70 transition-colors"
                  onClick={() => setOpenId(isOpen ? null : vuln.id)}
                >
                  <span className="text-gray-300 flex-shrink-0">
                    {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  </span>
                  <a
                    href={`https://osv.dev/vulnerability/${vuln.id}`}
                    target="_blank" rel="noopener"
                    onClick={e => e.stopPropagation()}
                    className="font-mono text-[0.78rem] font-semibold text-blue-600 hover:underline underline-offset-2 flex-shrink-0"
                  >
                    {vuln.id}
                  </a>
                  <SevBadge severity={vuln.severity} />
                  {!isOpen && vuln.summary && (
                    <span className="text-xs text-gray-400 truncate min-w-0 hidden sm:block">
                      {vuln.summary}
                    </span>
                  )}
                  <a
                    href={`https://osv.dev/vulnerability/${vuln.id}`}
                    target="_blank" rel="noopener"
                    onClick={e => e.stopPropagation()}
                    className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-blue-500 flex-shrink-0"
                  >
                    <ExternalLink size={11} />
                  </a>
                </div>

                {/* Expanded body */}
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className={`mx-4 mb-3 rounded-xl p-4 ${vc.bodyBg} border ${vc.bodyBorder}`}>
                        <p className="text-sm text-gray-700 leading-relaxed mb-2">
                          {vuln.summary
                            ? vuln.summary
                            : <em className="text-gray-400 not-italic">No description available from OSV.dev</em>
                          }
                        </p>
                        {vuln.fixed_version ? (
                          <div className="inline-flex items-center gap-2 text-xs">
                            <span className="text-gray-400">Fix:</span>
                            <span className="font-mono font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5">
                              upgrade to {vuln.fixed_version}
                            </span>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 italic">
                            No patched version — monitor the advisory for updates
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}

          {/* Show more / less */}
          {vulnerabilities.length > INITIAL && (
            <motion.button
              onClick={() => setShowAll(s => !s)}
              className={`w-full flex items-center justify-center gap-1.5 py-3 text-xs font-semibold border-t border-gray-100 transition-colors ${cfg.text} hover:${cfg.bg}`}
              initial={{ opacity: 0, y: 6 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: Math.min(visible.length, INITIAL) * 0.07 + 0.05 }}
            >
              {showAll
                ? <>Show less <ChevronDown size={11} className="rotate-180" /></>
                : <>Show {hidden} more {hidden === 1 ? "vulnerability" : "vulnerabilities"} <ChevronDown size={11} /></>
              }
            </motion.button>
          )}
        </div>
      </div>
    </LiquidGlassCard>
  )
}
