import { cn } from "@/lib/cn";

export function Brand({ large = false }: { large?: boolean }) {
  return (
    <div className={cn(large ? "space-y-3" : "flex items-center")}>
      <p
        className={cn(
          "font-semibold tracking-tight text-foreground",
          large ? "text-4xl" : "text-sm",
        )}
      >
        boat
      </p>
      {large ? (
        <p className="max-w-sm text-base leading-relaxed text-gray-600">
          云端沙箱控制台。配置算力，一键创建，公网直连。
        </p>
      ) : null}
    </div>
  );
}
