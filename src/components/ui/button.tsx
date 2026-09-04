"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[background-color,border-color,color,box-shadow] outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-accent text-accent-foreground shadow-xs hover:bg-accent/90 active:bg-accent/95",
        secondary:
          "bg-surface text-foreground border border-border shadow-xs hover:bg-surface-muted hover:border-border-strong",
        ghost: "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
        outline:
          "border border-border-strong bg-transparent text-foreground hover:bg-surface-muted",
        danger: "bg-danger text-white shadow-xs hover:bg-danger/90",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-3.5 [&_svg]:size-4",
        sm: "h-8 px-3 text-[13px] [&_svg]:size-3.5",
        xs: "h-7 px-2 text-xs rounded-sm [&_svg]:size-3.5",
        lg: "h-10 px-5 [&_svg]:size-4",
        icon: "size-9 [&_svg]:size-4",
        "icon-sm": "size-8 [&_svg]:size-4",
        "icon-xs": "size-7 rounded-sm [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
