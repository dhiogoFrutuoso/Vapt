import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * Páginas jurídicas (/termos e /privacidade).
 *
 * As duas compartilham a mesma moldura e mudam só o conteúdo, renderizado com
 * `prose` do Tailwind Typography.
 *
 * AVISO IMPORTANTE: os textos abaixo foram redigidos a partir da descrição do
 * produto (SaaS de PDV/KDS sem comissão, pedidos web, login social) e servem
 * como ponto de partida. Não são parecer jurídico. Antes de publicar, um
 * advogado precisa revisar — especialmente os campos marcados como
 * `[PREENCHER]`, que dependem de dados reais da empresa, e as seções de
 * responsabilidade e de transferência internacional de dados.
 */

const ATUALIZADO_EM = '4 de setembro de 2026';

function LegalShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#FAF8F5] px-4 py-8 md:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <Link
          to="/"
          className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-gray-500 no-underline transition-colors hover:text-gray-900"
        >
          <ArrowLeft size={16} />
          Voltar para o site
        </Link>

        <article className="rounded-3xl bg-white p-6 shadow-[0_10px_30px_-4px_rgba(17,17,17,0.06)] md:p-10">
          <header className="mb-8 border-0 border-b border-solid border-gray-100 pb-6">
            <h1 className="m-0 text-3xl font-extrabold tracking-tight text-gray-900">{title}</h1>
            <p className="m-0 mt-2 text-[0.95rem] text-gray-500">{subtitle}</p>
            <p className="m-0 mt-1 text-sm text-gray-400">Última atualização: {ATUALIZADO_EM}</p>
          </header>

          <div
            className="prose prose-sm max-w-none prose-headings:font-extrabold prose-headings:text-gray-900
              prose-h2:mt-8 prose-h2:text-xl prose-h3:text-base prose-p:text-gray-600
              prose-li:text-gray-600 prose-strong:text-gray-900 prose-a:text-[#F95D2A]
              md:prose-base"
          >
            {children}
          </div>
        </article>
      </div>
    </main>
  );
}

/** Bloco reaproveitado: quem é a empresa por trás do serviço. */
function Identificacao() {
  return (
    <p>
      O Vapt é operado por <strong>[PREENCHER: razão social]</strong>, inscrita no CNPJ sob o nº{' '}
      <strong>[PREENCHER: CNPJ]</strong>, com sede em <strong>[PREENCHER: endereço]</strong>, doravante
      denominada simplesmente "Vapt". Contato:{' '}
      <a href="mailto:contato@vapt.app">[PREENCHER: e-mail de contato]</a>.
    </p>
  );
}

