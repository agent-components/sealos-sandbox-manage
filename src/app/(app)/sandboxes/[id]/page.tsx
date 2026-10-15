"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

/** 详情已改为列表弹窗，保留路由以便旧链接跳回列表 */
export default function SandboxDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/sandboxes?view=${encodeURIComponent(params.id)}`);
  }, [params.id, router]);

  return <p className="text-sm text-gray-600">正在打开沙箱…</p>;
}
