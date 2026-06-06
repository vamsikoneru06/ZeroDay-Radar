import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronRight, ChevronDown, CheckCircle2 } from "lucide-react"
import { LiquidGlassCard } from "@/components/ui/liquid-weather-glass"
import type { DependencyResult } from "@/types"

export default function SafeSection({ results }: { results: DependencyResult[] }) {
  const [open, setOpen] = useState(false)

  return (
    <LiquidGlassCard
      draggable={false}
      shadowIntensity="sm"
      glowIntensity="xs"
      borderRadius="16px"
      className="bg-white/90 overflow-hidden"
    >
      {/* Left accent — green for safe */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-400 z-40 rounded-l-2xl" />

      <div className="pl-4">
        {/* Toggle row */}
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-gray-50/70 transition-colors"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
          <span className="flex-1 text-sm font-medium text-gray-700">
            {results.length} safe package{results.length !== 1 ? "s" : ""}
          </span>
          <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
            No issues
          </span>
          <span className="text-gray-300 flex-shrink-0">
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
        </button>

        {/* Expanded list */}
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="mx-4 h-px bg-gray-100" />
              <div className="py-2">
                {results.map((r, i) => {
                  const dep = r.dependency
                  const ecoStyles: Record<string, string> = {
                    pypi: "bg-blue-50 text-blue-600 border-blue-200",
                    npm:  "bg-amber-50 text-amber-600 border-amber-200",
                  }
                  const ecoClass = ecoStyles[dep.ecosystem.toLowerCase()] ?? "bg-gray-100 text-gray-500 border-gray-200"
                  return (
                    <motion.div
                      key={`${dep.name}@${dep.version}`}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50/60 transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      <span className="font-mono text-[0.82rem] font-semibold text-gray-800">{dep.name}</span>
                      <span className="font-mono text-xs text-gray-400 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded">
                        {dep.version}
                      </span>
                      <span className={`text-[0.58rem] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${ecoClass}`}>
                        {dep.ecosystem}
                      </span>
                    </motion.div>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </LiquidGlassCard>
  )
}
