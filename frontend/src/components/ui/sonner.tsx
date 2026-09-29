import { CircleCheckIcon, InfoIcon, OctagonXIcon, TriangleAlertIcon } from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

import { useAppState } from "@/app/AppState"

/** Toasts on --surface-2 with a --line border; status icons carry the colour, not the toast. */
const Toaster = (props: ToasterProps) => {
  const { theme } = useAppState()

  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-ok" />,
        info: <InfoIcon className="size-4 text-beacon" />,
        warning: <TriangleAlertIcon className="size-4 text-caution" />,
        error: <OctagonXIcon className="size-4 text-stop" />,
      }}
      style={
        {
          "--normal-bg": "var(--surface-2)",
          "--normal-text": "var(--text)",
          "--normal-border": "var(--line)",
          "--border-radius": "12px",
          fontFamily: "var(--font-sans)",
        } as React.CSSProperties
      }
      toastOptions={{ classNames: { toast: "text-sm", description: "!text-muted-foreground" } }}
      {...props}
    />
  )
}

export { Toaster }
