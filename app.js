/* Boletim Rubro-Negro — site estático para GitHub Pages.
   Dados: data/elenco.json, data/partidas.json, data/calendario.json, data/times.json
   Imagens enviadas pelo autor: fotos/<jogador>.jpg e escudos/<time>.png
   A área do autor grava tudo direto no repositório pela API do GitHub. */

const COMPETICOES = ['Brasileirão', 'Libertadores', 'Copa do Brasil', 'Carioca', 'Supercopa do Brasil', 'Recopa', 'Mundial de Clubes', 'Amistoso'];
const POSICOES = { GOL: 'Goleiros', DEF: 'Defensores', MEI: 'Meio-campistas', ATA: 'Atacantes' };
const POS_UM = { GOL: 'Goleiro', DEF: 'Defensor', MEI: 'Meio-campista', ATA: 'Atacante' };
const ORDEM_POS = ['GOL', 'DEF', 'MEI', 'ATA'];
const NOTA_PADRAO = 6;
const CFG_KEY = 'boletim-config';
const RASCUNHO_KEY = 'boletim-rascunho';
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const estado = {
  elenco: [], partidas: [], calendario: [], times: {},
  meta: { elenco: {}, partidas: {}, calendario: {}, times: {} },
  temporada: new Date().getFullYear(),
  sha: {},
  previas: {}, // imagens recém-enviadas, mostradas antes do GitHub Pages publicar
  filtroComp: 'Todas',
  ranking: { comp: 'Todas', minimo: 1, ordem: 'media', dir: -1 },
  rascunho: null,
};

/* ================= utilidades ================= */
const $ = (sel, raiz = document) => raiz.querySelector(sel);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtNota = (n) => (n == null || isNaN(n) ? '–' : Number(n).toFixed(1).replace('.', ','));
const slug = (t) => String(t).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// Cor da nota: vermelho (ruim) → dourado (mediana) → verde (7 pra cima, cada vez mais verde)
function matizNota(n) {
  if (n == null || isNaN(n)) return 0;
  if (n < 5) return Math.round(2 + (n / 5) * 18);
  if (n < 7) return Math.round(38 + ((n - 5) / 2) * 12);
  return Math.round(100 + ((n - 7) / 3) * 45);
}
const notaHTML = (n, extra = '') => `<span class="nota ${n >= 8.5 ? 'cheia' : ''} ${extra}" style="--h:${matizNota(n)}">${fmtNota(n)}</span>`;
const jogador = (id) => estado.elenco.find((j) => j.id === id) || { id, nome: id, posicao: 'MEI', numero: null };
const hojeISO = () => new Date().toLocaleDateString('sv-SE');
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function fmtData(iso, estilo = 'curto') {
  const [a, m, d] = iso.split('-').map(Number);
  const dia = DIAS[new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay()];
  if (estilo === 'longo') return `${d} de ${MESES_LONGO[m - 1]} de ${a}`;
  if (estilo === 'semana') return `${dia}, ${d} de ${MESES_LONGO[m - 1]}`;
  return `${String(d).padStart(2, '0')} ${MESES[m - 1]}`;
}
const fmtHora = (h) => (h ? h.replace(/^(\d{2}):00$/, '$1h').replace(':', 'h') : 'horário a definir');
function faltam(iso) {
  const dias = Math.round((new Date(iso + 'T12:00:00') - new Date(hojeISO() + 'T12:00:00')) / 864e5);
  if (dias === 0) return 'Hoje';
  if (dias === 1) return 'Amanhã';
  return `Em ${dias} dias`;
}
const resultado = (p) => (p.golsFla > p.golsAdv ? 'v' : p.golsFla < p.golsAdv ? 'd' : 'e');
const RES_TEXTO = { v: 'Vitória', e: 'Empate', d: 'Derrota' };

function avisar(msg, erro = false) {
  const el = $('#aviso');
  el.textContent = msg;
  el.className = 'aviso ver' + (erro ? ' erro' : '');
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => (el.className = 'aviso'), erro ? 6000 : 3500);
}

/* ================= times, escudos e fotos ================= */
function timeDe(nome) {
  const s = slug(nome || '');
  if (estado.times[s]) return { id: s, ...estado.times[s] };
  for (const [id, t] of Object.entries(estado.times)) {
    if (slug(t.nome) === s || (t.apelidos || []).some((a) => slug(a) === s)) return { id, ...t };
  }
  return { id: s, nome, sigla: String(nome || '?').normalize('NFKD').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase(), cor: '#2a2a2a', texto: '#f4f4f4', escudo: null, novo: true };
}
const imgSrc = (caminho) => estado.previas[caminho.split('?')[0]] || caminho;

function escudoHTML(nome, tam = 'm') {
  const t = timeDe(nome);
  return `<span class="escudo escudo-${tam}" style="--c:${esc(t.cor)};--t:${esc(t.texto)}" title="${esc(t.nome)}">
    <span class="sigla">${esc(t.sigla)}</span>
    ${t.escudo ? `<img src="${esc(imgSrc(t.escudo))}" alt="" loading="lazy" onerror="this.remove()">` : ''}
  </span>`;
}
function iniciais(nome) {
  const p = nome.split(/\s+/).filter((x) => !/^(de|da|do|dos|la)$/i.test(x));
  return (p.length > 1 ? p[0][0] + p[p.length - 1][0] : nome.slice(0, 2)).toUpperCase();
}
function avatarHTML(j, tam = 'm') {
  return `<span class="avatar avatar-${tam}" aria-hidden="true">
    <span class="ini">${j.numero ?? iniciais(j.nome)}</span>
    ${j.foto ? `<img src="${esc(imgSrc(j.foto))}" alt="" loading="lazy" onerror="this.remove()">` : ''}
  </span>`;
}

/* ================= configuração / GitHub ================= */
function lerConfig() {
  let c = {};
  try { c = JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); } catch { c = {}; }
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
    erro.arquivo = caminho;
    throw erro;
  }
  return r.json();
}
async function lerDoGitHub(nome) {
  const j = await gh(`data/${nome}.json`);
  estado.sha[`data/${nome}.json`] = j.sha;
  return JSON.parse(b64ParaTexto(j.content));
}
async function enviarArquivo(caminho, base64, mensagem, tentativa = 1) {
  const c = lerConfig();
  if (estado.sha[caminho] === undefined) {
    try { estado.sha[caminho] = (await gh(caminho)).sha; } catch (e) { if (e.status === 404) estado.sha[caminho] = null; else throw e; }
  }
  try {
    const r = await gh(caminho, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: mensagem, content: base64, sha: estado.sha[caminho] || undefined, branch: c.branch }),
    });
    estado.sha[caminho] = r.content.sha;
  } catch (e) {
    if ((e.status === 409 || e.status === 422) && tentativa === 1) {
      delete estado.sha[caminho];
      return enviarArquivo(caminho, base64, mensagem, 2);
    }
    throw e;
  }
}
const gravarDados = (nome, objeto, mensagem) => enviarArquivo(`data/${nome}.json`, textoParaB64(JSON.stringify(objeto, null, 2) + '\n'), mensagem);

