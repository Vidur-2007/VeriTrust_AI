"use client"

import React, {
  useEffect,
  useMemo,
  useState,
  type ComponentPropsWithoutRef,
} from "react"
import { AnimatePresence, motion, type MotionProps } from "motion/react"

import { useReduceMotion } from "@/lib/motion"
import { cn } from "@/lib/utils"

// Magic UI Animated List, adapted for live data:
// - AnimatedListItem slides in (a short y + fade, not a scale-from-zero pop). Use it inside
//   <AnimatePresence> for items that arrive over time (claims, red-team results, reviews),
//   so nothing waits on a timer (DESIGN.md: animation never delays reading data).
// - AnimatedList keeps the library's one-by-one reveal for demos; with reduced motion it shows
//   every item at once.

/** One item sliding in. `as="li"` keeps list markup valid inside <ul>/<ol>. */
export function AnimatedListItem({ children, as = "div", className }: { children: React.ReactNode; as?: "div" | "li"; className?: string }) {
  const animations: MotionProps = {
    initial: { opacity: 0, y: -8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0 },
    transition: { type: "spring", stiffness: 500, damping: 40, mass: 0.6 },
  }

  return (
    as === "li" ? (
      <motion.li {...animations} layout className={className ?? "w-full"}>
        {children}
      </motion.li>
    ) : (
      <motion.div {...animations} layout className={className ?? "w-full"}>
        {children}
      </motion.div>
    )
  )
}

export interface AnimatedListProps extends ComponentPropsWithoutRef<"div"> {
  children: React.ReactNode
  delay?: number
}

export const AnimatedList = React.memo(
  ({ children, className, delay = 1000, ...props }: AnimatedListProps) => {
    const reduce = useReduceMotion()
    const [index, setIndex] = useState(0)
    const childrenArray = useMemo(
      () => React.Children.toArray(children),
      [children]
    )

    useEffect(() => {
      let timeout: ReturnType<typeof setTimeout> | null = null

      if (!reduce && index < childrenArray.length - 1) {
        timeout = setTimeout(() => {
          setIndex((prevIndex) => (prevIndex + 1) % childrenArray.length)
        }, delay)
      }

      return () => {
        if (timeout !== null) {
          clearTimeout(timeout)
        }
      }
    }, [index, delay, childrenArray.length, reduce])

    const itemsToShow = useMemo(() => {
      const shown = reduce ? childrenArray.length : index + 1
      return childrenArray.slice(0, shown).reverse()
    }, [index, childrenArray, reduce])

    return (
      <div
        className={cn(`flex flex-col gap-2`, className)}
        {...props}
      >
        <AnimatePresence initial={false}>
          {itemsToShow.map((item) => (
            <AnimatedListItem key={(item as React.ReactElement).key}>
              {item}
            </AnimatedListItem>
          ))}
        </AnimatePresence>
      </div>
    )
  }
)

AnimatedList.displayName = "AnimatedList"