export function TermsPage() {
  return (
    <LegalShell
      title="Termos de Uso"
      subtitle="As regras da relação entre você e o Vapt."
    >
      <Identificacao />

      <h2>1. O que é o Vapt</h2>
      <p>
        O Vapt é um software como serviço (SaaS) que permite a comércios — restaurantes, bares,
        lanchonetes, pizzarias, cafeterias e mercados — montar e operar o próprio canal de vendas.
        A plataforma reúne:
      </p>
      <ul>
        <li>
          <strong>Cardápio digital e pedidos pela web</strong>, acessados pelo cliente final por
          navegador, sem necessidade de instalar aplicativo;
        </li>
        <li>
          <strong>PDV (ponto de venda)</strong> com controle de mesas, comandas de balcão, formas de
          pagamento e fechamento de caixa;
        </li>
        <li>
          <strong>KDS (Kitchen Display System)</strong>, que distribui os itens de cada pedido entre
          as praças de preparo da cozinha;
        </li>
        <li>
          <strong>Gestão de entregas</strong>, com definição de taxa por pedido e acompanhamento do
          status até a entrega.
        </li>
      </ul>
      <p>
        <strong>O Vapt não cobra comissão sobre as vendas.</strong> A remuneração se dá
        exclusivamente pela assinatura do plano contratado. O Vapt não é intermediário da venda, não
        processa o pagamento do consumidor final e não é parte na relação entre o comércio e seu
        cliente.
      </p>

      <h2>2. Cadastro e conta</h2>
      <p>
        Para usar a plataforma é necessário criar uma conta, informando dados verdadeiros, completos
        e atualizados. O cadastro pode ser feito com e-mail e senha ou por login social (Google).
      </p>
      <p>
        Você é responsável por manter a confidencialidade das suas credenciais e por toda atividade
        realizada na sua conta. Comunique-nos imediatamente qualquer uso não autorizado. O Vapt pode
        recusar, suspender ou encerrar contas que violem estes Termos ou a legislação aplicável.
      </p>
      <p>
        O serviço destina-se a pessoas com capacidade civil plena, atuando em nome próprio ou com
        poderes de representação do estabelecimento cadastrado.
      </p>

      <h2>3. Códigos de acesso da equipe</h2>
      <p>
        O titular da conta pode gerar códigos de acesso para funcionários, com permissões por área
        (atendimento, cozinha, caixa, entrega). O titular é responsável por conceder, revisar e
        revogar esses acessos, e responde pelos atos praticados por sua equipe na plataforma.
      </p>

      <h2>4. Conteúdo do estabelecimento</h2>
      <p>
        Todo o conteúdo que você insere — nome, marca, fotos, descrições, preços, cardápio — continua
        sendo seu. Você concede ao Vapt uma licença limitada, não exclusiva e revogável para
        armazenar, processar e exibir esse conteúdo, com a única finalidade de operar o serviço.
      </p>
      <p>Você declara e garante que:</p>
      <ul>
        <li>possui os direitos sobre o conteúdo publicado, inclusive sobre as imagens utilizadas;</li>
        <li>
          as informações de produtos, preços, composição e alergênicos são verdadeiras e estão em
          conformidade com a legislação sanitária e o Código de Defesa do Consumidor;
        </li>
        <li>
          é o responsável exclusivo perante o consumidor final pela venda, pelo preparo, pela
          qualidade e pela entrega dos produtos.
        </li>
      </ul>

      <h2>5. Planos, pagamento e cancelamento</h2>
      <p>
        O uso da plataforma depende de assinatura ativa. Os planos, valores e limites vigentes são os
        exibidos no site no momento da contratação. Períodos de teste, quando oferecidos, têm prazo e
        funcionalidades definidos na própria oferta.
      </p>
      <p>
        Reajustes serão comunicados com pelo menos <strong>30 (trinta) dias</strong> de antecedência.
        Você pode cancelar a qualquer momento; o cancelamento produz efeitos ao fim do ciclo já pago,
        sem devolução proporcional, salvo disposição legal em contrário.
      </p>
      <p>
        A falta de pagamento pode levar à suspensão do acesso. Seus dados permanecem disponíveis para
        exportação por <strong>30 (trinta) dias</strong> após o encerramento, e podem ser excluídos
        em definitivo depois desse prazo.
      </p>

      <h2>6. Uso aceitável</h2>
      <p>Ao usar o Vapt, você concorda em não:</p>
      <ul>
        <li>comercializar produtos ilícitos ou cuja venda dependa de autorização que não possua;</li>
        <li>
          tentar acessar contas, dados ou áreas da plataforma que não lhe pertençam, nem explorar
          falhas de segurança;
        </li>
        <li>
          fazer engenharia reversa, copiar ou revender o software, no todo ou em parte, sem
          autorização expressa;
        </li>
        <li>
          usar a plataforma para envio de mensagens não solicitadas ou para qualquer prática vedada
          pela legislação.
        </li>
      </ul>

      <h2>7. Disponibilidade e suporte</h2>
      <p>
        Trabalhamos para manter o serviço disponível de forma contínua, mas ele pode ser interrompido
        por manutenção programada, falhas de terceiros (hospedagem, provedores de e-mail, serviços de
        autenticação) ou eventos fora do nosso controle. Não garantimos operação ininterrupta ou
        isenta de erros.
      </p>
      <p>
        O suporte é prestado pelos canais informados no site, em dias úteis, nos horários ali
        divulgados.
      </p>

      <h2>8. Limitação de responsabilidade</h2>
      <p>
        O Vapt fornece a ferramenta; a operação comercial é sua. Não respondemos por lucros
        cessantes, perda de oportunidade ou danos indiretos decorrentes do uso ou da indisponibilidade
        do serviço.
      </p>
      <p>
        Nos limites permitidos pela lei, nossa responsabilidade total fica limitada ao valor pago por
        você nos <strong>12 (doze) meses</strong> anteriores ao evento. Esta limitação não se aplica a
        dolo, culpa grave ou a direitos que a lei declare irrenunciáveis.
      </p>

      <h2>9. Alterações destes Termos</h2>
      <p>
        Estes Termos podem ser atualizados. Mudanças relevantes serão comunicadas com antecedência
        razoável, por e-mail ou aviso na plataforma. O uso após a vigência da nova versão significa
        concordância com ela; se não concordar, você pode encerrar a assinatura.
      </p>

      <h2>10. Lei aplicável e foro</h2>
      <p>
        Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da
        comarca de <strong>[PREENCHER: comarca]</strong> para dirimir controvérsias, com renúncia a
        qualquer outro, por mais privilegiado que seja.
      </p>
    </LegalShell>
  );
}

