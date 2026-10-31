import * as React from "react";
import { cn } from "../lib/utils";
import { Label } from "./label";

export function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="field-group" className={cn("flex flex-col gap-4", className)} {...props} />;
}
export function Field({ className, orientation = "vertical", ...props }: React.ComponentProps<"div"> & { orientation?: "vertical" | "horizontal" }) {
  return <div data-slot="field" data-orientation={orientation} className={cn("flex gap-2 data-[orientation=vertical]:flex-col data-[orientation=horizontal]:items-start data-[orientation=horizontal]:gap-3", className)} {...props} />;
}
export function FieldContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="field-content" className={cn("flex min-w-0 flex-1 flex-col gap-1.5", className)} {...props} />;
}
export function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="field-description" className={cn("text-sm text-muted-foreground", className)} {...props} />;
}
export function FieldLabel(props: React.ComponentProps<typeof Label>) {
  return <Label data-slot="field-label" {...props} />;
}
export function FieldSet({ className, ...props }: React.ComponentProps<"fieldset">) {
  return <fieldset className={cn("flex flex-col gap-3", className)} {...props} />;
}
export function FieldLegend({ className, ...props }: React.ComponentProps<"legend">) {
  return <legend className={cn("mb-3 text-sm font-medium", className)} {...props} />;
}
