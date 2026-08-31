/**
 * TODA a copy da landing fica aqui.
 * Marketing edita texto sem precisar mexer em componente.
 * Dados de empresa e depoimentos sao FICTICIOS - substituir pelos reais.
 *
 * Tom: direto. Frase curta, verbo no comeco, zero enrolacao.
 * Quem chega aqui quer uma coisa: confianca de que o sistema funciona.
 */

export const site = {
  name: 'Vapt',
  domain: 'vaptapp.com.br',
  whatsapp: import.meta.env.VITE_WHATSAPP ?? '5511999999999',
  email: import.meta.env.VITE_SUPPORT_EMAIL ?? 'contato@vaptapp.com.br',
  companyName: import.meta.env.VITE_COMPANY_NAME ?? 'Vapt Tecnologia LTDA',
  cnpj: import.meta.env.VITE_COMPANY_CNPJ ?? '12.345.678/0001-90',
  androidUrl:
    import.meta.env.VITE_ANDROID_APP_URL ??
    'https://play.google.com/store/apps/details?id=com.vaptapp.parceiro',
  iosUrl: import.meta.env.VITE_IOS_APP_URL ?? 'https://apps.apple.com/br/app/vaptapp-parceiro/id0000000000',
};

/**
 * O wa.me so aceita digitos. O numero no .env costuma vir formatado
 * ("+55 88 99613-1836"), entao limpamos aqui e garantimos o DDI 55.
 */
export function whatsappNumber(): string {
  const digits = site.whatsapp.replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
}

export const whatsappLink = (message: string) =>
  `https://wa.me/${whatsappNumber()}?text=${encodeURIComponent(message)}`;

export const nav = {
  links: [
    { label: 'Recursos', href: '#funcionalidades' },
    { label: 'Testar agora', href: '#demonstracao' },
    { label: 'Suporte', href: '#suporte' },
    { label: 'Planos', href: '#planos' },
    { label: 'Dúvidas', href: '#faq' },
  ],
  loginLabel: 'Entrar',
  registerLabel: 'Criar conta',
};

/* ------------------------------------------------------------------ */
/* 1. HERO                                                             */
/* ------------------------------------------------------------------ */
export const hero = {
  eyebrow: 'Delivery próprio + mesas e caixa no celular',
  headlineTop: 'Seu delivery e seu caixa no ar em',
  headlineHighlight: '10 minutos',
  headlineBottom: '— sem pagar comissão a ninguém.',
  subheadline:
    'Criação imediata do seu app de delivery. Tudo sincronizado em tempo real: cliente, recepção e entregador. Sem instalação e sem taxa por pedido.',
  ctaPrimary: 'Monte seu Cardápio Grátis Agora',
  ctaSecondary: 'Falar com um humano no WhatsApp',
  microCopy: 'Grátis para montar • Sem cartão • Pronto antes do seu café esfriar',
  trustPoints: [
    { icon: '💸', title: '0% de comissão', text: 'O dinheiro cai direto na sua conta. Nada passa por nós.' },
    { icon: '🔑', title: 'Um código, toda a equipe', text: 'Garçom, caixa e cozinha entram com o mesmo código.' },
    { icon: '💬', title: 'Gente de verdade no WhatsApp', text: 'Montamos junto com você. Sem robô em loop.' },
  ],
  stats: [
    { value: '10 min', label: 'para o cardápio ir ao ar' },
    { value: 'R$ 0', label: 'de comissão por pedido' },
    { value: '+1.200', label: 'comércios usando' },
    { value: '4,9★', label: 'de nota no suporte' },
  ],
  phoneDemo: {
    storeName: 'Burger da Praça',
    tagline: 'Hambúrguer artesanal • Entrega em 35 min',
    items: [
      { name: 'Smash Duplo', description: 'Dois blends de 90g, cheddar e picles', price: 32.9, iconName: 'burger' },
      { name: 'Batata Rústica', description: 'Com alecrim e maionese da casa', price: 18, iconName: 'fries' },
      { name: 'Chopp 500ml', description: 'Pilsen gelado, colarinho na medida', price: 14, iconName: 'beer' },
    ],
    tables: [
      { label: '01', seats: 4, area: 'Salão', status: 'ocupada' as const, total: 128.4 },
      { label: '02', seats: 2, area: 'Salão', status: 'livre' as const },
      { label: '03', seats: 6, area: 'Varanda', status: 'pagamento' as const, total: 214.9 },
      { label: '04', seats: 4, area: 'Varanda', status: 'livre' as const },
      { label: '05', seats: 2, area: 'Balcão', status: 'ocupada' as const, total: 46 },
      { label: '06', seats: 2, area: 'Balcão', status: 'livre' as const },
    ],
    deliveries: [
      {
        code: '1042',
        customerName: 'Ana Paula',
        phone: '(11) 98877-6655',
        items: [
          { name: 'Smash Duplo', price: 32.9 },
          { name: 'Batata Rústica', price: 18 },
        ],
        total: 50.9,
        payments: [{ method: 'dinheiro' as const, amount: 100 }],
        address: {
          mode: 'manual' as const,
          city: 'São Paulo',
          district: 'Vila Mariana',
          street: 'Rua das Palmeiras',
          number: '128',
          reference: 'Depois da padaria vire à direita, segunda casa de portão azul.',
        },
        status: 'novo' as const,
        timeLabel: 'há 2 min',
        distanceLabel: '1,8 km',
      },
    ],
  },
};

