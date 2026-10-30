/* Boletim Rubro-Negro — site estático para GitHub Pages.
   Os dados ficam em data/elenco.json e data/partidas.json.
   A área do autor grava esses arquivos direto no repositório pela API do GitHub. */

const COMPETICOES = ['Brasileirão', 'Libertadores', 'Copa do Brasil', 'Carioca', 'Supercopa do Brasil', 'Recopa', 'Mundial de Clubes', 'Amistoso'];
const POSICOES = { GOL: 'Goleiros', DEF: 'Defensores', MEI: 'Meio-campistas', ATA: 'Atacantes' };
const POS_UM = { GOL: 'Goleiro', DEF: 'Defensor', MEI: 'Meio-campista', ATA: 'Atacante' };
const ORDEM_POS = ['GOL', 'DEF', 'MEI', 'ATA'];
const NOTA_PADRAO = 6;
const CFG_KEY = 'boletim-config';
const RASCUNHO_KEY = 'boletim-rascunho';

const estado = {
  elenco: [],
  partidas: [],
  temporada: new Date().getFullYear(),
  sha: { elenco: null, partidas: null },
  filtroComp: 'Todas',
  ranking: { comp: 'Todas', minimo: 1, ordem: 'media', dir: -1 },
  rascunho: null,
};

/* ---------------- utilidades ---------------- */
const $ = (sel, raiz = document) => raiz.querySelector(sel);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtNota = (n) => (n == null || isNaN(n) ? '–' : Number(n).toFixed(1).replace('.', ','));
const slug = (t) => String(t).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const classeNota = (n) => (n >= 8 ? 'n-otima' : n >= 7 ? 'n-boa' : n > 5 ? 'n-media' : 'n-ruim');
const notaHTML = (n, extra = '') => `<span class="nota ${classeNota(n)} ${extra}">${fmtNota(n)}</span>`;
const jogador = (id) => estado.elenco.find((j) => j.id === id) || { id, nome: id, posicao: 'MEI', numero: null };
const MESES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function fmtData(iso, longo = false) {
  const [a, m, d] = iso.split('-').map(Number);
  return longo ? `${d} de ${MESES_LONGO[m - 1]} de ${a}` : `${String(d).padStart(2, '0')} ${MESES[m - 1]}`;
}
function placarTexto(p) {
  return p.mandante
    ? `Flamengo <span class="gols">${p.golsFla} × ${p.golsAdv}</span> ${esc(p.adversario)}`
    : `${esc(p.adversario)} <span class="gols">${p.golsAdv} × ${p.golsFla}</span> Flamengo`;
}
const resultado = (p) => (p.golsFla > p.golsAdv ? 'v' : p.golsFla < p.golsAdv ? 'd' : 'e');
function avisar(msg, erro = false) {
  const el = $('#aviso');
  el.textContent = msg;
  el.className = 'aviso ver' + (erro ? ' erro' : '');
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => (el.className = 'aviso'), erro ? 6000 : 3000);
}

/* ---------------- configuração / GitHub ---------------- */
function lerConfig() {
  let c = {};
  try { c = JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); } catch { c = {}; }
  // Sugere dono/repositório a partir do endereço do GitHub Pages (usuario.github.io/repositorio)
  const host = location.hostname.match(/^([^.]+)\.github\.io$/);
  if (host && !c.dono) c.dono = host[1];
  if (host && !c.repo) c.repo = location.pathname.split('/').filter(Boolean)[0] || `${host[1]}.github.io`;
  if (!c.branch) c.branch = 'main';
  return c;
}
function salvarConfig(c) {
  try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch { avisar('Seu navegador não deixou guardar a configuração.', true); }
}
const temToken = () => !!lerConfig().token;

