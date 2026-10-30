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
const classeNota = (n) => (n >= 8 ? 'n-otima' : n >= 7 ? 'n-boa' : n > 5 ? 'n-media' : 'n-ruim');
const notaHTML = (n, extra = '') => `<span class="nota ${classeNota(n)} ${extra}">${fmtNota(n)}</span>`;
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
const rotuloJogo = (j) => `${esc(j.competicao)}${j.rodada ? `, ${j.rodada}ª rodada` : ''}`;
const localJogo = (j) => [j.estadio, j.cidade].filter(Boolean).map(esc).join(', ');

function cartaoProximo(c) {
  return `<section class="proximo" aria-labelledby="t-prox">
    <div class="proximo-topo">
      <h2 id="t-prox">Próximo jogo</h2>
      <span class="contagem-regressiva">${faltam(c.data)}</span>
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
  let html = '';

  if (temToken() && semNota.length) {
    html += semNota.map((c) => `<a class="alerta-nota" href="#/lancar/novo/${c.id}">
      ${escudoHTML(c.adversario, 'p')}<span><b>${c.mandante ? 'Flamengo × ' + esc(c.adversario) : esc(c.adversario) + ' × Flamengo'}</b> já foi jogado. Lançar as notas</span></a>`).join('');
  }
  html += '<div class="topo-home">';
  if (prox.length) html += cartaoProximo(prox[0]);
  if (ult) {
    const d = destaques(ult);
    const craque = jogador(d.craque[0]);
    html += `<a class="ultimo" href="#/jogo/${ult.id}">
      <div class="ultimo-topo"><h2>Último jogo</h2><span class="sub">${fmtData(ult.data, 'curto')}, ${esc(ult.competicao)}</span></div>
      ${confronto(ult, 'm', placarDe(ult))}
      <div class="craque-mini">
        ${avatarHTML(craque, 'm')}
        <div><span class="rotulo">Craque do jogo</span><b>${nomes(d.craque)}</b></div>
        ${notaHTML(d.max)}
      </div>
      <span class="ver-notas">Ver todas as notas</span>
    </a>`;
  } else if (!prox.length) {
    html += `<div class="ultimo vazio-card"><p>Nenhum jogo avaliado ainda.</p><a class="botao" href="#/lancar">Lançar as primeiras notas</a></div>`;
  }
  html += '</div>';

  if (prox.length > 1) {
    html += `<section class="secao"><h2>O que falta na temporada</h2>
      <ol class="calendario">${prox.slice(1).map((c) => `<li class="jogo-cal">
        <span class="data-bloco"><b>${c.data.slice(8)}</b>${MESES[Number(c.data.slice(5, 7)) - 1]}</span>
        ${escudoHTML(c.adversario, 'm')}
        <span class="info"><b>${c.mandante ? '' : '<span class="mando-tag">fora</span>'}${esc(timeDe(c.adversario).nome)}</b>
          <span>${DIAS[new Date(c.data + 'T12:00:00').getDay()]}, ${fmtHora(c.hora)}, ${localJogo(c) || 'local a definir'}</span></span>
        <span class="rodada">${c.rodada ? `${c.rodada}ª` : esc(c.competicao)}</span>
      </li>`).join('')}</ol>
    </section>`;
  }

  if (estado.partidas.length) {
    const comps = competicoesUsadas();
    const lista = filtrarComp(estado.partidas, estado.filtroComp);
    const v = estado.partidas.filter((p) => resultado(p) === 'v').length;
    const e = estado.partidas.filter((p) => resultado(p) === 'e').length;
    html += `<section class="secao">
      <div class="secao-topo"><h2>Resultados avaliados</h2><span class="sub">${plural(v, 'vitória', 'vitórias')}, ${plural(e, 'empate', 'empates')}, ${plural(estado.partidas.length - v - e, 'derrota', 'derrotas')}</span></div>
      ${comps.length > 1 ? `<div class="filtros" role="group" aria-label="Filtrar por competição">
        ${['Todas', ...comps].map((c) => `<button class="chip" data-comp="${esc(c)}" aria-pressed="${estado.filtroComp === c}">${esc(c)}</button>`).join('')}
      </div>` : ''}
      <ul class="resultados">${lista.map((p) => {
        const dd = destaques(p);
        return `<li><a class="resultado" href="#/jogo/${p.id}">
          <span class="faixa r-${resultado(p)}" title="${RES_TEXTO[resultado(p)]}"></span>
          <span class="data">${fmtData(p.data)}</span>
          ${escudoHTML(p.adversario, 'p')}
          <span class="adv">${esc(timeDe(p.adversario).nome)}<span class="comp">${esc(p.competicao)}, ${p.mandante ? 'casa' : 'fora'}</span></span>
          <span class="res r-${resultado(p)}">${p.golsFla}<small>×</small>${p.golsAdv}</span>
          <span class="craque-col">${avatarHTML(jogador(dd.craque[0]), 'p')}<span><b>${nomes(dd.craque)}</b>${fmtNota(dd.max)}</span></span>
        </a></li>`;
      }).join('')}</ul>
      ${lista.length ? '' : '<p class="vazio">Nenhum jogo nessa competição ainda.</p>'}
    </section>`;
  }
  return html;
}

function telaJogo(id) {
  const p = estado.partidas.find((x) => x.id === id);
  if (!p) return `<a class="voltar" href="#/">‹ Jogos</a><p class="vazio">Esse jogo não está no boletim.</p>`;
  const d = destaques(p);
  const atu = [...p.atuacoes].sort((a, b) => b.nota - a.nota || ORDEM_POS.indexOf(jogador(a.jogador).posicao) - ORDEM_POS.indexOf(jogador(b.jogador).posicao));
  const pessoa = (ids, nota, rotulo, cls) => `<div class="premio ${cls}">
    <div class="premio-fotos">${ids.slice(0, 4).map((i) => avatarHTML(jogador(i), ids.length > 1 ? 'm' : 'g')).join('')}${ids.length > 4 ? `<span class="mais">+${ids.length - 4}</span>` : ''}</div>
    <div><span class="rotulo">${rotulo}</span><b>${nomes(ids)}</b></div>
    ${notaHTML(nota)}
  </div>`;
  return `
    <a class="voltar" href="#/">‹ Jogos</a>
    <header class="placar-jogo">
      <div class="sub">${fmtData(p.data, 'semana')}${p.hora ? `, ${fmtHora(p.hora)}` : ''}${localJogo(p) ? `, ${localJogo(p)}` : ''}</div>
      ${confronto(p, 'g', placarDe(p))}
      <div class="sub">${rotuloJogo(p)}, ${RES_TEXTO[resultado(p)].toLowerCase()} do Flamengo</div>
      ${temToken() ? `<a class="botao sec" href="#/lancar/${p.id}">Editar notas</a>` : ''}
    </header>
    <div class="premios">
      ${pessoa(d.craque, d.max, d.craque.length > 1 ? 'Craques do jogo' : 'Craque do jogo', 'premio-craque')}
      ${d.pior.length ? pessoa(d.pior, d.min, 'Pior em campo', 'premio-pior') : ''}
      <div class="premio premio-media"><span class="numero-grande">${fmtNota(d.media)}</span><div><span class="rotulo">Média do time</span><b>${plural(p.atuacoes.length, 'jogador avaliado', 'jogadores avaliados')}</b></div></div>
    </div>
    <h2 class="titulo-lista">Notas</h2>
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
    </ul>`;
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
  const col = (chave, rotulo) => `<th scope="col"><button data-ordem="${chave}" data-ativo="${r.ordem === chave}">${rotulo}${r.ordem === chave ? (r.dir < 0 ? ' ▾' : ' ▴') : ''}</button></th>`;
  return `
    <h1 class="titulo-pagina">Ranking da temporada</h1>
    <p class="sub">Média das notas em ${plural(partidas.length, 'jogo avaliado', 'jogos avaliados')}.</p>
    <div class="ranking-controles">
      <label class="campo">Competição
        <select id="r-comp">${['Todas', ...competicoesUsadas()].map((c) => `<option ${c === r.comp ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      </label>
      <label class="campo">Mínimo de jogos
        <select id="r-min">${Array.from({ length: maxJogos }, (_, i) => i + 1).map((n) => `<option value="${n}" ${n === r.minimo ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </label>
    </div>
    ${podio.length ? `<ol class="podio">${podio.map((s, i) => {
      const j = jogador(s.id);
      return `<li class="degrau d${i + 1}"><a href="#/jogador/${j.id}">
        <span class="lugar">${i + 1}º</span>
        ${avatarHTML(j, i === 0 ? 'xg' : 'g')}
        <b>${esc(j.nome)}</b>
        ${notaHTML(s.media)}
        <span class="sub">${plural(s.jogos, 'jogo', 'jogos')}</span>
      </a></li>`;
    }).join('')}</ol>` : ''}
    <div class="tabela-scroll"><table>
      <thead><tr><th scope="col">#</th>${col('nome', 'Jogador')}${col('jogos', 'Jogos')}${col('media', 'Média')}${col('gols', 'Gols')}${col('assist', 'Assist.')}${col('craque', 'Craque')}${col('pior', 'Pior')}</tr></thead>
      <tbody>${linhas.map((s, i) => {
        const j = jogador(s.id);
        return `<tr>
          <td class="pos-rank">${i + 1}</td>
          <td><a class="jog-cel" href="#/jogador/${j.id}">${avatarHTML(j, 'p')}${esc(j.nome)}</a></td>
          <td>${s.jogos}</td><td>${notaHTML(s.media, 'pequena')}</td><td>${s.gols}</td><td>${s.assist}</td><td>${s.craque}</td><td>${s.pior}</td>
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
  const area = `${caminho} L${x(pontos.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const passo = Math.ceil(pontos.length / 8);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolução das notas jogo a jogo">
    <defs><linearGradient id="g-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--vermelho)" stop-opacity=".35"/><stop offset="1" stop-color="var(--vermelho)" stop-opacity="0"/></linearGradient></defs>
    ${grade}
    ${pontos.length > 1 ? `<path d="${area}" fill="url(#g-area)"/>` : ''}
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
  const topo = `<a class="voltar" href="#/ranking">‹ Ranking</a>
    <header class="jogador-topo">
      ${avatarHTML(j, 'xxg')}
      <div>
        <div class="sub">${POS_UM[j.posicao]}${j.numero ? `, camisa ${j.numero}` : ''}</div>
        <h1>${esc(j.nome)}</h1>
      </div>
    </header>`;
  if (!jogos.length) return `${topo}<p class="vazio">Ainda sem notas nesta temporada.</p>`;
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
    <div class="forma"><span class="sub">Últimos ${ultimos.length}</span>${ultimos.map((u) => notaHTML(u.nota, 'pequena')).join('')}</div>
    <h2>Evolução</h2>
    <div class="grafico">${graficoEvolucao(cron)}</div>
    <h2>Jogo a jogo</h2>
    <ul class="resultados">${jogos.map((p) => {
      const a = p.atuacoes.find((x) => x.jogador === id);
      const extra = [a.gols ? plural(a.gols, 'gol', 'gols') : '', a.assist ? plural(a.assist, 'assist.', 'assists.') : ''].filter(Boolean).join(', ');
      return `<li><a class="resultado" href="#/jogo/${p.id}">
        <span class="faixa r-${resultado(p)}"></span>
        <span class="data">${fmtData(p.data)}</span>
        ${escudoHTML(p.adversario, 'p')}
        <span class="adv">${esc(timeDe(p.adversario).nome)}<span class="comp">${esc(p.competicao)}${extra ? `, ${extra}` : ''}</span></span>
        <span class="res r-${resultado(p)}">${p.golsFla}<small>×</small>${p.golsAdv}</span>
        ${notaHTML(a.nota, 'pequena')}
      </a></li>`;
    }).join('')}</ul>`;
}

/* ================= área do autor ================= */
const ABAS = [['lancar', 'Notas'], ['calendario', 'Calendário'], ['elenco', 'Elenco e fotos'], ['times', 'Escudos'], ['conexao', 'Conexão']];
function abasAutor(atual) {
  return `<nav class="abas" aria-label="Área do autor">${ABAS.map(([id, nome]) => `<a href="#/${id === 'lancar' ? 'lancar' : 'autor/' + id}" ${id === atual ? 'aria-current="page"' : ''}>${nome}</a>`).join('')}</nav>`;
}

function novoRascunho(jogoCal) {
  const r = { id: null, calendarioId: null, data: hojeISO(), hora: null, adversario: '', mandante: true, competicao: 'Brasileirão', estadio: '', cidade: '', golsFla: 0, golsAdv: 0, atuacoes: {} };
  if (jogoCal) Object.assign(r, { calendarioId: jogoCal.id, data: jogoCal.data, hora: jogoCal.hora, adversario: timeDe(jogoCal.adversario).nome, mandante: jogoCal.mandante, competicao: jogoCal.competicao, rodada: jogoCal.rodada, estadio: jogoCal.estadio, cidade: jogoCal.cidade });
  return r;
}
function rascunhoDe(p) {
  const atuacoes = {};
  p.atuacoes.forEach((a) => (atuacoes[a.jogador] = { nota: a.nota, gols: a.gols || 0, assist: a.assist || 0 }));
  return { ...p, atuacoes };
}
function guardarRascunho() {
  try { localStorage.setItem(RASCUNHO_KEY, JSON.stringify(estado.rascunho)); } catch { /* segue em memória */ }
}
function precisaConexao() {
  return `${abasAutor('conexao')}<p class="ajuda">Para usar a área do autor, conecte este navegador ao seu repositório.</p>${telaConexao()}`;
}

function telaLancar(param, calId) {
  if (!temToken()) return precisaConexao();
  if (param === 'novo' && calId) {
    const c = estado.calendario.find((x) => x.id === calId);
    if (c && (!estado.rascunho || estado.rascunho.calendarioId !== calId)) { estado.rascunho = novoRascunho(c); guardarRascunho(); }
  } else if (param && param !== 'novo') {
    const p = estado.partidas.find((x) => x.id === param);
    if (!p) return `${abasAutor('lancar')}<p class="vazio">Jogo não encontrado.</p>`;
    if (!estado.rascunho || estado.rascunho.id !== param) estado.rascunho = rascunhoDe(p);
  } else if (!estado.rascunho || estado.rascunho.id) {
    let salvo = null;
    try { salvo = JSON.parse(localStorage.getItem(RASCUNHO_KEY) || 'null'); } catch { salvo = null; }
    estado.rascunho = salvo && !salvo.id ? salvo : novoRascunho(jogosSemNota()[0] || null);
  }
  const r = estado.rascunho;
  const ativos = estado.elenco.filter((j) => j.ativo !== false || r.atuacoes[j.id]);
  const comps = COMPETICOES.includes(r.competicao) ? COMPETICOES : [...COMPETICOES, r.competicao];
  const abertos = jogosAbertos();
  const jogoSel = r.adversario ? { ...r, adversario: r.adversario } : null;
  return `${abasAutor('lancar')}
    <h1 class="titulo-pagina">${r.id ? 'Editar notas' : 'Lançar notas'}</h1>
    ${!r.id && abertos.length ? `<label class="campo campo-largo">Jogo do calendário
      <select id="f-cal">
        <option value="">Outro jogo (preencher à mão)</option>
        ${abertos.map((c) => `<option value="${c.id}" ${r.calendarioId === c.id ? 'selected' : ''}>${fmtData(c.data)}: ${c.mandante ? 'Flamengo × ' + esc(timeDe(c.adversario).nome) : esc(timeDe(c.adversario).nome) + ' × Flamengo'}${c.data < hojeISO() ? ' (sem notas)' : ''}</option>`).join('')}
      </select></label>` : ''}
    <section class="painel painel-jogo">
      ${jogoSel ? `<div class="previa-confronto">${confronto({ ...r, adversario: r.adversario }, 'm', { casa: r.mandante ? r.golsFla : r.golsAdv, fora: r.mandante ? r.golsAdv : r.golsFla })}</div>` : ''}
      <div class="grade">
        <label class="campo">Data<input type="date" id="f-data" value="${esc(r.data)}"></label>
        <label class="campo">Adversário<input type="text" id="f-adv" value="${esc(r.adversario)}" placeholder="Ex.: Palmeiras" autocomplete="off" list="lista-times"></label>
        <label class="campo">Competição<select id="f-comp">${comps.map((x) => `<option ${x === r.competicao ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
        <div class="campo">Local
          <div class="mando" role="group" aria-label="Local do jogo">
            <button type="button" data-mando="1" aria-pressed="${r.mandante}">Em casa</button>
            <button type="button" data-mando="0" aria-pressed="${!r.mandante}">Fora</button>
          </div>
        </div>
        <div class="campo">Placar
          <div class="placar-campos">
            <span>Fla</span><input type="number" id="f-gf" min="0" max="20" inputmode="numeric" value="${r.golsFla}" aria-label="Gols do Flamengo">
            <span>×</span>
            <input type="number" id="f-ga" min="0" max="20" inputmode="numeric" value="${r.golsAdv}" aria-label="Gols do adversário"><span>Adv</span>
          </div>
        </div>
        <label class="campo">Estádio<input type="text" id="f-est" value="${esc(r.estadio || '')}" placeholder="Ex.: Maracanã" autocomplete="off"></label>
      </div>
      <datalist id="lista-times">${Object.values(estado.times).filter((t) => t.nome !== 'Flamengo').map((t) => `<option value="${esc(t.nome)}">`).join('')}</datalist>
    </section>

    <section>
      <p class="ajuda">Toque em quem entrou em campo e ajuste a nota de meio em meio ponto.</p>
      ${ORDEM_POS.map((pos) => {
        const grupo = ativos.filter((j) => j.posicao === pos);
        if (!grupo.length) return '';
        return `<div class="grupo-pos"><h3>${POSICOES[pos]}</h3>${grupo.map((j) => linhaJogador(j, r.atuacoes[j.id])).join('')}</div>`;
      }).join('')}
    </section>

    <div class="barra-salvar">
      <span class="contagem" id="contagem">${contagemTexto()}</span>
      <div class="botoes">
        ${r.id ? '<button class="botao perigo" id="f-excluir">Excluir jogo</button>' : '<button class="botao sec" id="f-limpar">Recomeçar</button>'}
        <button class="botao" id="f-salvar">${r.id ? 'Salvar alterações' : 'Publicar notas'}</button>
      </div>
    </div>`;
}

function linhaJogador(j, a) {
  return `<div class="linha-jogador ${a ? 'ativo' : ''}" data-jogador="${j.id}">
    <label class="entrou"><input type="checkbox" data-entrou ${a ? 'checked' : ''}>${avatarHTML(j, 'p')}<span><b>${esc(j.nome)}</b><span class="sub">${j.numero ? `camisa ${j.numero}` : POS_UM[j.posicao]}</span></span></label>
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
  return n ? `${plural(n, 'jogador avaliado', 'jogadores avaliados')}` : 'Nenhum jogador marcado';
}

function ligarLancar() {
  const app = $('#app');
  const r = estado.rascunho;
  if (!r) return;
  const atualizarPrevia = () => {
    const el = $('.previa-confronto', app);
    if (el && r.adversario) el.innerHTML = confronto(r, 'm', { casa: r.mandante ? r.golsFla : r.golsAdv, fora: r.mandante ? r.golsAdv : r.golsFla });
  };
  const ligarCampo = (sel, chave, conv = (v) => v) => {
    const el = $(sel, app);
    if (el) el.addEventListener('input', () => { r[chave] = conv(el.value); guardarRascunho(); atualizarPrevia(); });
  };
  ligarCampo('#f-data', 'data');
  ligarCampo('#f-adv', 'adversario', (v) => v.trim());
  ligarCampo('#f-comp', 'competicao');
  ligarCampo('#f-est', 'estadio', (v) => v.trim());
  ligarCampo('#f-gf', 'golsFla', (v) => Math.max(0, parseInt(v, 10) || 0));
  ligarCampo('#f-ga', 'golsAdv', (v) => Math.max(0, parseInt(v, 10) || 0));
  const sel = $('#f-cal', app);
  if (sel) sel.addEventListener('change', () => {
    const c = estado.calendario.find((x) => x.id === sel.value);
    const atuacoes = r.atuacoes;
    estado.rascunho = Object.assign(novoRascunho(c || null), { atuacoes });
    guardarRascunho(); render();
  });

  app.addEventListener('click', async (ev) => {
    const alvo = ev.target.closest('button');
    if (!alvo) return;
    if (alvo.dataset.mando) {
      r.mandante = alvo.dataset.mando === '1';
      app.querySelectorAll('[data-mando]').forEach((b) => b.setAttribute('aria-pressed', b === alvo));
      guardarRascunho(); atualizarPrevia();
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
      estado.rascunho = novoRascunho(null); guardarRascunho(); render();
    }
    if (alvo.id === 'f-salvar') salvarPartida(alvo);
    if (alvo.id === 'f-excluir') excluirPartida(alvo);
  });

  app.addEventListener('change', (ev) => {
    if (!ev.target.matches('[data-entrou]')) return;
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
  });
}

function montarPartida() {
  const r = estado.rascunho;
  const atuacoes = Object.entries(r.atuacoes).map(([j, a]) => ({ jogador: j, nota: a.nota, gols: a.gols, assist: a.assist }))
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
  if (!r.data) return avisar('Escolha a data do jogo.', true);
  if (!r.adversario) return avisar('Escreva o nome do adversário.', true);
  if (!Object.keys(r.atuacoes).length) return avisar('Marque pelo menos um jogador que entrou em campo.', true);
  const p = montarPartida();
  const lista = estado.partidas.filter((x) => x.id !== p.id).concat(p).sort((a, b) => b.data.localeCompare(a.data));
  botao.disabled = true; botao.textContent = 'Publicando…';
  try {
    await gravarDados('partidas', { ...estado.meta.partidas, temporada: estado.temporada, partidas: lista }, `${r.id ? 'Edita' : 'Notas de'} ${p.data} × ${p.adversario}`);
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
  return `<div class="cal-linha ${feito ? 'feito' : ''}" data-i="${i}">
    ${escudoHTML(c.adversario, 'm')}
    <div class="grade grade-cal">
      <label class="campo">Adversário<input type="text" data-k="adversario" value="${esc(c.adversario)}" list="lista-times-cal"></label>
      <label class="campo">Data<input type="date" data-k="data" value="${esc(c.data)}"></label>
      <label class="campo">Horário<input type="time" data-k="hora" value="${esc(c.hora || '')}"></label>
      <label class="campo">Competição<select data-k="competicao">${COMPETICOES.map((x) => `<option ${x === c.competicao ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label class="campo">Rodada ou fase<input type="text" data-k="rodada" value="${esc(c.rodada ?? '')}"></label>
      <label class="campo">Estádio<input type="text" data-k="estadio" value="${esc(c.estadio || '')}"></label>
      <label class="campo">Cidade<input type="text" data-k="cidade" value="${esc(c.cidade || '')}"></label>
      <label class="campo campo-check"><input type="checkbox" data-k="mandante" ${c.mandante ? 'checked' : ''}> Flamengo é mandante</label>
    </div>
    <div class="cal-acoes">${feito ? `<a class="sub" href="#/jogo/${feito.id}">Com notas</a>` : `<a class="botao sec mini-botao" href="#/lancar/novo/${c.id}">Lançar notas</a>`}
      <button class="link-perigo" data-remover="${i}">Remover</button></div>
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
      if (!confirm(`Remover ${c.adversario} (${fmtData(c.data)}) do calendário?`)) return;
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
          <label class="campo-check"><input type="checkbox" data-campo="ativo" data-id="${j.id}" ${j.ativo !== false ? 'checked' : ''}> No elenco</label>
        </div>
      </li>`).join('')}</ul></div>`).join('')}
    <section class="painel" style="margin-top:1.5rem">
      <h2>Novo jogador</h2>
      <div class="grade">
        <label class="campo">Nome<input type="text" id="e-nome" autocomplete="off"></label>
        <label class="campo">Posição<select id="e-pos">${ORDEM_POS.map((p) => `<option value="${p}">${POS_UM[p]}</option>`).join('')}</select></label>
        <label class="campo">Número<input type="number" id="e-num" min="1" max="99" inputmode="numeric"></label>
      </div>
      <button class="botao sec" id="e-add" style="margin-top:1rem">Adicionar ao elenco</button>
    </section>
    <div class="barra-salvar"><span class="contagem">${plural(estado.elenco.filter((j) => j.ativo !== false).length, 'jogador no elenco', 'jogadores no elenco')}</span>
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
  dlg.className = 'editor';
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
  return `<section class="painel">
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

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
carregar().then(render).catch((e) => {
  $('#app').innerHTML = `<p class="vazio">Não consegui carregar os dados: ${esc(e.message)}.</p>`;
});