/* Faixa de confiança logo abaixo do hero. */
export const trustStrip = {
  title: 'Feito para aguentar o rush',
  items: [
    { icon: '🏦', title: 'Seu dinheiro é seu', text: 'PIX na sua conta, maquininha na sua mão. Nenhum centavo passa pelo Vapt.' },
    { icon: '📶', title: 'Roda no celular da equipe', text: 'Android ou iPhone, no 4G do salão. Sem computador, sem servidor, sem fio.' },
    { icon: '🔒', title: 'Dados na nuvem, com backup', text: 'Perdeu o celular? Entra em outro com o mesmo código e continua de onde parou.' },
    { icon: '🚪', title: 'Sem fidelidade', text: 'Cancela em um clique, pelo painel ou pelo WhatsApp. Sem multa e sem ligação de retenção.' },
  ],
};

/* ------------------------------------------------------------------ */
/* 2. VANTAGENS E FUNCIONALIDADES                                      */
/* ------------------------------------------------------------------ */
export const advantages = {
  eyebrow: 'O que você recebe',
  title: 'Três coisas. Bem feitas.',
  subtitle: 'Delivery próprio e caixa no celular. Sem taxa por pedido e sem a burocracia das lojas de app.',
  cards: [
    {
      id: 'delivery',
      icon: '🛵',
      badge: 'Venda direta',
      title: 'App de Delivery Imediato',
      text: 'Seu app de delivery pronto na hora, com seu nome e suas cores. O cliente pede com facilidade e a recepção é notificada em tempo real.',
      bullets: [
        'Localização exata via mapa interativo (GPS/Leaflet) direto no checkout',
        'Divisão avançada de pagamentos (ex: parte PIX, parte dinheiro)',
        'Sincronização 100% em tempo real entre cliente, recepção e entregador',
        'O contato do cliente fica com você — não com o aplicativo',
      ],
      footnote: 'Sem comissão. Sem intermediário entre você e o seu cliente.',
    },
    {
      id: 'pdv',
      icon: '📱',
      badge: 'Salão e caixa',
      title: 'Mesas e caixa no celular',
      text: 'Você desenha o salão uma vez: mesas, lugares e áreas. Depois é só tocar na mesa para abrir a comanda, lançar o pedido na frente do cliente e fechar a conta.',
      bullets: [
        'Mapa de mesas: livre, ocupada e aguardando pagamento',
        'Comanda por mesa, por cliente ou por ficha',
        'Divisão de conta, 10% e desconto por item em dois toques',
        'Fechamento de caixa com sangria, suprimento e conferência',
      ],
      footnote: 'Funciona em qualquer Android ou iPhone. Sem comprar máquina.',
    },
    {
      id: 'codigo',
      icon: '🔑',
      badge: 'Zero burocracia',
      title: 'Ecossistema Sincronizado',
      text: 'O app Vapt Parceiro já está pronto. Sua equipe se conecta via código e o ecossistema inteiro opera em harmonia instantânea: do clique do cliente à entrega na porta.',
      bullets: [
        'Recepção despacha, entregador recebe rota no mapa imediatamente',
        'Notificações em tempo real sobre o status do pedido para o cliente',
        'Contratou? Passa o código. Saiu? Revoga o acesso em um toque',
        'Gestão e controle unificados na palma da mão',
      ],
      footnote: 'Do site pronto ao garçom lançando pedido: o tempo de baixar um app.',
    },
  ],
};

