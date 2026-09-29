import * as React from "react"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// A right-side drawer on the Radix Dialog primitive: focus is trapped inside, Esc closes it and
// focus returns to whatever opened it. Slides in (tw-animate), instant under reduced motion.

const Sheet = DialogPrimitive.Root
const SheetClose = DialogPrimitive.Close

function SheetContent({
  className,
  children,
  onOpenAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-bg/60 duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        // Focus the panel itself on open (not the first button, which would show a ring on the
        // close button or open a tooltip); Tab then moves through it in reading order.
        onOpenAutoFocus={(e) => {
          onOpenAutoFocus?.(e)
          if (e.defaultPrevented) return
          e.preventDefault()
          ;(e.currentTarget as HTMLElement | null)?.focus()
        }}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-[40rem] flex-col border-l border-line bg-surface text-foreground outline-none duration-200 data-open:animate-in data-open:slide-in-from-right-8 data-open:fade-in-0 data-closed:animate-out data-closed:slide-out-to-right-8 data-closed:fade-out-0",
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close asChild>
          <Button variant="ghost" size="icon" className="absolute top-3 right-3" aria-label="Close">
            <XIcon />
          </Button>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("font-heading text-xl font-semibold", className)} {...props} />
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-sm text-muted-foreground", className)} {...props} />
}

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle }
