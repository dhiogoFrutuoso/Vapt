import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ClientOrderFlow, type DadosCheckout } from '../components/phone/ClientOrderFlow';
import { ServiceView } from '../components/phone/ServiceView';
import { CashRegister } from '../components/phone/CashRegister';
import { OrderSheet, type Ticket } from '../components/phone/OrderSheet';
import { DeliveryView } from '../components/phone/DeliveryView';
import { ReceptionView } from '../components/phone/ReceptionView';
import { KitchenView } from '../components/phone/KitchenView';
import { AdministrationView } from '../components/phone/AdministrationView';
import { deviceApi } from './deviceApi';
import { NO_STATION, sumItems, totalEntregue } from '../components/phone/types';
import type {
  CategoryItem,
  KitchenStatus,
  KitchenTicket,
  OrderItem,
  PaymentSplit,
  PreviewProduct,
  PreviewPromotion,
  PreviewTable,
  TableStatus,
  TakeoutOrder,
} from '../components/phone/types';
import type { PedidoImportado } from '../lib/parseWhatsappOrder';
import type { Comando, EstadoOperacao } from './useOperation';

/**
 * As seis áreas de operação, ligadas ao servidor.
 *
 * Os componentes visuais são os MESMOS do painel do dono — `ReceptionView`,
 * `KitchenView`, `CashRegister` e companhia não foram tocados. O que muda é
 * quem os alimenta: no painel era o estado em memória do simulador; aqui é o
 * documento de operação no MongoDB.
 *
 * O QUE FICA LOCAL, E O QUE VAI PARA O SERVIDOR
 * ---------------------------------------------
 * Vai para o servidor tudo que outra pessoa precisa ver: mesa aberta, item
 * lançado, pedido despachado, turno fechado.
 *
 * Fica local o que é da tela de quem está mexendo — o carrinho sendo montado,
 * qual mesa está aberta na frente deste garçom, o saguão filtrado na cozinha.
 * Mandar isso para o servidor faria o aparelho do colega abrir a mesa que
 * ESTE aqui acabou de tocar.
 */

type Props = {
  aba: 'cliente' | 'recepcao' | 'salao' | 'cozinha' | 'caixa' | 'entregador' | 'administracao';
  estado: EstadoOperacao;
  executar: (comando: Comando) => Promise<string | null>;
  /** Cardápio e configuração, vindos do aplicativo do dono. */
  products: PreviewProduct[];
  promotions: PreviewPromotion[];
  categories: CategoryItem[];
  stations: string[];
  storeName: string;
  logoUrl: string | null;
  brandColor: string;
  theme: 'claro' | 'escuro';
  deliveryFee: number;
  courierPaidPerDelivery: boolean;
  waiterCommissionRate: number;
  /** Troca de aba pedida por dentro (ex.: importar pedido leva ao Cliente). */
  onIrPara: (aba: Props['aba']) => void;
  /** Funcionário logado, para carimbar autoria e reatribuir entregas. */
  employeeId: string;
  /** Equipe, para o seletor de entregador. */
  equipe?: Array<{
    id: string;
    name: string;
    roleName: string;
    permissions: string[];
    isDeliveryman: boolean;
  }>;
  permissions: string[];
  isDeliveryman: boolean;
};

