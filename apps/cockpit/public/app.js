// App.js - Cockpit da Mesa Redonda
let globalState = null;

const agentColors = {
  antigravity: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400' },
  claude: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400' },
  codex: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400' },
  fiscal: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400' },
  tef: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-400' }
};

async function fetchState() {
  try {
    const res = await fetch('/api/state');
    if (!res.ok) throw new Error('Falha ao carregar estado');
    globalState = await res.json();
    renderAll();
  } catch (err) {
    console.error('Erro ao buscar estado:', err);
  }
}

function initSSE() {
  const evtSource = new EventSource('/api/events');

  evtSource.addEventListener('thought', (e) => {
    try {
      const newThought = JSON.parse(e.data);
      if (globalState && globalState.thoughts) {
        globalState.thoughts.unshift(newThought);
        renderThoughts();
      }
    } catch (err) {
      console.error(err);
    }
  });

  evtSource.addEventListener('state', (e) => {
    try {
      globalState = JSON.parse(e.data);
      renderAll();
    } catch (err) {
      console.error(err);
    }
  });

  evtSource.onerror = (err) => {
    console.warn('Conexão SSE caiu, tentando reconectar...', err);
  };
}

function renderAll() {
  if (!globalState) return;
  renderThoughts();
  renderTasks();
  renderServices();
  renderGitLog();
}