/* ------------------------------------------------------------------ */
/* 3. DEMONSTRAÇÃO INTERATIVA                                          */
/* ------------------------------------------------------------------ */
export const demo = {
  eyebrow: 'Teste agora, sem cadastro',
  title: 'Monte o seu aqui. Leva menos tempo que postar um story.',
  subtitle:
    'É a plataforma de verdade. Escolha o tipo do negócio, monte o cardápio, desenhe as mesas e veja funcionando na telinha — do jeito que o cliente e a equipe vão ver.',
  encouragement: 'Sem cadastro, sem cartão, sem compromisso. É só brincar.',
  steps: [
    {
      key: 'marca',
      label: 'Negócio',
      title: 'Passo 1 — Seu negócio',
      helper: 'Diga o que você tem e coloque a sua cara: logo, nome e cor. A telinha muda na hora.',
      tip: 'Use a cor da sua fachada ou da sua embalagem. O cliente reconhece na hora.',
    },
    {
      key: 'produto',
      label: 'Cardápio',
      title: 'Passo 2 — Seu cardápio',
      helper: 'Cadastre o campeão de vendas: nome, foto, descrição e preço. Depois é só repetir.',
      tip: 'Descrição com ingrediente vende mais: "blend de 180g com cheddar derretido" bate "X-Burger".',
    },
    {
      key: 'salao',
      label: 'Salão',
      title: 'Passo 3 — Seu salão',
      helper:
        'Monte as mesas do jeito que a sua casa é. Toque em "App da equipe" na telinha para abrir uma comanda e testar o caixa.',
      tip: 'Só faz delivery? Pule este passo — dá para ligar o salão depois, a qualquer momento.',
    },
    {
      key: 'preview',
      label: 'Pronto',
      title: 'Passo 4 — Está pronto. Esse é o seu sistema.',
      helper: 'Gere o código do restaurante e leve a sua equipe para dentro do app.',
      tip: 'Guarde o código: é com ele que garçom, caixa e cozinha entram.',
    },
  ],
  businessTypes: [
    { value: 'restaurante', label: 'Restaurante', iconName: 'restaurant', hasTables: true },
    { value: 'bar', label: 'Bar', iconName: 'beer', hasTables: true },
    { value: 'lanchonete', label: 'Lanchonete', iconName: 'burger', hasTables: true },
    { value: 'pizzaria', label: 'Pizzaria', iconName: 'pizza', hasTables: true },
    { value: 'cafeteria', label: 'Cafeteria', iconName: 'coffee', hasTables: true },
    { value: 'mercado', label: 'Mercado', iconName: 'cart', hasTables: false },
  ],
  form: {
    typeLabel: 'O que é o seu negócio?',
    logoLabel: 'Logo',
    logoHint: 'PNG ou JPG até 5MB. Sem logo agora? Use um ícone.',
    nameLabel: 'Nome do negócio',
    namePlaceholder: 'Ex.: Bar do Cais',
    taglineLabel: 'Frase curta',
    taglinePlaceholder: 'Ex.: Chopp gelado e petisco • Aberto até 1h',
    colorLabel: 'Cor da marca',
    productNameLabel: 'Nome do produto',
    productNamePlaceholder: 'Ex.: Porção de Calabresa',
    productDescLabel: 'Descrição',
    productDescPlaceholder: 'Ex.: 400g com cebola caramelizada e pão torrado',
    productPriceLabel: 'Preço',
    productPhotoLabel: 'Foto',
    productPhotoHint: 'Foto boa vende mais. Não tem agora? Nosso time tira e edita com você.',
    addProduct: 'Adicionar ao cardápio',
    emailLabel: 'Seu e-mail (para guardarmos o teste)',
    emailPlaceholder: 'voce@seunegocio.com.br',
    emailHint: 'Opcional e sem spam.',
    submitLabel: 'Gerar meu código do restaurante',
    submitting: 'Criando sua loja...',
  },
  tables: {
    title: 'Monte o salão',
    helper: 'Escolha a área, quantos lugares e quantas mesas. Dá para misturar salão, varanda e balcão.',
    areaLabel: 'Área',
    areas: ['Salão', 'Varanda', 'Balcão', 'Área externa'],
    seatsLabel: 'Lugares por mesa',
    quantityLabel: 'Quantas mesas',
    addLabel: 'Adicionar mesas',
    quickLabel: 'Rápido:',
    quickOptions: [
      { label: '+4 mesas de 4', seats: 4, quantity: 4, area: 'Salão' },
      { label: '+6 mesas de 2', seats: 2, quantity: 6, area: 'Salão' },
      { label: '+4 banquetas no balcão', seats: 1, quantity: 4, area: 'Balcão' },
    ],
    emptyLabel: 'Nenhuma mesa ainda. Só delivery? Pode seguir sem mesa.',
    clearLabel: 'Limpar mesas',
    skipLabel: 'Só faço delivery, pular',
    countLabel: (tables: number, seats: number) => `${tables} mesas · ${seats} lugares`,
    testHint: 'Toque em uma mesa na telinha para abrir a comanda e testar o fechamento.',
  },
  preview: {
    tabMenu: 'Cliente',
    tabRoom: 'Equipe',
    tabDelivery: 'Entregador',

    /* Faixa dentro da tela dizendo de quem é a visão — some qualquer dúvida sobre a aba. */
    roleStrip: {
      menu: { icon: '👤', text: 'Visão do cliente — é assim que quem pede vê o seu delivery' },
      salao: { icon: '🧑‍🍳', text: 'Visão da sua equipe — garçom, caixa e cozinha' },
      entrega: { icon: '🛵', text: 'Visão do entregador — a fila de entregas do dia' },
    },
    addToCart: 'Adicionar',
    addedToCart: 'no carrinho',
    cartExpand: 'Ver os itens',
    cartCollapse: 'Esconder os itens',
    checkoutOpen: 'Finalizar pedido',

    /* ---- Salão / comanda ---- */
    roomTitle: 'Mapa de mesas',
    legend: [
      { status: 'livre', label: 'Livre' },
      { status: 'ocupada', label: 'Ocupada' },
      { status: 'pagamento', label: 'Fechando' },
    ],
    emptyRoom: 'Monte as mesas no passo 3 para ver o salão da sua equipe aqui.',
    orderTitle: 'Comanda',
    addItem: 'Lançar item',
    pickerTitle: 'Cardápio — toque para lançar',
    pickerEmpty: 'Cadastre um item no passo 2 para lançar na mesa.',
    pickerBack: 'Voltar para a comanda',
    orderEmpty: 'Nenhum item lançado ainda.',
    closeTable: 'Fechar conta',
    confirmPayment: 'Confirmar pagamento',
    serviceFee: 'Serviço 10%',
    paid: 'Conta fechada. Mesa liberada.',
    openTable: 'Abrir mesa',

    /* ---- Pedido pelo site (cliente final) ---- */
    cartLabel: 'Ver sacola',
    checkoutTitle: 'Finalizar pedido',
    checkoutName: 'Seu nome',
    checkoutNamePlaceholder: 'Ex.: Ana Paula',
    checkoutPhone: 'Seu WhatsApp',
    checkoutPhonePlaceholder: '(11) 99999-9999',
    checkoutPhoneHint: 'É por aqui que o restaurante avisa quando o pedido sair para entrega.',
    checkoutItems: 'Seu pedido',
    checkoutPayment: 'Como você vai pagar?',
    payments: [
      { value: 'pix', label: 'PIX', iconName: 'pix' },
      { value: 'dinheiro', label: 'Dinheiro', iconName: 'cash' },
      { value: 'cartao', label: 'Cartão na entrega', iconName: 'card' },
    ],
    changeLabel: 'Precisa de troco para quanto?',
    changePlaceholder: 'Ex.: 100',
    locationTitle: 'Onde entregamos?',
    locationButton: 'Usar minha localização agora',
    locationLoading: 'Localizando...',
    locationDone: 'Localização capturada',
    /* Texto pedido pelo dono do produto — manter literalmente. */
    manualToggle: 'Não consigo compartilhar ou quero pedir para outro endereço',
    manualCity: 'Cidade',
    manualDistrict: 'Bairro',
    manualStreet: 'Rua',
    manualNumber: 'Número',
    manualReference: 'Observações ou referências',
    manualReferencePlaceholder: 'Ex.: depois do restaurante do Zé vire à direita, vá na segunda esquerda, portão azul',
    manualReferenceHint: 'Vale ouro: escreva como se chega. "Depois da padaria vire à direita, casa de portão azul" faz o entregador achar de primeira.',
    checkoutSubmit: 'Enviar pedido',
    checkoutSuccess: 'Pedido enviado! Ele já caiu na fila do entregador.',
    checkoutSeeDelivery: 'Ver na aba do entregador',

    /* ---- Categorias (cliente e equipe) ---- */
    categoriesTitle: 'Categorias',
    categoriesHint: 'Toque em uma categoria para ver os itens',
    categoryBack: 'Todas as categorias',
    categoryEmpty: 'Nenhum produto nesta categoria ainda.',
    categoryCount: (n: number) => `${n} ${n === 1 ? 'item' : 'itens'}`,
    featuredTitle: 'Destaques',
    uncategorized: 'Sem categoria',

    /* ---- Equipe: retirada, mesas e caixa ---- */
    teamTabs: {
      service: 'Atendimento',
      cash: 'Caixa',
    },
    takeoutTitle: 'Retirada no balcão',
    takeoutHint: 'Anote o nome do cliente e monte o pedido. O card funciona igual a uma mesa.',
    takeoutNameLabel: 'Nome do cliente',
    takeoutNamePlaceholder: 'Ex.: Ana Paula',
    takeoutPhoneLabel: 'WhatsApp (opcional)',
    takeoutCreate: 'Abrir retirada',
    takeoutEmpty: 'Nenhuma retirada aberta agora.',
    takeoutBadge: 'Retirada',
    tablesTitle: 'Mapa de mesas',
    statusManualLabel: 'Mudar status',
    cancelOrder: 'Cancelar pedido',
    cancelOrderConfirm: 'Cancelar este pedido? Os itens lançados serão perdidos.',
    orderCanceled: 'Pedido cancelado.',
    choosePayment: 'Como o cliente pagou?',

    /* ---- Fechamento de caixa ---- */
    cashTitle: 'Caixa do turno',
    cashHint: 'Confira os pagamentos, receba o dinheiro dos entregadores e feche o caixa.',
    cashEmpty: 'Nenhum lançamento no período escolhido.',
    cashFilterPayment: 'Pagamento',
    cashFilterSource: 'Origem',
    cashFilterPeriod: 'Período',
    cashFilterAll: 'Todos',
    cashPeriods: [
      { value: '2h', label: 'Últimas 2 horas' },
      { value: '6h', label: 'Últimas 6 horas' },
      { value: '24h', label: 'Últimas 24 horas' },
      { value: 'hoje', label: 'Somente hoje' },
      { value: 'tudo', label: 'Tudo' },
    ],
    cashSources: [
      { value: 'mesa', label: 'Mesa' },
      { value: 'retirada', label: 'Retirada' },
      { value: 'delivery', label: 'Delivery' },
    ],
    cashPayments: [
      { value: 'pix', label: 'PIX' },
      { value: 'cartao', label: 'Cartão' },
      { value: 'dinheiro', label: 'Dinheiro' },
    ],
    cashOrderStatus: { feito: 'Pedido feito', cancelado: 'Cancelado' },
    cashPaymentStatus: { pendente: 'Pagamento pendente', concluido: 'Pagamento concluído' },
    cashMarkPaid: 'Confirmar pagamento',
    cashTotals: 'Totais do período',
    cashTotalGeneral: 'Total recebido',
    cashTotalOrders: 'Valor dos pedidos',
    cashTotalDelivery: 'Taxas de entrega',
    cashTotalPending: 'Ainda a receber',
    cashCourierNote: 'O entregador recebe por entrega: esse valor é acertado com ele no fechamento.',
    cashClose: 'Fechar caixa',
    cashClosed: (total: string) => `Caixa fechado com ${total} conferidos.`,
    cashPixNote: 'PIX é confirmado pelo comprovante no WhatsApp.',

    /* ---- Aba do entregador ---- */
    deliveryTabs: {
      pending: 'Em andamento',
      done: 'Concluídas',
    },
    deliverySearchPlaceholder: 'Buscar por nome, telefone, código, item ou endereço',
    deliverySearchEmpty: 'Nenhuma entrega encontrada para essa busca.',
    deliveryPendingEmpty: 'Nenhuma entrega em andamento agora.',
    deliveryDoneEmpty: 'Nenhuma entrega concluída ainda.',
    deliveryTitle: 'Entregas de hoje',
    deliveryEmpty: 'Nenhuma entrega na fila. Faça um pedido na aba do cliente para ver aparecer aqui.',
    deliveryStatus: {
      novo: 'Novo',
      aceito: 'Aceito',
      a_caminho: 'A caminho',
      entregue: 'Entregue',
    },
    deliveryActions: {
      novo: 'Aceitar entrega',
      aceito: 'Saí para entrega',
      a_caminho: 'Marcar como entregue',
      entregue: 'Entrega concluída',
    },
    deliveryMaps: 'Abrir no Google Maps',
    deliveryCall: 'Chamar no WhatsApp',
    deliveryGps: 'Localização em tempo real',
    deliveryReference: 'Referência',
    deliveryChange: 'Levar troco para',
    deliveryPaid: 'Já pago no PIX',
  },
  /** Entrega de exemplo que já vem na fila do entregador durante a demonstração. */
  sampleDelivery: {
    code: '1039',
    customerName: 'Carlos Menezes',
    phone: '(11) 97766-5544',
    items: [{ name: 'Pedido do dia', price: 46.5 }],
    total: 46.5,
    payments: [{ method: 'pix' as const, amount: 46.5 }],
    address: {
      mode: 'gps' as const,
      lat: -23.5629,
      lng: -46.6544,
      reference: 'Prédio comercial, falar com a portaria e pedir o 12º andar.',
    },
    status: 'aceito' as const,
    timeLabel: 'há 8 min',
    distanceLabel: '900 m',
  },
  success: {
    title: 'Pronto. Seu sistema está no ar.',
    text: 'Esse é o código do seu restaurante. Sua equipe baixa o app Vapt Parceiro e digita exatamente esse código para entrar.',
    copyLabel: 'Copiar código',
    copied: 'Código copiado!',
    ctaPrimary: 'Quero colocar para vender',
    ctaSecondary: 'Chamar o suporte no WhatsApp',
    reset: 'Montar outro',
  },
  offlineNotice:
    'Não conseguimos falar com o servidor agora, mas o seu teste continua aqui na tela. Chame a gente no WhatsApp que finalizamos juntos.',
};

