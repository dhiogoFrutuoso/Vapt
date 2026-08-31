import type { Plan } from '../lib/api';

/**
 * Espelho dos planos do banco.
 * Serve para a landing renderizar preco mesmo se a API estiver fora do ar.
 * Fonte da verdade: apps/api/src/seed/plans.data.ts
 */
export const fallbackPlans: Plan[] = [
  {
    slug: 'delivery',
    name: 'Plano Delivery',
    tagline: 'Para quem vende por WhatsApp e quer parar de pagar comissão.',
    monthlyPrice: 89,
    annualPrice: 69,
    currency: 'BRL',
    badge: null,
    highlighted: false,
    ctaLabel: 'Começar com o Delivery',
    features: [
      'Site de delivery próprio (seurestaurante.vaptapp.com.br)',
      'Cardápio digital ilimitado com fotos, categorias e adicionais',
      'Pedido cai direto no WhatsApp do restaurante, já formatado',
      'Painel de pedidos em tempo real (aceitar, preparar, sair para entrega)',
      'Link e QR Code do cardápio para bio, Instagram e mesa',
      'Taxa de entrega por bairro e pedido mínimo',
      'Cupons de desconto e frete grátis',
      'Relatório de vendas do dia, da semana e do mês',
      '0% de comissão sobre suas vendas',
    ],
    notIncluded: ['Controle de mesas e comandas', 'Fechamento de caixa'],
    comparison:
      'Vendendo R$ 30 mil/mês nos aplicativos, a comissão de ~23% consome R$ 6.900. Aqui você paga R$ 89.',
    order: 1,
  },
  {
    slug: 'salao-caixa',
    name: 'Plano Salão + Caixa',
    tagline: 'Para o restaurante que atende no local e quer organizar o atendimento.',
    monthlyPrice: 129,
    annualPrice: 99,
    currency: 'BRL',
    badge: null,
    highlighted: false,
    ctaLabel: 'Organizar meu salão',
    features: [
      'App VaptApp Parceiro para toda a equipe (Android e iPhone)',
      'Acesso da equipe só com o código do restaurante',
      'Mapa de mesas: livre, ocupada, aguardando pagamento',
      'Comanda por mesa, por cliente ou por ficha',
      'Pedido do garçom direto no celular, sem papel',
      'Divisão de conta, taxa de serviço (10%) e desconto por item',
      'Fechamento de caixa com sangria, suprimento e conferência',
      'Dinheiro, PIX, crédito, débito e vale',
      'Permissões por função: garçom, caixa, cozinha e gerente',
    ],
    notIncluded: ['Site de delivery próprio'],
    comparison:
      'Um PDV tradicional custa a partir de R$ 250/mês e ainda exige computador, impressora e instalação. Aqui roda no celular que sua equipe já tem.',
    order: 2,
  },
  {
    slug: 'completo',
    name: 'Plano Completo',
    tagline: 'Delivery + salão no mesmo lugar. O plano que a maioria escolhe.',
    monthlyPrice: 179,
    annualPrice: 139,
    currency: 'BRL',
    badge: 'Mais escolhido',
    highlighted: true,
    ctaLabel: 'Quero o Completo',
    features: [
      'Tudo do Plano Delivery + tudo do Plano Salão + Caixa',
      'Pedidos do delivery e do salão na mesma tela da cozinha',
      'Estoque simples com baixa automática por venda',
      'Cadastro de clientes e histórico de pedidos',
      'Relatórios por produto, garçom, forma de pagamento e horário',
      'Múltiplas unidades no mesmo painel',
      'Impressão automática na cozinha (impressora térmica opcional)',
      'Suporte prioritário no WhatsApp com pessoa dedicada',
      'Montagem completa feita pelo nosso time, sem custo extra',
    ],
    notIncluded: [],
    comparison:
      'Delivery + PDV + suporte por R$ 179. Menos do que a comissão de um único dia movimentado nos aplicativos de entrega.',
    order: 3,
  },
];
