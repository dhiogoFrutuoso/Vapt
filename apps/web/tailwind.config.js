/** @type {import('tailwindcss').Config} */
export default {
  // Escopo deliberadamente restrito: so o arquivo que de fato usa classes
  // Tailwind (AdminPage) entra no scan. Nenhuma outra pagina do site usa
  // essas classes, entao nada muda em Landing/Editor/Auth mesmo com o
  // import global do CSS gerado.
  content: ['./index.html', './src/pages/AdminPage.tsx'],
  // preflight desligado de proposito: o resto do site tem seu proprio
  // reset em base.css. Ligar o preflight do Tailwind re-normalizaria
  // margens/tipografia/botoes em TODAS as paginas, nao so na /admin.
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        // Paleta Vapt: off-white/creme + chumbo + laranja de marca.
        cream: {
          50: '#FDFCFB',
          100: '#FAF8F5',
        },
        ink: {
          900: '#111111',
          700: '#333333',
          500: '#666666',
          300: '#999999',
        },
        brand: {
          DEFAULT: '#F95D2A',
          hover: '#FF7A4D',
          soft: '#FFF0EC',
        },
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        // Sombras difusas e amplas ("soft shadow"), sem borda dura.
        soft: '0 10px 30px -4px rgba(17, 17, 17, 0.06)',
        'soft-lg': '0 24px 60px -12px rgba(17, 17, 17, 0.12)',
        'soft-xl': '0 32px 80px -16px rgba(17, 17, 17, 0.16)',
        brand: '0 12px 28px -6px rgba(249, 93, 42, 0.35)',
        'brand-lg': '0 18px 40px -8px rgba(249, 93, 42, 0.45)',
      },
      fontFamily: {
        sans: ['Inter', 'Poppins', 'system-ui', 'sans-serif'],
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};