/* ------------------------------------------------------------------ */
/* 4. SUPORTE HUMANIZADO                                               */
/* ------------------------------------------------------------------ */
export const support = {
  eyebrow: 'Gente de verdade, no seu WhatsApp',
  title: 'Você não monta isso sozinho.',
  subtitle:
    'Você foca na operação, a gente foca no sistema. Um humano te acompanha no WhatsApp do primeiro clique até o primeiro pedido sair.',
  paragraphs: [
    'Sem protocolo, sem fila, sem "digite 1 para voltar ao menu". É a mesma pessoa do começo ao fim, que te chama pelo nome e manda áudio, print ou chamada de vídeo se precisar.',
    'Se preferir, você nem monta: mande a foto do cardápio impresso ou o print do outro aplicativo que a gente cadastra tudo. Você só confere e aprova.',
  ],
  pillars: [
    { icon: '💬', title: 'Montagem acompanhada', text: 'Mesmo número, mesma pessoa, até o sistema estar rodando.' },
    { icon: '📸', title: 'Fotos por nossa conta', text: 'Manda como está. A gente recorta, ajusta e organiza por categoria.' },
    { icon: '🧾', title: 'Cardápio cadastrado', text: 'Impresso, planilha ou print: transcrevemos item por item, com adicionais.' },
    { icon: '💳', title: 'Pagamentos alinhados', text: 'PIX, maquininha e vale configurados junto, com uma venda de teste antes de abrir.' },
    { icon: '👥', title: 'Equipe treinada', text: 'Chamada com garçons e caixa mostrando o app. Dura menos que uma passagem de turno.' },
    { icon: '🛟', title: 'Suporte no aperto', text: 'Sexta, 20h, casa cheia: respondemos no WhatsApp, de segunda a sábado, das 8h às 22h.' },
  ],
  noRobots: {
    title: 'O que você NÃO vai encontrar aqui',
    items: [
      'Robô repetindo "não entendi, pode reformular?"',
      'Resposta por e-mail em 3 dias úteis',
      'Central de ajuda cheia de artigo que não resolve',
      'Cobrança extra para configurar o que você já pagou',
    ],
  },
  /* CTA no lugar do formulário: leva direto para a conversa real. */
  chatCta: 'Começar conversa agora',
  chatCtaHint: 'Segunda a sábado, das 8h às 22h. Responde uma pessoa, não um robô.',
};

