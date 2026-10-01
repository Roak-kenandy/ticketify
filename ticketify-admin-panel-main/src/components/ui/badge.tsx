import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-destructive/10 text-destructive dark:bg-destructive/20",
        success:
          "border-transparent bg-success/10 text-success dark:bg-success/15",
        warning:
          "border-transparent bg-warning/15 text-[hsl(32_90%_32%)] dark:bg-warning/15 dark:text-warning",
        info: "border-transparent bg-info/10 text-info dark:bg-info/15",
        brand: "border-transparent bg-accent text-accent-foreground",
        outline: "border-border text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean
}

function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      )}
      {children}
    </span>
  )
}

export { Badge, badgeVariants }
