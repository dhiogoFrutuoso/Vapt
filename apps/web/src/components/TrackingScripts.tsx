import { useEffect } from 'react';

/**
 * Tracking white-label: injeta as tags de marketing DO LOJISTA no <head>.
 *
 * As conversões precisam cair na conta dele, não na da Vapt — por isso os IDs
 * vêm do app (`AppProject.tracking`) e não de variável de ambiente nossa.
 *
 * SEGURANÇA — o ponto sensível deste arquivo:
 * os IDs são texto que o lojista digita no painel e que acaba DENTRO de um
 * `<script>` inline. Sem validação, um valor como `x');alert(1);//` viraria
 * código executando no navegador de todos os clientes daquela loja. Por isso
 * cada ID passa por um regex estrito antes de ser usado, e um valor fora do
 * formato é descartado em silêncio em vez de injetado.
 */

export type TrackingConfig = {
  facebookPixelId?: string | null;
  googleAnalyticsId?: string | null;
  googleTagManagerId?: string | null;
};

/** Os mesmos formatos validados no schema Mongoose, repetidos na borda do cliente. */
const PATTERNS = {
  facebookPixelId: /^[0-9]{10,20}$/,
  googleAnalyticsId: /^G-[A-Z0-9]{6,14}$/,
  googleTagManagerId: /^GTM-[A-Z0-9]{5,12}$/,
} as const;

function clean(value: string | null | undefined, kind: keyof typeof PATTERNS): string | null {
  const trimmed = (value ?? '').trim().toUpperCase();
  if (!trimmed) return null;
  if (!PATTERNS[kind].test(trimmed)) {
    console.warn(`[tracking] ID ignorado por formato inválido (${kind}).`);
    return null;
  }
  return trimmed;
}

/** Marca tudo que criamos, para conseguir remover na troca de loja/desmontagem. */
const OWNED = 'data-vapt-tracking';

function appendScript(content: string, id: string): HTMLScriptElement {
  const script = document.createElement('script');
  script.setAttribute(OWNED, id);
  script.text = content;
  document.head.appendChild(script);
  return script;
}

function appendExternal(src: string, id: string): HTMLScriptElement {
  const script = document.createElement('script');
  script.setAttribute(OWNED, id);
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
  return script;
}

export function TrackingScripts({ tracking }: { tracking?: TrackingConfig | null }) {
  const pixel = clean(tracking?.facebookPixelId, 'facebookPixelId');
  const ga4 = clean(tracking?.googleAnalyticsId, 'googleAnalyticsId');
  const gtm = clean(tracking?.googleTagManagerId, 'googleTagManagerId');

  useEffect(() => {
    // Nada configurado: não sujamos o <head> nem carregamos rede à toa.
    if (!pixel && !ga4 && !gtm) return;

    const added: Element[] = [];

    /* ------------------------- Meta / Facebook Pixel ------------------------- */
    if (pixel) {
      added.push(
        appendScript(
          `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixel}');
fbq('track', 'PageView');`,
          'fb-pixel'
        )
      );

      // Fallback para quem bloqueia JS: o <img> ainda registra o PageView.
      const noscript = document.createElement('noscript');
      noscript.setAttribute(OWNED, 'fb-pixel-noscript');
      const img = document.createElement('img');
      img.height = 1;
      img.width = 1;
      img.style.display = 'none';
      img.src = `https://www.facebook.com/tr?id=${encodeURIComponent(pixel)}&ev=PageView&noscript=1`;
      noscript.appendChild(img);
      document.head.appendChild(noscript);
      added.push(noscript);
    }

    /* ------------------------------- GA4 ------------------------------------- */
    if (ga4) {
      added.push(appendExternal(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4)}`, 'ga4-src'));
      added.push(
        appendScript(
          `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${ga4}');`,
          'ga4-init'
        )
      );
    }

    /* ------------------------ Google Tag Manager ----------------------------- */
    if (gtm) {
      added.push(
        appendScript(
          `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtm}');`,
          'gtm-init'
        )
      );

      // O <iframe> do GTM precisa ficar no topo do <body>, não no <head>.
      const noscript = document.createElement('noscript');
      noscript.setAttribute(OWNED, 'gtm-noscript');
      const frame = document.createElement('iframe');
      frame.src = `https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(gtm)}`;
      frame.height = '0';
      frame.width = '0';
      frame.style.display = 'none';
      frame.style.visibility = 'hidden';
      noscript.appendChild(frame);
      document.body.insertBefore(noscript, document.body.firstChild);
      added.push(noscript);
    }

    return () => {
      for (const node of added) node.remove();
    };
  }, [pixel, ga4, gtm]);

  return null;
}