export function PrivacyPage() {
  return (
    <LegalShell
      title="Política de Privacidade"
      subtitle="Quais dados tratamos, por quê, e o que você pode exigir."
    >
      <Identificacao />
      <p>
        Esta Política explica como o Vapt trata dados pessoais, em conformidade com a{' '}
        <strong>Lei nº 13.709/2018 (LGPD)</strong>.
      </p>

      <h2>1. Dois papéis diferentes</h2>
      <p>Esta distinção define quem responde pelo quê:</p>
      <ul>
        <li>
          <strong>Sobre os dados do lojista</strong> (quem assina o Vapt), somos{' '}
          <strong>controladores</strong>: decidimos as finalidades e os meios do tratamento.
        </li>
        <li>
          <strong>Sobre os dados do consumidor final</strong> (quem faz o pedido no cardápio digital),
          somos <strong>operadores</strong>: tratamos os dados por conta e ordem do estabelecimento,
          que é o controlador. Pedidos de titulares dessa base devem ser dirigidos ao próprio
          estabelecimento, a quem prestamos apoio.
        </li>
      </ul>

      <h2>2. Dados que coletamos</h2>
      <h3>Do lojista</h3>
      <ul>
        <li>Identificação e contato: nome, e-mail, telefone, nome de usuário, foto de perfil;</li>
        <li>Endereço do estabelecimento;</li>
        <li>
          Dados de autenticação: senha armazenada exclusivamente como <em>hash</em> (bcrypt) — nunca
          em texto legível — e, no login social, o identificador da conta Google, o e-mail e a foto
          pública do perfil;
        </li>
        <li>Dados de uso: registros de acesso, endereço IP e data/hora, conforme o Marco Civil da Internet.</li>
      </ul>
      <h3>Do consumidor final, em nome do estabelecimento</h3>
      <ul>
        <li>Nome e telefone informados no pedido;</li>
        <li>Endereço de entrega, quando o pedido é para delivery;</li>
        <li>Itens do pedido, valores e forma de pagamento escolhida.</li>
      </ul>
      <p>
        <strong>Não coletamos nem armazenamos dados de cartão de crédito.</strong> O Vapt não é
        gateway de pagamento.
      </p>

      <h2>3. Por que tratamos esses dados</h2>
      <ul>
        <li>
          <strong>Execução do contrato:</strong> criar e manter sua conta, operar o cardápio, o PDV, o
          KDS e a gestão de entregas;
        </li>
        <li>
          <strong>Segurança e prevenção a fraude:</strong> autenticação, limites de tentativas,
          registros de acesso;
        </li>
        <li>
          <strong>Obrigação legal:</strong> guarda de registros de conexão e de aplicação;
        </li>
        <li>
          <strong>Legítimo interesse:</strong> suporte, melhoria do produto e comunicações
          operacionais sobre o serviço;
        </li>
        <li>
          <strong>Consentimento:</strong> comunicações de marketing, quando houver — sempre com opção
          de descadastro.
        </li>
      </ul>

      <h2>4. Ferramentas de medição do lojista</h2>
      <p>
        O Vapt permite que o estabelecimento insira as próprias chaves de Meta Pixel, Google
        Analytics e Google Tag Manager no seu cardápio digital. Quando isso é feito,{' '}
        <strong>o estabelecimento passa a ser o controlador desse tratamento</strong> e é responsável
        por informar seus clientes e obter as bases legais cabíveis. O Vapt apenas disponibiliza o
        campo de configuração e não acessa as contas de anúncio ou de análise do lojista.
      </p>

      <h2>5. Compartilhamento</h2>
      <p>Não vendemos dados pessoais. Compartilhamos apenas com:</p>
      <ul>
        <li>
          <strong>Provedores de infraestrutura</strong> (hospedagem, banco de dados, armazenamento de
          imagens e envio de e-mail transacional), na medida necessária para o serviço funcionar;
        </li>
        <li>
          <strong>Google</strong>, quando você opta pelo login social, limitado à autenticação;
        </li>
        <li>
          <strong>Autoridades</strong>, mediante ordem judicial ou requisição legal.
        </li>
      </ul>
      <p>
        Alguns desses provedores operam fora do Brasil. Nesses casos, a transferência internacional
        observa os requisitos dos arts. 33 e seguintes da LGPD, com cláusulas contratuais adequadas.
      </p>

      <h2>6. Retenção</h2>
      <p>
        Mantemos os dados pelo tempo da relação contratual. Encerrada a conta, os dados ficam
        disponíveis para exportação por <strong>30 (trinta) dias</strong> e são eliminados em seguida,
        exceto o que a lei exigir preservar — como os registros de acesso, guardados por{' '}
        <strong>6 (seis) meses</strong> nos termos do Marco Civil da Internet.
      </p>

      <h2>7. Segurança</h2>
      <p>Entre as medidas adotadas:</p>
      <ul>
        <li>tráfego cifrado em trânsito (HTTPS);</li>
        <li>senhas armazenadas apenas como hash bcrypt, jamais em texto legível;</li>
        <li>
          sessão em cookie <code>httpOnly</code>, inacessível a scripts da página, o que reduz o
          impacto de ataques de XSS;
        </li>
        <li>limites de tentativas nas rotas de autenticação e de recuperação de senha;</li>
        <li>códigos de recuperação com validade curta, uso único e armazenados como hash.</li>
      </ul>
      <p>
        Nenhum sistema é infalível. Em caso de incidente com risco relevante, comunicaremos os
        titulares e a ANPD nos prazos legais.
      </p>

      <h2>8. Seus direitos</h2>
      <p>A LGPD garante a você, a qualquer momento:</p>
      <ul>
        <li>confirmação da existência de tratamento e acesso aos dados;</li>
        <li>correção de dados incompletos, inexatos ou desatualizados;</li>
        <li>anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos;</li>
        <li>portabilidade a outro fornecedor;</li>
        <li>informação sobre com quem compartilhamos seus dados;</li>
        <li>revogação do consentimento, quando esta for a base legal utilizada.</li>
      </ul>
      <p>
        Para exercer qualquer um deles, escreva para{' '}
        <a href="mailto:privacidade@vapt.app">[PREENCHER: e-mail do encarregado]</a>. Responderemos
        nos prazos previstos em lei.
      </p>

      <h2>9. Cookies</h2>
      <p>
        Usamos cookies estritamente necessários para manter sua sessão autenticada e para proteger o
        fluxo de login social contra CSRF. Eles não servem para publicidade e não podem ser
        desativados sem inviabilizar o acesso à sua conta. Cookies de medição eventualmente presentes
        no cardápio digital são de responsabilidade do estabelecimento, conforme a seção 4.
      </p>

      <h2>10. Alterações</h2>
      <p>
        Esta Política pode ser atualizada. Mudanças relevantes serão comunicadas por e-mail ou aviso
        na plataforma, com antecedência razoável.
      </p>
    </LegalShell>
  );
}