function renderThoughts() {
  const container = document.getElementById('thoughts-list');
  const countEl = document.getElementById('thoughts-count');
  if (!container || !globalState.thoughts) return;

  countEl.innerText = `${globalState.thoughts.length} Pensamentos`;
  container.innerHTML = '';

  globalState.thoughts.forEach((item) => {
    const agent = globalState.agents[item.agentId] || { name: item.agentId, avatar: '🤖' };
    const colorStyle = agentColors[item.agentId] || agentColors.antigravity;

    const div = document.createElement('div');
    div.className = `p-3 rounded-xl bg-slate-950/60 border ${colorStyle.border} space-y-1.5 transition-all hover:bg-slate-900/60`;

    const timeAgo = formatTime(item.timestamp);

    div.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span>${agent.avatar}</span>
          <span class="font-bold ${colorStyle.text}">${agent.name}</span>
          <span class="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">${item.tag || 'Raciocínio'}</span>
        </div>
        <span class="text-[10px] text-slate-500 font-mono">${timeAgo}</span>
      </div>
      <p class="text-slate-300 text-[11px] leading-relaxed italic pl-6 border-l-2 ${colorStyle.border}">
        "${item.thought}"
      </p>
    `;

    container.appendChild(div);
  });
}

function renderTasks() {
  const container = document.getElementById('tasks-list');
  if (!container || !globalState.tasks) return;

  container.innerHTML = '';

  const statusIcons = {
    done: { icon: '✔', label: 'Concluído', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
    in_progress: { icon: '⚡', label: 'Em Andamento', color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
    backlog: { icon: '⏳', label: 'Backlog', color: 'text-slate-400 bg-slate-800/80 border-slate-700' }
  };

  globalState.tasks.forEach((task) => {
    const agent = globalState.agents[task.assignedTo] || { name: task.assignedTo, avatar: '🤖' };
    const st = statusIcons[task.status] || statusIcons.backlog;

    const div = document.createElement('div');
    div.className = 'p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between gap-3 hover:border-slate-700 transition-colors';

    div.innerHTML = `
      <div class="space-y-1 min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="px-2 py-0.5 rounded text-[10px] font-semibold border ${st.color} flex items-center gap-1">
            <span>${st.icon}</span> ${st.label}
          </span>
          <span class="text-[10px] font-mono text-slate-500 truncate">${task.module}</span>
        </div>
        <div class="font-medium text-slate-200 text-xs truncate">${task.title}</div>
      </div>
      <div class="flex items-center gap-1.5 shrink-0 bg-slate-900 border border-slate-800 px-2 py-1 rounded-lg">
        <span class="text-xs">${agent.avatar}</span>
        <span class="text-[11px] text-slate-300 font-medium">${agent.name.split(' ')[0]}</span>
      </div>
    `;

    container.appendChild(div);
  });
}

function renderServices() {
  const container = document.getElementById('services-list');
  if (!container || !globalState.modules) return;

  container.innerHTML = '';

  globalState.modules.forEach((mod) => {
    const isOnline = mod.status === 'online' || mod.status === 'ready';
    const statusColor = isOnline ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' : 'text-slate-400 bg-slate-800 border-slate-700';

    const div = document.createElement('div');
    div.className = 'p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between';

    div.innerHTML = `
      <div>
        <div class="font-bold text-slate-200 text-xs">${mod.name}</div>
        <div class="text-[10px] font-mono text-slate-500">${mod.path} ${mod.port ? `(:${mod.port})` : ''}</div>
      </div>
      <span class="px-2 py-0.5 rounded text-[10px] font-mono border ${statusColor}">
        ${mod.status.toUpperCase()}
      </span>
    `;

    container.appendChild(div);
  });
}

function renderGitLog() {
  const container = document.getElementById('git-log-list');
  if (!container || !globalState.gitLog) return;

  container.innerHTML = '';

  if (globalState.gitLog.length === 0) {
    container.innerHTML = '<div class="text-slate-500 text-xs">Nenhum commit recente encontrado.</div>';
    return;
  }

  globalState.gitLog.forEach((c) => {
    const div = document.createElement('div');
    div.className = 'p-2 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between gap-3 text-[11px]';

    div.innerHTML = `
      <div class="flex items-center gap-2 min-w-0">
        <span class="text-blue-400 font-bold">${c.hash}</span>
        <span class="text-slate-200 truncate">${c.message}</span>
      </div>
      <span class="text-[10px] text-slate-500 shrink-0 font-sans">${c.time}</span>
    `;

    container.appendChild(div);
  });
}

function inspectAgent(agentId) {
  if (!globalState || !globalState.agents[agentId]) return;
  const agent = globalState.agents[agentId];

  document.getElementById('inspect-avatar').innerText = agent.avatar;
  document.getElementById('inspect-name').innerText = `${agent.name} (${agent.role})`;
  document.getElementById('inspect-model').innerText = `${agent.model} • ${agent.badge}`;
  document.getElementById('inspect-status').innerText = agent.status.toUpperCase();
  document.getElementById('inspect-action').innerText = agent.lastAction || 'Pronto para novas ordens';

  // Find recent thought
  const recentThought = globalState.thoughts.find(t => t.agentId === agentId);
  if (recentThought) {
    document.getElementById('inspect-thought').innerText = `"${recentThought.thought}"`;
  }

  document.getElementById('inspector-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function inspectModule(moduleId) {
  if (!globalState || !globalState.modules) return;
  const mod = globalState.modules.find(m => m.id === moduleId);
  if (!mod) return;

  document.getElementById('inspect-avatar').innerText = '📦';
  document.getElementById('inspect-name').innerText = `${mod.name} (${mod.path})`;
  document.getElementById('inspect-model').innerText = mod.port ? `Porta Local: ${mod.port}` : 'Pacote do Monorepo';
  document.getElementById('inspect-status').innerText = mod.status.toUpperCase();
  document.getElementById('inspect-thought').innerText = `"${mod.description}"`;
  document.getElementById('inspect-action').innerText = `Localização física: F:\\totem-pdv-central\\${mod.path}`;

  document.getElementById('inspector-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function formatTime(isoString) {
  try {
    const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (diff < 60) return 'Agora mesmo';
    if (diff < 3600) return `Há ${Math.floor(diff / 60)} min`;
    return `Há ${Math.floor(diff / 3600)} h`;
  } catch (e) {
    return '';
  }
}

// Start
fetchState();
initSSE();
