import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import { MobileViewPage } from './pages/MobileViewPage';
import './styles/global.css';

/**
 * Entrada do APLICATIVO NATIVO (APK e .exe). Nao e a entrada do site.
 *
 * POR QUE EXISTE UM SEGUNDO ENTRY POINT
 * -------------------------------------
 * O painel de edicao nao pode viajar dentro do binario. Se a casca nativa
 * carregasse o bundle do site, todo o `/painel` estaria no arquivo instalado
 * no celular: bastaria a WebView navegar ate a rota para o painel aparecer,
 * e um APK e um arquivo — qualquer pessoa o abre e le o que tem dentro.
 *
 * Confiar no login para esconder o painel resolveria o acesso, nao a
 * presenca. O codigo continuaria ali para ser lido. Aqui a garantia e outra:
 * este arquivo nao importa `App.tsx`, entao o empacotador nunca ve as rotas
 * do painel e elas nao entram no bundle. O painel deixa de estar protegido
 * para deixar de existir no aplicativo.
 *
 * SEM ROTEADOR, DE PROPOSITO
 * --------------------------
 * O app tem uma tela so — quem decide o que aparece e a sessao do
 * funcionario, nao a URL. Um `BrowserRouter` aqui ainda traria o `history`
 * para dentro do binario e daria a WebView uma forma de navegar para
 * qualquer caminho. Sem roteador, `/painel` nao e uma rota protegida: nao e
 * uma rota.
 *
 * O aplicativo continua falando com a API de producao, entao cardapio,
 * pedidos e equipe sao os dados reais. O que ficou de fora foi a interface
 * de edicao do dono, e so ela.
 */

const container = document.getElementById('root');
if (!container) throw new Error('Elemento #root nao encontrado no index.html');

createRoot(container).render(
  <StrictMode>
    <MobileViewPage />
    {/* No topo: no celular o rodape e a barra de abas, e um toast ali cobre
        justamente o botao que o funcionario acabou de tocar. */}
    <Toaster position="top-center" />
  </StrictMode>
);
