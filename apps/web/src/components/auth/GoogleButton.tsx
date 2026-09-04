
/**
 * Botão "Continuar com o Google" + separador "ou".
 *
 * Renderiza SEMPRE. A versão anterior consultava `/auth/google/status` e se
 * escondia quando a resposta não vinha — o que parecia prudente e na prática
 * apagava o botão: em produção o `vercel.json` do front reescreve `/(.*)` para
 * `index.html`, então a chamada de status devolvia HTML, o `response.json()`
 * estourava, o catch marcava "desabilitado" e ninguém nunca via o botão.
 * Um `<a href>` estático não precisa de permissão de ninguém para existir.
 *
 * Continua sendo âncora, e não `<button>` com JavaScript: o OAuth termina com
 * o Google redirecionando o navegador de volta para a nossa API, que grava o
 * cookie de sessão nessa resposta. Isso exige navegação de página inteira —
 * num `fetch` o redirect seria seguido em background e o cookie nunca chegaria
 * ao documento. Como âncora ainda funciona sem JS e aceita abrir em nova aba.
 */

type Props = {
  /** Texto do botão. O padrão serve para login e cadastro. */
  label?: string;
  /** Repassado ao voltar, para o painel saber de qual plano o usuário veio. */
  plan?: string | null;
  disabled?: boolean;
};

/** Logo oficial do Google, nas 4 cores da marca. */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false" className="shrink-0">
      <path
        fill="#4285F4"
        d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2823-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71z"
      />
      <path
        fill="#EA4335"
        d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.656 3.5795 9 3.5795z"
      />
    </svg>
  );
}

export function GoogleButton({ label = 'Continuar com o Google', plan = null, disabled = false }: Props) {
  /*
   * Caminho RELATIVO de proposito — este e o unico lugar do app que ignora
   * VITE_API_URL.
   *
   * O OAuth so fecha se o inicio e o callback acontecerem na MESMA origem: o
   * cookie `vapt_oauth_state` e gravado por quem atende /auth/google e
   * conferido por quem atende /auth/google/callback. Com VITE_API_URL
   * absoluto, o inicio iria para o dominio da API e gravaria o cookie la,
   * enquanto o callback (registrado no Console do Google no dominio do front)
   * procuraria o cookie aqui e nao acharia — que e exatamente o
   * "state invalido" que aparece na tela.
   *
   * Relativo, o /api/* e resolvido pelo proxy do Vite em dev e pelo rewrite
   * do vercel.json em producao. Nos dois casos, mesma origem nas duas pontas.
   */
  const href = plan
    ? `/api/auth/google?plano=${encodeURIComponent(plan)}`
    : '/api/auth/google';

  return (
    <>
      <a
        href={disabled ? undefined : href}
        aria-disabled={disabled || undefined}
        className={[
          'flex w-full items-center justify-center gap-2 rounded-full py-2',
          // `border-solid` e obrigatorio: o projeto roda com preflight
          // desligado, entao o Tailwind nao reseta border-style. Sem isto ele
          // fica `none` e a borda computa 0px por mais que a classe declare 1px.
          'border border-solid border-gray-300 bg-white px-5',
          'font-medium text-gray-700 no-underline',
          'transition-colors hover:bg-gray-50',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
          disabled ? 'pointer-events-none opacity-60' : '',
        ].join(' ')}
      >
        <GoogleLogo />
        <span>{label}</span>
      </a>

      {/* Separador entre o login social e o tradicional. */}
      <div className="my-4 flex items-center gap-3" role="separator" aria-label="ou">
        <span className="h-px flex-1 bg-gray-200" aria-hidden="true" />
        <span className="text-sm text-gray-400">ou</span>
        <span className="h-px flex-1 bg-gray-200" aria-hidden="true" />
      </div>
    </>
  );
}