/* ------------------------------------------------------------------ */
/* 5. PLANOS E PREÇOS                                                  */
/* ------------------------------------------------------------------ */
export const pricing = {
  eyebrow: 'Planos e preços',
  title: 'Preço fixo. Nunca uma fatia do seu faturamento.',
  subtitle:
    'Vender R$ 10 mil ou R$ 100 mil não muda a mensalidade. Todo plano inclui montagem acompanhada, suporte humano e o app para a equipe inteira, sem limite de funcionários.',
  monthlyLabel: 'Mensal',
  annualLabel: 'Anual',
  annualBadge: 'economize até 22%',
  perMonth: '/mês',
  annualNote: 'cobrado anualmente',
  includedTitle: 'Incluído em todos os planos',
  included: [
    'Montagem acompanhada por uma pessoa no WhatsApp',
    'App Vapt Parceiro para funcionários ilimitados',
    'Atualizações e novos recursos sem custo extra',
    'Sem fidelidade, sem multa e sem taxa de instalação',
    '7 dias de teste grátis com tudo liberado',
  ],
  guarantee: {
    title: 'Garantia de 7 dias',
    text: 'Teste com a sua operação real. Se não for para você, devolvemos 100% do valor — sem formulário e sem ninguém tentando te convencer do contrário.',
  },
  calculator: {
    title: 'Quanto os aplicativos levam do seu bolso?',
    subtitle: 'Arraste o seu faturamento de delivery e compare.',
    revenueLabel: 'Faturamento mensal em delivery',
    commissionLabel: 'Comissão dos aplicativos (23%)',
    vaptappLabel: 'Vapt — Plano Completo',
    savingsLabel: 'Você deixa de perder por mês',
    yearLabel: 'Em um ano:',
    footnote: 'Percentual médio de mercado, usado como referência. Sua taxa real varia conforme o contrato do aplicativo.',
    cta: 'Quero parar de pagar comissão',
  },
  ctaFootnote: 'Mais de uma unidade ou algo específico? A gente monta um plano com você.',
};

