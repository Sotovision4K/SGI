import * as React from "react"
import { cn } from "../../lib/cn"

const SelectNative = React.forwardRef<
  HTMLSelectElement,
  React.ComponentProps<"select">
>(({ className, children, ...props }, ref) => {
  return (
    <select
      ref={ref}
      data-slot="select-native"
      className={cn(
        "w-full rounded-lg border border-app-border bg-white px-3 py-2 text-app-text",
        "focus:outline-none focus:ring-2 focus:ring-app-accent/30 focus:border-app-accent",
        "disabled:bg-app-bg disabled:opacity-50",
        "transition-colors",
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
})

SelectNative.displayName = "SelectNative"

export { SelectNative }
export default SelectNative