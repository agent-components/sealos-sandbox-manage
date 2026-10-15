import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

const variants: Record<Variant, string> = {
  primary:
    "border-transparent bg-foreground text-background hover:bg-gray-700 disabled:bg-gray-400",
  secondary:
    "border-gray-300 bg-background text-foreground hover:bg-gray-50 disabled:opacity-50",
  ghost:
    "border-transparent bg-transparent text-gray-600 hover:bg-gray-100 hover:text-foreground disabled:opacity-50",
  danger:
    "border-danger/20 bg-danger-soft text-danger hover:bg-danger/10 disabled:opacity-50",
};

const sizes: Record<Size, string> = {
  md: "h-10 px-4 text-sm",
  sm: "h-8 px-3 text-xs",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: Props) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-md border font-medium transition-colors disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