/* ------------------------------------------------------------------ */
/* FAQ + CTA FINAL + RODAPÉ                                            */
/* ------------------------------------------------------------------ */
export const faq = {
  eyebrow: 'Dúvidas honestas',
  title: 'O que todo dono pergunta antes de começar',
  items: [
    {
      q: 'Preciso publicar um aplicativo na Play Store ou na App Store?',
      a: 'Não. O app já está publicado por nós: Vapt Parceiro. Sua equipe baixa, digita o código do seu restaurante e entra direto na sua operação. Sem conta de desenvolvedor, sem revisão de loja, sem espera.',
    },
    {
      q: 'O que é o "código do restaurante"?',
      a: 'É um código único gerado quando o seu site fica pronto (ex.: FW-8K2M4). Funciona como a chave da sua casa dentro do app: quem tem o código entra, quem não tem, não entra. Contratou alguém? Passe o código. A pessoa saiu? Você revoga o acesso pelo painel, em um toque.',
    },
    {
      q: 'Serve para bar, com mesa e comanda?',
      a: 'Serve. Você desenha o salão no sistema (mesas, lugares e áreas como salão, varanda e balcão) e a equipe passa a abrir comanda tocando na mesa. Dá para dividir conta, aplicar os 10% e fechar o caixa no fim da noite. Bar, restaurante, lanchonete, pizzaria e cafeteria usam o mesmo app.',
    },
    {
      q: 'E se a internet cair no meio do rush?',
      a: 'O app avisa na hora que perdeu conexão e não deixa você lançar no escuro. Assim que a internet volta, a comanda continua de onde parou — os dados ficam na nuvem, não no celular. Se o aparelho quebrar, é só entrar em outro com o mesmo código.',
    },
    {
      q: 'Eu não entendo nada de tecnologia. Consigo?',
      a: 'Consegue, e não vai fazer sozinho. Montar aqui é parecido com montar um perfil de rede social: sobe a foto, escreve o nome, coloca o preço. E tem uma pessoa do nosso time no WhatsApp acompanhando. Se preferir, mande a foto do cardápio impresso que a gente cadastra tudo.',
    },
    {
      q: 'Como o pedido do delivery chega para mim?',
      a: 'Do jeito que você preferir: formatado no WhatsApp do restaurante (itens, adicionais, endereço e troco) ou no seu painel, com aviso sonoro. Muita gente usa os dois no começo, até se acostumar.',
    },
    {
      q: 'Preciso comprar computador, impressora ou maquininha?',
      a: 'Não para começar. Roda no celular Android ou iPhone que a sua equipe já tem. Impressora térmica na cozinha e maquininha são opcionais e entram depois, quando você quiser.',
    },
    {
      q: 'O dinheiro das vendas passa por vocês?',
      a: 'Não. PIX na sua conta, maquininha na sua mão, dinheiro no seu caixa. Cobramos só a mensalidade do sistema. Nenhum centavo da sua venda passa pelo Vapt.',
    },
    {
      q: 'Tem fidelidade ou multa?',
      a: 'Não. Cancela quando quiser, pelo painel ou pelo WhatsApp, sem multa e sem ligação de retenção. Nos primeiros 7 dias você ainda tem devolução integral.',
    },
  ],
};

