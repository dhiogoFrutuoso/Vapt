import ptBR from './locales/pt-BR.json';
import ptPT from './locales/pt-PT.json';
import en from './locales/en.json';
import es from './locales/es.json';
import zh from './locales/zh.json';
import ja from './locales/ja.json';

/**
 * Dicionários do aplicativo da equipe.
 *
 * Os textos moram em JSON, um arquivo por idioma, e não espalhados pelo TSX.
 * Traduzir passa a ser copiar um arquivo e reescrever o lado direito — coisa
 * que um tradutor faz sem abrir o editor de código nem saber React.
 *
 * SEM BIBLIOTECA DE i18n, DE PROPÓSITO
 * ------------------------------------
 * Nenhuma tela aqui tem plural, gênero variável ou formatação de data por
 * região — as datas usam `toLocaleDateString` do próprio navegador. Uma
 * biblioteca resolveria problemas que este app não tem e acrescentaria peso
 * ao bundle que roda dentro do APK.
 *
 * O PT-BR É O CONTRATO
 * --------------------
 * O tipo `Chave` sai do arquivo pt-BR, e os outros cinco são conferidos
 * contra ele por `satisfies`. Esquecer uma chave numa tradução vira erro de
 * compilação, e não um texto faltando na tela do funcionário no meio do
 * turno.
 */

export type Idioma = 'pt-BR' | 'pt-PT' | 'en' | 'es' | 'zh' | 'ja';

export type Chave = keyof typeof ptBR;

type Dicionario = Record<Chave, string>;

const DICIONARIOS = {
  'pt-BR': ptBR,
  'pt-PT': ptPT satisfies Dicionario,
  en: en satisfies Dicionario,
  es: es satisfies Dicionario,
  zh: zh satisfies Dicionario,
  ja: ja satisfies Dicionario,
} as const satisfies Record<Idioma, Dicionario>;

/**
 * Nome de cada idioma escrito NA PRÓPRIA LÍNGUA.
 *
 * Quem precisa trocar o idioma normalmente não lê o idioma atual da tela.
 * "Japonês" numa lista em português não ajuda ninguém; 日本語 é reconhecido
 * de imediato por quem procura.
 */
export const NOMES_IDIOMA: Record<Idioma, string> = {
  'pt-BR': 'Português (Brasil)',
  'pt-PT': 'Português (Portugal)',
  en: 'English',
  es: 'Español',
  zh: '中文',
  ja: '日本語',
};

/** Lista na ordem em que aparece no seletor. */
export const IDIOMAS = Object.keys(NOMES_IDIOMA) as Idioma[];

export function traduzir(idioma: Idioma, chave: Chave): string {
  /*
   * O fallback é o pt-BR, e não a própria chave. Um texto na língua errada
   * ainda é lido; `prefs.escala.ajuda` na tela não é lido por ninguém.
   */
  return DICIONARIOS[idioma]?.[chave] ?? ptBR[chave];
}
