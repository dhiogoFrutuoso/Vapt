/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/pages/AdminPage.tsx',
    './src/pages/EditorPage.tsx',
    './src/components/EditorPreview.tsx',
    './src/components/phone/**/*.tsx',
    // Telas de autenticacao: sem isto as utilitarias usadas no botao do
    // Google e no separador nao chegam a ser geradas no CSS final.
    './src/pages/AccountPage.tsx',
    './src/pages/LoginPage.tsx',
    './src/pages/RegisterPage.tsx',
    './src/components/auth/**/*.tsx',
  ],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
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
