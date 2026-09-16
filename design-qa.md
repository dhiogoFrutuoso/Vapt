# Design QA — Caixa, Gestão e disponibilidade do cardápio

## Fonte visual

- Referências: onze capturas fornecidas pelo usuário para Caixa/Registro, correção de entrega, Entregador, Gestão, Recepção e Cozinha.
- Implementação renderizada em uma rota local temporária com dados representativos; a rota foi removida depois da inspeção.
- Superfície validada: aplicativo responsivo em 480 CSS px, cobrindo o mesmo layout compartilhado por Web, Electron e Capacitor.

## Verificações realizadas

- Caixa/Turno: resumo financeiro, saída de dinheiro, movimentos, quatro filtros, cartão de venda e fechamento fixo.
- Caixa/Registro: resumo do resultado, busca, extrato por data, filtros, cartões, ações administrativas e total fixo.
- Correção de entrega: o botão “Adicionar item pelo cardápio” substitui a linha manual em branco e informa a continuação na aba Cliente.
- Gestão: quatro indicadores clicáveis, acesso a fechamentos, cartões operacionais e último fechamento.
- Fechamentos: modal com datas, operador, situação, valores esperados e diferenças por meio de pagamento.
- Recepção: acesso de disponibilidade, categorias, itens disponíveis/esgotados e ações com alvo de toque adequado.
- Cardápio do cliente: produto esgotado permanece visível em cinza, recebe selo “ESGOTADO” e não oferece ação de adicionar.

## Ajustes feitos durante a inspeção

- P1 — Caixa espremido horizontalmente: a casca flexível estava sem direção de coluna após remover os estilos inline. Corrigido com `flex-direction: column` e revalidado.
- Pós-correção: Turno e Registro ocupam toda a largura útil, mantêm rolagem interna e preservam o rodapé de conferência sem cobrir os cartões.

## Resultado

- Sem diferenças visuais P0/P1/P2 restantes nas superfícies alteradas.
- Hierarquia, contraste, estados desabilitados, responsividade, modais e alvos de toque aprovados.
- Console visual sem erros de componente durante os fluxos inspecionados.

## Auditoria em tela cheia

- Acesso validado pelo cartão “eventos auditados”, com modal ocupando toda a tela e retorno de foco ao cartão após fechar com `Escape`.
- Busca global validada por código de entrega: `3457` retornou 3 de 8 eventos.
- Filtros combinados validados por funcionário e área: `Milena + Entregas` retornou 1 de 8 eventos, sem registros de outras áreas.
- Estado sem resultados e restauração pelo botão “Limpar filtros” validados.
- Datas, funcionário, área, tipo de ação e ordenação ficam disponíveis simultaneamente, com controles responsivos e alvos de toque adequados.
- A rota temporária usada para inspeção foi removida após a validação.

## Edição de funcionários no aplicativo

- A lista da equipe foi validada com quatro funções e affordance de edição em todos os cartões.
- A modal permite editar nome e tag, mostra as permissões resultantes e identifica o próprio acesso do administrador.
- Alteração somente de nome foi persistida e refletida imediatamente na lista.
- Alteração de tag exige confirmação explícita e informa que as sessões serão encerradas para aplicar as permissões.
- `Escape` retorna do editor para a equipe sem fechar todo o contexto; foco inicial, anel de foco e retorno por teclado foram validados.
- Layout validado em 375 × 812 px e 812 × 375 px; em paisagem o conteúdo continua acessível por rolagem interna.
- Nenhum erro foi registrado no console durante o fluxo; a rota e os dados temporários de QA foram removidos.

final result: passed

# Design QA — modo escuro integral

## Superfícies verificadas

- Cardápio do cliente, Recepção, Salão, Cozinha e Caixa na mesma casca compartilhada por navegador, Electron e Capacitor.
- Fundos de página, cards, filtros, formulários, modais, abas, estados vazios e controles secundários.
- Preferência do funcionário aplicada à interface operacional do restaurante, sem alterar a cor principal da marca.

## Ajustes durante a inspeção

- P1 — A interface operacional ainda usava o tema salvo no cardápio do restaurante. A casca passou a usar o tema efetivo da preferência do funcionário.
- P1 — Diversas superfícies mantinham `#fff`, creme e cinzas claros fixos. Foi criada uma camada final de tokens e substituições semânticas para todas as áreas operacionais.
- P2 — `--ink-900` era usado ao mesmo tempo para texto e faixas escuras; a inversão deixava a identificação da área branca. O token permaneceu escuro e os textos passaram a receber cores semânticas explícitas.
- P2 — Filtro ativo da cozinha e valores do resumo do Caixa tinham contraste insuficiente. Ambos foram recalibrados e revalidados.

## Resultado

- Tema escuro contínuo, sem grandes superfícies claras residuais nas áreas verificadas.
- Texto principal, texto secundário, bordas e estados possuem contraste independente do tema claro.
- A cor do restaurante continua como acento, preservando identidade visual sem comprometer legibilidade.

final result: passed

# Design QA — Recepção unificada, central do pedido e impressão

## Fonte visual

- Referências: três capturas fornecidas pelo usuário, incluindo a comanda térmica física de referência.
- Implementação validada na prévia local do aplicativo com pedidos representativos de retirada e entrega.
- Superfícies: navegador responsivo, componentes compartilhados pelo Electron e Capacitor e ponte nativa de impressão.

## Verificações realizadas

- Recepção em fluxo único: retiradas e pagamentos, incluindo fiado, aparecem antes do despacho sem uma segunda rolagem interna.
- Caixa: a ação “Abrir” exibe a central do pedido, edição administrativa, cópia formatada e impressão da comanda.
- Comanda: estabelecimento, impressão, aviso não fiscal, cliente, telefone, destino, referência, itens, totais, taxa, pagamentos, operador e rodapé.
- Gestão: configuração de impressoras com tutorial, seleção persistente no Windows e impressão nativa no Android.
- Salão: comando de impressão disponível nos cartões de mesa para uso do garçom no celular.

## Ajustes feitos durante a inspeção

- P2 — A largura CSS efetiva do simulador móvel era 487 px e mantinha a grade larga do modal. O breakpoint foi ampliado para 520 px.
- Pós-correção: ferramentas em uma coluna, resumo em duas colunas e ausência de overflow horizontal (`scrollWidth` igual à largura útil).
- A ação de copiar foi executada e confirmou a geração da comanda formatada; o conteúdo térmico oculto foi inspecionado com todos os blocos obrigatórios.

## Resultado

- Sem diferenças visuais P0/P1/P2 restantes nas superfícies alteradas.
- Hierarquia, encaixe, responsividade e ações de impressão aprovados.
- Console sem erros de componente durante os fluxos inspecionados.

final result: passed
