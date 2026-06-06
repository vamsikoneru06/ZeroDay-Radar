"use client"

import React, { useRef, useState, useEffect } from "react"
import { useScroll, useTransform, motion } from "framer-motion"

interface ContainerScrollProps {
  titleComponent: React.ReactNode
  children: React.ReactNode
  /** Called whenever scroll progress changes (0 = tilted, 1 = flat) */
  onScrollProgress?: (progress: number) => void
}

export default function ContainerScroll({
  titleComponent,
  children,
  onScrollProgress,
}: ContainerScrollProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: containerRef })
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  // Bubble progress up so parent can gate interactions
  useEffect(() => {
    return scrollYProgress.on("change", v => onScrollProgress?.(v))
  }, [scrollYProgress, onScrollProgress])

  const rotate    = useTransform(scrollYProgress, [0, 1], [20, 0])
  const scale     = useTransform(scrollYProgress, [0, 1], isMobile ? [0.7, 0.9] : [1.05, 1])
  const translateY = useTransform(scrollYProgress, [0, 1], [0, -100])

  return (
    <div
      ref={containerRef}
      className="h-[60rem] md:h-[80rem] flex items-center justify-center relative p-2 md:p-20"
    >
      <div className="py-10 md:py-40 w-full relative" style={{ perspective: "1000px" }}>
        <motion.div style={{ translateY }} className="max-w-5xl mx-auto text-center">
          {titleComponent}
        </motion.div>
        <motion.div
          style={{
            rotateX: rotate,
            scale,
            boxShadow:
              "0 0 #0000004d, 0 9px 20px #0000004a, 0 37px 37px #00000042, 0 84px 50px #00000026, 0 149px 60px #0000000a, 0 233px 65px #00000003",
          }}
          className="max-w-5xl -mt-12 mx-auto h-[30rem] md:h-[40rem] w-full border-4 border-[#6C6C6C] p-2 md:p-6 bg-[#222222] rounded-[30px] shadow-2xl"
        >
          <div className="h-full w-full overflow-hidden rounded-2xl md:rounded-2xl relative">
            <div className="absolute inset-0 bg-white" />
            <div className="relative z-10 h-full w-full md:p-4">{children}</div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
