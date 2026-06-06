import { useState } from "react"
import { AlertTriangle, X } from "lucide-react"
import HeroSection from "./components/HeroSection"
import GlassUploader from "./components/GlassUploader"
import ResultsSection from "./components/ResultsSection"
import { OwnerCard } from "./components/ui/owner-card"
import type { ScanData } from "./types"

export default function App() {
  const [results, setResults] = useState<ScanData | null>(null)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">

      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <header className="bg-white/75 border-b border-white/60 sticky top-0 z-50"
        style={{ backdropFilter: "blur(28px) saturate(180%)", WebkitBackdropFilter: "blur(28px) saturate(180%)" }}
      >
        <div className="w-full px-6 py-3 flex items-center justify-between">

          {/* ── Left: glass pill wrapping icon chip + title ── */}
          <div
            className="relative flex items-center gap-2.5 px-2 py-1.5 rounded-2xl"
            style={{
              background: "rgba(255,255,255,0.72)",
              backdropFilter: "blur(20px) saturate(160%)",
              WebkitBackdropFilter: "blur(20px) saturate(160%)",
              boxShadow: [
                "0 2px 10px rgba(0,0,0,0.07)",
                "0 1px 3px rgba(0,0,0,0.04)",
                "inset 0 1px 0 rgba(255,255,255,1)",
                "inset 1px 0 0 rgba(255,255,255,0.9)",
                "inset 0 -1px 0 rgba(0,0,0,0.06)",
                "inset -1px 0 0 rgba(0,0,0,0.03)",
                "inset 0 0 10px rgba(0,0,0,0.04)",
              ].join(", "),
            }}
          >
            {/* Diagonal sheen */}
            <div className="absolute inset-0 rounded-2xl pointer-events-none"
              style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.08) 45%, transparent 100%)" }}
            />

            {/* ◈ icon glass chip */}
            <div
              className="relative w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: "rgba(255,255,255,0.88)",
                boxShadow: [
                  "0 1px 6px rgba(0,0,0,0.09)",
                  "inset 0 1px 0 rgba(255,255,255,1)",
                  "inset 1px 0 0 rgba(255,255,255,0.9)",
                  "inset 0 -1px 0 rgba(0,0,0,0.08)",
                  "inset -1px 0 0 rgba(0,0,0,0.04)",
                  "inset 0 0 8px rgba(0,0,0,0.05)",
                ].join(", "),
              }}
            >
              <div className="absolute inset-0 rounded-xl pointer-events-none"
                style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.7) 0%, transparent 60%)" }}
              />
              <span className="relative z-10 text-lg text-blue-500 select-none leading-none"
                style={{ filter: "drop-shadow(0 0 5px rgba(88,166,255,0.5))" }}
              >◈</span>
            </div>

            {/* Title text */}
            <div className="relative z-10 pr-1">
              <h1 className="text-sm font-bold tracking-tight text-gray-900 leading-tight">Zero-Day Radar</h1>
              <p className="text-[0.63rem] text-gray-400 leading-none mt-0.5">Automated Dependency Vulnerability Scanner</p>
            </div>
          </div>

          {/* ── Right: glass pill badge ── */}
          <div
            className="relative hidden sm:flex items-center px-3.5 py-1.5 rounded-full"
            style={{
              background: "rgba(255,255,255,0.72)",
              backdropFilter: "blur(20px) saturate(160%)",
              WebkitBackdropFilter: "blur(20px) saturate(160%)",
              boxShadow: [
                "0 2px 10px rgba(0,0,0,0.07)",
                "0 1px 3px rgba(0,0,0,0.04)",
                "inset 0 1px 0 rgba(255,255,255,1)",
                "inset 1px 0 0 rgba(255,255,255,0.9)",
                "inset 0 -1px 0 rgba(0,0,0,0.06)",
                "inset -1px 0 0 rgba(0,0,0,0.03)",
                "inset 0 0 10px rgba(0,0,0,0.04)",
              ].join(", "),
            }}
          >
            <div className="absolute inset-0 rounded-full pointer-events-none"
              style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.08) 45%, transparent 100%)" }}
            />
            <span className="relative z-10 text-[0.6rem] font-semibold uppercase tracking-widest text-gray-400">
              Powered by OSV.dev
            </span>
          </div>

        </div>
      </header>

      {/* ── Hero: mouse-reactive + ContainerScroll 3-D tilt ──────────────── */}
      <HeroSection>
        <GlassUploader
          onScanComplete={data => { setResults(data); setError(null) }}
          onScanError={msg   => { setError(msg);      setResults(null) }}
        />
      </HeroSection>

      {/* ── Error banner (below hero, above results) ──────────────────────── */}
      {error && (
        <div className="max-w-5xl mx-auto w-full px-6 py-4">
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3 text-sm">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="flex-1 leading-snug">{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-300 hover:text-red-500 transition-colors flex-shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Scan results — dot-grid bg makes liquid glass distortion visible ── */}
      {results && (
        <section
          className="flex-1 px-6 py-12"
          style={{
            backgroundColor: "#ffffff",
            backgroundImage: "radial-gradient(#cbd5e1 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        >
          <div className="max-w-5xl mx-auto">
            <ResultsSection key={`${results.filename}-${results.dependency_count}`} data={results} />
          </div>
        </section>
      )}

      {/* ── Owner card — fixed bottom-left ─────────────────────────────────── */}
      <OwnerCard />

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 text-center text-xs py-5 bg-white text-gray-400">
        Vulnerability data sourced from{" "}
        <a
          href="https://osv.dev"
          target="_blank"
          rel="noopener"
          className="text-blue-400 hover:underline"
        >
          OSV.dev
        </a>{" "}
        · Zero-Day Radar
      </footer>

    </div>
  )
}