function b64ParaTexto(b64) {
  const bin = atob(b64.replace(/\n/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
function textoParaB64(txt) {
  const bytes = new TextEncoder().encode(txt);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}
async function gh(caminho, opcoes = {}) {
  const c = lerConfig();
  const r = await fetch(`https://api.github.com/repos/${c.dono}/${c.repo}/contents/${caminho}${opcoes.method ? '' : `?ref=${encodeURIComponent(c.branch)}`}`, {
    ...opcoes,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${c.token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(opcoes.headers || {}) },
  });
  if (!r.ok) {
    const corpo = await r.json().catch(() => ({}));
    const erro = new Error(corpo.message || `Erro ${r.status}`);
    erro.status = r.status;
    throw erro;
  }
  return r.json();
}
async function lerDoGitHub(nome) {
  let j;
  try { j = await gh(`data/${nome}.json`); } catch (e) {
    if (e.status === 404) { e.arquivo = `data/${nome}.json`; }
    throw e;
  }
  estado.sha[nome] = j.sha;
  return JSON.parse(b64ParaTexto(j.content));
}
async function gravarNoGitHub(nome, objeto, mensagem, tentativa = 1) {
  const c = lerConfig();
  try {
    const r = await gh(`data/${nome}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: mensagem, content: textoParaB64(JSON.stringify(objeto, null, 2) + '\n'), sha: estado.sha[nome] || undefined, branch: c.branch }),
    });
    estado.sha[nome] = r.content.sha;
  } catch (e) {
    if ((e.status === 409 || e.status === 422) && tentativa === 1) {
      await lerDoGitHub(nome); // atualiza o sha e tenta de novo
      return gravarNoGitHub(nome, objeto, mensagem, 2);
    }
    throw e;
  }
}
function explicarErro(e) {
  if (e.status === 401) return 'O token foi recusado pelo GitHub. Gere um novo e cole na configuração.';
  if (e.status === 403) return 'O token não tem permissão de escrita. Dê acesso “Contents: Read and write” ao repositório.';
  if (e.status === 404 && e.arquivo) return `O repositório foi encontrado, mas o arquivo ${e.arquivo} não está nele. Envie a pasta data junto com o index.html.`;
  if (e.status === 404) return 'Repositório ou branch não encontrado, ou o token não tem acesso a ele. Confira usuário, repositório e branch.';
  return `Algo deu errado: ${e.message}`;
}

/* ---------------- carregamento ---------------- */
async function carregar() {
  let elenco, partidas;
  if (temToken()) {
    try {
      [elenco, partidas] = await Promise.all([lerDoGitHub('elenco'), lerDoGitHub('partidas')]);
    } catch (e) {
      avisar('Não consegui ler pelo GitHub, usando a versão publicada. ' + explicarErro(e), true);
    }
  }
  if (!elenco || !partidas) {
    const v = Date.now();
    const lerPublicado = async (nome) => {
      const r = await fetch(`data/${nome}.json?v=${v}`);
      const txt = await r.text();
      try { return JSON.parse(txt); } catch {
        throw new Error(`o arquivo data/${nome}.json não foi encontrado no site. Confira se a pasta data foi enviada para o repositório, ao lado do index.html`);
      }
    };
    [elenco, partidas] = await Promise.all([lerPublicado('elenco'), lerPublicado('partidas')]);
  }
  estado.elenco = elenco.jogadores || [];
  estado.elencoMeta = elenco;
  estado.temporada = partidas.temporada || estado.temporada;
  estado.partidas = (partidas.partidas || []).sort((a, b) => b.data.localeCompare(a.data));
}

/* ---------------- cálculos ---------------- */
function destaques(p) {
  const notas = p.atuacoes.map((a) => a.nota);
  if (!notas.length) return { craque: [], pior: [], media: null };
  const max = Math.max(...notas), min = Math.min(...notas);
  return {
    craque: p.atuacoes.filter((a) => a.nota === max).map((a) => a.jogador),
    pior: max === min ? [] : p.atuacoes.filter((a) => a.nota === min).map((a) => a.jogador),
    max, min,
    media: notas.reduce((s, n) => s + n, 0) / notas.length,
  };
}
const filtrarComp = (lista, comp) => (comp === 'Todas' ? lista : lista.filter((p) => p.competicao === comp));
function estatisticas(partidas) {
  const mapa = new Map();
  partidas.forEach((p) => {
    const d = destaques(p);
    p.atuacoes.forEach((a) => {
      const s = mapa.get(a.jogador) || { id: a.jogador, jogos: 0, soma: 0, gols: 0, assist: 0, craque: 0, pior: 0 };
      s.jogos++; s.soma += a.nota; s.gols += a.gols || 0; s.assist += a.assist || 0;
      if (d.craque.includes(a.jogador)) s.craque++;
      if (d.pior.includes(a.jogador)) s.pior++;
      mapa.set(a.jogador, s);
    });
  });
  return [...mapa.values()].map((s) => ({ ...s, media: s.soma / s.jogos }));
}
const nomes = (ids) => {
  const n = ids.map((id) => esc(jogador(id).nome));
  return n.length > 1 ? `${n.slice(0, -1).join(', ')} e ${n[n.length - 1]}` : n[0] || '';
};
const competicoesUsadas = () => COMPETICOES.filter((c) => estado.partidas.some((p) => p.competicao === c))
  .concat([...new Set(estado.partidas.map((p) => p.competicao))].filter((c) => !COMPETICOES.includes(c)));

/* ---------------- telas ---------------- */
function telaJogos() {
  if (!estado.partidas.length) {
    return `<h2>Temporada ${estado.temporada}</h2>
      <p class="vazio">Nenhum jogo avaliado ainda. Depois da próxima partida, abra a área do autor e lance as notas.</p>
      <a class="botao" href="#/lancar">Lançar as primeiras notas</a>`;
  }
  const ult = estado.partidas[0];
  const d = destaques(ult);
  const comps = competicoesUsadas();
  const lista = filtrarComp(estado.partidas, estado.filtroComp);
  return `
    <a class="destaque" href="#/jogo/${ult.id}">
      <div>
        <div class="contexto">Último jogo, ${fmtData(ult.data, true)}, ${esc(ult.competicao)}</div>
        <div class="placar">${placarTexto(ult)}</div>
      </div>
      <div class="resumo">
        <div class="selo-linha">${notaHTML(d.max, 'pequena')}<div><span class="rotulo">Craque do jogo</span><span class="quem">${nomes(d.craque)}</span></div></div>
        ${d.pior.length ? `<div class="selo-linha">${notaHTML(d.min, 'pequena')}<div><span class="rotulo">Pior em campo</span><span class="quem">${nomes(d.pior)}</span></div></div>` : ''}
        <div class="selo-linha">${notaHTML(d.media, 'pequena')}<div><span class="rotulo">Média do time</span><span class="quem">${ult.atuacoes.length} jogadores avaliados</span></div></div>
      </div>
    </a>
    <h2>Temporada ${estado.temporada}</h2>
    ${comps.length > 1 ? `<div class="filtros" role="group" aria-label="Filtrar por competição">
      ${['Todas', ...comps].map((c) => `<button class="chip" data-comp="${esc(c)}" aria-pressed="${estado.filtroComp === c}">${esc(c)}</button>`).join('')}
    </div>` : ''}
    <ul class="jogos">
      ${lista.map((p) => {
        const dd = destaques(p);
        return `<li class="jogo"><a href="#/jogo/${p.id}">
          <span class="data">${fmtData(p.data)}<br>${p.mandante ? 'em casa' : 'fora'}</span>
          <span class="adv">${esc(p.adversario)}<span class="comp">${esc(p.competicao)}</span></span>
          <span class="res ${resultado(p)}">${p.golsFla} × ${p.golsAdv}</span>
          <span class="craque">Craque<b>${nomes(dd.craque)} ${fmtNota(dd.max)}</b></span>
        </a></li>`;
      }).join('')}
    </ul>
    ${lista.length ? '' : '<p class="vazio">Nenhum jogo nessa competição ainda.</p>'}`;
}

function telaJogo(id) {
  const p = estado.partidas.find((x) => x.id === id);
  if (!p) return `<a class="voltar" href="#/">‹ Jogos</a><p class="vazio">Esse jogo não está no boletim.</p>`;
  const d = destaques(p);
  const atu = [...p.atuacoes].sort((a, b) => b.nota - a.nota || ORDEM_POS.indexOf(jogador(a.jogador).posicao) - ORDEM_POS.indexOf(jogador(b.jogador).posicao));
  const gols = atu.reduce((s, a) => s + (a.gols || 0), 0);
  return `
    <a class="voltar" href="#/">‹ Jogos</a>
    <div class="partida-topo">
      <div class="sub">${fmtData(p.data, true)}, ${esc(p.competicao)}${p.mandante ? ', em casa' : ', fora de casa'}</div>
      <h1 class="placar">${placarTexto(p)}</h1>
      ${temToken() ? `<div class="acoes"><a class="botao sec" href="#/lancar/${p.id}">Editar notas</a></div>` : ''}
    </div>
    <div class="media-time">
      <div><span class="numero-grande">${fmtNota(d.media)}</span><span>média do time</span></div>
      <div><span class="numero-grande">${p.atuacoes.length}</span><span>jogadores avaliados</span></div>
      <div><span class="numero-grande">${gols}</span><span>gols de jogadores</span></div>
    </div>
    <ul class="atuacoes">
      ${atu.map((a) => {
        const j = jogador(a.jogador);
        const craque = d.craque.includes(a.jogador), pior = d.pior.includes(a.jogador);
        const det = [POS_UM[j.posicao]];
        if (a.gols) det.push(a.gols === 1 ? '1 gol' : `${a.gols} gols`);
        if (a.assist) det.push(a.assist === 1 ? '1 assistência' : `${a.assist} assistências`);
        return `<li class="atuacao ${craque ? 'craque' : ''}">
          <span class="num">${j.numero ?? ''}</span>
          <span><a class="nome" href="#/jogador/${j.id}">${esc(j.nome)}</a>${craque ? '<span class="tag craque">Craque</span>' : ''}${pior ? '<span class="tag pior">Pior em campo</span>' : ''}
            <span class="det">${det.join(', ')}</span></span>
          ${notaHTML(a.nota)}
        </li>`;
      }).join('')}
    </ul>`;
}

function telaRanking() {
  if (!estado.partidas.length) return `<h2>Ranking</h2><p class="vazio">O ranking aparece depois do primeiro jogo avaliado.</p>`;
  const r = estado.ranking;
  const partidas = filtrarComp(estado.partidas, r.comp);
  const maxJogos = Math.max(1, ...estatisticas(partidas).map((s) => s.jogos));
  if (r.minimo > maxJogos) r.minimo = 1;
  const linhas = estatisticas(partidas).filter((s) => s.jogos >= r.minimo)
    .sort((a, b) => (r.ordem === 'nome' ? jogador(a.id).nome.localeCompare(jogador(b.id).nome) * r.dir : (a[r.ordem] - b[r.ordem]) * r.dir) || b.media - a.media);
  const col = (chave, rotulo) => `<th scope="col"><button data-ordem="${chave}" data-ativo="${r.ordem === chave}">${rotulo}${r.ordem === chave ? (r.dir < 0 ? ' ▾' : ' ▴') : ''}</button></th>`;
  return `
    <h2>Ranking da temporada</h2>
    <p class="sub" style="margin-top:-.25rem;margin-bottom:1rem">Média das notas de cada jogador em ${partidas.length} ${partidas.length === 1 ? 'jogo' : 'jogos'}.</p>
    <div class="ranking-controles">
      <label class="campo">Competição
        <select id="r-comp">${['Todas', ...competicoesUsadas()].map((c) => `<option ${c === r.comp ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      </label>
      <label class="campo">Mínimo de jogos
        <select id="r-min">${Array.from({ length: maxJogos }, (_, i) => i + 1).map((n) => `<option value="${n}" ${n === r.minimo ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </label>
    </div>
    <div class="tabela-scroll"><table>
      <thead><tr><th scope="col">#</th>${col('nome', 'Jogador')}${col('jogos', 'Jogos')}${col('media', 'Média')}${col('gols', 'Gols')}${col('assist', 'Assist.')}${col('craque', 'Craque')}${col('pior', 'Pior')}</tr></thead>
      <tbody>${linhas.map((s, i) => {
        const j = jogador(s.id);
        return `<tr class="${i === 0 && r.ordem === 'media' && r.dir < 0 ? 'lider' : ''}">
          <td class="pos-rank">${i + 1}</td>
          <td><a href="#/jogador/${j.id}">${esc(j.nome)}</a></td>
          <td>${s.jogos}</td><td>${notaHTML(s.media)}</td><td>${s.gols}</td><td>${s.assist}</td><td>${s.craque}</td><td>${s.pior}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
}

function graficoEvolucao(pontos) {
  const W = 900, H = 260, m = { e: 34, d: 14, t: 14, b: 30 };
  const iw = W - m.e - m.d, ih = H - m.t - m.b;
  const x = (i) => m.e + (pontos.length === 1 ? iw / 2 : (i * iw) / (pontos.length - 1));
  const y = (n) => m.t + ih - (n / 10) * ih;
  const grade = [0, 2, 4, 6, 8, 10].map((n) => `<line x1="${m.e}" x2="${W - m.d}" y1="${y(n)}" y2="${y(n)}" stroke="var(--linha)"/><text x="${m.e - 8}" y="${y(n) + 4}" fill="var(--apagado)" font-size="12" text-anchor="end">${n}</text>`).join('');
  const media = pontos.reduce((s, p) => s + p.nota, 0) / pontos.length;
  const caminho = pontos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.nota).toFixed(1)}`).join(' ');
  const passo = Math.ceil(pontos.length / 8);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolução das notas jogo a jogo">
    ${grade}
    <line x1="${m.e}" x2="${W - m.d}" y1="${y(media)}" y2="${y(media)}" stroke="var(--apagado)" stroke-dasharray="4 4"/>
    <text x="${m.e + 6}" y="${y(media) - 6}" fill="var(--apagado)" font-size="12">média ${fmtNota(media)}</text>
    <path d="${caminho}" fill="none" stroke="var(--vermelho)" stroke-width="3" stroke-linejoin="round"/>
    ${pontos.map((p, i) => `<a href="#/jogo/${p.id}"><circle cx="${x(i)}" cy="${y(p.nota)}" r="6" fill="${p.nota >= 7 ? 'var(--vermelho)' : 'var(--preto)'}" stroke="var(--vermelho)" stroke-width="2.5"><title>${fmtData(p.data)} × ${esc(p.adversario)}: ${fmtNota(p.nota)}</title></circle></a>
      ${i % passo === 0 ? `<text x="${x(i)}" y="${H - 8}" fill="var(--apagado)" font-size="11" text-anchor="middle">${fmtData(p.data)}</text>` : ''}`).join('')}
  </svg>`;
}

function telaJogador(id) {
  const j = jogador(id);
  const jogos = estado.partidas.filter((p) => p.atuacoes.some((a) => a.jogador === id));
  const voltar = `<a class="voltar" href="#/ranking">‹ Ranking</a>`;
  if (!jogos.length) return `${voltar}<h1>${esc(j.nome)}</h1><p class="vazio">Ainda sem notas nesta temporada.</p>`;
  const s = estatisticas(jogos).find((x) => x.id === id);
  const cron = [...jogos].reverse().map((p) => ({ ...p.atuacoes.find((a) => a.jogador === id), id: p.id, data: p.data, adversario: p.adversario }));
  const melhor = cron.reduce((a, b) => (b.nota > a.nota ? b : a));
  return `${voltar}
    <div class="jogador-topo">
      ${j.numero ? `<span class="camisa">${j.numero}</span>` : ''}
      <div><div class="sub">${POS_UM[j.posicao]}</div><h1>${esc(j.nome)}</h1></div>
    </div>
    <div class="numeros">
      <div><span class="numero-grande">${fmtNota(s.media)}</span><span>média</span></div>
      <div><span class="numero-grande">${s.jogos}</span><span>${s.jogos === 1 ? 'jogo' : 'jogos'}</span></div>
      <div><span class="numero-grande">${s.gols}</span><span>${s.gols === 1 ? 'gol' : 'gols'}</span></div>
      <div><span class="numero-grande">${s.assist}</span><span>${s.assist === 1 ? 'assistência' : 'assistências'}</span></div>
      <div><span class="numero-grande">${s.craque}</span><span>vezes craque</span></div>
      <div><span class="numero-grande">${fmtNota(melhor.nota)}</span><span>melhor nota, × ${esc(melhor.adversario)}</span></div>
    </div>
    <h2>Evolução</h2>
    <div class="grafico">${graficoEvolucao(cron)}</div>
    <h2>Jogo a jogo</h2>
    <ul class="jogos">${jogos.map((p) => {
      const a = p.atuacoes.find((x) => x.jogador === id);
      const extra = [a.gols ? `${a.gols} ${a.gols === 1 ? 'gol' : 'gols'}` : '', a.assist ? `${a.assist} ${a.assist === 1 ? 'assist.' : 'assists.'}` : ''].filter(Boolean).join(', ');
      return `<li class="jogo"><a href="#/jogo/${p.id}">
        <span class="data">${fmtData(p.data)}</span>
        <span class="adv">${esc(p.adversario)}<span class="comp">${esc(p.competicao)}${extra ? `, ${extra}` : ''}</span></span>
        <span class="res ${resultado(p)}">${p.golsFla} × ${p.golsAdv}</span>
        ${notaHTML(a.nota, 'pequena')}
      </a></li>`;
    }).join('')}</ul>`;
}

/* ---------------- área do autor ---------------- */
function novoRascunho() {
  return { id: null, data: new Date().toISOString().slice(0, 10), adversario: '', mandante: true, competicao: 'Brasileirão', golsFla: 0, golsAdv: 0, atuacoes: {} };
}
function rascunhoDe(p) {
  const atuacoes = {};
  p.atuacoes.forEach((a) => (atuacoes[a.jogador] = { nota: a.nota, gols: a.gols || 0, assist: a.assist || 0 }));
  return { ...p, atuacoes };
}
function guardarRascunho() {
  try { localStorage.setItem(RASCUNHO_KEY, JSON.stringify(estado.rascunho)); } catch { /* sem armazenamento, segue em memória */ }
}

function telaConfig(c, aberta) {
  return `<details class="painel config" ${aberta ? 'open' : ''}>
    <summary>Conexão com o GitHub ${c.token ? '(conectado)' : '(não configurada)'}</summary>
    <div class="grade">
      <label class="campo">Usuário dono do repositório<input type="text" id="c-dono" value="${esc(c.dono || '')}" autocomplete="off" spellcheck="false"></label>
      <label class="campo">Repositório<input type="text" id="c-repo" value="${esc(c.repo || '')}" autocomplete="off" spellcheck="false"></label>
      <label class="campo">Branch<input type="text" id="c-branch" value="${esc(c.branch || 'main')}" autocomplete="off" spellcheck="false"></label>
      <label class="campo">Token do GitHub<input type="password" id="c-token" value="${esc(c.token || '')}" autocomplete="off" placeholder="github_pat_…"></label>
    </div>
    <p class="ajuda">O token fica guardado só neste navegador. Crie um token “fine-grained” com acesso apenas a este repositório e a permissão “Contents: Read and write”. O passo a passo está no README.</p>
    <div style="display:flex;gap:.6rem;flex-wrap:wrap">
      <button class="botao" id="c-salvar">Salvar conexão</button>
      ${c.token ? '<button class="botao sec" id="c-sair">Desconectar este navegador</button>' : ''}
    </div>
  </details>`;
}

function telaLancar(idEdicao) {
  const c = lerConfig();
  if (!c.token) {
    return `<h2>Área do autor</h2><p class="ajuda" style="margin-bottom:1rem">Para lançar notas, conecte este navegador ao seu repositório.</p>${telaConfig(c, true)}`;
  }
  if (idEdicao) {
    const p = estado.partidas.find((x) => x.id === idEdicao);
    if (!p) return `<p class="vazio">Jogo não encontrado.</p>`;
    if (!estado.rascunho || estado.rascunho.id !== idEdicao) estado.rascunho = rascunhoDe(p);
  } else if (!estado.rascunho || estado.rascunho.id) {
    let salvo = null;
    try { salvo = JSON.parse(localStorage.getItem(RASCUNHO_KEY) || 'null'); } catch { salvo = null; }
    estado.rascunho = salvo && !salvo.id ? salvo : novoRascunho();
  }
  const r = estado.rascunho;
  const ativos = estado.elenco.filter((j) => j.ativo !== false || r.atuacoes[j.id]);
  const comps = COMPETICOES.includes(r.competicao) ? COMPETICOES : [...COMPETICOES, r.competicao];
  return `
    <h2>${r.id ? 'Editar notas' : 'Lançar notas'}</h2>
    <section class="painel">
      <div class="grade">
        <label class="campo">Data<input type="date" id="f-data" value="${esc(r.data)}"></label>
        <label class="campo">Adversário<input type="text" id="f-adv" value="${esc(r.adversario)}" placeholder="Ex.: Palmeiras" autocomplete="off"></label>
        <label class="campo">Competição<select id="f-comp">${comps.map((x) => `<option ${x === r.competicao ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
        <div class="campo">Local
          <div class="mando" role="group" aria-label="Local do jogo">
            <button type="button" data-mando="1" aria-pressed="${r.mandante}">Em casa</button>
            <button type="button" data-mando="0" aria-pressed="${!r.mandante}">Fora</button>
          </div>
        </div>
        <div class="campo">Placar
          <div class="placar-campos">
            <input type="number" id="f-gf" min="0" max="20" inputmode="numeric" value="${r.golsFla}" aria-label="Gols do Flamengo"><span>Flamengo</span>
            <span>×</span>
            <input type="number" id="f-ga" min="0" max="20" inputmode="numeric" value="${r.golsAdv}" aria-label="Gols do adversário">
          </div>
        </div>
      </div>
    </section>

    <section>
      <p class="ajuda">Marque quem entrou em campo e ajuste a nota de meio em meio ponto.</p>
      ${ORDEM_POS.map((pos) => {
        const grupo = ativos.filter((j) => j.posicao === pos);
        if (!grupo.length) return '';
        return `<div class="grupo-pos"><h3>${POSICOES[pos]}</h3>${grupo.map((j) => linhaJogador(j, r.atuacoes[j.id])).join('')}</div>`;
      }).join('')}
    </section>

    <div class="barra-salvar">
      <span class="contagem" id="contagem">${contagemTexto()}</span>
      <div style="display:flex;gap:.6rem;flex-wrap:wrap">
        ${r.id ? '<button class="botao perigo" id="f-excluir">Excluir jogo</button>' : '<button class="botao sec" id="f-limpar">Limpar</button>'}
        <button class="botao" id="f-salvar">${r.id ? 'Salvar alterações' : 'Publicar notas'}</button>
      </div>
    </div>

    <details class="painel" style="margin-top:2rem">
      <summary style="cursor:pointer;font-weight:600">Gerenciar elenco</summary>
      <p class="ajuda">Desmarque quem saiu do clube para tirar da lista de lançamento. As notas antigas continuam no histórico.</p>
      <ul class="elenco-edit">${estado.elenco.map((j) => `<li><label><input type="checkbox" data-elenco="${j.id}" ${j.ativo !== false ? 'checked' : ''}>${j.numero ? `${j.numero}. ` : ''}${esc(j.nome)} <span class="sub">${POS_UM[j.posicao]}</span></label></li>`).join('')}</ul>
      <div class="grade">
        <label class="campo">Nome do novo jogador<input type="text" id="e-nome" autocomplete="off"></label>
        <label class="campo">Posição<select id="e-pos">${ORDEM_POS.map((p) => `<option value="${p}">${POS_UM[p]}</option>`).join('')}</select></label>
        <label class="campo">Número<input type="number" id="e-num" min="1" max="99" inputmode="numeric"></label>
      </div>
      <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1rem">
        <button class="botao sec" id="e-add">Adicionar jogador</button>
        <button class="botao" id="e-salvar">Salvar elenco</button>
      </div>
    </details>

    ${telaConfig(c, false)}`;
}

function linhaJogador(j, a) {
  return `<div class="linha-jogador ${a ? 'ativo' : ''}" data-jogador="${j.id}">
    <label class="entrou"><input type="checkbox" data-entrou ${a ? 'checked' : ''}><span class="n">${j.numero ?? ''}</span>${esc(j.nome)}</label>
    <div class="controles">
      <div class="stepper" aria-label="Nota de ${esc(j.nome)}">
        <button type="button" data-passo="nota" data-delta="-0.5" aria-label="Diminuir nota">−</button>
        <span class="valor">${notaHTML(a ? a.nota : NOTA_PADRAO)}</span>
        <button type="button" data-passo="nota" data-delta="0.5" aria-label="Aumentar nota">+</button>
      </div>
      <div class="stepper mini"><span class="rot">Gols</span>
        <button type="button" data-passo="gols" data-delta="-1" aria-label="Menos um gol">−</button>
        <span class="valor" data-v="gols">${a ? a.gols : 0}</span>
        <button type="button" data-passo="gols" data-delta="1" aria-label="Mais um gol">+</button>
      </div>
      <div class="stepper mini"><span class="rot">Assist.</span>
        <button type="button" data-passo="assist" data-delta="-1" aria-label="Menos uma assistência">−</button>
        <span class="valor" data-v="assist">${a ? a.assist : 0}</span>
        <button type="button" data-passo="assist" data-delta="1" aria-label="Mais uma assistência">+</button>
      </div>
    </div>
  </div>`;
}
function contagemTexto() {
  const n = Object.keys(estado.rascunho?.atuacoes || {}).length;
  return n ? `${n} ${n === 1 ? 'jogador avaliado' : 'jogadores avaliados'}` : 'Nenhum jogador marcado';
}

function ligarLancar() {
  const app = $('#app');
  const r = estado.rascunho;
  const ligarCampo = (sel, chave, conv = (v) => v) => {
    const el = $(sel, app);
    if (el) el.addEventListener('input', () => { r[chave] = conv(el.value); guardarRascunho(); });
  };
  ligarCampo('#f-data', 'data');
  ligarCampo('#f-adv', 'adversario', (v) => v.trim());
  ligarCampo('#f-comp', 'competicao');
  ligarCampo('#f-gf', 'golsFla', (v) => Math.max(0, parseInt(v, 10) || 0));
  ligarCampo('#f-ga', 'golsAdv', (v) => Math.max(0, parseInt(v, 10) || 0));

  app.addEventListener('click', async (ev) => {
    const alvo = ev.target.closest('button');
    if (!alvo) return;
    if (alvo.dataset.mando) {
      r.mandante = alvo.dataset.mando === '1';
      app.querySelectorAll('[data-mando]').forEach((b) => b.setAttribute('aria-pressed', b === alvo));
      guardarRascunho();
    }
    if (alvo.dataset.passo) {
      const linha = alvo.closest('[data-jogador]');
      const a = r.atuacoes[linha.dataset.jogador];
      if (!a) return;
      const campo = alvo.dataset.passo, delta = Number(alvo.dataset.delta);
      if (campo === 'nota') {
        a.nota = Math.min(10, Math.max(0, a.nota + delta));
        $('.stepper .valor', linha).innerHTML = notaHTML(a.nota);
      } else {
        a[campo] = Math.max(0, a[campo] + delta);
        $(`[data-v="${campo}"]`, linha).textContent = a[campo];
      }
      guardarRascunho();
    }
    if (alvo.id === 'f-limpar') {
      if (!confirm('Apagar tudo o que foi preenchido neste lançamento?')) return;
      estado.rascunho = novoRascunho(); guardarRascunho(); render();
    }
    if (alvo.id === 'f-salvar') salvarPartida(alvo);
    if (alvo.id === 'f-excluir') excluirPartida(alvo);
    if (alvo.id === 'e-add') adicionarJogador();
    if (alvo.id === 'e-salvar') salvarElenco(alvo);
  });

  app.addEventListener('change', (ev) => {
    if (ev.target.matches('[data-entrou]')) {
      const linha = ev.target.closest('[data-jogador]');
      const id = linha.dataset.jogador;
      if (ev.target.checked) r.atuacoes[id] = r.atuacoes[id] || { nota: NOTA_PADRAO, gols: 0, assist: 0 };
      else delete r.atuacoes[id];
      linha.classList.toggle('ativo', ev.target.checked);
      const a = r.atuacoes[id];
      $('.stepper .valor', linha).innerHTML = notaHTML(a ? a.nota : NOTA_PADRAO);
      $('[data-v="gols"]', linha).textContent = a ? a.gols : 0;
      $('[data-v="assist"]', linha).textContent = a ? a.assist : 0;
      $('#contagem').textContent = contagemTexto();
      guardarRascunho();
    }
    if (ev.target.matches('[data-elenco]')) {
      const j = estado.elenco.find((x) => x.id === ev.target.dataset.elenco);
      if (j) j.ativo = ev.target.checked;
    }
  });
}

function ligarConfig() {
  const salvar = $('#c-salvar');
  if (!salvar) return;
  salvar.addEventListener('click', async () => {
    const c = {
      dono: $('#c-dono').value.trim(), repo: $('#c-repo').value.trim(),
      branch: $('#c-branch').value.trim() || 'main', token: $('#c-token').value.trim(),
    };
    if (!c.dono || !c.repo || !c.token) return avisar('Preencha usuário, repositório e token.', true);
    salvarConfig(c);
    try {
      await testarConexao(c);
      await carregar();
      avisar('Conectado ao GitHub.');
      atualizarNav(); render();
    } catch (e) {
      avisar(explicarErro(e), true);
    }
  });
  const sair = $('#c-sair');
  if (sair) sair.addEventListener('click', () => {
    const c = lerConfig(); delete c.token; salvarConfig(c);
    avisar('Token removido deste navegador.'); atualizarNav(); render();
  });
}

async function testarConexao(c) {
  const h = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${c.token}` };
  const repo = await fetch(`https://api.github.com/repos/${c.dono}/${c.repo}`, { headers: h });
  if (repo.status === 401) throw Object.assign(new Error(''), { status: 401 });
  if (!repo.ok) throw Object.assign(new Error(''), { status: 404 });
  const info = await repo.json();
  if (info.permissions && !info.permissions.push) throw Object.assign(new Error(''), { status: 403 });
  const br = await fetch(`https://api.github.com/repos/${c.dono}/${c.repo}/branches/${encodeURIComponent(c.branch)}`, { headers: h });
  if (!br.ok) throw new Error(`a branch “${c.branch}” não existe. O padrão do repositório é “${info.default_branch}”`);
  await lerDoGitHub('elenco');
  await lerDoGitHub('partidas');
}

function montarPartida() {
  const r = estado.rascunho;
  const atuacoes = Object.entries(r.atuacoes).map(([jogador, a]) => ({ jogador, nota: a.nota, gols: a.gols, assist: a.assist }))
    .sort((a, b) => ORDEM_POS.indexOf(jogador(a.jogador).posicao) - ORDEM_POS.indexOf(jogador(b.jogador).posicao));
  let id = r.id;
  if (!id) {
    const base = `${r.data}-${slug(r.adversario)}`;
    id = base; let n = 2;
    while (estado.partidas.some((p) => p.id === id)) id = `${base}-${n++}`;
  }
  return { id, data: r.data, adversario: r.adversario, mandante: r.mandante, competicao: r.competicao, golsFla: r.golsFla, golsAdv: r.golsAdv, atuacoes };
}

async function salvarPartida(botao) {
  const r = estado.rascunho;
  if (!r.data) return avisar('Escolha a data do jogo.', true);
  if (!r.adversario) return avisar('Escreva o nome do adversário.', true);
  if (!Object.keys(r.atuacoes).length) return avisar('Marque pelo menos um jogador que entrou em campo.', true);
  const p = montarPartida();
  const lista = estado.partidas.filter((x) => x.id !== p.id).concat(p).sort((a, b) => b.data.localeCompare(a.data));
  botao.disabled = true; botao.textContent = 'Publicando…';
  try {
    await gravarNoGitHub('partidas', { temporada: estado.temporada, partidas: lista }, `${r.id ? 'Edita' : 'Notas de'} ${p.data} × ${p.adversario}`);
    estado.partidas = lista;
    const editando = !!r.id;
    estado.rascunho = null;
    try { localStorage.removeItem(RASCUNHO_KEY); } catch { /* ok */ }
    avisar(editando ? 'Alterações salvas. O site atualiza em cerca de 1 minuto.' : 'Notas publicadas. O site atualiza em cerca de 1 minuto.');
    location.hash = `#/jogo/${p.id}`;
  } catch (e) {
    avisar(explicarErro(e), true);
    botao.disabled = false; botao.textContent = r.id ? 'Salvar alterações' : 'Publicar notas';
  }
}

async function excluirPartida(botao) {
  const r = estado.rascunho;
  if (!confirm(`Excluir o jogo contra ${r.adversario} e todas as notas dele?`)) return;
  const lista = estado.partidas.filter((x) => x.id !== r.id);
  botao.disabled = true;
  try {
    await gravarNoGitHub('partidas', { temporada: estado.temporada, partidas: lista }, `Exclui ${r.data} × ${r.adversario}`);
    estado.partidas = lista; estado.rascunho = null;
    avisar('Jogo excluído.');
    location.hash = '#/';
  } catch (e) {
    avisar(explicarErro(e), true); botao.disabled = false;
  }
}

function adicionarJogador() {
  const nome = $('#e-nome').value.trim();
  if (!nome) return avisar('Escreva o nome do jogador.', true);
  let id = slug(nome), n = 2;
  while (estado.elenco.some((j) => j.id === id)) id = `${slug(nome)}-${n++}`;
  const numero = parseInt($('#e-num').value, 10) || null;
  estado.elenco.push({ id, nome, posicao: $('#e-pos').value, numero, ativo: true });
  avisar(`${nome} adicionado. Clique em “Salvar elenco” para publicar.`);
  render();
  const det = document.querySelectorAll('details.painel')[0];
  if (det) det.open = true;
}

async function salvarElenco(botao) {
  botao.disabled = true;
  try {
    const meta = { ...(estado.elencoMeta || {}), atualizado: new Date().toISOString().slice(0, 10), jogadores: estado.elenco };
    await gravarNoGitHub('elenco', meta, 'Atualiza elenco');
    avisar('Elenco salvo.');
    render();
  } catch (e) {
    avisar(explicarErro(e), true); botao.disabled = false;
  }
}

/* ---------------- roteamento ---------------- */
function atualizarNav(secao) {
  document.querySelector('.nav-autor').hidden = !temToken();
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === secao) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

function render() {
  const [, rota, param] = (location.hash || '#/').split('/');
  const app = $('#app');
  let html, secao = 'jogos', titulo = 'Boletim Rubro-Negro';
  if (rota === 'jogo') { html = telaJogo(param); const p = estado.partidas.find((x) => x.id === param); if (p) titulo = `× ${p.adversario}, ${fmtData(p.data)} | Boletim`; }
  else if (rota === 'ranking') { html = telaRanking(); secao = 'ranking'; titulo = 'Ranking | Boletim'; }
  else if (rota === 'jogador') { html = telaJogador(param); secao = 'ranking'; titulo = `${jogador(param).nome} | Boletim`; }
  else if (rota === 'lancar') { html = telaLancar(param); secao = 'lancar'; titulo = 'Lançar notas | Boletim'; }
  else html = telaJogos();

  // recria o <main> para limpar listeners da tela anterior
  const novo = app.cloneNode(false);
  novo.innerHTML = html;
  app.replaceWith(novo);
  document.title = titulo;
  atualizarNav(secao);

  if (rota === 'lancar') { if (estado.rascunho) ligarLancar(); ligarConfig(); }
  if (rota === 'ranking') ligarRanking();
  if (!rota || rota === '') ligarJogos();
}

function ligarJogos() {
  $('#app').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-comp]');
    if (!b) return;
    estado.filtroComp = b.dataset.comp; render();
  });
}
function ligarRanking() {
  const app = $('#app');
  app.addEventListener('change', (ev) => {
    if (ev.target.id === 'r-comp') estado.ranking.comp = ev.target.value;
    if (ev.target.id === 'r-min') estado.ranking.minimo = Number(ev.target.value);
    render();
  });
  app.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-ordem]');
    if (!b) return;
    const r = estado.ranking;
    if (r.ordem === b.dataset.ordem) r.dir *= -1; else { r.ordem = b.dataset.ordem; r.dir = b.dataset.ordem === 'nome' ? 1 : -1; }
    render();
  });
}

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
carregar().then(render).catch((e) => {
  $('#app').innerHTML = `<p class="vazio">Não consegui carregar os dados (${esc(e.message)}). Se estiver abrindo o arquivo direto do computador, publique no GitHub Pages ou rode um servidor local.</p>`;
});
