import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  aplicarPreferencias,
  gravarPreferencias,
  lerPreferencias,
  PADRAO,
  type Preferencias,
} from './preferences';
import { traduzir, type Chave } from './i18n';

/**
 * Preferências de interface, disponíveis em qualquer tela do aplicativo.
 *
 * O estado inicial é lido de forma SÍNCRONA, dentro do `useState`, e não num
 * `useEffect`. A diferença aparece na tela: lido depois da montagem, o app
 * pinta a versão clara, roda o efeito e só então escurece — o clarão branco
 * na cara de quem trabalha no salão à noite.
 */

type Contexto = Preferencias & {
  definir: (mudanca: Partial<Preferencias>) => void;
  restaurar: () => void;
  /** Traduz uma chave no idioma escolhido. */
  t: (chave: Chave) => string;
};

const PreferencesContext = createContext<Contexto | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Preferencias>(() => {
    const inicial = lerPreferencias();
    /*
     * Aplica já na primeira renderização. Esperar o efeito faria a tela
     * aparecer no tamanho errado e reajustar na frente do usuário.
     */
    aplicarPreferencias(inicial);
    return inicial;
  });

  useEffect(() => {
    aplicarPreferencias(prefs);
    gravarPreferencias(prefs);
  }, [prefs]);

  useEffect(() => () => {
    const raiz = document.documentElement;
    raiz.style.removeProperty('zoom');
    raiz.style.removeProperty('color-scheme');
    raiz.style.removeProperty('--font');
    raiz.classList.remove('dark');
    delete raiz.dataset.vaptScale;
  }, []);

  /*
   * Com o tema em "automático", o aparelho pode trocar sozinho — no anoitecer
   * programado do Android, por exemplo. Sem este ouvinte a interface só
   * mudaria quando o funcionário fechasse e reabrisse o aplicativo.
   */
  useEffect(() => {
    if (prefs.tema !== 'sistema') return;

    let media: MediaQueryList;
    try {
      media = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return;
    }

    const aoMudar = () => aplicarPreferencias(prefs);
    media.addEventListener('change', aoMudar);
    return () => media.removeEventListener('change', aoMudar);
  }, [prefs]);

  const definir = useCallback((mudanca: Partial<Preferencias>) => {
    setPrefs((atual) => ({ ...atual, ...mudanca }));
  }, []);

  const restaurar = useCallback(() => setPrefs({ ...PADRAO }), []);

  const valor = useMemo<Contexto>(
    () => ({
      ...prefs,
      definir,
      restaurar,
      t: (chave: Chave) => traduzir(prefs.idioma, chave),
    }),
    [prefs, definir, restaurar]
  );

  return <PreferencesContext.Provider value={valor}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): Contexto {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences precisa estar dentro de <PreferencesProvider>.');
  return ctx;
}
