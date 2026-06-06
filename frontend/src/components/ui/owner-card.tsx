import { Github, Linkedin } from "lucide-react"

export function OwnerCard() {
  return (
    <div
      className="fixed bottom-4 left-4 z-30 flex items-center gap-3 px-3.5 py-2.5 rounded-2xl select-none"
      style={{
        background: "rgba(255,255,255,0.72)",
        backdropFilter: "blur(24px) saturate(180%) brightness(1.03)",
        WebkitBackdropFilter: "blur(24px) saturate(180%) brightness(1.03)",
        boxShadow: [
          "0 2px 12px rgba(0,0,0,0.08)",
          "0 1px 3px rgba(0,0,0,0.05)",
          "inset 0 1px 0 rgba(255,255,255,1)",
          "inset 1px 0 0 rgba(255,255,255,0.9)",
          "inset 0 -1px 0 rgba(0,0,0,0.06)",
          "inset -1px 0 0 rgba(0,0,0,0.03)",
          "inset 0 0 10px rgba(0,0,0,0.04)",
        ].join(", "),
      }}
    >
      {/* Diagonal sheen */}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.08) 45%, transparent 100%)",
        }}
      />

      {/* Avatar — liquid glass chip */}
      <div
        className="relative h-7 w-7 rounded-xl flex items-center justify-center shrink-0 text-[11px] font-bold text-gray-700"
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
        <div
          className="absolute inset-0 rounded-xl pointer-events-none"
          style={{
            background: "linear-gradient(135deg, rgba(255,255,255,0.7) 0%, transparent 60%)",
          }}
        />
        <span className="relative z-10">VK</span>
      </div>

      {/* Name + label */}
      <div className="relative z-10 flex flex-col leading-none gap-0.5">
        <span className="text-[12px] font-semibold text-gray-800 whitespace-nowrap">
          Vamsi Koneru
        </span>
        <span className="text-[10px] text-gray-400 whitespace-nowrap">
          Built by the owner
        </span>
      </div>

      {/* Divider */}
      <div className="relative z-10 h-5 w-px bg-gray-200" />

      {/* Links */}
      <div className="relative z-10 flex items-center gap-1">
        <a
          href="https://github.com/vamsikoneru06"
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-800 hover:bg-white/60 transition-colors duration-150"
          title="GitHub"
        >
          <Github size={13} strokeWidth={1.8} />
        </a>
        <a
          href="https://www.linkedin.com/in/vamsi-koneru-0a0661330/"
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 rounded-lg text-gray-400 hover:text-[#0A66C2] hover:bg-blue-50/60 transition-colors duration-150"
          title="LinkedIn"
        >
          <Linkedin size={13} strokeWidth={1.8} />
        </a>
      </div>
    </div>
  )
}
