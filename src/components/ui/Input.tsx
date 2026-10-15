import { cn } from "@/lib/cn";

type Props = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: Props) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border border-gray-300 bg-background px-3 text-sm text-foreground outline-none placeholder:text-gray-500 focus:border-foreground disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
