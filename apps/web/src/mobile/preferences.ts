/**
 * Preferências de interface do FUNCIONÁRIO, não do restaurante.
 *
 * Tema, tamanho da interface e idioma são de quem segura o aparelho. Dois
 * garçons dividem o mesmo restaurante e o mesmo cardápio, mas um enxerga mal
 * e quer a fonte grande, e o outro trabalha no salão escuro à noite. Guardar
 * isso no banco do restaurante faria a escolha de um virar a tela do outro.
 *
 * POR QUE `localStorage` E NÃO O ARMAZENAMENTO SEGURO
 * --------------------------------------------------
 * O `deviceStorage` existe para o token do funcionário e usa `sessionStorage`
 * de propósito, para que um XSS não leia a sessão. Aqui é o oposto: não há
 * segredo nenhum, e a preferência PRECISA sobreviver ao fechamento do app —
 * senão o funcionário reajusta a fonte toda manhã.
 *
 * A leitura também precisa ser SÍNCRONA. As APIs nativas de preferência são
 * assíncronas, e ler o tema depois da primeira pintura produz o clarão branco
 * antes da tela escura aparecer.
 */

export type Tema = 'claro' | 'escuro' | 'sistema';
export type Idioma = 'pt-BR' | 'en' | 'es';

export type Preferencias = {
  tema: Tema;
  /** Porcentagem do tamanho base da interface. */
  escala: number;
  idioma: Idioma;
};

const CHAVE = 'vapt.pref.interface';

/*
 * Limites da escala.
 *
 * Abaixo de 85% os alvos de toque ficam menores que a ponta de um dedo; acima
 * de 130% a barra de abas com seis itens começa a quebrar. São os extremos em
 * que a tela ainda funciona, não o que o slider consegue representar.
 */
export const ESCALA_MIN = 85;
export const ESCALA_MAX = 130;
export const ESCALA_PADRAO = 100;

export const PADRAO: Preferencias = {
  tema: 'sistema',
  escala: ESCALA_PADRAO,
  idioma: 'pt-BR',
};

const TEMAS: Tema[] = ['claro', 'escuro', 'sistema'];
const IDIOMAS: Idioma[] = ['pt-BR', 'en', 'es'];

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
 * outro formato, e o usuário pode ter editado o `localStorage` à mão. Um
 * `tema` inválido aplicado ao `<html>` deixaria a tela num estado que nenhum
 * botão da interface desfaz.
 */
export function lerPreferencias(): Preferencias {
  try {
    const cru = window.localStorage.getItem(CHAVE);
    if (!cru) return { ...PADRAO };

    const dados = JSON.parse(cru) as Partial<Preferencias>;

    return {
      tema: TEMAS.includes(dados.tema as Tema) ? (dados.tema as Tema) : PADRAO.tema,
      escala: limitar(dados.escala),
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
 * A escala mexe no `font-size` do `<html>` porque o Tailwind dimensiona tudo
 * em `rem` — texto, espaçamentos, raios e alturas. Mudar a raiz escala a
 * interface inteira de forma proporcional; aumentar só a fonte deixaria o
 * texto grande dentro de botões do tamanho antigo.
 */
export function aplicarPreferencias(prefs: Preferencias): void {
  const raiz = document.documentElement;
  const escuro = temaEfetivo(prefs.tema) === 'escuro';

  raiz.classList.toggle('dark', escuro);

  /* `color-scheme` faz o navegador escurecer o que não é nosso: barras de
     rolagem, campos nativos e o fundo atrás do quique do scroll. */
  raiz.style.colorScheme = escuro ? 'dark' : 'light';

  raiz.style.fontSize = `${limitar(prefs.escala)}%`;
  raiz.lang = prefs.idioma;
}
