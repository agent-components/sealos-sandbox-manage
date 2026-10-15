import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

const variants: Record<Variant, string> = {
  primary:
    "border-transparent bg-brand text-white shadow-sm hover:bg-brand-deep disabled:opacity-45",
  secondary:
    "border-line bg-surface text-ink hover:border-line-strong hover:bg-canvas disabled:opacity-45",
  ghost:
    "border-transparent bg-transparent text-muted hover:bg-canvas hover:text-ink disabled:opacity-40",
  danger:
    "border-danger/30 bg-danger-soft text-danger hover:border-danger/50 disabled:opacity-45",
};

const sizes: Record<Size, string> = {
  md: "px-4 py-2.5 text-sm",
  sm: "px-3 py-1.5 text-xs",
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
        "inline-flex items-center justify-center rounded-xl border font-semibold tracking-tight transition duration-200 ease-out enabled:active:translate-y-px enabled:hover:-translate-y-px disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
