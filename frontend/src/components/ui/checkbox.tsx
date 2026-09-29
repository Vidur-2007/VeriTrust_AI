import * as React from "react"
import { CheckIcon, MinusIcon } from "lucide-react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/** Radix checkbox on our tokens. `checked="indeterminate"` shows a dash (part of a group). */
function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "peer grid size-5 shrink-0 place-items-center rounded-[5px] border border-line bg-bg transition-colors outline-none",
        "hover:border-beacon/70 disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:border-beacon data-[state=checked]:bg-beacon data-[state=checked]:text-on-accent",
        "data-[state=indeterminate]:border-beacon data-[state=indeterminate]:bg-beacon data-[state=indeterminate]:text-on-accent",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="grid place-items-center">
        {props.checked === "indeterminate" ? <MinusIcon className="size-3.5" strokeWidth={3} /> : <CheckIcon className="size-3.5" strokeWidth={3} />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
