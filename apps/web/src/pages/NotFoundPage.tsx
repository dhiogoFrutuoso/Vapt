import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Home } from 'lucide-react';

/**
 * 404 do Vapt.
 *
 * Antes, qualquer rota desconhecida caía num `<Navigate to="/" replace />`:
 * o usuário era jogado na home sem saber que errou o endereço, e um link
 * quebrado do painel virava "o site me expulsou". Uma página explícita diz o
 * que aconteceu e oferece os dois caminhos que fazem sentido.
 */
export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FAF8F5] px-4 py-12">
      <div className="w-full max-w-lg rounded-3xl bg-white p-8 text-center shadow-[0_10px_30px_-4px_rgba(17,17,17,0.06)] md:p-12">
        <p className="m-0 text-6xl font-extrabold tracking-tight text-[#F95D2A] md:text-7xl">404</p>

        <h1 className="m-0 mt-4 text-2xl font-extrabold text-gray-900">Página não encontrada</h1>

        <p className="m-0 mt-3 text-[0.98rem] leading-relaxed text-gray-500">
          O endereço que você abriu não existe ou foi movido. Nada de errado com a sua conta — é só
          esta página mesmo.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-solid
              border-gray-200 bg-white px-6 py-3 text-[0.95rem] font-bold text-gray-700
              transition-colors hover:bg-gray-50 sm:w-auto"
          >
            <ArrowLeft size={16} />
            Voltar
          </button>

          <Link
            to="/"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#F95D2A] px-6 py-3
              text-[0.95rem] font-bold text-white no-underline transition-colors hover:bg-[#FF7A4D] sm:w-auto"
          >
            <Home size={16} />
            Ir para o início
          </Link>
        </div>
      </div>
    </main>
  );
}
