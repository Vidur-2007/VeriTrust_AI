import React, { useEffect, useId, useRef, useState } from "react"
import { motion } from "motion/react"

import { useReduceMotion } from "@/lib/motion"
import { cn } from "@/lib/utils"

/**
 * Magic UI Dot Pattern, restyled for VeriTrust.
 *
 * - Dots use --line (via `text-line`) so the pattern stays a quiet background.
 * - The static pattern is one SVG <pattern> tile instead of one <circle> per dot (the
 *   original renders ~4,000 elements on a 1366x768 console), so it costs nothing to draw.
 * - `glow` keeps the library's per-dot animation for small areas; it is off under reduced
 *   motion.
 */
interface DotPatternProps extends React.SVGProps<SVGSVGElement> {
  width?: number
  height?: number
  x?: number
  y?: number
  cx?: number
  cy?: number
  cr?: number
  className?: string
  glow?: boolean
  [key: string]: unknown
}

export function DotPattern({
  width = 16,
  height = 16,
  x = 0,
  y = 0,
  cx = 1,
  cy = 1,
  cr = 1,
  className,
  glow = false,
  ...props
}: DotPatternProps) {
  const id = useId()
  const reduce = useReduceMotion()
  const animated = glow && !reduce

  if (!animated) {
    return (
      <svg
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 h-full w-full text-line",
          className
        )}
        {...props}
      >
        <defs>
          <pattern
            id={`${id}-dots`}
            width={width}
            height={height}
            patternUnits="userSpaceOnUse"
            x={x}
            y={y}
          >
            <circle cx={cx} cy={cy} r={cr} fill="currentColor" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id}-dots)`} />
      </svg>
    )
  }

  return <GlowDots {...{ width, height, x, y, cx, cy, cr, className, id, ...props }} />
}

function GlowDots({
  width,
  height,
  x,
  y,
  cx,
  cy,
  cr,
  className,
  id,
  ...props
}: Required<Pick<DotPatternProps, "width" | "height" | "x" | "y" | "cx" | "cy" | "cr">> & {
  className?: string
  id: string
  [key: string]: unknown
}) {
  const containerRef = useRef<SVGSVGElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect()
        setDimensions({ width, height })
      }
    }

    updateDimensions()
    window.addEventListener("resize", updateDimensions)
    return () => window.removeEventListener("resize", updateDimensions)
  }, [])

  const cols = Math.ceil(dimensions.width / width)
  const dots = Array.from(
    { length: cols * Math.ceil(dimensions.height / height) },
    (_, i) => ({
      x: (i % cols) * width + cx + x,
      y: Math.floor(i / cols) * height + cy + y,
      delay: (i * 7919) % 5, // deterministic spread instead of Math.random during render
      duration: 2 + ((i * 104729) % 3),
    })
  )

  return (
    <svg
      ref={containerRef}
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full text-line",
        className
      )}
      {...props}
    >
      <defs>
        <radialGradient id={`${id}-gradient`}>
          <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>
      {dots.map((dot) => (
        <motion.circle
          key={`${dot.x}-${dot.y}`}
          cx={dot.x}
          cy={dot.y}
          r={cr}
          fill={`url(#${id}-gradient)`}
          initial={{ opacity: 0.4, scale: 1 }}
          animate={{ opacity: [0.4, 1, 0.4], scale: [1, 1.5, 1] }}
          transition={{
            duration: dot.duration,
            repeat: Infinity,
            repeatType: "reverse",
            delay: dot.delay,
            ease: "easeInOut",
          }}
        />
      ))}
    </svg>
  )
}
