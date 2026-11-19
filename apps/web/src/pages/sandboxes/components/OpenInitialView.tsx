import { useEffect, useRef } from 'react';
import { useListPageContext } from 'listpage-components';
import type { Sandbox } from '@/modules/sandbox/schema';
import type { SandboxFilters } from '../config/filters';

export function OpenInitialView({
  sandboxId,
  onConsumed,
}: {
  sandboxId: string | null;
  onConsumed?: () => void;
}) {
  const ctx = useListPageContext<Sandbox, SandboxFilters>();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!sandboxId) {
      handled.current = null;
      return;
    }
    if (handled.current === sandboxId) return;
    handled.current = sandboxId;
    ctx.showFloat('detail', { id: sandboxId } as Sandbox);
    onConsumed?.();
  }, [ctx, onConsumed, sandboxId]);

  return null;
}