export function AppViews({
  aba,
  estado,
  executar,
  products,
  promotions,
  categories,
  stations,
  storeName,
  logoUrl,
  brandColor,
  theme,
  deliveryFee,
  courierPaidPerDelivery,
  waiterCommissionRate,
  onIrPara,
  employeeId,
  equipe = [],
  permissions,
  isDeliveryman,
}: Props) {
  /* ------------------------- Estado local da tela ------------------------- */

  const [cart, setCart] = useState<OrderItem[]>([]);
  const [openTableId, setOpenTableId] = useState<string | null>(null);
  const [openTakeoutId, setOpenTakeoutId] = useState<string | null>(null);
  const [activeStation, setActiveStation] = useState('todos');
  const [editandoPedidoId, setEditandoPedidoId] = useState<string | null>(null);
  const [rascunhoCliente, setRascunhoCliente] = useState<{
    name: string;
    phone: string;
    address: string | import('../components/phone/types').DeliveryAddress;
    notes: string;
    payments?: PaymentSplit;
    isDelivery?: boolean;
  } | null>(null);

  const openTable = useMemo(
    () => estado.tables.find((t) => t.id === openTableId) ?? null,
    [estado.tables, openTableId]
  );
  const openTakeout = useMemo(
    () => estado.takeouts.find((t) => t.id === openTakeoutId) ?? null,
    [estado.takeouts, openTakeoutId]
  );

  /**
   * Roda um comando e mostra o resultado.
   *
   * Todo erro vira `toast` em vez de subir: no meio de um turno, uma exceção
   * não tratada apagaria a tela do caixa. A mensagem do servidor é específica
   * ("este pedido já foi despachado") e vale mais que um "erro" genérico.
   */
  async function rodar(comando: Comando) {
    try {
      const mensagem = await executar(comando);
      if (mensagem) toast.success(mensagem);
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : 'Não foi possível concluir a ação.');
    }
  }

  /* ------------------------------- Cliente ------------------------------- */

  /**
   * Importação do WhatsApp: o texto lido vira carrinho.
   *
   * A quantidade é expandida em itens repetidos porque o carrinho é uma lista
   * simples, um item por unidade — o mesmo formato que o cliente produz
   * clicando duas vezes em "adicionar".
   */
  function importarPedido(pedido: PedidoImportado) {
    const itens: OrderItem[] = [];

    for (const item of pedido.items) {
      for (let i = 0; i < item.quantity; i += 1) {
        /* Casa com o cardápio para recuperar o saguão: sem isso o item cairia
           em "Sem saguão" na Cozinha e ninguém saberia quem prepara. */
        const doCardapio = products.find(
          (p) => p.name.trim().toLowerCase() === item.name.trim().toLowerCase()
        );
        itens.push({
          name: item.name,
          price: item.price > 0 ? item.price : (doCardapio?.price ?? 0),
          station: doCardapio?.station,
        });
      }
    }

    setCart(itens);
    setRascunhoCliente({
      name: pedido.customerName,
      phone: pedido.phone,
      address: pedido.address,
      notes: pedido.notes,
      /* Texto do WhatsApp com endereço = entrega; sem endereço = retirada. */
      isDelivery: Boolean(pedido.address?.trim()),
    });
    setEditandoPedidoId(null);
    onIrPara('cliente');
    toast.success(
      `${itens.length} ${itens.length === 1 ? 'item importado' : 'itens importados'}. Revise e confirme.`
    );
  }

  function editarPedido(id: string) {
    const pedido = estado.deliveries.find((d) => d.id === id);
    if (!pedido) return;

    setCart(pedido.items.map((item) => ({ ...item })));

    /*
     * O endereço volta preenchido, e EDITÁVEL.
     *
     * O caso real é o cliente ligando para acrescentar uma Coca-Cola. Obrigar
     * o recepcionista a pedir o CEP de novo, com o cliente na linha, é o tipo
     * de atrito que faz a equipe abandonar o sistema e voltar para o caderno.
     *
     * A observação também volta: ela costuma ser o "sem cebola" que a cozinha
     * já leu, e perdê-la na edição produziria o prato errado.
     */
    setRascunhoCliente({
      name: pedido.customerName,
      phone: pedido.phone ?? '',
      address: { ...pedido.address },
      notes: pedido.notes ?? '',
      payments: pedido.payments.map((payment) => ({ ...payment })),
      isDelivery: pedido.isDelivery !== false,
    });
    setEditandoPedidoId(id);
    onIrPara('cliente');
    toast(`Editando o pedido #${pedido.code}.`);
  }

  async function finalizarCheckout(data: DadosCheckout) {
    /*
     * MODO EDIÇÃO atualiza o pedido existente em vez de criar outro. Criar um
     * novo deixaria o antigo na fila, e a cozinha produziria os dois.
     */
    const comando: Comando = editandoPedidoId
      ? {
          tipo: 'pedido.atualizar',
          pedidoId: editandoPedidoId,
          customerName: data.customerName,
          phone: data.phone,
          items: cart,
          payments: data.payments,
          address: data.address,
          notes: data.notes,
          isDelivery: data.isDelivery,
        }
      : {
          tipo: 'pedido.criar',
          customerName: data.customerName,
          phone: data.phone,
          items: cart,
          payments: data.payments,
          address: data.address,
          notes: data.notes,
          isDelivery: data.isDelivery,
        };

    await rodar(comando);

    setCart([]);
    setEditandoPedidoId(null);
    setRascunhoCliente(null);
    onIrPara('recepcao');
  }

  /* ------------------------------- Recepção ------------------------------- */

  /**
   * Despachar: muda o status e deixa a mensagem pronta na área de transferência.
   *
   * O recepcionista despacha e cola no WhatsApp do cliente. Escrever a mesma
   * frase quarenta vezes por noite é onde o erro entra — troca de nome, taxa
   * errada, esquecer de avisar.
   *
   * A cópia acontece DEPOIS do comando dar certo. Copiar antes deixaria o
   * recepcionista colando "seu pedido saiu" de um despacho que o servidor
   * recusou por já ter sido feito por outra pessoa.
   *
   * A falha ao copiar não desfaz o despacho: navegador sem permissão de
   * clipboard é chato, mas o pedido JÁ saiu, e reverter por causa disso seria
   * pior. A tela avisa e segue.
   */
  async function despachar(id: string, fee: number, employeeId?: string) {
    const pedido = estado.deliveries.find((d) => d.id === id);
    try {
      await executar({ tipo: 'pedido.aceitar', pedidoId: id, fee, employeeId });
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : 'Não foi possível despachar.');
      return;
    }

    const nome = pedido?.customerName ?? 'cliente';
    const taxa = fee.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const mensagem =
      pedido?.isDelivery === false
        ? `Olá ${nome}, seu pedido está pronto para retirada no balcão! Pode vir buscar.`
        : `Olá ${nome}, seu pedido saiu para entrega! Taxa: ${taxa}. Previsão de chegada: 30 minutos.`;

    try {
      await navigator.clipboard.writeText(mensagem);
      toast.success('Despachado. Mensagem copiada — é só colar no WhatsApp.');
    } catch {
      toast.success('Pedido despachado.');
      toast('Não consegui copiar a mensagem: o navegador bloqueou a área de transferência.', {
        duration: 6000,
      });
    }
  }

  /* -------------------------------- Salão -------------------------------- */

  const ticket: Ticket | null = openTable
    ? {
        id: openTable.id,
        title: `Mesa ${openTable.label}`,
        status: openTable.status,
        items: openTable.items ?? [],
        serviceFeeRate: waiterCommissionRate,
      }
    : openTakeout
      ? {
          id: openTakeout.id,
          title: `Retirada #${openTakeout.label} · ${openTakeout.customerName}`,
          status: openTakeout.status,
          items: openTakeout.items,
          serviceFeeRate: 0,
        }
      : null;

  async function abrirMesa(mesa: PreviewTable) {
    setOpenTakeoutId(null);
    setOpenTableId(mesa.id);
    if (mesa.status === 'livre') await rodar({ tipo: 'mesa.abrir', mesaId: mesa.id });
  }

  async function adicionarItem(item: OrderItem) {
    if (openTable) await rodar({ tipo: 'mesa.item.adicionar', mesaId: openTable.id, item });
    else if (openTakeout)
      await rodar({ tipo: 'retirada.item.adicionar', retiradaId: openTakeout.id, item });
  }

  async function removerItem(indice: number) {
    if (openTable) await rodar({ tipo: 'mesa.item.remover', mesaId: openTable.id, indice });
    else if (openTakeout)
      await rodar({ tipo: 'retirada.item.remover', retiradaId: openTakeout.id, indice });
  }

  async function pedirPagamento() {
    if (openTable) await rodar({ tipo: 'mesa.status', mesaId: openTable.id, status: 'pagamento' });
    else if (openTakeout)
      await rodar({ tipo: 'retirada.status', retiradaId: openTakeout.id, status: 'pagamento' });
  }

  async function confirmarPagamento(payments: PaymentSplit) {
    if (!ticket) return;
    await rodar({
      tipo: 'comanda.pagar',
      alvo: openTable ? 'mesa' : 'retirada',
      alvoId: ticket.id,
      payments,
    });
    setOpenTableId(null);
    setOpenTakeoutId(null);
  }

  async function cancelarComanda() {
    if (!ticket) return;
    await rodar({
      tipo: 'comanda.cancelar',
      alvo: openTable ? 'mesa' : 'retirada',
      alvoId: ticket.id,
    });
    setOpenTableId(null);
    setOpenTakeoutId(null);
  }

  /* ------------------------------- Cozinha ------------------------------- */

  /**
   * A cozinha não tem estado próprio de pedidos: ela lê mesa, retirada e
   * delivery e monta a fila de produção. Assim nada precisa ser
   * sincronizado — o que existe no salão existe na cozinha.
   */
  const kitchenTickets = useMemo<KitchenTicket[]>(() => {
    const lista: KitchenTicket[] = [];

    for (const mesa of estado.tables) {
      const itens = mesa.items ?? [];
      if (mesa.status === 'livre' || itens.length === 0) continue;
      lista.push({
        id: `k-mesa-${mesa.id}`,
        origin: 'mesa',
        label: `Mesa ${mesa.label}`,
        customerName: `Mesa ${mesa.label}`,
        items: itens,
        createdAt: 0,
      });
    }

    for (const retirada of estado.takeouts) {
      if (retirada.items.length === 0) continue;
      lista.push({
        id: `k-retirada-${retirada.id}`,
        origin: 'retirada',
        label: `Retirada #${retirada.label}`,
        customerName: retirada.customerName,
        items: retirada.items,
        createdAt: retirada.createdAt,
      });
    }

    for (const pedido of estado.deliveries) {
      /* Entregue já saiu da cozinha; o resto ainda interessa à produção. */
      if (pedido.status === 'entregue' || pedido.items.length === 0) continue;
      lista.push({
        id: `k-delivery-${pedido.id}`,
        origin: 'delivery',
        label: `Entrega #${pedido.code}`,
        customerName: pedido.customerName,
        items: pedido.items,
        createdAt: 0,
      });
    }

    return lista;
  }, [estado.tables, estado.takeouts, estado.deliveries]);

  function statusDaCozinha(comandaId: string, saguao: string): KitchenStatus {
    return estado.kitchenStatus[`${comandaId}::${saguao}`] ?? 'recebido';
  }

  /* --------------------------------- Telas -------------------------------- */

  if (aba === 'cliente') {
    return (
      <ClientOrderFlow
        storeName={storeName}
        logoUrl={logoUrl}
        brandColor={brandColor}
        theme={theme}
        products={products}
        promotions={promotions}
        categories={categories}
        cart={cart}
        onCartChange={setCart}
        /* Só do lado de dentro: o cliente final não importa nada. */
        mostrarImportacao
        onImportar={importarPedido}
        editando={Boolean(editandoPedidoId)}
        onCancelarEdicao={() => {
          setEditandoPedidoId(null);
          setRascunhoCliente(null);
          setCart([]);
          onIrPara('recepcao');
        }}
        rotuloEnvio={editandoPedidoId ? 'Salvar alterações' : undefined}
        inicial={rascunhoCliente ?? undefined}
        onSubmit={finalizarCheckout}
      />
    );
  }

  if (aba === 'recepcao') {
    return (
      <>
        <ReceptionView
          deliveries={estado.deliveries}
          defaultFee={deliveryFee}
          deliveryPeople={equipe.filter((person) => person.isDeliveryman)}
          onEdit={editarPedido}
          onAccept={(id, fee, assignedId) => void despachar(id, fee, assignedId)}
          onReject={(id) => void rodar({ tipo: 'pedido.rejeitar', pedidoId: id })}
          onReassign={(id, assignedId) => void rodar({ tipo: 'pedido.entregador', pedidoId: id, employeeId: assignedId })}
          storeName={storeName}
        />
        <ServiceView
          tables={[]}
          takeouts={estado.takeouts}
          showTables={false}
          interactive
          flash={null}
          onOpenTable={() => {}}
          onOpenTakeout={(takeout) => {
            setOpenTableId(null);
            setOpenTakeoutId(takeout.id);
          }}
          onCreateTakeout={(name, phone) => void rodar({ tipo: 'retirada.criar', customerName: name, phone })}
          onSetTableStatus={() => {}}
          onSetTakeoutStatus={(id, status) => void rodar({ tipo: 'retirada.status', retiradaId: id, status })}
          onCancelTakeout={(id) => void rodar({ tipo: 'retirada.remover', retiradaId: id })}
        />
        {openTakeout && ticket && (
          <OrderSheet
            ticket={ticket}
            categories={categories}
            products={products}
            onAddItem={(item) => void adicionarItem(item)}
            onRemoveItem={(index) => void removerItem(index)}
            onRequestPayment={() => void pedirPagamento()}
            onConfirmPayment={(payments) => void confirmarPagamento(payments)}
            onCancelOrder={() => void cancelarComanda()}
            onDismiss={() => setOpenTakeoutId(null)}
          />
        )}
      </>
    );
  }

  if (aba === 'salao') {
    return (
      <>
        <ServiceView
          tables={estado.tables}
          takeouts={estado.takeouts}
          showTakeouts={false}
          interactive
          flash={null}
          onOpenTable={(mesa) => void abrirMesa(mesa)}
          onOpenTakeout={(retirada: TakeoutOrder) => {
            setOpenTableId(null);
            setOpenTakeoutId(retirada.id);
          }}
          onCreateTakeout={(nome, telefone) =>
            void rodar({ tipo: 'retirada.criar', customerName: nome, phone: telefone })
          }
          onSetTableStatus={(id: string, status: TableStatus) =>
            void rodar({ tipo: 'mesa.status', mesaId: id, status })
          }
          onSetTakeoutStatus={(id: string, status: TableStatus) =>
            void rodar({ tipo: 'retirada.status', retiradaId: id, status })
          }
          onCancelTakeout={(id: string) => {
            void rodar({ tipo: 'retirada.remover', retiradaId: id });
            if (openTakeoutId === id) setOpenTakeoutId(null);
          }}
        />

        {ticket && (
          <OrderSheet
            ticket={ticket}
            categories={categories}
            products={products}
            onAddItem={(item) => void adicionarItem(item)}
            onRemoveItem={(indice) => void removerItem(indice)}
            onRequestPayment={() => void pedirPagamento()}
            onConfirmPayment={(payments) => void confirmarPagamento(payments)}
            onCancelOrder={() => void cancelarComanda()}
            onDismiss={() => {
              setOpenTableId(null);
              setOpenTakeoutId(null);
            }}
          />
        )}
      </>
    );
  }

  if (aba === 'cozinha') {
    return (
      <KitchenView
        tickets={kitchenTickets}
        stations={stations}
        activeStation={activeStation}
        onChangeStation={setActiveStation}
        statusOf={statusDaCozinha}
        onSetStatus={(comandaId, saguoes, status) =>
          void rodar({
            tipo: 'cozinha.status',
            comandaId,
            /* Comanda sem saguão cadastrado cai no balde "Sem saguão", e ele
               também precisa de um nome para virar chave no servidor. */
            saguoes: saguoes.length > 0 ? saguoes : [NO_STATION],
            status,
          })
        }
        products={products}
        storeName={storeName}
        onToggleAvailability={(productId, available) => {
          void deviceApi.patch(`/device/menu/products/${productId}/availability`, { available })
            .then(() => toast.success(available ? 'Produto disponível.' : 'Produto pausado no cardápio.'))
            .catch((error) => toast.error(error instanceof Error ? error.message : 'Não foi possível alterar o produto.'));
        }}
      />
    );
  }

  if (aba === 'caixa') {
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <CashRegister
          entries={estado.cashEntries}
          archive={estado.cashArchive}
          courierPaidPerDelivery={courierPaidPerDelivery}
          onUpdatePayments={(id, payments) =>
            void rodar({ tipo: 'caixa.pagamento', lancamentoId: id, payments })
          }
          onEditEntry={permissions.includes('administracao')
            ? (id, data) => void rodar({ tipo: 'caixa.editar', lancamentoId: id, ...data })
            : undefined}
          onCancelEntry={(id, motivo) =>
            void rodar({ tipo: 'caixa.cancelar', lancamentoId: id, motivo })
          }
          movements={estado.cashMovements}
          onCashMovement={(movementType, amount, reason) =>
            void rodar({ tipo: 'caixa.movimento', movementType, amount, reason })
          }
          onCreditPayment={(id, amount) => void rodar({ tipo: 'fiado.abater', lancamentoId: id, amount })}
          onReopenEntry={permissions.includes('administracao')
            ? (id) => void rodar({ tipo: 'caixa.reabrir', lancamentoId: id })
            : undefined}
          onCloseRegister={(counted) => void rodar({ tipo: 'caixa.fechar', counted })}
        />
      </div>
    );
  }

  if (aba === 'administracao') {
    return <AdministrationView estado={estado} equipe={equipe} />;
  }

  /* ------------------------------ Entregador ------------------------------ */

  const placar = totalEntregue(estado.deliveries);
  const concluidas = estado.deliveries.filter((d) => d.status === 'entregue');

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <DeliveryView
          orders={estado.deliveries}
          interactive
          onAdvance={(id) => void rodar({ tipo: 'pedido.avancar', pedidoId: id })}
          onClaim={isDeliveryman
            ? (id) => void rodar({ tipo: 'pedido.aceitar', pedidoId: id, fee: deliveryFee, employeeId })
            : undefined}
          onRevert={(id) => void rodar({ tipo: 'pedido.voltar', pedidoId: id })}
          onCancel={(id) => void rodar({ tipo: 'pedido.cancelar', pedidoId: id })}
        />

        {/*
          Autoria das entregas concluídas.
          Fica FORA do DeliveryView de propósito: aquele componente também
          veste a simulação da landing, onde não existe equipe para atribuir.
        */}
        {concluidas.length > 0 && (
          <div className="deliv-autoria">
            <p className="deliv-autoria__titulo">Autoria das entregas</p>
            {concluidas.map((pedido) => (
              <div key={pedido.id} className="deliv-autoria__linha">
                <span className="deliv-autoria__pedido">#{pedido.code}</span>
                <select
                  value={pedido.deliveredById || employeeId}
                  onChange={(e) =>
                    void rodar({
                      tipo: 'pedido.entregador',
                      pedidoId: pedido.id,
                      employeeId: e.target.value,
                    })
                  }
                  aria-label={`Entregue por, pedido ${pedido.code}`}
                >
                  <option value="">— sem entregador —</option>
                  {/* O atual entra na lista mesmo se já saiu da equipe: sem
                      isto o select mostraria vazio e um toque distraído
                      apagaria a autoria de uma entrega antiga. */}
                  {!equipe.some((p) => p.id === pedido.deliveredById) && pedido.deliveredById && (
                    <option value={pedido.deliveredById}>
                      {pedido.deliveredByName || 'Funcionário removido'}
                    </option>
                  )}
                  {equipe.filter((pessoa) => pessoa.isDeliveryman).map((pessoa) => (
                    <option key={pessoa.id} value={pessoa.id}>
                      {pessoa.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Placar da noite, fixo no rodapé da aba. */}
      <div className="deliv-placar">
        <span>Total de entregas da noite</span>
        <strong>{placar.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
      </div>
    </div>
  );
}

/** Soma exportada para a casca mostrar contadores sem recalcular a regra. */
export { sumItems };
