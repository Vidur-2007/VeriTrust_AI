import React, { type ComponentPropsWithoutRef, type CSSProperties } from "react"

import { cn } from "@/lib/utils"

// Magic UI Shimmer Button, restyled for the three primary actions only (Send, Run attacks,
// Scan manuals). Accent fill, --on-accent label, 8 px control radius, no drop or inset
// shadows. The travelling glint (--glint) shows and runs only while hovered or focused, so the
// page has no idle animation. Reduced motion stops the keyframes via index.css.

export interface ShimmerButtonProps extends ComponentPropsWithoutRef<"button"> {
  shimmerColor?: string
  shimmerSize?: string
  borderRadius?: string
  shimmerDuration?: string
  background?: string
  className?: string
  children?: React.ReactNode
}

export const ShimmerButton = React.forwardRef<
  HTMLButtonElement,
  ShimmerButtonProps
>(
  (
    {
      shimmerColor = "var(--glint)",
      shimmerSize = "0.1em",
      shimmerDuration = "2.5s",
      borderRadius = "8px",
      background = "var(--accent)",
      className,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        style={
          {
            "--spread": "90deg",
            "--shimmer-color": shimmerColor,
            "--radius": borderRadius,
            "--speed": shimmerDuration,
            "--cut": shimmerSize,
            "--bg": background,
          } as CSSProperties
        }
        className={cn(
          "group relative z-0 inline-flex h-9 cursor-pointer items-center justify-center gap-2 overflow-hidden [border-radius:var(--radius)] border border-transparent px-4 text-sm font-semibold whitespace-nowrap text-on-accent [background:var(--bg)]",
          "transform-gpu transition-[transform,filter] duration-200 ease-out hover:brightness-110 active:translate-y-px",
          "disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
          className
        )}
        ref={ref}
        {...props}
      >
        {/* spark container: visible and moving only on hover / keyboard focus */}
        <div
          aria-hidden="true"
          className={cn(
            "-z-30 blur-[2px] opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100",
            "@container-[size] absolute inset-0 overflow-visible"
          )}
        >
          {/* spark */}
          <div className="animate-shimmer-slide absolute inset-0 aspect-[1] h-[100cqh] rounded-none [animation-play-state:paused] [mask:none] group-hover:[animation-play-state:running] group-focus-visible:[animation-play-state:running]">
            {/* spark before */}
            <div className="animate-spin-around absolute -inset-full w-auto [translate:0_0] rotate-0 [animation-play-state:paused] [background:conic-gradient(from_calc(270deg-(var(--spread)*0.5)),transparent_0,var(--shimmer-color)_var(--spread),transparent_var(--spread))] group-hover:[animation-play-state:running] group-focus-visible:[animation-play-state:running]" />
          </div>
        </div>
        {children}

        {/* backdrop */}
        <div
          aria-hidden="true"
          className={cn(
            "absolute inset-(--cut) -z-20 [border-radius:var(--radius)] [background:var(--bg)]"
          )}
        />
      </button>
    )
  }
)

ShimmerButton.displayName = "ShimmerButton"
