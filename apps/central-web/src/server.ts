import express, { Request, Response } from 'express';
import cors from 'cors';
import { db } from './database.js';
import { FiscalEngineService } from '@totem-pdv/fiscal-engine';
import { CashMovement, Order, OrderPayment, OrderStatus, Shift } from '@totem-pdv/shared-types';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const fiscalService = new FiscalEngineService(db.fiscalConfig);

// ==========================================
// 1. ROTAS DE PRODUTOS & CARDÁPIO
// ==========================================

app.get('/api/categories', (req: Request, res: Response) => {
  res.json(db.categories.filter((c) => c.active).sort((a, b) => a.order - b.order));
});

app.get('/api/products', (req: Request, res: Response) => {
  const { categoryId, activeOnly, kioskOnly } = req.query;
  let items = db.products;

  if (activeOnly === 'true') items = items.filter((p) => p.active);
  if (kioskOnly === 'true') items = items.filter((p) => p.availableInKiosk && p.active);
  if (categoryId) items = items.filter((p) => p.categoryId === categoryId);

  res.json(items);
});

app.patch('/api/products/:id/toggle', (req: Request, res: Response) => {
  const product = db.products.find((p) => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Produto não encontrado' });

  product.active = !product.active;
  product.updatedAt = new Date().toISOString();
  res.json({ success: true, active: product.active });
});

// ==========================================
// 2. ROTAS DE PEDIDOS & KDS (COZINHA)
// ==========================================

app.get('/api/orders/kds', (req: Request, res: Response) => {
  const activeOrders = db.orders
    .filter((o) => ['RECEIVED', 'PREPARING', 'READY'].includes(o.status))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  res.json(activeOrders);
});

app.get('/api/orders', (req: Request, res: Response) => {
  res.json(db.orders.slice().reverse());
});

app.patch('/api/orders/:id/status', (req: Request, res: Response) => {
  const { status } = req.body as { status: OrderStatus };
  const order = db.orders.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

  order.status = status;
  order.updatedAt = new Date().toISOString();
  res.json(order);
});

app.post('/api/orders', async (req: Request, res: Response) => {
  const { items, payments, clientCpf, origin = 'TOTEM', kioskId } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Pedido deve conter itens' });
  }

  const subtotal = items.reduce((acc: number, item: any) => acc + item.totalPrice, 0);
  const total = subtotal; // Sem cupom de desconto no momento

  const ticketNumber = db.nextTicketSequence.toString().padStart(3, '0');
  db.nextTicketSequence += 1;

  const currentShift = db.shifts.find((s) => s.status === 'OPEN') || db.shifts[0];

  const newOrder: Order = {
    id: `ord-${Date.now()}`,
    publicTicketNumber: ticketNumber,
    origin,
    kioskId,
    shiftId: currentShift.id,
    status: 'RECEIVED',
    items,
    subtotal,
    discount: 0,
    total,
    payments: payments || [],
    clientCpf,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Se o pagamento for em dinheiro no PDV assistido, registra movimento de caixa
  const cashPay = payments?.find((p: OrderPayment) => p.method === 'CASH');
  if (cashPay && currentShift) {
    currentShift.finalCalculatedCash += cashPay.amount;
    currentShift.movements.push({
      id: `mov-${Date.now()}`,
      shiftId: currentShift.id,
      type: 'ORDER_PAYMENT',
      amount: cashPay.amount,
      description: `Venda #${ticketNumber} - Dinheiro`,
      operatorId: currentShift.operatorId,
      operatorName: currentShift.operatorName,
      createdAt: new Date().toISOString()
    });
  }

  // Emissão fiscal da NFC-e via Motor Fiscal
  try {
    const invoice = await fiscalService.emitNFCe(newOrder);
    newOrder.nfceKey = invoice.chaveAcesso;
    newOrder.nfceStatus = invoice.status === 'CONTINGENCY_PENDING' ? 'CONTINGENCY' : 'AUTHORIZED';
    newOrder.nfceXmlUrl = `/api/fiscal/xml/${invoice.id}`;
  } catch (err) {
    console.error('Falha ao emitir NFC-e:', err);
    newOrder.nfceStatus = 'CONTINGENCY';
  }

  db.orders.push(newOrder);
  res.status(201).json(newOrder);
});

// ==========================================
// 3. ROTAS DE CAIXA, TURNOS, SANGRIA E SUPRIMENTO
// ==========================================

app.get('/api/shifts/current', (req: Request, res: Response) => {
  const currentShift = db.shifts.find((s) => s.status === 'OPEN');
  if (!currentShift) return res.json({ open: false });

  // Recalcular totais com base nos pedidos pagos deste turno
  const shiftOrders = db.orders.filter((o) => o.shiftId === currentShift.id);
  let totalCash = currentShift.initialCash;
  let totalCredit = 0;
  let totalDebit = 0;
  let totalPix = 0;

  for (const o of shiftOrders) {
    for (const p of o.payments) {
      if (p.status === 'APPROVED') {
        if (p.method === 'CASH') totalCash += p.amount;
        if (p.method === 'CREDIT_CARD') totalCredit += p.amount;
        if (p.method === 'DEBIT_CARD') totalDebit += p.amount;
        if (p.method === 'PIX') totalPix += p.amount;
      }
    }
  }

  // Descontar sangrias e somar suprimentos
  for (const m of currentShift.movements) {
    if (m.type === 'BLEED_SANGRIA') totalCash -= m.amount;
    if (m.type === 'SUPPLY') totalCash += m.amount;
  }

  currentShift.finalCalculatedCash = totalCash;
  currentShift.reconciliation = [
    { method: 'CASH', systemCalculatedAmount: totalCash },
    { method: 'CREDIT_CARD', systemCalculatedAmount: totalCredit },
    { method: 'DEBIT_CARD', systemCalculatedAmount: totalDebit },
    { method: 'PIX', systemCalculatedAmount: totalPix }
  ];

  res.json({ open: true, shift: currentShift });
});

app.post('/api/shifts/open', (req: Request, res: Response) => {
  const { terminalId, initialCash, operatorName } = req.body;
  const existingOpen = db.shifts.find((s) => s.status === 'OPEN' && s.terminalId === terminalId);
  if (existingOpen) return res.status(400).json({ error: 'Já existe um turno aberto para este terminal' });

  const newShift: Shift = {
    id: `shift-${Date.now()}`,
    terminalId: terminalId || 'CAIXA-01',
    terminalType: 'PDV',
    operatorId: 'user-op',
    operatorName: operatorName || 'Operador Padrão',
    status: 'OPEN',
    openedAt: new Date().toISOString(),
    initialCash: Number(initialCash) || 0,
    finalCalculatedCash: Number(initialCash) || 0,
    movements: [
      {
        id: `mov-${Date.now()}`,
        shiftId: `shift-${Date.now()}`,
        type: 'INITIAL_SUPPLY',
        amount: Number(initialCash) || 0,
        description: 'Abertura de Caixa (Fundo Inicial)',
        operatorId: 'user-op',
        operatorName: operatorName || 'Operador Padrão',
        createdAt: new Date().toISOString()
      }
    ],
    reconciliation: []
  };

  db.shifts.unshift(newShift);
  res.status(201).json(newShift);
});

app.post('/api/shifts/movement', (req: Request, res: Response) => {
  const { type, amount, description } = req.body; // 'SUPPLY' ou 'BLEED_SANGRIA'
  const currentShift = db.shifts.find((s) => s.status === 'OPEN');
  if (!currentShift) return res.status(400).json({ error: 'Nenhum turno aberto' });

  const mov: CashMovement = {
    id: `mov-${Date.now()}`,
    shiftId: currentShift.id,
    type,
    amount: Number(amount),
    description,
    operatorId: currentShift.operatorId,
    operatorName: currentShift.operatorName,
    createdAt: new Date().toISOString()
  };

  currentShift.movements.push(mov);
  res.json(mov);
});

app.post('/api/shifts/close', (req: Request, res: Response) => {
  const { declaredCash, declaredCredit, declaredDebit, declaredPix } = req.body;
  const currentShift = db.shifts.find((s) => s.status === 'OPEN');
  if (!currentShift) return res.status(400).json({ error: 'Nenhum turno aberto' });

  currentShift.status = 'CLOSED';
  currentShift.closedAt = new Date().toISOString();
  currentShift.finalDeclaredCash = Number(declaredCash);
  currentShift.cashDifference = (currentShift.finalDeclaredCash || 0) - currentShift.finalCalculatedCash;

  res.json(currentShift);
});

// ==========================================
// 4. ROTAS DE TOTENS & STATUS
// ==========================================

app.get('/api/totems', (req: Request, res: Response) => {
  res.json(db.totems);
});

app.post('/api/totems/:id/heartbeat', (req: Request, res: Response) => {
  const totem = db.totems.find((t) => t.id === req.params.id);
  if (totem) {
    totem.lastHeartbeatAt = new Date().toISOString();
    totem.status = 'ONLINE';
    if (req.body.printerStatus) totem.printerStatus = req.body.printerStatus;
    if (req.body.pinpadStatus) totem.pinpadStatus = req.body.pinpadStatus;
  }
  res.json({ success: true, timestamp: new Date().toISOString() });
});

// ==========================================
// 5. INTERFACE WEB CENTRAL (DASHBOARD COMPLETO)
// ==========================================

app.get('/', (req: Request, res: Response) => {
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Central Web - Burger Tech Totem & PDV</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0f172a;
      --card: #1e293b;
      --card-border: #334155;
      --primary: #f59e0b;
      --primary-hover: #d97706;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --info: #3b82f6;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      min-height: 100vh;
    }
    aside {
      width: 260px;
      background: #090d16;
      border-right: 1px solid var(--card-border);
      padding: 24px 16px;
      display: flex;
      flex-direction: column;
      gap: 32px;
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 800;
      font-size: 1.15rem;
      color: var(--primary);
    }
    .nav-links {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .nav-btn {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      border-radius: 8px;
      background: transparent;
      color: var(--text-muted);
      border: none;
      cursor: pointer;
      font-weight: 600;
      font-size: 0.95rem;
      text-align: left;
      transition: all 0.2s;
    }
    .nav-btn.active, .nav-btn:hover {
      background: var(--card);
      color: #fff;
    }
    main {
      flex: 1;
      padding: 32px;
      overflow-y: auto;
    }
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 28px;
    }
    .header-title h1 { font-size: 1.7rem; font-weight: 800; }
    .header-title p { color: var(--text-muted); font-size: 0.9rem; margin-top: 4px; }
    .badge {
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 0.8rem;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .badge-success { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
    .badge-warning { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
    .badge-info { background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }
    .grid { display: grid; gap: 20px; }
    .grid-4 { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .grid-2 { grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); }
    .card {
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 20px;
    }
    .card-title {
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 8px;
      font-weight: 700;
    }
    .card-value {
      font-size: 1.8rem;
      font-weight: 800;
      color: #fff;
    }
    .table-container {
      margin-top: 24px;
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      overflow: hidden;
    }
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th {
      background: #151f30;
      padding: 14px 18px;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      border-bottom: 1px solid var(--card-border);
    }
    td {
      padding: 14px 18px;
      border-bottom: 1px solid #243248;
      font-size: 0.95rem;
    }
    .btn {
      padding: 10px 16px;
      border-radius: 8px;
      border: none;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 0.9rem;
      transition: all 0.2s;
    }
    .btn-primary { background: var(--primary); color: #000; }
    .btn-primary:hover { background: var(--primary-hover); }
    .btn-outline { background: transparent; border: 1px solid var(--card-border); color: #fff; }
    .btn-outline:hover { background: #26354a; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .dot-online { background: #10b981; box-shadow: 0 0 10px #10b981; }
  </style>
</head>
<body>
  <aside>
    <div class="logo">
      🍔 <span>BURGER TECH</span>
    </div>
    <div class="nav-links">
      <button class="nav-btn active">📊 Visão Geral & Caixa</button>
      <button class="nav-btn">👨‍🍳 KDS Cozinha</button>
      <button class="nav-btn">🍔 Cardápio & Preços</button>
      <button class="nav-btn">🖥️ Totens Conectados</button>
      <button class="nav-btn">🧾 Notas Fiscais (NFC-e)</button>
    </div>
  </aside>

  <main>
    <div class="header-bar">
      <div class="header-title">
        <h1>Painel de Controle Central</h1>
        <p>Monitoramento em tempo real de Caixas, Totens e Pedidos</p>
      </div>
      <div>
        <span class="badge badge-success"><span class="status-dot dot-online"></span> Central Online</span>
        <span class="badge badge-info">SEFAZ Produção Ativa</span>
      </div>
    </div>

    <div class="grid grid-4">
      <div class="card">
        <div class="card-title">Turno Atual (Caixa)</div>
        <div class="card-value" id="cash-value">R$ 150,00</div>
        <p style="color:#94a3b8; font-size:0.8rem; margin-top:6px;">Terminal: CAIXA-BALCAO-01</p>
      </div>
      <div class="card">
        <div class="card-title">Fila de Produção</div>
        <div class="card-value" id="kds-count">2 Pedidos</div>
        <p style="color:#f59e0b; font-size:0.8rem; margin-top:6px;">Em preparo agora</p>
      </div>
      <div class="card">
        <div class="card-title">Totens em Operação</div>
        <div class="card-value">2 / 2</div>
        <p style="color:#10b981; font-size:0.8rem; margin-top:6px;">100% de disponibilidade</p>
      </div>
      <div class="card">
        <div class="card-title">NFC-e Emitidas Hoje</div>
        <div class="card-value">103</div>
        <p style="color:#10b981; font-size:0.8rem; margin-top:6px;">Série 1 · CSC Válido</p>
      </div>
    </div>

    <div class="table-container">
      <div style="padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--card-border);">
        <h3 style="font-size: 1.1rem; font-weight: 700;">Últimos Pedidos em Tempo Real</h3>
        <button class="btn btn-primary" onclick="loadData()">Atualizar Fila</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Senha</th>
            <th>Origem</th>
            <th>Itens</th>
            <th>Total</th>
            <th>Pagamento</th>
            <th>Status KDS</th>
            <th>NFC-e</th>
          </tr>
        </thead>
        <tbody id="orders-table">
          <tr><td colspan="7" style="text-align:center;">Carregando pedidos...</td></tr>
        </tbody>
      </table>
    </div>
  </main>

  <script>
    async function loadData() {
      try {
        const res = await fetch('/api/orders');
        const orders = await res.json();
        const tbody = document.getElementById('orders-table');
        tbody.innerHTML = '';

        orders.forEach(o => {
          const itemsSummary = o.items.map(i => i.quantity + 'x ' + i.productName).join(', ');
          const pay = o.payments[0] ? o.payments[0].method : 'PENDENTE';
          const badgeClass = o.status === 'READY' ? 'badge-success' : (o.status === 'PREPARING' ? 'badge-warning' : 'badge-info');

          tbody.innerHTML += \`
            <tr>
              <td><strong style="color:var(--primary); font-size:1.1rem;">#\${o.publicTicketNumber}</strong></td>
              <td><span class="badge badge-info">\${o.origin}</span></td>
              <td>\${itemsSummary}</td>
              <td><strong>R$ \${o.total.toFixed(2)}</strong></td>
              <td>\${pay}</td>
              <td><span class="badge \${badgeClass}">\${o.status}</span></td>
              <td><span class="badge badge-success">AUTORIZADA</span></td>
            </tr>
          \`;
        });
      } catch (err) {
        console.error(err);
      }
    }
    loadData();
    setInterval(loadData, 5000);
  </script>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`Central Web API rodando em http://localhost:${PORT}`);
});
