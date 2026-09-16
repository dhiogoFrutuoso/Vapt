import { IDIOMAS, type Idioma } from './i18n';

/**
 * Preferências de interface do FUNCIONÁRIO, não do restaurante.
 *
 * Tema, tamanho, tipografia e idioma são de quem segura o aparelho. Dois
 * garçons dividem o mesmo restaurante e o mesmo cardápio, mas um enxerga mal
 * e quer a fonte grande, e o outro trabalha no salão escuro à noite. Guardar
 * isso no banco do restaurante faria a escolha de um virar a tela do outro.
 *
 * NADA DISTO VAI PARA O BACKEND. É estritamente local.
 *
 * POR QUE `localStorage`
 * ----------------------
 * O `deviceStorage` existe para o token do funcionário e usa `sessionStorage`
 * de propósito, para que um XSS não leia a sessão. Aqui é o oposto: não há
 * segredo nenhum, e a preferência PRECISA sobreviver ao fechamento do app —
 * senão o funcionário reajusta a fonte toda manhã.
 *
 * `localStorage` funciona igual nas três plataformas: navegador, WebView do
 * Capacitor (Android) e Chromium do Electron (Windows). No Electron ele é
 * persistido porque a página é servida por `vapt://`, uma origem estável;
 * em `file://` não haveria origem e o armazenamento se perderia.
 *
 * A leitura também precisa ser SÍNCRONA. As APIs nativas de preferência são
 * assíncronas, e ler o tema depois da primeira pintura produz o clarão branco
 * antes da tela escura aparecer.
 */

export type Tema = 'claro' | 'escuro' | 'sistema';
export type Fonte = 'padrao' | 'serifada' | 'mono';

export type Preferencias = {
  tema: Tema;
  /** Porcentagem do tamanho base da interface. */
  escala: number;
  fonte: Fonte;
  idioma: Idioma;
};

const CHAVE = 'vapt.pref.interface';

/*
 * Limites da escala.
 *
 * A escala amplia também dimensões fixas em px. Em 130% ou mais, a navegação
 * inferior passa a rolar horizontalmente para não esmagar os rótulos.
 */
export const ESCALA_MIN = 90;
export const ESCALA_MAX = 150;
export const ESCALA_PADRAO = 100;

export const PADRAO: Preferencias = {
  tema: 'sistema',
  escala: ESCALA_PADRAO,
  fonte: 'padrao',
  idioma: 'pt-BR',
};

const TEMAS: Tema[] = ['claro', 'escuro', 'sistema'];
const FONTES: Fonte[] = ['padrao', 'serifada', 'mono'];

/**
 * Pilhas de fonte.
 *
 * Cada uma termina numa família genérica para que o aparelho use o que tiver
 * instalado. A serifada e a monoespaçada não vêm do Google Fonts de
 * propósito: o app precisa abrir com a tipografia certa mesmo sem internet,
 * e um restaurante com wi-fi ruim veria a tela trocar de fonte no meio do
 * carregamento.
 */
export const PILHA_DE_FONTE: Record<Fonte, string> = {
  padrao: "'Plus Jakarta Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  serifada: "Georgia, 'Times New Roman', 'Noto Serif', ui-serif, serif",
  mono: "ui-monospace, 'Cascadia Mono', Consolas, 'Roboto Mono', 'Noto Sans Mono', monospace",
};

/** Prende um número ao intervalo aceito, inclusive quando vem `NaN`. */
function limitar(valor: unknown): number {
  const n = Number(valor);
  if (!Number.isFinite(n)) return ESCALA_PADRAO;
  return Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, Math.round(n)));
}

/**
 * Lê o que está gravado, campo a campo.
 *
 * Nunca confia na forma do objeto salvo: uma versão anterior pode ter gravado
 * outro formato — e gravou mesmo, quando a escala ia até 130 — e o usuário
 * pode ter editado o `localStorage` à mão. Um `tema` inválido aplicado ao
 * `<html>` deixaria a tela num estado que nenhum botão da interface desfaz.
 */
export function lerPreferencias(): Preferencias {
  try {
    const cru = window.localStorage.getItem(CHAVE);
    if (!cru) return { ...PADRAO };

    const dados = JSON.parse(cru) as Partial<Preferencias>;

    return {
      tema: TEMAS.includes(dados.tema as Tema) ? (dados.tema as Tema) : PADRAO.tema,
      escala: limitar(dados.escala),
      fonte: FONTES.includes(dados.fonte as Fonte) ? (dados.fonte as Fonte) : PADRAO.fonte,
      idioma: IDIOMAS.includes(dados.idioma as Idioma) ? (dados.idioma as Idioma) : PADRAO.idioma,
    };
  } catch {
    /* Modo privado, cota estourada, JSON corrompido: a tela abre no padrão. */
    return { ...PADRAO };
  }
}

export function gravarPreferencias(prefs: Preferencias): void {
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(prefs));
  } catch {
    /* Não gravou. A sessão atual continua valendo; só não sobrevive ao
       fechamento — e travar a interface por causa disso seria pior. */
  }
}

/** O sistema operacional está em modo escuro? */
export function sistemaEscuro(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

export function temaEfetivo(tema: Tema): 'claro' | 'escuro' {
  if (tema === 'sistema') return sistemaEscuro() ? 'escuro' : 'claro';
  return tema;
}

/**
 * Aplica as preferências ao documento.
 *
 * `font-size` só alcançava medidas em rem; boa parte da casca e dos cards usa
 * px. `zoom` no documento provoca novo layout e amplia ambos (inclusive
 * ícones e alvos de toque), sem a sobreposição de `transform: scale()`.
 * Não combinamos as duas técnicas para evitar uma escala quadrática.
 */
export function aplicarPreferencias(prefs: Preferencias): void {
  const raiz = document.documentElement;
  const escuro = temaEfetivo(prefs.tema) === 'escuro';

  raiz.classList.toggle('dark', escuro);

  /* `color-scheme` faz o navegador escurecer o que não é nosso: barras de
     rolagem, campos nativos e o fundo atrás do quique do scroll. */
  raiz.style.colorScheme = escuro ? 'dark' : 'light';

  const escala = limitar(prefs.escala);
  raiz.style.removeProperty('font-size');
  raiz.style.zoom = `${escala}%`;
  raiz.dataset.vaptScale = escala >= 130 ? 'large' : 'normal';

  /*
   * A tipografia vai na variável `--font`, não em `style.fontFamily`.
   *
   * O `base.css` declara `body { font-family: var(--font) }`. Escrever
   * `font-family` no `<html>` seria sobrescrito pelo `body` uma linha
   * depois — a preferência ficaria salva e sem efeito nenhum na tela.
   * Trocando a variável, a regra que já existe passa a resolver para a
   * fonte escolhida.
   */
  raiz.style.setProperty('--font', PILHA_DE_FONTE[prefs.fonte] ?? PILHA_DE_FONTE.padrao);

  raiz.lang = prefs.idioma;
}
