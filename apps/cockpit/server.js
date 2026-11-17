import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5050;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory state for the Round Table Cockpit
const state = {
  agents: {
    antigravity: {
      id: 'antigravity',
      name: 'Antigravity',
      role: 'Orquestrador Geral & Maestro',
      model: 'Gemini Ecosystem',
      status: 'active', // 'active' | 'thinking' | 'idle'
      avatar: '🪐',
      color: '#3b82f6',
      badge: 'Líder da Mesa',
      lastAction: 'Coordenando implantação do Cockpit Visual'
    },
    claude: {
      id: 'claude',
      name: 'Claude Code',
      role: 'Arquiteto de Backend & API',
      model: 'Claude 3.7 / Opus 5.5',
      status: 'active',
      avatar: '🟣',
      color: '#a855f7',
      badge: 'Backend & Caixa',
      lastAction: 'API Central Web rodando em :4000'
    },
    codex: {
      id: 'codex',
      name: 'Codex',
      role: 'Engenheiro Kiosk & Flutter UI',
      model: 'ChatGPT Plus (GPT-6 Astra)',
      status: 'active',
      avatar: '🟢',
      color: '#10b981',
      badge: 'Totem Kiosk',
      lastAction: 'TotemKioskApp com análise 0 lint'
    },
    fiscal: {
      id: 'fiscal',
      name: 'Subagente Fiscal',
      role: 'Especialista SEFAZ & NFC-e',
      model: 'SEFAZ MOC 7.0 Engine',
      status: 'active',
      avatar: '📜',
      color: '#f59e0b',
      badge: 'NFC-e 4.00',
      lastAction: 'Geração de chave 44 dígitos e QR-Code v2'
    },
    tef: {
      id: 'tef',
      name: 'Subagente TEF',
      role: 'Protocolo Pinpad & 2PC',
      model: 'State Machine Driver',
      status: 'active',
      avatar: '💳',
      color: '#06b6d4',
      badge: 'TEF / Pinpad',
      lastAction: 'Two-Phase Commit com estorno de pendências'
    }
  },
  modules: [
    {
      id: 'central-web',
      name: 'Central Web & KDS API',
      path: 'apps/central-web',
      port: 4000,
      url: 'http://localhost:4000',
      status: 'online',
      description: 'API Node/Express de turnos de caixa, fila KDS para produção e dashboard administrativo.'
    },
    {
      id: 'totem_app',
      name: 'Totem Kiosk Touch App',
      path: 'apps/totem_app',
      status: 'ready',
      description: 'Aplicativo Flutter para autoatendimento com cardápio dinâmico, personalização e timer de 60s.'
    },
    {
      id: 'fiscal-engine',
      name: 'Motor Fiscal NFC-e',
      path: 'packages/fiscal-engine',
      status: 'ready',
      description: 'Cálculo de Módulo 11, emissão SEFAZ Mod 65, QR Code v2 com hash CSC e contingência offline.'
    },
    {
      id: 'tef-client',
      name: 'Driver TEF / Pinpad',
      path: 'packages/tef-client',
      status: 'ready',
      description: 'Máquina de estados de pagamentos TEF (Crédito, Débito, Pix) com Two-Phase Commit e estorno.'
    },
    {
      id: 'shared-types',
      name: 'Tipos Compartilhados',
      path: 'packages/shared-types',
      status: 'ready',
      description: 'Contratos e schemas TypeScript unificados para pedidos, produtos, turnos e notas fiscais.'
    }
  ],
  thoughts: [
    {
      id: 'th-1',
      agentId: 'antigravity',
      timestamp: new Date().toISOString(),
      thought: 'Inicializando o Cockpit Visual da Mesa Redonda na porta 5050. Objetivo: centralizar os pensamentos e o mapa mental do monorepo F:\\totem-pdv-central para o usuário acompanhar tudo em tempo real.',
      tag: 'Orquestração'
    },
    {
      id: 'th-2',
      agentId: 'claude',
      timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      thought: 'A integridade do caixa no sistema central está garantida: aberturas de turno registram suprimento inicial e a conferência de fechamento calcula eventuais quebras por forma de pagamento (Dinheiro, Cartão, Pix).',
      tag: 'Backend'
    },
    {
      id: 'th-3',
      agentId: 'codex',
      timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
      thought: 'Totem Kiosk estruturado em Flutter com cards táteis e fotos atrativas. Implementei timer de 60s de inatividade para limpar a sessão caso o cliente abandone o totem na tela de customização.',
      tag: 'Frontend'
    },
    {
      id: 'th-4',
      agentId: 'fiscal',
      timestamp: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
      thought: 'Emissão de NFC-e calibrada para o MOC 7.0. Se houver oscilação de rede na loja, o sistema comuta automaticamente para contingência offline (tpEmis=9), gerando QR Code v2 e gravando XMLs localmente.',
      tag: 'Fiscal'
    },
    {
      id: 'th-5',
      agentId: 'tef',
      timestamp: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
      thought: 'Fluxo Two-Phase Commit do Pinpad validado: nunca emitir NFC-e nem despachar pedido para o KDS antes da confirmação criptográfica (ACK) da adquirente.',
      tag: 'TEF'
    }
  ],
  tasks: [
    {
      id: 'task-1',
      title: 'Estruturação da Arquitetura Monorepo e Shared Types',
      assignedTo: 'antigravity',
      module: 'packages/shared-types',
      status: 'done',
      priority: 'high'
    },
    {
      id: 'task-2',
      title: 'Implementação do Motor Fiscal NFC-e (SEFAZ Mod 65 e QR-Code v2)',
      assignedTo: 'fiscal',
      module: 'packages/fiscal-engine',
      status: 'done',
      priority: 'high'
    },
    {
      id: 'task-3',
      title: 'Driver TEF Pinpad com Two-Phase Commit e Tratamento de Pendências',
      assignedTo: 'tef',
      module: 'packages/tef-client',
      status: 'done',
      priority: 'high'
    },
    {
      id: 'task-4',
      title: 'Servidor Central Web com Gestão de Turnos de Caixa e Fila KDS',
      assignedTo: 'claude',
      module: 'apps/central-web',
      status: 'done',
      priority: 'high'
    },
    {
      id: 'task-5',
      title: 'App Flutter Totem Kiosk com Cardápio, Modais e Inatividade 60s',
      assignedTo: 'codex',
      module: 'apps/totem_app',
      status: 'done',
      priority: 'high'
    },
    {
      id: 'task-6',
      title: 'Cockpit Visual Interativo em Tempo Real para a Mesa Redonda',
      assignedTo: 'antigravity',
      module: 'apps/cockpit',
      status: 'in_progress',
      priority: 'high'
    },
    {
      id: 'task-7',
      title: 'Persistência Offline em SQLite no Totem com Sincronização em Background',
      assignedTo: 'codex',
      module: 'apps/totem_app',
      status: 'backlog',
      priority: 'medium'
    },
    {
      id: 'task-8',
      title: 'Fluxo de Sangria, Suprimento e Fechamento Cego de Caixa no PDV',
      assignedTo: 'claude',
      module: 'apps/central-web',
      status: 'backlog',
      priority: 'medium'
    }
  ],
  gitLog: []
};

