import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError, auth } from './api';
import { loadApiUrl } from './config';
import type { LoginResult, Me, SettingsAnswer } from './types';

export interface Dealership {
  id: string;
  name: string;
  logo: string;
  status: string;
}

interface LoginInput {
  login: string;
  password: string;
  /** chosen dealership when the same login exists in several (409 answer) */
  tenantId?: string;
  /** Platform Admin login ("support mode"): works inside one dealership through the X-Tenant-Id header */
  platform?: boolean;
  supportTenantId?: string;
}

interface Ctx {
  /** false until the stored token has been checked */
  ready: boolean;
  me: Me | null;
  dealership: Dealership | null;
  isOwner: boolean;
  can: (...perms: string[]) => boolean;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
}

const SessionContext = createContext<Ctx>({
  ready: false, me: null, dealership: null, isOwner: false, can: () => false,
  login: async () => undefined, logout: async () => undefined, reload: async () => undefined,
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [dealership, setDealership] = useState<Dealership | null>(null);

  const fetchSession = useCallback(async () => {
    const m = await api<Me>('/auth/me');
    let d: Dealership | null = m.tenant ? { id: m.tenant.id, name: m.tenant.name, logo: m.tenant.logo, status: m.tenant.status } : null;
    if (!d && m.user.kind === 'owner' && auth.supportTenant()) {
      // platform owner: the dealership comes from the X-Tenant-Id header
      const s = await api<SettingsAnswer>('/dealer/settings');
      d = { id: s.tenant.id, name: String(s.settings.name || s.tenant.name), logo: String(s.settings.logo || ''), status: s.tenant.status };
    }
    setMe(m);
    setDealership(d);
  }, []);

  const drop = useCallback(() => {
    setMe(null);
    setDealership(null);
    qc.clear();
  }, [qc]);

  // app launch: restore the session from the encrypted store
  useEffect(() => {
    let alive = true;
    (async () => {
      await loadApiUrl();
      const t = await auth.load();
      if (t) {
        try {
          await fetchSession();
        } catch (e) {
          // expired / revoked token → Login. A network problem keeps the token for the next launch.
          if (e instanceof ApiError && (e.status === 401 || e.status === 403)) await auth.clear();
        }
      }
      if (alive) setReady(true);
    })();
    auth.onUnauthorized(() => drop());
    return () => {
      alive = false;
      auth.onUnauthorized(null);
    };
  }, [fetchSession, drop]);

  const login = useCallback(
    async (input: LoginInput) => {
      // POST /auth/login { login, password, portal: 'dealer' | 'platform', tenantId? } → { token, kind, tenantId? }
      const r = await api<LoginResult>('/auth/login', {
        body: { login: input.login.trim(), password: input.password, portal: input.platform ? 'platform' : 'dealer', ...(input.tenantId ? { tenantId: input.tenantId } : {}) },
      });
      await auth.clear();
      qc.clear();
      await auth.setToken(r.token);
      await auth.setSupportTenant(r.kind === 'owner' ? input.supportTenantId || '' : '');
      try {
        await fetchSession();
      } catch (e) {
        await auth.clear();
        throw e;
      }
    },
    [fetchSession, qc],
  );

  const logout = useCallback(async () => {
    await auth.clear();
    drop();
  }, [drop]);

  const value = useMemo<Ctx>(
    () => ({
      ready,
      me,
      dealership,
      isOwner: me?.user.kind === 'owner',
      can: (...perms: string[]) => !!me && perms.some((p) => me.user.perms.includes(p)),
      login,
      logout,
      reload: fetchSession,
    }),
    [ready, me, dealership, login, logout, fetchSession],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
