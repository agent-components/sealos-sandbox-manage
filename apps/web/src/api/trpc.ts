import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from 'server/router';
import { readToken } from '../modules/auth/session';
import { errorToastLink } from './errorLink';

export const trpc = createTRPCClient<AppRouter>({
  links: [
    errorToastLink(),
    httpBatchLink({
      url: import.meta.env.VITE_TRPC_URL ?? '/trpc',
      headers() {
        const token = readToken();
        return token ? { authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});