export const finalCta = {
  title: 'Seu cardápio pode estar no ar antes do próximo almoço.',
  subtitle: 'Comece grátis, monte do seu jeito e leve a equipe junto. Travou? Chama que tem gente esperando para ajudar.',
  ctaPrimary: 'Monte seu Cardápio Grátis Agora',
  ctaSecondary: 'Prefiro falar com uma pessoa',
  microCopy: 'Grátis para montar • Sem cartão • Cancelamento em um clique',
};

export const footer = {
  description:
    'O Vapt é a plataforma onde o comércio monta o próprio delivery e opera o salão pelo celular — preço fixo, sem comissão e com suporte de gente de verdade.',
  columns: [
    {
      title: 'Produto',
      links: [
        { label: 'Delivery próprio', href: '#funcionalidades' },
        { label: 'Mesas e caixa', href: '#funcionalidades' },
        { label: 'App da equipe', href: '#funcionalidades' },
        { label: 'Testar agora', href: '#demonstracao' },
        { label: 'Planos e preços', href: '#planos' },
      ],
    },
    {
      title: 'Ajuda',
      links: [
        { label: 'Suporte humanizado', href: '#suporte' },
        { label: 'Perguntas frequentes', href: '#faq' },
        { label: 'Central de ajuda', href: '#suporte' },
        { label: 'Status do sistema', href: '#suporte' },
      ],
    },
    {
      title: 'Empresa',
      links: [
        { label: 'Sobre o Vapt', href: '#funcionalidades' },
        { label: 'Termos de uso', href: '#faq' },
        { label: 'Política de privacidade', href: '#faq' },
        { label: 'Seja parceiro', href: '#suporte' },
      ],
    },
  ],
  addressLines: ['Av. Exemplo, 1234 — Sala 56', 'Pinheiros, São Paulo/SP — 05000-000'],
  legal: 'Dados fictícios para demonstração. Substituir pelas informações reais antes de publicar.',
};

