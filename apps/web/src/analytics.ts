/**
 * Google Analytics, carregado pelo bundle em vez de por script embutido.
 *
 * POR QUE SAIU DO index.html
 * --------------------------
 * O bloco antigo era um `<script>` inline dentro do HTML. Para o navegador
 * executá-lo, a CSP precisaria de `script-src 'unsafe-inline'` — e essa
 * permissão não distingue o NOSSO script inline de um injetado por XSS: vale
 * para todos. Uma única linha de conveniência anulava a política inteira.
 *
 * Daqui o código sai como parte do bundle, que é um arquivo servido pela
 * própria origem, e `script-src 'self'` basta.
 *
 * O script do Google continua vindo de fora, e por isso o domínio
 * `googletagmanager.com` está declarado no `script-src` do `vercel.json` — a
 * exceção é nominal e auditável, em vez de um `unsafe-inline` geral.
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function iniciarAnalytics(): void {
  const id = (import.meta.env.VITE_GA_ID ?? '').trim();

  /*
   * Sem id configurado, não carrega nada. O `.env.example` traz um valor de
   * exemplo (`G-EXEMPLO000`), e mandar dados para um id inventado sujaria a
   * conta de quem por acaso o tivesse.
   */
  if (!id || id.startsWith('G-EXEMPLO')) return;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  function gtag(...args: unknown[]) {
    window.dataLayer!.push(args);
  }
  window.gtag = gtag;

  gtag('js', new Date());
  gtag('config', id);
}
