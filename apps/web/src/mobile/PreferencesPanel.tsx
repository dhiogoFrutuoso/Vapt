import { Languages, Monitor, Moon, Sun, Type } from 'lucide-react';
import { usePreferences } from './PreferencesContext';
import {
  ESCALA_MAX,
  ESCALA_MIN,
  ESCALA_PADRAO,
  type Idioma,
  type Tema,
} from './preferences';
import { NOMES_IDIOMA } from './i18n';

/**
 * Preferências de interface, dentro do perfil do funcionário.
 *
 * Fica no perfil, e não numa aba própria, porque é ajuste de quem está logado
 * — mora ao lado de "meus dados" e de "sair da conta", não ao lado de Caixa e
 * Cozinha, que são áreas de trabalho.
 */

const TEMAS: Array<{ valor: Tema; Icone: typeof Sun; chave: 'prefs.tema.claro' | 'prefs.tema.escuro' | 'prefs.tema.sistema' }> = [
  { valor: 'claro', Icone: Sun, chave: 'prefs.tema.claro' },
  { valor: 'escuro', Icone: Moon, chave: 'prefs.tema.escuro' },
  { valor: 'sistema', Icone: Monitor, chave: 'prefs.tema.sistema' },
];

export function PreferencesPanel({ marca }: { marca: string }) {
  const { tema, escala, idioma, definir, t } = usePreferences();

  return (
    <div className="rounded-3xl bg-white p-5 shadow-[0_10px_30px_-4px_rgba(17,17,17,0.06)] dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-white/10">
      <h2 className="m-0 text-base font-extrabold text-gray-900 dark:text-gray-50">
        {t('prefs.titulo')}
      </h2>
      <p className="m-0 mt-1 text-[0.82rem] leading-relaxed text-gray-500 dark:text-gray-400">
        {t('prefs.descricao')}
      </p>

      {/* ------------------------------ Tema ------------------------------ */}
      <section className="mt-5">
        <span className="flex items-center gap-2 text-[0.9rem] font-bold text-gray-900 dark:text-gray-100">
          <Sun size={15} className="shrink-0 text-gray-400" />
          {t('prefs.tema')}
        </span>

        {/*
          Três botões visíveis em vez de um interruptor de dois estados: com o
          interruptor não haveria onde encaixar "automático", e é ele que
          resolve o caso do turno que atravessa o anoitecer.
        */}
        <div
          role="radiogroup"
          aria-label={t('prefs.tema')}
          className="mt-2.5 grid grid-cols-3 gap-2"
        >
          {TEMAS.map(({ valor, Icone, chave }) => {
            const ativo = tema === valor;
            return (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={ativo}
                onClick={() => definir({ tema: valor })}
                /* `px-1` e `leading-tight`: na escala de 130% a palavra mais
                   longa ("Automático", "Automatic") encosta na borda do botão
                   com padding maior. */
                className={`flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border border-solid px-1 py-3 text-center text-[0.78rem] font-semibold leading-tight transition-colors ${
                  ativo
                    ? 'text-white'
                    : 'border-gray-200 bg-white text-gray-600 dark:border-white/10 dark:bg-gray-800 dark:text-gray-300'
                }`}
                style={ativo ? { backgroundColor: marca, borderColor: marca } : undefined}
              >
                <Icone size={17} />
                {t(chave)}
              </button>
            );
          })}
        </div>

        <p className="m-0 mt-2 text-[0.78rem] text-gray-400 dark:text-gray-500">
          {t('prefs.tema.ajuda')}
        </p>
      </section>

      {/* ----------------------------- Escala ----------------------------- */}
      <section className="mt-6">
        <span className="flex items-center justify-between gap-2 text-[0.9rem] font-bold text-gray-900 dark:text-gray-100">
          <span className="flex items-center gap-2">
            <Type size={15} className="shrink-0 text-gray-400" />
            {t('prefs.escala')}
          </span>
          <span className="tabular-nums font-extrabold" style={{ color: marca }}>
            {escala}%
          </span>
        </span>

        <input
          type="range"
          min={ESCALA_MIN}
          max={ESCALA_MAX}
          step={5}
          value={escala}
          onChange={(e) => definir({ escala: Number(e.target.value) })}
          aria-label={t('prefs.escala')}
          className="mt-3 w-full cursor-pointer"
          style={{ accentColor: marca }}
        />

        <div className="mt-1 flex items-center justify-between text-[0.72rem] text-gray-400 dark:text-gray-500">
          <span>{ESCALA_MIN}%</span>
          <span>{ESCALA_MAX}%</span>
        </div>

        {/*
          Empilhado, não lado a lado. Na escala máxima os dois textos disputam
          a mesma linha e a ajuda quebra em duas colunas estreitas — e é
          justamente quem aumentou a fonte que mais precisa lê-la.
        */}
        <p className="m-0 mt-2 text-[0.78rem] leading-relaxed text-gray-400 dark:text-gray-500">
          {t('prefs.escala.ajuda')}
        </p>

        {escala !== ESCALA_PADRAO && (
          <button
            type="button"
            onClick={() => definir({ escala: ESCALA_PADRAO })}
            className="mt-2 bg-transparent p-0 text-[0.78rem] font-bold underline"
            style={{ color: marca }}
          >
            {t('prefs.escala.restaurar')}
          </button>
        )}
      </section>

      {/* ----------------------------- Idioma ----------------------------- */}
      <section className="mt-6">
        <label
          htmlFor="pref-idioma"
          className="flex items-center gap-2 text-[0.9rem] font-bold text-gray-900 dark:text-gray-100"
        >
          <Languages size={15} className="shrink-0 text-gray-400" />
          {t('prefs.idioma')}
        </label>

        <select
          id="pref-idioma"
          value={idioma}
          onChange={(e) => definir({ idioma: e.target.value as Idioma })}
          className="mt-2.5 w-full rounded-2xl border border-solid border-gray-200 bg-white px-4 py-3
            text-[0.9rem] font-semibold text-gray-900 outline-none
            dark:border-white/10 dark:bg-gray-800 dark:text-gray-100"
        >
          {(Object.keys(NOMES_IDIOMA) as Idioma[]).map((codigo) => (
            <option key={codigo} value={codigo}>
              {NOMES_IDIOMA[codigo]}
            </option>
          ))}
        </select>
      </section>
    </div>
  );
}