/* ------------------------------------------------------------------ */
/* AUTENTICAÇÃO (telas /login e /register)                             */
/* ------------------------------------------------------------------ */
export const auth = {
  brandPitch: {
    title: 'Seu delivery e seu caixa, sem comissão.',
    text: 'Crie a conta, monte o seu aplicativo na tela e escolha o plano quando estiver pronto. A montagem tem acompanhamento de gente de verdade no WhatsApp.',
    bullets: [
      '0% de comissão sobre as suas vendas',
      'App da equipe com um código só',
      'Sem fidelidade e sem cartão para começar',
    ],
  },
  login: {
    title: 'Entrar na sua conta',
    subtitle: 'Use o seu e-mail ou nome de usuário.',
    identifierLabel: 'E-mail ou nome de usuário',
    identifierPlaceholder: 'voce@seunegocio.com.br',
    passwordLabel: 'Senha',
    passwordPlaceholder: 'Sua senha',
    submit: 'Entrar',
    submitting: 'Entrando...',
    switchText: 'Ainda não tem conta?',
    switchLink: 'Criar conta grátis',
    backToSite: 'Voltar para o site',
  },
  register: {
    title: 'Criar sua conta',
    subtitle: 'Leva menos de dois minutos. Sem cartão de crédito.',
    steps: ['Seus dados', 'Endereço', 'Foto de perfil'],
    emailLabel: 'E-mail',
    emailPlaceholder: 'voce@seunegocio.com.br',
    usernameLabel: 'Nome de usuário',
    usernamePlaceholder: 'bardocais',
    usernameHint: 'Letras minúsculas, números, ponto, hífen e underline.',
    displayNameLabel: 'Nome do negócio',
    displayNamePlaceholder: 'Bar do Cais',
    phoneLabel: 'WhatsApp',
    phonePlaceholder: '(11) 99999-9999',
    passwordLabel: 'Senha',
    passwordPlaceholder: 'Mínimo de 8 caracteres',
    passwordConfirmLabel: 'Repita a senha',
    zipLabel: 'CEP',
    streetLabel: 'Rua',
    numberLabel: 'Número',
    complementLabel: 'Complemento',
    districtLabel: 'Bairro',
    cityLabel: 'Cidade',
    stateLabel: 'UF',
    referenceLabel: 'Ponto de referência (opcional)',
    photoLabel: 'Foto de perfil',
    photoHint: 'PNG ou JPG. Convertemos para WEBP automaticamente.',
    photoPick: 'Escolher foto',
    photoChange: 'Trocar foto',
    next: 'Continuar',
    back: 'Voltar',
    submit: 'Criar minha conta',
    submitting: 'Criando conta...',
    switchText: 'Já tem conta?',
    switchLink: 'Entrar',
    planNotice: (plan: string) => `Você escolheu o ${plan}. Crie a conta para continuar.`,
  },
  dashboard: {
    greeting: (name: string) => `Olá, ${name}`,
    subtitle: 'Este é o seu painel. Monte quantos aplicativos quiser antes de escolher um plano.',
    sectionTitle: 'Meus Aplicativos',
    createLabel: 'Criar aplicativo',
    emptyTitle: 'Você ainda não criou nenhum aplicativo',
    emptyText: 'Comece agora: escolha as cores, monte o cardápio e veja o resultado na tela, em tamanho real.',
    logout: 'Sair',
    soonTitle: 'Editor em construção',
    soonText:
      'A tela de customização do aplicativo é a próxima etapa do desenvolvimento. Sua conta já está criada e pronta.',
  },
};