// SSE Subscribers
const sseClients = new Set();

function broadcastSSE(eventType, data) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (err) {
      sseClients.delete(client);
    }
  }
}

// Function to fetch git log
function updateGitLog() {
  return new Promise((resolve) => {
    exec('git log -n 6 --pretty=format:"%h|%an|%s|%cr"', { cwd: rootDir }, (err, stdout) => {
      if (!err && stdout) {
        state.gitLog = stdout.split('\n').filter(Boolean).map(line => {
          const [hash, author, message, time] = line.split('|');
          return { hash, author, message, time };
        });
      }
      resolve(state.gitLog);
    });
  });
}

// Check central API status
async function checkCentralApiStatus() {
  try {
    const res = await fetch('http://localhost:4000/api/products');
    if (res.ok) {
      const central = state.modules.find(m => m.id === 'central-web');
      if (central) central.status = 'online';
    }
  } catch (e) {
    const central = state.modules.find(m => m.id === 'central-web');
    if (central) central.status = 'offline';
  }
}

// SSE Route
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// Full state endpoint
app.get('/api/state', async (req, res) => {
  await updateGitLog();
  await checkCentralApiStatus();
  res.json(state);
});

// Post a thought
app.post('/api/thoughts', (req, res) => {
  const { agentId, thought, tag } = req.body;
  if (!agentId || !thought) {
    return res.status(400).json({ error: 'agentId e thought são obrigatórios' });
  }

  const newThought = {
    id: 'th-' + Date.now(),
    agentId,
    thought,
    tag: tag || 'Raciocínio',
    timestamp: new Date().toISOString()
  };

  state.thoughts.unshift(newThought);
  if (state.thoughts.length > 50) state.thoughts.pop();

  if (state.agents[agentId]) {
    state.agents[agentId].lastAction = thought.slice(0, 60) + '...';
    state.agents[agentId].status = 'active';
  }

  broadcastSSE('thought', newThought);
  broadcastSSE('state', state);

  res.json({ success: true, thought: newThought });
});

// Post/Update a task
app.post('/api/tasks', (req, res) => {
  const { id, title, assignedTo, module, status, priority } = req.body;
  
  if (id) {
    const existing = state.tasks.find(t => t.id === id);
    if (existing) {
      if (title) existing.title = title;
      if (assignedTo) existing.assignedTo = assignedTo;
      if (module) existing.module = module;
      if (status) existing.status = status;
      if (priority) existing.priority = priority;

      broadcastSSE('task_updated', existing);
      broadcastSSE('state', state);
      return res.json({ success: true, task: existing });
    }
  }

  const newTask = {
    id: 'task-' + Date.now(),
    title: title || 'Nova Tarefa',
    assignedTo: assignedTo || 'antigravity',
    module: module || 'geral',
    status: status || 'backlog',
    priority: priority || 'medium'
  };

  state.tasks.push(newTask);
  broadcastSSE('task_created', newTask);
  broadcastSSE('state', state);

  res.json({ success: true, task: newTask });
});

// Update agent status
app.post('/api/agents/:id/status', (req, res) => {
  const { id } = req.params;
  const { status, lastAction } = req.body;

  if (state.agents[id]) {
    if (status) state.agents[id].status = status;
    if (lastAction) state.agents[id].lastAction = lastAction;

    broadcastSSE('agent_updated', state.agents[id]);
    broadcastSSE('state', state);
    return res.json({ success: true, agent: state.agents[id] });
  }

  res.status(404).json({ error: 'Agente não encontrado' });
});

// Initial boot
updateGitLog();
checkCentralApiStatus();

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🪐 COCKPIT VISUAL DA MESA REDONDA INICIADO COM SUCESSO!`);
  console.log(`👉 Acesse no navegador: http://localhost:${PORT}`);
  console.log(`📦 Monorepo Alvo: ${rootDir}`);
  console.log(`=======================================================`);
});