function explicarErro(e) {
  if (e.status === 401) return 'O token foi recusado pelo GitHub. Gere um novo e cole na conexão.';
  if (e.status === 403) return 'O token não tem permissão de escrita. Dê acesso “Contents: Read and write” ao repositório.';
  if (e.status === 404 && e.arquivo) return `O repositório foi encontrado, mas o arquivo ${e.arquivo} não está nele. Envie a pasta data junto com o index.html.`;
  if (e.status === 404) return 'Repositório ou branch não encontrado, ou o token não tem acesso a ele. Confira usuário, repositório e branch.';
  return `Algo deu errado: ${e.message}`;
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

/* ================= carregamento ================= */
const PADRAO = { calendario: { jogos: [] }, times: { times: {} } };
async function lerArquivo(nome, viaGitHub) {
  if (viaGitHub) {
    try { return await lerDoGitHub(nome); } catch (e) {
      if (e.status === 404 && PADRAO[nome]) { estado.sha[`data/${nome}.json`] = null; return PADRAO[nome]; }
      throw e;
    }
  }
  const r = await fetch(`data/${nome}.json?v=${Date.now()}`);
  const txt = await r.text();
  try { return JSON.parse(txt); } catch {
    if (PADRAO[nome]) return PADRAO[nome];
    throw new Error(`o arquivo data/${nome}.json não foi encontrado no site. Confira se a pasta data foi enviada para o repositório, ao lado do index.html`);
  }
}
async function carregar() {
  const nomes = ['elenco', 'partidas', 'calendario', 'times'];
  let dados;
  if (temToken()) {
    try { dados = await Promise.all(nomes.map((n) => lerArquivo(n, true))); } catch (e) {
      avisar('Não consegui ler pelo GitHub, usando a versão publicada. ' + explicarErro(e), true);
    }
  }
  if (!dados) dados = await Promise.all(nomes.map((n) => lerArquivo(n, false)));
  const [elenco, partidas, calendario, times] = dados;
  estado.meta = { elenco, partidas, calendario, times };
  estado.elenco = elenco.jogadores || [];
  estado.temporada = partidas.temporada || estado.temporada;
  estado.partidas = (partidas.partidas || []).sort((a, b) => b.data.localeCompare(a.data));
  estado.calendario = (calendario.jogos || []).sort((a, b) => a.data.localeCompare(b.data) || (a.hora || '').localeCompare(b.hora || ''));
  estado.times = times.times || {};
}

/* ================= cálculos ================= */
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

const partidaDoJogo = (c) => estado.partidas.find((p) => p.calendarioId === c.id || (p.data === c.data && timeDe(p.adversario).id === timeDe(c.adversario).id));
const jogosAbertos = () => estado.calendario.filter((c) => !partidaDoJogo(c));
const proximosJogos = () => jogosAbertos().filter((c) => c.data >= hojeISO());
const jogosSemNota = () => jogosAbertos().filter((c) => c.data < hojeISO() || (c.data === hojeISO() && c.hora && new Date() > new Date(`${c.data}T${c.hora}:00-03:00`)));

/* ================= blocos visuais ================= */
function confronto(jogo, tam = 'g', placar = null) {
  const casa = jogo.mandante ? 'Flamengo' : jogo.adversario;
  const fora = jogo.mandante ? jogo.adversario : 'Flamengo';
  const meio = placar
    ? `<span class="placar-centro ${placar.classe || ''}">${placar.casa}<span class="x">×</span>${placar.fora}</span>`
    : '<span class="placar-centro vs">×</span>';
  return `<div class="confronto confronto-${tam}">
    <div class="lado">${escudoHTML(casa, tam)}<span class="nome-time">${esc(timeDe(casa).nome)}</span></div>
    ${meio}
    <div class="lado">${escudoHTML(fora, tam)}<span class="nome-time">${esc(timeDe(fora).nome)}</span></div>
  </div>`;
}
const placarDe = (p) => ({ casa: p.mandante ? p.golsFla : p.golsAdv, fora: p.mandante ? p.golsAdv : p.golsFla, classe: `r-${resultado(p)}` });
const rotuloJogo = (j) => `${esc(j.competicao)}${j.rodada ? `, ${j.rodada}${/^\d+$/.test(j.rodada) ? 'ª rodada' : ''}` : ''}`;
const localJogo = (j) => [j.estadio, j.cidade].filter(Boolean).map(esc).join(', ');
const tituloJogo = (j) => (j.mandante ? `Flamengo × ${esc(timeDe(j.adversario).nome)}` : `${esc(timeDe(j.adversario).nome)} × Flamengo`);
const ICONE_VOLTAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
const voltar = (href, texto) => `<a class="voltar" href="${href}">${ICONE_VOLTAR}${texto}</a>`;

function cartaoProximo(c) {
  return `<section class="card proximo" aria-labelledby="t-prox">
    <div class="card-topo">
      <h2 id="t-prox">Próximo jogo</h2>
      <span class="pilula pilula-clara">${faltam(c.data)}</span>
    </div>
    ${confronto(c, 'g')}
    <dl class="ficha">
      <div><dt>Quando</dt><dd>${fmtData(c.data, 'semana')}, ${fmtHora(c.hora)}</dd></div>
      <div><dt>Onde</dt><dd>${localJogo(c) || 'local a definir'}</dd></div>
      <div><dt>Competição</dt><dd>${rotuloJogo(c)}</dd></div>
    </dl>
  </section>`;
}

/* ================= telas públicas ================= */
function telaJogos() {
  const prox = proximosJogos();
  const semNota = jogosSemNota();
  const ult = estado.partidas[0];

  const cta = temToken() && semNota.length
    ? `<a class="card cta-notas" href="#/lancar/novo/${semNota[0].id}">
        <div class="cta-escudos">${escudoHTML('Flamengo', 'm')}${escudoHTML(semNota[0].adversario, 'm')}</div>
        <div><span class="rotulo">Jogo sem notas</span><b>${tituloJogo(semNota[0])}</b><span class="sub">${fmtData(semNota[0].data, 'semana')}</span></div>
        <span class="botao">Dar as notas</span>
      </a>` : '';

  const ultimo = ult ? (() => {
    const d = destaques(ult);
    return `<a class="card ultimo" href="#/jogo/${ult.id}">
      <div class="card-topo"><h2>Último jogo</h2><span class="sub">${fmtData(ult.data)}, ${esc(ult.competicao)}</span></div>
      ${confronto(ult, 'm', placarDe(ult))}
      <div class="craque-mini">
        ${avatarHTML(jogador(d.craque[0]), 'm')}
        <div><span class="rotulo">Craque do jogo</span><b>${nomes(d.craque)}</b></div>
        ${notaHTML(d.max)}
      </div>
    </a>`;
  })() : '';

  const calendario = prox.length > 1 ? `<section class="card">
    <div class="card-topo"><h2>O que falta</h2><span class="sub">${plural(prox.length, 'jogo', 'jogos')}</span></div>
    <ol class="calendario">${prox.slice(1).map((c) => `<li class="jogo-cal">
      <span class="data-bloco"><b>${c.data.slice(8)}</b>${MESES[Number(c.data.slice(5, 7)) - 1]}</span>
      ${escudoHTML(c.adversario, 'm')}
      <span class="info"><b>${esc(timeDe(c.adversario).nome)}${c.mandante ? '' : ' <span class="pilula pilula-mini">fora</span>'}</b>
        <span>${DIAS[new Date(c.data + 'T12:00:00').getDay()]}, ${fmtHora(c.hora)}</span>
        <span>${localJogo(c) || 'local a definir'}</span></span>
    </li>`).join('')}</ol>
  </section>` : '';

  let resultados = '';
  if (estado.partidas.length) {
    const comps = competicoesUsadas();
    const lista = filtrarComp(estado.partidas, estado.filtroComp);
    const v = estado.partidas.filter((p) => resultado(p) === 'v').length;
    const e = estado.partidas.filter((p) => resultado(p) === 'e').length;
    resultados = `<section class="secao">
      <div class="secao-topo"><h2>Resultados</h2>
        <span class="placar-temporada"><span class="r-v">${v}V</span><span>${e}E</span><span class="r-d">${estado.partidas.length - v - e}D</span></span></div>
      ${comps.length > 1 ? `<div class="segmentos" role="group" aria-label="Filtrar por competição">
        ${['Todas', ...comps].map((c) => `<button class="seg" data-comp="${esc(c)}" aria-pressed="${estado.filtroComp === c}">${esc(c)}</button>`).join('')}
      </div>` : ''}
      <ul class="cards-resultado">${lista.map((p) => {
        const dd = destaques(p);
        return `<li><a class="card card-resultado" href="#/jogo/${p.id}">
          <div class="cr-topo">
            ${escudoHTML(p.adversario, 'm')}
            <div class="cr-adv"><b>${esc(timeDe(p.adversario).nome)}</b><span class="sub">${fmtData(p.data)}, ${esc(p.competicao)}, ${p.mandante ? 'casa' : 'fora'}</span></div>
            <span class="res r-${resultado(p)}">${p.golsFla}<small>×</small>${p.golsAdv}</span>
          </div>
          <div class="cr-base">
            ${avatarHTML(jogador(dd.craque[0]), 'p')}
            <span><span class="rotulo">Craque</span>${nomes(dd.craque)}</span>
            ${notaHTML(dd.max, 'pequena')}
            <span class="cr-media"><span class="rotulo">Média</span>${fmtNota(dd.media)}</span>
          </div>
        </a></li>`;
      }).join('')}</ul>
      ${lista.length ? '' : '<p class="vazio">Nenhum jogo nessa competição ainda.</p>'}
    </section>`;
  }

  const vazio = !ult && !prox.length ? `<div class="card vazio-card"><p>Nenhum jogo avaliado ainda.</p><a class="botao" href="#/lancar">Dar as primeiras notas</a></div>` : '';
  return `<div class="dash">
    <div class="dash-principal">${cta}${prox.length ? cartaoProximo(prox[0]) : ''}${vazio}${resultados}</div>
    <aside class="dash-lateral">${ultimo}${calendario}</aside>
  </div>`;
}

function telaJogo(id) {
  const p = estado.partidas.find((x) => x.id === id);
  if (!p) return `${voltar('#/', 'Jogos')}<p class="vazio">Esse jogo não está no boletim.</p>`;
  const d = destaques(p);
  const atu = [...p.atuacoes].sort((a, b) => b.nota - a.nota || ORDEM_POS.indexOf(jogador(a.jogador).posicao) - ORDEM_POS.indexOf(jogador(b.jogador).posicao));
  const pessoa = (ids, nota, rotulo, cls) => `<div class="card premio ${cls}">
    <div class="premio-fotos">${ids.slice(0, 4).map((i) => avatarHTML(jogador(i), ids.length > 1 ? 'm' : 'g')).join('')}${ids.length > 4 ? `<span class="mais">+${ids.length - 4}</span>` : ''}</div>
    ${notaHTML(nota)}
    <div><span class="rotulo">${rotulo}</span><b>${nomes(ids)}</b></div>
  </div>`;
  return `${voltar('#/', 'Jogos')}
    <div class="jogo-layout">
      <div class="jogo-lateral">
        <header class="card placar-jogo">
          <div class="sub">${fmtData(p.data, 'semana')}${p.hora ? `, ${fmtHora(p.hora)}` : ''}${localJogo(p) ? `, ${localJogo(p)}` : ''}</div>
          ${confronto(p, 'g', placarDe(p))}
          <div class="sub">${rotuloJogo(p)}</div>
          ${temToken() ? `<a class="botao sec" href="#/lancar/${p.id}">Editar notas</a>` : ''}
        </header>
        <div class="premios">
          ${pessoa(d.craque, d.max, d.craque.length > 1 ? 'Craques do jogo' : 'Craque do jogo', 'premio-craque')}
          ${d.pior.length ? pessoa(d.pior, d.min, 'Pior em campo', 'premio-pior') : ''}
          <div class="card premio-media"><span class="numero-grande">${fmtNota(d.media)}</span><div><span class="rotulo">Média do time</span><b>${plural(p.atuacoes.length, 'jogador avaliado', 'jogadores avaliados')}</b></div></div>
        </div>
      </div>
      <section class="card lista-notas">
        <h2>Notas</h2>
        <ul class="atuacoes">
          ${atu.map((a) => {
            const j = jogador(a.jogador);
            const craque = d.craque.includes(a.jogador), pior = d.pior.includes(a.jogador);
            const det = [POS_UM[j.posicao]];
            if (a.gols) det.push(plural(a.gols, 'gol', 'gols'));
            if (a.assist) det.push(plural(a.assist, 'assistência', 'assistências'));
            return `<li><a class="atuacao ${craque ? 'craque' : ''}" href="#/jogador/${j.id}">
              ${avatarHTML(j, 'm')}
              <span class="quem"><b>${esc(j.nome)}</b>${craque ? '<span class="tag craque">Craque</span>' : ''}${pior ? '<span class="tag pior">Pior</span>' : ''}
                <span class="det">${det.join(', ')}</span></span>
              ${notaHTML(a.nota)}
            </a></li>`;
          }).join('')}
        </ul>
      </section>
    </div>`;
}

function telaRanking() {
  if (!estado.partidas.length) return `<h1 class="titulo-pagina">Ranking</h1><p class="vazio">O ranking aparece depois do primeiro jogo avaliado.</p>`;
  const r = estado.ranking;
  const partidas = filtrarComp(estado.partidas, r.comp);
  const todas = estatisticas(partidas);
  const maxJogos = Math.max(1, ...todas.map((s) => s.jogos));
  if (r.minimo > maxJogos) r.minimo = 1;
  const linhas = todas.filter((s) => s.jogos >= r.minimo)
    .sort((a, b) => (r.ordem === 'nome' ? jogador(a.id).nome.localeCompare(jogador(b.id).nome) * r.dir : (a[r.ordem] - b[r.ordem]) * r.dir) || b.media - a.media);
  const podio = [...todas].filter((s) => s.jogos >= r.minimo).sort((a, b) => b.media - a.media || b.jogos - a.jogos).slice(0, 3);
  const col = (chave, rotulo) => `<th scope="col"><button data-ordem="${chave}" data-ativo="${r.ordem === chave}">${rotulo}${r.ordem === chave ? `<svg class="seta ${r.dir < 0 ? 'baixo' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>` : ''}</button></th>`;
  return `
    <div class="pagina-topo">
      <div><h1 class="titulo-pagina">Ranking da temporada</h1>
      <p class="sub">Média das notas em ${plural(partidas.length, 'jogo avaliado', 'jogos avaliados')}.</p></div>
      <div class="ranking-controles">
        <label class="campo">Competição
          <select id="r-comp">${['Todas', ...competicoesUsadas()].map((c) => `<option ${c === r.comp ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        </label>
        <label class="campo">Mínimo de jogos
          <select id="r-min">${Array.from({ length: maxJogos }, (_, i) => i + 1).map((n) => `<option value="${n}" ${n === r.minimo ? 'selected' : ''}>${n}</option>`).join('')}</select>
        </label>
      </div>
    </div>
    <div class="ranking-layout">
      ${podio.length ? `<ol class="podio">${podio.map((s, i) => {
        const j = jogador(s.id);
        return `<li class="degrau d${i + 1}"><a class="card" href="#/jogador/${j.id}">
          <span class="lugar">${i + 1}º</span>
          ${avatarHTML(j, i === 0 ? 'xg' : 'g')}
          <b>${esc(j.nome)}</b>
          ${notaHTML(s.media)}
          <span class="sub">${plural(s.jogos, 'jogo', 'jogos')}</span>
        </a></li>`;
      }).join('')}</ol>` : ''}
      <div class="card tabela-card"><div class="tabela-scroll"><table>
        <thead><tr><th scope="col">#</th>${col('nome', 'Jogador')}${col('jogos', 'Jogos')}${col('media', 'Média')}${col('gols', 'Gols')}${col('assist', 'Assist.')}${col('craque', 'Craque')}${col('pior', 'Pior')}</tr></thead>
        <tbody>${linhas.map((s, i) => {
          const j = jogador(s.id);
          return `<tr>
            <td class="pos-rank">${i + 1}</td>
            <td><a class="jog-cel" href="#/jogador/${j.id}">${avatarHTML(j, 'p')}${esc(j.nome)}</a></td>
            <td>${s.jogos}</td><td>${notaHTML(s.media, 'pequena')}</td><td>${s.gols}</td><td>${s.assist}</td><td>${s.craque}</td><td>${s.pior}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div></div>
    </div>`;
}

function graficoEvolucao(pontos) {
  const W = 900, H = 280, m = { e: 34, d: 14, t: 14, b: 30 };
  const iw = W - m.e - m.d, ih = H - m.t - m.b;
  const x = (i) => m.e + (pontos.length === 1 ? iw / 2 : (i * iw) / (pontos.length - 1));
  const y = (n) => m.t + ih - (n / 10) * ih;
  const grade = [0, 2, 4, 6, 8, 10].map((n) => `<line x1="${m.e}" x2="${W - m.d}" y1="${y(n)}" y2="${y(n)}" stroke="rgba(255,255,255,.08)"/><text x="${m.e - 8}" y="${y(n) + 4}" fill="var(--apagado)" font-size="12" text-anchor="end">${n}</text>`).join('');
  const media = pontos.reduce((s, p) => s + p.nota, 0) / pontos.length;
  const caminho = pontos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.nota).toFixed(1)}`).join(' ');
  const area = `${caminho} L${x(pontos.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const passo = Math.ceil(pontos.length / 8);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolução das notas jogo a jogo">
    <defs><linearGradient id="g-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff1f38" stop-opacity=".4"/><stop offset="1" stop-color="#ff1f38" stop-opacity="0"/></linearGradient></defs>
    ${grade}
    ${pontos.length > 1 ? `<path d="${area}" fill="url(#g-area)"/>` : ''}
    <line x1="${m.e}" x2="${W - m.d}" y1="${y(media)}" y2="${y(media)}" stroke="var(--apagado)" stroke-dasharray="4 4"/>
    <text x="${m.e + 6}" y="${y(media) - 6}" fill="var(--apagado)" font-size="12">média ${fmtNota(media)}</text>
    <path d="${caminho}" fill="none" stroke="#ff1f38" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    ${pontos.map((p, i) => `<a href="#/jogo/${p.id}"><circle cx="${x(i)}" cy="${y(p.nota)}" r="6.5" fill="hsl(${matizNota(p.nota)} 80% 50%)" stroke="#120507" stroke-width="2"><title>${fmtData(p.data)} × ${esc(p.adversario)}: ${fmtNota(p.nota)}</title></circle></a>
      ${i % passo === 0 ? `<text x="${x(i)}" y="${H - 8}" fill="var(--apagado)" font-size="11" text-anchor="middle">${fmtData(p.data)}</text>` : ''}`).join('')}
  </svg>`;
}

function telaJogador(id) {
  const j = jogador(id);
  const jogos = estado.partidas.filter((p) => p.atuacoes.some((a) => a.jogador === id));
  const topo = `${voltar('#/ranking', 'Ranking')}
    <header class="card jogador-topo">
      ${avatarHTML(j, 'xxg')}
      <div>
        <div class="sub">${POS_UM[j.posicao]}${j.numero ? `, camisa ${j.numero}` : ''}</div>
        <h1>${esc(j.nome)}</h1>
      </div>`;
  if (!jogos.length) return `${topo}</header><p class="vazio">Ainda sem notas nesta temporada.</p>`;
  const s = estatisticas(jogos).find((x) => x.id === id);
  const cron = [...jogos].reverse().map((p) => ({ ...p.atuacoes.find((a) => a.jogador === id), id: p.id, data: p.data, adversario: p.adversario }));
  const melhor = cron.reduce((a, b) => (b.nota > a.nota ? b : a));
  const ultimos = cron.slice(-5);
  return `${topo}
      <div class="numeros">
        <div><span class="numero-grande destaque-num">${fmtNota(s.media)}</span><span>média</span></div>
        <div><span class="numero-grande">${s.jogos}</span><span>${s.jogos === 1 ? 'jogo' : 'jogos'}</span></div>
        <div><span class="numero-grande">${s.gols}</span><span>${s.gols === 1 ? 'gol' : 'gols'}</span></div>
        <div><span class="numero-grande">${s.assist}</span><span>${s.assist === 1 ? 'assistência' : 'assistências'}</span></div>
        <div><span class="numero-grande">${s.craque}</span><span>vezes craque</span></div>
        <div><span class="numero-grande">${fmtNota(melhor.nota)}</span><span>melhor nota, contra ${esc(timeDe(melhor.adversario).nome)}</span></div>
      </div>
    </header>
    <div class="jogador-layout">
      <section class="card">
        <div class="card-topo"><h2>Evolução</h2><div class="forma"><span class="sub">Últimos ${ultimos.length}</span>${ultimos.map((u) => notaHTML(u.nota, 'pequena')).join('')}</div></div>
        <div class="grafico">${graficoEvolucao(cron)}</div>
      </section>
      <section class="card">
        <h2>Jogo a jogo</h2>
        <ul class="resultados">${jogos.map((p) => {
          const a = p.atuacoes.find((x) => x.jogador === id);
          const extra = [a.gols ? plural(a.gols, 'gol', 'gols') : '', a.assist ? plural(a.assist, 'assist.', 'assists.') : ''].filter(Boolean).join(', ');
          return `<li><a class="resultado" href="#/jogo/${p.id}">
            ${escudoHTML(p.adversario, 'p')}
            <span class="adv">${esc(timeDe(p.adversario).nome)}<span class="comp">${fmtData(p.data)}, ${esc(p.competicao)}${extra ? `, ${extra}` : ''}</span></span>
            <span class="res r-${resultado(p)}">${p.golsFla}<small>×</small>${p.golsAdv}</span>
            ${notaHTML(a.nota, 'pequena')}
          </a></li>`;
        }).join('')}</ul>
      </section>
    </div>`;
}

/* ================= diálogo de confirmação ================= */
function confirmar(mensagem, ok = 'Confirmar', perigo = false) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'card dialogo';
    dlg.innerHTML = `<p>${esc(mensagem)}</p><div class="botoes"><button class="botao sec" value="0">Cancelar</button><button class="botao ${perigo ? 'perigo' : ''}" value="1">${esc(ok)}</button></div>`;
    document.body.appendChild(dlg);
    const fim = (v) => { dlg.close(); dlg.remove(); resolve(v); };
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); fim(false); });
    dlg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) fim(b.value === '1'); else if (e.target === dlg) fim(false); });
    dlg.showModal();
    dlg.querySelector('[value="1"]').focus();
  });
}

/* ================= área do autor ================= */
const ABAS = [['lancar', 'Notas'], ['calendario', 'Calendário'], ['elenco', 'Elenco e fotos'], ['times', 'Escudos'], ['conexao', 'Conexão']];
function abasAutor(atual) {
  return `<nav class="abas" aria-label="Área do autor">${ABAS.map(([id, nome]) => `<a href="#/${id === 'lancar' ? 'lancar' : 'autor/' + id}" ${id === atual ? 'aria-current="page"' : ''}>${nome}</a>`).join('')}</nav>`;
}

function novoRascunho(jogoCal) {
  const r = { id: null, calendarioId: null, data: hojeISO(), hora: null, adversario: '', mandante: true, competicao: 'Brasileirão', estadio: '', cidade: '', golsFla: 0, golsAdv: 0, atuacoes: {}, naoAtuou: {}, manual: !jogoCal };
  if (jogoCal) Object.assign(r, { calendarioId: jogoCal.id, data: jogoCal.data, hora: jogoCal.hora, adversario: timeDe(jogoCal.adversario).nome, mandante: jogoCal.mandante, competicao: jogoCal.competicao, rodada: jogoCal.rodada, estadio: jogoCal.estadio, cidade: jogoCal.cidade });
  return r;
}
function rascunhoDe(p) {
  const atuacoes = {}, naoAtuou = {};
  p.atuacoes.forEach((a) => (atuacoes[a.jogador] = { nota: a.nota, gols: a.gols || 0, assist: a.assist || 0 }));
  estado.elenco.forEach((j) => { if (j.ativo !== false && !atuacoes[j.id]) naoAtuou[j.id] = true; });
  return { ...p, atuacoes, naoAtuou };
}
function guardarRascunho() {
  try { localStorage.setItem(RASCUNHO_KEY, JSON.stringify(estado.rascunho)); } catch { /* segue em memória */ }
}
function precisaConexao() {
  return `${abasAutor('conexao')}<p class="ajuda">Para dar notas, conecte este navegador ao seu repositório. É só uma vez.</p>${telaConexao()}`;
}
const jogadoresDoLancamento = (r) => estado.elenco.filter((j) => j.ativo !== false || r.atuacoes[j.id])
  .sort((a, b) => ORDEM_POS.indexOf(a.posicao) - ORDEM_POS.indexOf(b.posicao) || (a.numero ?? 999) - (b.numero ?? 999));
const temNota = (r, id) => r.atuacoes[id]?.nota != null;
const situacao = (r, id) => (r.naoAtuou[id] ? 'nao-atuou' : temNota(r, id) ? 'com-nota' : 'pendente');

function telaLancar(param, calId) {
  if (!temToken()) return precisaConexao();
  if (param === 'novo' && calId) {
    const c = estado.calendario.find((x) => x.id === calId);
    if (c && (!estado.rascunho || estado.rascunho.calendarioId !== calId)) { estado.rascunho = novoRascunho(c); guardarRascunho(); }
  } else if (param === 'outro') {
    if (!estado.rascunho || !estado.rascunho.manual || estado.rascunho.id) { estado.rascunho = novoRascunho(null); guardarRascunho(); }
  } else if (param && param !== 'novo') {
    const p = estado.partidas.find((x) => x.id === param);
    if (!p) return `${abasAutor('lancar')}<p class="vazio">Jogo não encontrado.</p>`;
    if (!estado.rascunho || estado.rascunho.id !== param) estado.rascunho = rascunhoDe(p);
  } else if (!estado.rascunho || estado.rascunho.id) {
    let salvo = null;
    try { salvo = JSON.parse(localStorage.getItem(RASCUNHO_KEY) || 'null'); } catch { salvo = null; }
    const pend = jogosSemNota()[0];
    estado.rascunho = salvo && !salvo.id ? salvo : pend ? novoRascunho(pend) : null;
  }
  const r = estado.rascunho;
  if (r) r.naoAtuou = r.naoAtuou || {};

  const abertos = jogosAbertos();
  const cartaoEscolha = (c) => {
    const passou = c.data < hojeISO();
    return `<a class="card escolha ${r && r.calendarioId === c.id ? 'selecionada' : ''}" href="#/lancar/novo/${c.id}" ${r && r.calendarioId === c.id ? 'aria-current="true"' : ''}>
      <div class="escolha-escudos">${escudoHTML(c.mandante ? 'Flamengo' : c.adversario, 'p')}<span>×</span>${escudoHTML(c.mandante ? c.adversario : 'Flamengo', 'p')}</div>
      <b>${esc(timeDe(c.adversario).nome)}</b>
      <span class="sub">${fmtData(c.data)}, ${c.mandante ? 'casa' : 'fora'}</span>
      <span class="pilula ${passou ? 'pilula-alerta' : ''}">${passou ? 'Sem notas' : faltam(c.data)}</span>
    </a>`;
  };
  const escolher = r && r.id
    ? `<div class="editando card"><span class="rotulo">Editando</span><b>${tituloJogo(r)}</b><span class="sub">${fmtData(r.data, 'semana')}</span><a class="link" href="#/lancar/novo">Trocar de jogo</a></div>`
    : `<div class="trilho" role="list">
        ${abertos.map(cartaoEscolha).join('')}
        <a class="card escolha escolha-outro ${r && r.manual ? 'selecionada' : ''}" href="#/lancar/outro"><span class="mais-grande">+</span><b>Outro jogo</b><span class="sub">preencher à mão</span></a>
      </div>`;

  if (!r) {
    return `${abasAutor('lancar')}
      <h1 class="titulo-pagina">Dar notas</h1>
      <p class="ajuda">Escolha a partida para começar.</p>${escolher}`;
  }

  const comps = COMPETICOES.includes(r.competicao) ? COMPETICOES : [...COMPETICOES, r.competicao];
  const lista = jogadoresDoLancamento(r);
  return `${abasAutor('lancar')}
    <div class="lancar-cabeca">
      <h1 class="titulo-pagina">${r.id ? 'Editar notas' : 'Dar notas'}</h1>
    </div>
    ${escolher}

    <section class="card painel-jogo">
      <div class="placar-edit">
        ${ladoPlacar(r, r.mandante ? 'fla' : 'adv')}
        <span class="x">×</span>
        ${ladoPlacar(r, r.mandante ? 'adv' : 'fla')}
      </div>
      <p class="sub meta-jogo">${r.adversario ? `${rotuloJogo(r)}, ${fmtData(r.data, 'semana')}${r.estadio ? `, ${esc(r.estadio)}` : ''}` : 'Preencha os detalhes da partida'}</p>
      <details class="detalhes" ${r.manual && !r.adversario ? 'open' : ''}>
        <summary>Detalhes da partida</summary>
        <div class="grade">
          <label class="campo">Adversário<input type="text" id="f-adv" value="${esc(r.adversario)}" placeholder="Ex.: Palmeiras" autocomplete="off" list="lista-times"></label>
          <label class="campo">Data<input type="date" id="f-data" value="${esc(r.data)}"></label>
          <label class="campo">Competição<select id="f-comp">${comps.map((x) => `<option ${x === r.competicao ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
          <div class="campo">Mando
            <div class="segmentos" role="group" aria-label="Mando de campo">
              <button type="button" class="seg" data-mando="1" aria-pressed="${r.mandante}">Em casa</button>
              <button type="button" class="seg" data-mando="0" aria-pressed="${!r.mandante}">Fora</button>
            </div>
          </div>
          <label class="campo">Estádio<input type="text" id="f-est" value="${esc(r.estadio || '')}" placeholder="Ex.: Maracanã" autocomplete="off"></label>
        </div>
        <datalist id="lista-times">${Object.values(estado.times).filter((t) => t.nome !== 'Flamengo').map((t) => `<option value="${esc(t.nome)}">`).join('')}</datalist>
      </details>
    </section>

    <div class="lancar-topo">
      <h2>Notas</h2>
      <p class="sub">Deslize a régua de cada jogador. Toque no ✕ de quem não entrou em campo. Mínimo de ${MIN_NOTAS} e máximo de ${MAX_NOTAS} notas.</p>
    </div>
    <div class="lista-lancar">
    ${ORDEM_POS.map((pos) => {
      const grupo = lista.filter((j) => j.posicao === pos);
      if (!grupo.length) return '';
      return `<section class="grupo-pos"><h3>${POSICOES[pos]}</h3><div class="grade-jog">${grupo.map((j) => linhaJogador(j, r)).join('')}</div></section>`;
    }).join('')}
    </div>
    <section id="fora-jogo" class="fora-jogo" hidden></section>

    <div class="barra-salvar card">
      <div class="progresso-info">
        <span id="contagem"></span>
        <span class="barra"><span id="barra-fill"></span><i class="marca-min" style="left:${(MIN_NOTAS / MAX_NOTAS) * 100}%"></i></span>
      </div>
      <button class="botao" id="f-salvar">${r.id ? 'Salvar alterações' : 'Salvar notas'}</button>
    </div>
    <div class="acoes-fim">
      ${r.id ? '<button class="botao perigo" id="f-excluir">Excluir este jogo</button>' : '<button class="botao sec" id="f-limpar">Apagar o que preenchi</button>'}
    </div>`;
}
function ladoPlacar(r, quem) {
  const nome = quem === 'fla' ? 'Flamengo' : r.adversario || 'Adversário';
  const v = quem === 'fla' ? r.golsFla : r.golsAdv;
  return `<div class="lado-placar">
    ${escudoHTML(nome, 'g')}
    <span class="nome-time">${esc(timeDe(nome).nome)}</span>
    <div class="contador" role="group" aria-label="Gols do ${esc(nome)}">
      <button type="button" class="redondo" data-placar="${quem}" data-delta="-1" aria-label="Menos um gol">−</button>
      <span class="contador-valor" data-placar-valor="${quem}">${v}</span>
      <button type="button" class="redondo" data-placar="${quem}" data-delta="1" aria-label="Mais um gol">+</button>
    </div>
  </div>`;
}
const MAX_NOTAS = 16, MIN_NOTAS = 11;
const ICONE_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const ICONE_VOLTA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

function linhaJogador(j, r) {
  const a = r.atuacoes[j.id] || { nota: null, gols: 0, assist: 0 };
  const sit = situacao(r, j.id);
  const v = a.nota ?? 6;
  return `<div class="jog ${sit}" data-jogador="${j.id}" style="--h:${matizNota(v)};--p:${v * 10}%" ${sit === 'nao-atuou' ? 'hidden' : ''}>
    ${avatarHTML(j, 'g')}
    <span class="jog-nome"><b>${esc(j.nome)}</b><span class="sub">${j.numero ? `${j.numero}, ` : ''}${POS_UM[j.posicao]}</span></span>
    <div class="regua-box">
      <input class="regua" type="range" min="0" max="10" step="0.5" value="${v}" data-regua aria-label="Nota de ${esc(j.nome)}">
      <span class="marcas" aria-hidden="true">${[0, 2, 4, 6, 8, 10].map((n) => `<i>${n}</i>`).join('')}</span>
    </div>
    <button type="button" class="valor-nota" data-limpar-nota title="Toque para apagar a nota">${a.nota != null ? fmtNota(a.nota) : '–'}</button>
    <span class="ga-mini">
      ${['gols', 'assist'].map((k) => `<span class="ga-par ${a[k] ? 'tem' : ''}"><button type="button" data-ga="${k}" data-delta="-1" aria-label="Menos ${k === 'gols' ? 'um gol' : 'uma assistência'}">−</button><span class="ga-v" data-v="${k}">${k === 'gols' ? 'G' : 'A'}${a[k] || 0}</span><button type="button" data-ga="${k}" data-delta="1" aria-label="Mais ${k === 'gols' ? 'um gol' : 'uma assistência'}">+</button></span>`).join('')}
    </span>
    <button type="button" class="tirar" data-nao aria-label="${esc(j.nome)} não atuou" title="Não atuou">${ICONE_X}</button>
  </div>`;
}
function contar() {
  const r = estado.rascunho;
  const lista = jogadoresDoLancamento(r);
  const com = lista.filter((j) => situacao(r, j.id) === 'com-nota').length;
  const nao = lista.filter((j) => situacao(r, j.id) === 'nao-atuou').length;
  return { total: lista.length, com, nao, pend: lista.length - com - nao };
}
function contagemTexto() {
  const c = contar();
  if (c.com < MIN_NOTAS) return `${c.com} de ${MAX_NOTAS} notas. Faltam ${MIN_NOTAS - c.com} para o mínimo de ${MIN_NOTAS}`;
  if (c.com === MAX_NOTAS) return `${MAX_NOTAS} de ${MAX_NOTAS} notas. Limite atingido`;
  return `${c.com} de ${MAX_NOTAS} notas`;
}
function atualizarResumo() {
  const c = contar();
  const t = $('#contagem'); if (t) t.textContent = contagemTexto();
  const f = $('#barra-fill'); if (f) f.style.width = (c.com / MAX_NOTAS) * 100 + '%';
  const lim = c.com >= MAX_NOTAS;
  document.querySelector('.lista-lancar')?.classList.toggle('no-limite', lim);
  const s = $('#f-salvar'); if (s) s.classList.toggle('pronto', c.com >= MIN_NOTAS);
}
function atualizarLinha(id) {
  const r = estado.rascunho;
  const el = document.querySelector(`.jog[data-jogador="${id}"]`);
  if (!el) return;
  const sit = situacao(r, id), a = r.atuacoes[id] || { nota: null, gols: 0, assist: 0 };
  el.classList.remove('pendente', 'com-nota', 'nao-atuou');
  el.classList.add(sit);
  if (a.nota != null) { el.style.setProperty('--h', matizNota(a.nota)); el.style.setProperty('--p', a.nota * 10 + '%'); }
  el.querySelector('.valor-nota').textContent = a.nota != null ? fmtNota(a.nota) : '–';
  ['gols', 'assist'].forEach((k) => {
    el.querySelector(`[data-v="${k}"]`).textContent = (k === 'gols' ? 'G' : 'A') + (a[k] || 0);
    el.querySelector(`[data-v="${k}"]`).parentNode.classList.toggle('tem', !!a[k]);
  });
  atualizarResumo();
}
function desenharForaDeJogo() {
  const r = estado.rascunho;
  const fora = jogadoresDoLancamento(r).filter((j) => r.naoAtuou[j.id]);
  const box = $('#fora-jogo');
  if (!box) return;
  box.hidden = !fora.length;
  box.innerHTML = `<h3>Não atuaram <span class="sub">${fora.length}</span></h3>
    <div class="fichas">${fora.map((j) => `<button type="button" class="ficha-jog" data-voltar="${j.id}" title="Voltar para a lista">${ICONE_VOLTA}${esc(j.nome)}</button>`).join('')}</div>`;
  document.querySelectorAll('.grupo-pos').forEach((g) => { g.hidden = !g.querySelector('.jog:not([hidden])'); });
}

function ligarLancar() {
  const app = $('#app');
  const r = estado.rascunho;
  if (!r) return;
  const meta = () => {
    const el = $('.meta-jogo', app);
    if (el) el.innerHTML = r.adversario ? `${rotuloJogo(r)}, ${fmtData(r.data, 'semana')}${r.estadio ? `, ${esc(r.estadio)}` : ''}` : 'Preencha os detalhes da partida';
  };
  const ligarCampo = (sel, chave, conv = (v) => v, redesenhar = false) => {
    const el = $(sel, app);
    if (el) el.addEventListener(redesenhar ? 'change' : 'input', () => {
      r[chave] = conv(el.value); guardarRascunho(); meta();
      if (redesenhar) { const lados = app.querySelectorAll('.lado-placar'); const nl = [r.mandante ? 'fla' : 'adv', r.mandante ? 'adv' : 'fla']; lados.forEach((l, i) => { const t = document.createElement('div'); t.innerHTML = ladoPlacar(r, nl[i]); l.replaceWith(t.firstElementChild); }); }
    });
  };
  ligarCampo('#f-data', 'data');
  ligarCampo('#f-adv', 'adversario', (v) => v.trim(), true);
  ligarCampo('#f-comp', 'competicao');
  ligarCampo('#f-est', 'estadio', (v) => v.trim());

  // guarda o rascunho sem travar o deslizar (no máximo a cada 400 ms)
  let tGuardar;
  const guardarDepois = () => { clearTimeout(tGuardar); tGuardar = setTimeout(guardarRascunho, 400); };

  const darNota = (regua) => {
    const id = regua.closest('[data-jogador]').dataset.jogador;
    const ja = temNota(r, id);
    if (!ja && contar().com >= MAX_NOTAS) {
      avisar(`Limite de ${MAX_NOTAS} notas: 11 titulares e até 5 substitutos.`, true);
      regua.value = 6; return;
    }
    const a = (r.atuacoes[id] = r.atuacoes[id] || { nota: null, gols: 0, assist: 0 });
    a.nota = Number(regua.value);
    delete r.naoAtuou[id];
    const el = regua.closest('.jog');
    el.style.setProperty('--h', matizNota(a.nota));
    el.style.setProperty('--p', a.nota * 10 + '%');
    el.querySelector('.valor-nota').textContent = fmtNota(a.nota);
    if (!ja) { el.classList.remove('pendente'); el.classList.add('com-nota'); atualizarResumo(); }
    guardarDepois();
  };
  app.addEventListener('input', (ev) => { if (ev.target.matches('[data-regua]')) darNota(ev.target); });
  // um toque na régua sem arrastar também vale como nota
  app.addEventListener('change', (ev) => { if (ev.target.matches('[data-regua]')) { darNota(ev.target); guardarRascunho(); } });
  app.addEventListener('pointerup', (ev) => {
    if (ev.target.matches('[data-regua]') && !temNota(r, ev.target.closest('[data-jogador]').dataset.jogador)) darNota(ev.target);
  });

  app.addEventListener('click', async (ev) => {
    const alvo = ev.target.closest('button');
    if (!alvo) return;
    if (alvo.dataset.placar) {
      const k = alvo.dataset.placar === 'fla' ? 'golsFla' : 'golsAdv';
      r[k] = Math.max(0, Math.min(20, r[k] + Number(alvo.dataset.delta)));
      $(`[data-placar-valor="${alvo.dataset.placar}"]`, app).textContent = r[k];
      guardarRascunho(); return;
    }
    if (alvo.dataset.mando) { r.mandante = alvo.dataset.mando === '1'; guardarRascunho(); render(); return; }
    const linha = alvo.closest('[data-jogador]');
    if (alvo.dataset.ga && linha) {
      const id = linha.dataset.jogador;
      const a = (r.atuacoes[id] = r.atuacoes[id] || { nota: null, gols: 0, assist: 0 });
      a[alvo.dataset.ga] = Math.max(0, (a[alvo.dataset.ga] || 0) + Number(alvo.dataset.delta));
      guardarRascunho(); atualizarLinha(id); return;
    }
    if (alvo.hasAttribute('data-limpar-nota') && linha) {
      const id = linha.dataset.jogador;
      if (r.atuacoes[id]) r.atuacoes[id].nota = null;
      linha.querySelector('[data-regua]').value = 6;
      linha.style.setProperty('--h', matizNota(6)); linha.style.setProperty('--p', '60%');
      guardarRascunho(); atualizarLinha(id); return;
    }
    if (alvo.hasAttribute('data-nao') && linha) {
      const id = linha.dataset.jogador;
      r.naoAtuou[id] = true; delete r.atuacoes[id];
      linha.hidden = true; linha.classList.remove('com-nota'); linha.classList.add('nao-atuou', 'pendente');
      guardarRascunho(); desenharForaDeJogo(); atualizarResumo(); return;
    }
    if (alvo.dataset.voltar) {
      const id = alvo.dataset.voltar;
      delete r.naoAtuou[id];
      const el = document.querySelector(`.jog[data-jogador="${id}"]`);
      if (el) { el.hidden = false; el.classList.remove('nao-atuou'); el.classList.add('pendente'); el.querySelector('.valor-nota').textContent = '–'; el.querySelector('[data-regua]').value = 6; }
      guardarRascunho(); desenharForaDeJogo(); atualizarResumo(); return;
    }
    if (alvo.id === 'f-limpar') {
      if (!(await confirmar('Apagar todas as notas preenchidas neste jogo?', 'Apagar', true))) return;
      r.atuacoes = {}; r.naoAtuou = {}; r.golsFla = 0; r.golsAdv = 0; guardarRascunho(); render();
    }
    if (alvo.id === 'f-salvar') salvarPartida(alvo);
    if (alvo.id === 'f-excluir') excluirPartida(alvo);
  });
  desenharForaDeJogo();
  atualizarResumo();
}

function montarPartida() {
  const r = estado.rascunho;
  const atuacoes = Object.entries(r.atuacoes).filter(([, a]) => a.nota != null).map(([j, a]) => ({ jogador: j, nota: a.nota, gols: a.gols || 0, assist: a.assist || 0 }))
    .sort((a, b) => ORDEM_POS.indexOf(jogador(a.jogador).posicao) - ORDEM_POS.indexOf(jogador(b.jogador).posicao));
  let id = r.id;
  if (!id) {
    const base = `${r.data}-${slug(r.adversario)}`;
    id = base; let n = 2;
    while (estado.partidas.some((p) => p.id === id)) id = `${base}-${n++}`;
  }
  const p = { id, data: r.data, adversario: r.adversario, mandante: r.mandante, competicao: r.competicao, golsFla: r.golsFla, golsAdv: r.golsAdv, atuacoes };
  ['calendarioId', 'hora', 'rodada', 'estadio', 'cidade'].forEach((k) => { if (r[k]) p[k] = r[k]; });
  return p;
}
async function salvarPartida(botao) {
  const r = estado.rascunho;
  if (!r.adversario) { const d = $('.detalhes'); if (d) d.open = true; $('#f-adv')?.focus(); return avisar('Escreva o nome do adversário nos detalhes da partida.', true); }
  if (!r.data) return avisar('Escolha a data do jogo.', true);
  const c = contar();
  if (c.com < MIN_NOTAS) {
    const primeiro = document.querySelector('.jog.pendente:not([hidden])');
    if (primeiro) primeiro.scrollIntoView({ block: 'center' });
    return avisar(`Uma partida precisa de pelo menos ${MIN_NOTAS} notas. Faltam ${MIN_NOTAS - c.com}.`, true);
  }
  if (c.com > MAX_NOTAS) return avisar(`Uma partida pode ter no máximo ${MAX_NOTAS} notas.`, true);
  // quem ficou sem nota é salvo como não atuou
  const p = montarPartida();
  const lista = estado.partidas.filter((x) => x.id !== p.id).concat(p).sort((a, b) => b.data.localeCompare(a.data));
  botao.disabled = true; botao.textContent = 'Salvando…';
  try {
    await gravarDados('partidas', { ...estado.meta.partidas, temporada: estado.temporada, partidas: lista }, `${r.id ? 'Edita' : 'Notas de'} ${p.data} × ${p.adversario}`);
    estado.partidas = lista;
    const editando = !!r.id;
    estado.rascunho = null;
    try { localStorage.removeItem(RASCUNHO_KEY); } catch { /* ok */ }
    avisar(editando ? 'Alterações salvas. O site atualiza em cerca de 1 minuto.' : 'Notas salvas. O site atualiza em cerca de 1 minuto.');
    location.hash = `#/jogo/${p.id}`;
  } catch (e) {
    avisar(explicarErro(e), true);
    botao.disabled = false; botao.textContent = r.id ? 'Salvar alterações' : 'Salvar notas';
  }
}
async function excluirPartida(botao) {
  const r = estado.rascunho;
  if (!(await confirmar(`Excluir o jogo contra ${r.adversario} e todas as notas dele?`, 'Excluir', true))) return;
  const lista = estado.partidas.filter((x) => x.id !== r.id);
  botao.disabled = true;
  try {
    await gravarDados('partidas', { ...estado.meta.partidas, temporada: estado.temporada, partidas: lista }, `Exclui ${r.data} × ${r.adversario}`);
    estado.partidas = lista; estado.rascunho = null;
    avisar('Jogo excluído.');
    location.hash = '#/';
  } catch (e) { avisar(explicarErro(e), true); botao.disabled = false; }
}

/* ---------- calendário ---------- */
function telaCalendario() {
  if (!temToken()) return precisaConexao();
  return `${abasAutor('calendario')}
    <h1 class="titulo-pagina">Calendário</h1>
    <p class="ajuda">Quando a CBF confirmar horário ou mudar uma data, atualize aqui e salve. Jogos que já têm notas saem da lista de próximos automaticamente.</p>
    <div class="cal-edit">${estado.calendario.map((c, i) => linhaCal(c, i)).join('')}</div>
    <div class="botoes" style="margin-top:1rem">
      <button class="botao sec" id="cal-add">Adicionar jogo</button>
      <button class="botao" id="cal-salvar">Salvar calendário</button>
    </div>`;
}
function linhaCal(c, i) {
  const feito = partidaDoJogo(c);
  return `<div class="card cal-linha ${feito ? 'feito' : ''}" data-i="${i}">
    ${escudoHTML(c.adversario, 'm')}
    <div class="grade grade-cal">
      <label class="campo">Adversário<input type="text" data-k="adversario" value="${esc(c.adversario)}" list="lista-times-cal"></label>
      <label class="campo">Data<input type="date" data-k="data" value="${esc(c.data)}"></label>
      <label class="campo">Horário<input type="time" data-k="hora" value="${esc(c.hora || '')}"></label>
      <label class="campo">Competição<select data-k="competicao">${COMPETICOES.map((x) => `<option ${x === c.competicao ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label class="campo">Rodada ou fase<input type="text" data-k="rodada" value="${esc(c.rodada ?? '')}"></label>
      <label class="campo">Estádio<input type="text" data-k="estadio" value="${esc(c.estadio || '')}"></label>
      <label class="campo">Cidade<input type="text" data-k="cidade" value="${esc(c.cidade || '')}"></label>
      <label class="switch campo-switch"><input type="checkbox" role="switch" data-k="mandante" ${c.mandante ? 'checked' : ''}><span class="sw" aria-hidden="true"></span><span class="sw-rot">Flamengo é mandante</span></label>
    </div>
    <div class="cal-acoes">${feito ? `<a class="sub" href="#/jogo/${feito.id}">Com notas</a>` : `<a class="botao sec mini-botao" href="#/lancar/novo/${c.id}">Lançar notas</a>`}
      <button class="botao sec mini-botao" data-remover="${i}">Remover</button></div>
    ${i === 0 ? `<datalist id="lista-times-cal">${Object.values(estado.times).filter((t) => t.nome !== 'Flamengo').map((t) => `<option value="${esc(t.nome)}">`).join('')}</datalist>` : ''}
  </div>`;
}
function ligarCalendario() {
  const app = $('#app');
  app.addEventListener('input', (ev) => {
    const linha = ev.target.closest('.cal-linha');
    if (!linha || !ev.target.dataset.k) return;
    const c = estado.calendario[Number(linha.dataset.i)];
    const k = ev.target.dataset.k;
    if (k === 'mandante') c.mandante = ev.target.checked;
    else if (k === 'rodada') c.rodada = /^\d+$/.test(ev.target.value) ? Number(ev.target.value) : ev.target.value || null;
    else c[k] = ev.target.value || (k === 'hora' ? null : '');
    if (k === 'adversario') linha.querySelector('.escudo').outerHTML = escudoHTML(c.adversario, 'm');
  });
  app.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.remover !== undefined) {
      const c = estado.calendario[Number(b.dataset.remover)];
      if (!(await confirmar(`Remover ${c.adversario} (${fmtData(c.data)}) do calendário?`, 'Remover', true))) return;
      estado.calendario.splice(Number(b.dataset.remover), 1); render();
    }
    if (b.id === 'cal-add') {
      estado.calendario.push({ id: `jogo-${Date.now().toString(36)}`, competicao: 'Brasileirão', rodada: null, data: hojeISO(), hora: null, adversario: '', mandante: true, estadio: '', cidade: '' });
      render();
      const ultima = [...document.querySelectorAll('.cal-linha')].pop();
      if (ultima) { ultima.scrollIntoView({ block: 'center' }); ultima.querySelector('input').focus(); }
    }
    if (b.id === 'cal-salvar') {
      const vazio = estado.calendario.find((c) => !c.adversario || !c.data);
      if (vazio) return avisar('Todo jogo do calendário precisa de adversário e data.', true);
      b.disabled = true;
      try {
        estado.calendario.sort((a, c) => a.data.localeCompare(c.data));
        await gravarDados('calendario', { ...estado.meta.calendario, temporada: estado.temporada, jogos: estado.calendario }, 'Atualiza calendário');
        avisar('Calendário salvo.'); render();
      } catch (e) { avisar(explicarErro(e), true); b.disabled = false; }
    }
  });
}

/* ---------- elenco e fotos ---------- */
function telaElenco() {
  if (!temToken()) return precisaConexao();
  return `${abasAutor('elenco')}
    <h1 class="titulo-pagina">Elenco e fotos</h1>
    <p class="ajuda">Toque na foto de um jogador para enviar uma imagem. Você ajusta o enquadramento do pescoço para cima antes de salvar. Desmarque “No elenco” para quem saiu do clube; as notas antigas continuam no histórico.</p>
    ${ORDEM_POS.map((pos) => `<div class="grupo-pos"><h3>${POSICOES[pos]}</h3>
      <ul class="elenco-grade">${estado.elenco.filter((j) => j.posicao === pos).map((j) => `<li class="${j.ativo === false ? 'fora' : ''}">
        <button class="foto-botao" data-foto="${j.id}" aria-label="Enviar foto de ${esc(j.nome)}">${avatarHTML(j, 'g')}<span class="trocar">${j.foto ? 'Trocar' : 'Enviar foto'}</span></button>
        <div class="elenco-info">
          <input type="text" class="input-nome" data-campo="nome" data-id="${j.id}" value="${esc(j.nome)}" aria-label="Nome">
          <div class="elenco-linha2">
            <input type="number" data-campo="numero" data-id="${j.id}" value="${j.numero ?? ''}" min="1" max="99" placeholder="nº" aria-label="Número">
            <select data-campo="posicao" data-id="${j.id}" aria-label="Posição">${ORDEM_POS.map((p) => `<option value="${p}" ${p === j.posicao ? 'selected' : ''}>${POS_UM[p]}</option>`).join('')}</select>
          </div>
          <label class="switch"><input type="checkbox" role="switch" data-campo="ativo" data-id="${j.id}" ${j.ativo !== false ? 'checked' : ''}><span class="sw" aria-hidden="true"></span><span class="sw-rot">No elenco</span></label>
        </div>
      </li>`).join('')}</ul></div>`).join('')}
    <section class="card painel" style="margin-top:1.5rem">
      <h2>Novo jogador</h2>
      <div class="grade">
        <label class="campo">Nome<input type="text" id="e-nome" autocomplete="off"></label>
        <label class="campo">Posição<select id="e-pos">${ORDEM_POS.map((p) => `<option value="${p}">${POS_UM[p]}</option>`).join('')}</select></label>
        <label class="campo">Número<input type="number" id="e-num" min="1" max="99" inputmode="numeric"></label>
      </div>
      <button class="botao sec" id="e-add" style="margin-top:1rem">Adicionar ao elenco</button>
    </section>
    <div class="barra-salvar card"><span class="contagem">${plural(estado.elenco.filter((j) => j.ativo !== false).length, 'jogador no elenco', 'jogadores no elenco')}</span>
      <div class="botoes"><button class="botao" id="e-salvar">Salvar elenco</button></div></div>`;
}
function ligarElenco() {
  const app = $('#app');
  app.addEventListener('change', (ev) => {
    const el = ev.target; const j = estado.elenco.find((x) => x.id === el.dataset.id);
    if (!j) return;
    const k = el.dataset.campo;
    if (k === 'ativo') { j.ativo = el.checked; el.closest('li').classList.toggle('fora', !el.checked); }
    else if (k === 'numero') j.numero = parseInt(el.value, 10) || null;
    else if (k === 'nome') j.nome = el.value.trim() || j.nome;
    else if (k === 'posicao') j.posicao = el.value;
  });
  app.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.foto) {
      const j = jogador(b.dataset.foto);
      abrirEditorImagem({ titulo: `Foto de ${j.nome}`, modo: 'foto', aoSalvar: async (base64, dataURL) => {
        const caminho = `fotos/${j.id}.jpg`;
        await enviarArquivo(caminho, base64, `Foto de ${j.nome}`);
        estado.previas[caminho] = dataURL;
        j.foto = `${caminho}?v=${Date.now().toString(36)}`;
        await gravarDados('elenco', { ...estado.meta.elenco, jogadores: estado.elenco }, `Foto de ${j.nome}`);
        avisar(`Foto de ${j.nome} salva.`); render();
      } });
    }
    if (b.id === 'e-add') {
      const nome = $('#e-nome').value.trim();
      if (!nome) return avisar('Escreva o nome do jogador.', true);
      let id = slug(nome), n = 2;
      while (estado.elenco.some((x) => x.id === id)) id = `${slug(nome)}-${n++}`;
      estado.elenco.push({ id, nome, posicao: $('#e-pos').value, numero: parseInt($('#e-num').value, 10) || null, ativo: true });
      avisar(`${nome} adicionado. Salve o elenco para publicar.`); render();
    }
    if (b.id === 'e-salvar') {
      b.disabled = true;
      try {
        await gravarDados('elenco', { ...estado.meta.elenco, atualizado: hojeISO(), jogadores: estado.elenco }, 'Atualiza elenco');
        avisar('Elenco salvo.'); render();
      } catch (e) { avisar(explicarErro(e), true); b.disabled = false; }
    }
  });
}

/* ---------- escudos ---------- */
function telaTimes() {
  if (!temToken()) return precisaConexao();
  const lista = Object.entries(estado.times).sort((a, b) => (a[0] === 'flamengo' ? -1 : b[0] === 'flamengo' ? 1 : a[1].nome.localeCompare(b[1].nome)));
  return `${abasAutor('times')}
    <h1 class="titulo-pagina">Escudos</h1>
    <p class="ajuda">Sem imagem, cada time aparece com a sigla nas cores do clube. Toque em um escudo para enviar a imagem; PNG com fundo transparente fica melhor.</p>
    <ul class="times-grade">${lista.map(([id, t]) => `<li>
      <button class="foto-botao" data-escudo="${id}" aria-label="Enviar escudo do ${esc(t.nome)}">${escudoHTML(id, 'g')}<span class="trocar">${t.escudo ? 'Trocar' : 'Enviar'}</span></button>
      <span>${esc(t.nome)}</span>
    </li>`).join('')}</ul>`;
}
function ligarTimes() {
  $('#app').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-escudo]');
    if (!b) return;
    const id = b.dataset.escudo, t = estado.times[id];
    abrirEditorImagem({ titulo: `Escudo do ${t.nome}`, modo: 'escudo', aoSalvar: async (base64, dataURL) => {
      const caminho = `escudos/${id}.png`;
      await enviarArquivo(caminho, base64, `Escudo do ${t.nome}`);
      estado.previas[caminho] = dataURL;
      t.escudo = `${caminho}?v=${Date.now().toString(36)}`;
      await gravarDados('times', { ...estado.meta.times, times: estado.times }, `Escudo do ${t.nome}`);
      avisar(`Escudo do ${t.nome} salvo.`); render();
    } });
  });
}

/* ---------- editor de imagem (enquadrar e reduzir) ---------- */
function abrirEditorImagem({ titulo, modo, aoSalvar }) {
  const entrada = document.createElement('input');
  entrada.type = 'file'; entrada.accept = 'image/*';
  entrada.addEventListener('change', () => {
    const arquivo = entrada.files[0];
    if (!arquivo) return;
    const img = new Image();
    img.onload = () => montarEditor(img, titulo, modo, aoSalvar);
    img.onerror = () => avisar('Não consegui abrir essa imagem. Tente um JPG ou PNG.', true);
    img.src = URL.createObjectURL(arquivo);
  });
  entrada.click();
}
function montarEditor(img, titulo, modo, aoSalvar) {
  const TAM = modo === 'foto' ? 480 : 256;
  const dlg = document.createElement('dialog');
  dlg.className = 'card editor';
  dlg.innerHTML = `<h2>${esc(titulo)}</h2>
    <p class="ajuda">${modo === 'foto' ? 'Arraste para enquadrar do pescoço para cima e use o zoom.' : 'Ajuste o tamanho do escudo dentro do círculo.'}</p>
    <div class="editor-palco ${modo}"><canvas width="${TAM}" height="${TAM}"></canvas></div>
    <label class="campo">Zoom<input type="range" min="0.5" max="4" step="0.01" value="1"></label>
    <div class="botoes"><button class="botao sec" value="cancelar">Cancelar</button><button class="botao" value="salvar">Salvar imagem</button></div>`;
  document.body.appendChild(dlg);
  const cv = $('canvas', dlg), ctx = cv.getContext('2d'), zoom = $('input', dlg);
  const base = modo === 'foto' ? Math.max(TAM / img.width, TAM / img.height) : Math.min(TAM / img.width, TAM / img.height) * 0.86;
  let z = 1, ox = 0, oy = modo === 'foto' ? Math.max(0, (img.height * base - TAM) / 2) : 0; // foto começa pelo topo
  const desenhar = () => {
    const s = base * z, w = img.width * s, h = img.height * s;
    ctx.clearRect(0, 0, TAM, TAM);
    if (modo === 'foto') { ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, TAM, TAM); }
    ctx.drawImage(img, (TAM - w) / 2 - ox, (TAM - h) / 2 - oy, w, h);
  };
  desenhar();
  zoom.addEventListener('input', () => { z = Number(zoom.value); desenhar(); });
  let arrasto = null;
  cv.addEventListener('pointerdown', (e) => { arrasto = { x: e.clientX, y: e.clientY, ox, oy }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => {
    if (!arrasto) return;
    const k = TAM / cv.getBoundingClientRect().width;
    ox = arrasto.ox - (e.clientX - arrasto.x) * k; oy = arrasto.oy - (e.clientY - arrasto.y) * k; desenhar();
  });
  cv.addEventListener('pointerup', () => (arrasto = null));
  cv.addEventListener('wheel', (e) => { e.preventDefault(); z = Math.min(4, Math.max(0.5, z * (e.deltaY < 0 ? 1.06 : 0.94))); zoom.value = z; desenhar(); }, { passive: false });
  const fechar = () => { dlg.close(); dlg.remove(); URL.revokeObjectURL(img.src); };
  dlg.addEventListener('cancel', fechar);
  dlg.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.value === 'cancelar') return fechar();
    b.disabled = true; b.textContent = 'Enviando…';
    const tipo = modo === 'foto' ? 'image/jpeg' : 'image/png';
    const dataURL = cv.toDataURL(tipo, 0.86);
    try { await aoSalvar(dataURL.split(',')[1], dataURL); fechar(); } catch (err) { avisar(explicarErro(err), true); b.disabled = false; b.textContent = 'Salvar imagem'; }
  });
  dlg.showModal();
}

/* ---------- conexão ---------- */
function telaConexao() {
  const c = lerConfig();
  return `<section class="card painel">
    <h2>Conexão com o GitHub ${c.token ? '<span class="tag craque">conectado</span>' : ''}</h2>
    <div class="grade">
      <label class="campo">Usuário dono do repositório<input type="text" id="c-dono" value="${esc(c.dono || '')}" autocomplete="off" spellcheck="false"></label>
      <label class="campo">Repositório<input type="text" id="c-repo" value="${esc(c.repo || '')}" autocomplete="off" spellcheck="false"></label>
      <label class="campo">Branch<input type="text" id="c-branch" value="${esc(c.branch || 'main')}" autocomplete="off" spellcheck="false"></label>
      <label class="campo">Token do GitHub<input type="password" id="c-token" value="${esc(c.token || '')}" autocomplete="off" placeholder="github_pat_…"></label>
    </div>
    <p class="ajuda">O token fica guardado só neste navegador. Use um token “fine-grained” com acesso apenas a este repositório e a permissão “Contents: Read and write”.</p>
    <div class="botoes">
      <button class="botao" id="c-salvar">Salvar conexão</button>
      ${c.token ? '<button class="botao sec" id="c-sair">Desconectar este navegador</button>' : ''}
    </div>
  </section>`;
}
function ligarConexao() {
  const salvar = $('#c-salvar');
  if (!salvar) return;
  salvar.addEventListener('click', async () => {
    const c = { dono: $('#c-dono').value.trim(), repo: $('#c-repo').value.trim(), branch: $('#c-branch').value.trim() || 'main', token: $('#c-token').value.trim() };
    if (!c.dono || !c.repo || !c.token) return avisar('Preencha usuário, repositório e token.', true);
    salvarConfig(c);
    salvar.disabled = true; salvar.textContent = 'Testando…';
    try {
      await testarConexao(c);
      await carregar();
      avisar('Conectado ao GitHub.');
      location.hash = '#/lancar'; render();
    } catch (e) {
      avisar(explicarErro(e), true);
      salvar.disabled = false; salvar.textContent = 'Salvar conexão';
    }
  });
  const sair = $('#c-sair');
  if (sair) sair.addEventListener('click', () => {
    const c = lerConfig(); delete c.token; salvarConfig(c);
    avisar('Token removido deste navegador.'); render();
  });
}

/* ================= roteamento ================= */
function atualizarNav(secao) {
  document.querySelectorAll('.so-autor').forEach((a) => (a.hidden = !temToken()));
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === secao) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}
function render() {
  const [, rota, param, extra] = (location.hash || '#/').split('/');
  const app = $('#app');
  let html, secao = 'jogos', titulo = 'Boletim Rubro-Negro', ligar = null;
  if (rota === 'jogo') { html = telaJogo(param); const p = estado.partidas.find((x) => x.id === param); if (p) titulo = `Flamengo × ${p.adversario} | Boletim`; }
  else if (rota === 'ranking') { html = telaRanking(); secao = 'ranking'; titulo = 'Ranking | Boletim'; ligar = ligarRanking; }
  else if (rota === 'jogador') { html = telaJogador(param); secao = 'ranking'; titulo = `${jogador(param).nome} | Boletim`; }
  else if (rota === 'lancar') { html = telaLancar(param, extra); secao = 'autor'; titulo = 'Lançar notas | Boletim'; ligar = () => { ligarLancar(); ligarConexao(); }; }
  else if (rota === 'autor') {
    secao = 'autor';
    const telas = { calendario: [telaCalendario, ligarCalendario], elenco: [telaElenco, ligarElenco], times: [telaTimes, ligarTimes], conexao: [() => `${abasAutor('conexao')}${telaConexao()}`, () => {}] };
    const [t, l] = telas[param] || telas.conexao;
    html = t(); titulo = 'Área do autor | Boletim';
    ligar = () => { l(); ligarConexao(); };
  } else { html = telaJogos(); ligar = ligarJogos; }

  const novo = app.cloneNode(false); // recria o <main> para limpar listeners da tela anterior
  novo.innerHTML = html;
  app.replaceWith(novo);
  document.title = titulo;
  atualizarNav(secao);
  if (ligar) ligar();
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

const posicoes = {};
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.addEventListener('hashchange', (e) => {
  const antes = new URL(e.oldURL).hash || '#/';
  posicoes[antes] = window.scrollY;
  render();
  const alvo = posicoes[location.hash || '#/'] || 0;
  window.scrollTo({ top: alvo, behavior: 'instant' });
  if (alvo) requestAnimationFrame(() => window.scrollTo({ top: alvo, behavior: 'instant' }));
});
carregar().then(render).catch((e) => {
  $('#app').innerHTML = `<p class="vazio">Não consegui carregar os dados: ${esc(e.message)}.</p>`;
});
