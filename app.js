// APP.JS – main10 (VERSÃO DIAGNÓSTICA COMPLETA)
// Objetivo: manter a lógica atual, mas adicionar testes/telemetria de console
// para diagnosticar por que o app/sync/IndexedDB não estão se comportando como esperado.
// Depois vamos extrair a sincronização para um arquivo separado.

// ============================================================
// 0) DEBUG / DIAGNÓSTICO (ANDROID SAFE)
// ============================================================

const DEBUG_MODE = true; // deixe TRUE no PC; no Android, pode por false depois do diagnóstico

(function setupConsoleGuards() {
  if (!DEBUG_MODE) {
    console.log = function () {};
    console.warn = function () {};
    // mantenha console.error
  }
})();

// Tag de build para você confirmar cache/versão
const APP_BUILD_TAG = `main10-diag-${new Date().toISOString()}`;

// logger padronizado
const LOG = {
  info: (...a) => console.log("[APP]", ...a),
  warn: (...a) => console.warn("[APP]", ...a),
  err:  (...a) => console.error("[APP]", ...a),
};

window.__APP_BUILD_TAG = APP_BUILD_TAG;
LOG.info("✅ app.js carregou", APP_BUILD_TAG);

// ============================================================
// 1) CONSTANTES E ESTADO GLOBAL
// ============================================================

const LOCAIS_VISITA = [
  "Rio D'Ouro", "São Pedro", "Tinguá - Barrelão", "Tinguá - Serra Velha",
  "Tinguá - Brava/Macuco", "Tinguá - Colomi", "Tinguá - Boa Esperança",
  "Mantiquira - T1", "Mantiquira - T2", "Xerém I - João Pinto",
  "Xerém II - Entrada", "Xerém III - Plano", "Xerém III - Registro"
];

let APP_STATE = {
  avaliador: "",
  colaborador: "",
  local: "",
  data: "",
  tipoRoteiro: null,
  sublocal: "",
  roteiro: [],
  respostas: { geral: {}, pge: {}, aa: {} },
  id_vistoria: null
};

// câmera (se estiver em camera.js)
let stream = null;
let currentPhotoInputId = null;

// ============================================================
// 2) HELPERS (DATA / STRING / STATUS)
// ============================================================

function _toDateInputValue(v) {
  if (!v) return "";
  const s = String(v);

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);

  const d = new Date(s);
  if (isNaN(d.getTime())) return "";

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function _safeSlug(s) {
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function atualizarStatusTexto(msg) {
  const el = document.getElementById("status-sinc");
  if (el) el.innerText = msg;
  if (DEBUG_MODE) LOG.info("STATUS:", msg);
}

function _updateStatusSafe(msg) {
  try { atualizarStatusTexto(msg); } catch (_) {}
}

// ============================================================
// 3) DIAGNÓSTICOS (SEM QUEBRAR)
// ============================================================

function diag_dom() {
  const must = [
    "screen-cadastro",
    "screen-select-roteiro",
    "screen-formulario",
    "screen-final",
    "btn-sync",
    "btn-excel",
    "status-sinc",
    "avaliador",
    "local",
    "data_visita",
    "colaborador",
    "conteudo_formulario",
    "secao_select",
    "sublocal_select"
  ];

  const missing = must.filter(id => !document.getElementById(id));
  if (missing.length) LOG.warn("DOM: IDs ausentes:", missing);
  else LOG.info("DOM: OK (IDs principais presentes)");

  const scripts = Array.from(document.scripts || []).map(s => s.src || "[inline]");
  LOG.info("Scripts carregados:", scripts);
}

function diag_dbapi() {
  const expected = [
    "saveVisita",
    "loadVisita",
    "getVistoriasPendentes",
    "marcarComoSincronizado",
    "getAllFotosVistoria",
    "getFotosPergunta"
  ];

  if (!window.DB_API) {
    LOG.warn("DB_API ausente (indexedDB.js pode não ter carregado).");
    return;
  }

  const ok = [];
  const bad = [];
  expected.forEach(fn => (typeof window.DB_API[fn] === "function" ? ok : bad).push(fn));

  LOG.info("DB_API: funções OK:", ok);
  if (bad.length) LOG.warn("DB_API: funções faltando:", bad);
}

async function diag_pendencias() {
  if (!window.DB_API?.getVistoriasPendentes) {
    LOG.warn("diag_pendencias: getVistoriasPendentes indisponível.");
    return;
  }
  try {
    const pend = await window.DB_API.getVistoriasPendentes();
    LOG.info("Pendências (IndexedDB):", Array.isArray(pend) ? pend.length : pend);
    if (Array.isArray(pend) && pend[0]) {
      LOG.info("Exemplo pendente[0] keys:", Object.keys(pend[0]));
    }
  } catch (e) {
    LOG.err("diag_pendencias erro:", e?.message || e);
  }
}

function diag_network() {
  LOG.info("navigator.onLine =", navigator.onLine);
  // não faz fetch aqui; só status local
}

async function diag_sw() {
  if (!("serviceWorker" in navigator)) {
    LOG.warn("ServiceWorker: não suportado.");
    return;
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      LOG.warn("ServiceWorker: sem registro ativo.");
      return;
    }
    LOG.info("ServiceWorker: registrado, scope=", reg.scope);
  } catch (e) {
    LOG.warn("ServiceWorker: falha ao consultar registro:", e?.message || e);
  }
}

async function runDiagnosticsOnLoad() {
  LOG.info("🔎 Iniciando diagnósticos...");
  diag_dom();
  diag_dbapi();
  diag_network();
  await diag_sw();
  await diag_pendencias();
  LOG.info("🔎 Diagnósticos concluídos.");
}

// ============================================================
// 4) CONTROLE DE TELAS E NAVEGAÇÃO
// ============================================================

function showScreen(id) {
  ["screen-cadastro", "screen-select-roteiro", "screen-formulario", "screen-final"]
    .forEach(t => document.getElementById(t)?.classList.toggle("hidden", t !== id));
  window.scrollTo(0, 0);
  if (DEBUG_MODE) LOG.info("Tela:", id);
}

// ============================================================
// 5) SINCRONIZAR UI COM ESTADO (cadastro)
// ============================================================

function sincronizarInterfaceComEstado() {
  const elAval = document.getElementById("avaliador");
  const elLocal = document.getElementById("local");
  const elData = document.getElementById("data_visita");

  // garante opções do select local
  if (elLocal && elLocal.tagName === "SELECT" && elLocal.options.length === 0) {
    elLocal.innerHTML =
      `<option value="">Selecionar Local...</option>` +
      LOCAIS_VISITA.map(l => `<option value="${l}">${l}</option>`).join("");
  }

  if (elAval) elAval.value = APP_STATE.avaliador || "";
  if (elLocal) elLocal.value = APP_STATE.local || "";
  if (elData) elData.value = _toDateInputValue(APP_STATE.data);
}

// ============================================================
// 6) INIT APP (IndexedDB como fonte da verdade)
// ============================================================

async function initApp() {
  LOG.info("🚀 initApp() - build:", APP_BUILD_TAG);

  // A) ID da vistoria sempre existe
  const idSalvo = localStorage.getItem("id_vistoria");
  const idAtual = idSalvo || `VIST_${Date.now()}`;
  APP_STATE.id_vistoria = idAtual;
  if (!idSalvo) localStorage.setItem("id_vistoria", idAtual);

  // B) Carregar do IndexedDB
  try {
    if (window.DB_API?.loadVisita) {
      const dadosDoBanco = await window.DB_API.loadVisita(idAtual);

      if (dadosDoBanco) {
        LOG.info("♻️ Estado carregado do IndexedDB:", idAtual);

        APP_STATE = {
          ...APP_STATE,
          ...dadosDoBanco,
          id_vistoria: idAtual
        };

        // compat
        if (dadosDoBanco.tecnico && !APP_STATE.avaliador) APP_STATE.avaliador = dadosDoBanco.tecnico;
        if (dadosDoBanco.data_hora && !APP_STATE.data) APP_STATE.data = dadosDoBanco.data_hora;

        // garante estrutura
        if (!APP_STATE.respostas || typeof APP_STATE.respostas !== "object") {
          APP_STATE.respostas = { geral: {}, pge: {}, aa: {} };
        } else {
          APP_STATE.respostas.geral ||= {};
          APP_STATE.respostas.pge   ||= {};
          APP_STATE.respostas.aa    ||= {};
        }
      } else {
        LOG.warn("Sem visita no IndexedDB para id:", idAtual, "(normal se primeira vez)");
        const backup = localStorage.getItem("APP_STATE_BACKUP");
        if (backup) {
          try {
            const b = JSON.parse(backup);
            APP_STATE = { ...APP_STATE, ...b, id_vistoria: idAtual };
            APP_STATE.respostas ||= { geral: {}, pge: {}, aa: {} };
            APP_STATE.respostas.geral ||= {};
            APP_STATE.respostas.pge   ||= {};
            APP_STATE.respostas.aa    ||= {};
            LOG.warn("⚠️ Usando backup emergencial do LocalStorage.");
          } catch (e) {
            LOG.warn("Backup inválido no LocalStorage.");
          }
        }
      }
    } else {
      LOG.warn("DB_API.loadVisita indisponível (indexedDB.js carregou?)");
    }
  } catch (e) {
    LOG.err("Erro crítico no carregamento inicial:", e?.message || e);
  }

  // C) Configuração do seletor de local + persistência mínima
  const selLocal = document.getElementById("local");
  if (selLocal) {
    selLocal.innerHTML =
      `<option value="">Selecionar Local...</option>` +
      LOCAIS_VISITA.map(l => `<option value="${l}">${l}</option>`).join("");

    if (APP_STATE.local) selLocal.value = APP_STATE.local;

    selLocal.onchange = async () => {
      APP_STATE.local = selLocal.value;

      if (window.DB_API?.saveVisita) {
        const id = APP_STATE.id_vistoria || localStorage.getItem("id_vistoria") || `VIST_${Date.now()}`;
        APP_STATE.id_vistoria = id;
        localStorage.setItem("id_vistoria", id);

        try {
          await window.DB_API.saveVisita({
            id_vistoria: id,
            avaliador: APP_STATE.avaliador || "",
            local: APP_STATE.local || "",
            data: APP_STATE.data || new Date().toISOString(),
            tipoRoteiro: APP_STATE.tipoRoteiro || "geral",
            respostas: APP_STATE.respostas || { geral: {}, pge: {}, aa: {} },
            sincronizado: false
          });
          if (DEBUG_MODE) LOG.info("✅ IndexedDB: metadados atualizados (local).", id);
        } catch (err) {
          LOG.err("❌ IndexedDB: falha ao salvar metadados (onchange local):", err?.message || err);
        }
      } else {
        LOG.warn("DB_API.saveVisita indisponível (onchange local)");
      }
    };
  }

  sincronizarInterfaceComEstado();

  // D) Direcionamento de tela
  if (APP_STATE.local && APP_STATE.avaliador) showScreen("screen-select-roteiro");
  else showScreen("screen-cadastro");

  // E) Diagnósticos
  if (DEBUG_MODE) await runDiagnosticsOnLoad();
}

// ============================================================
// 7) VALIDAR E COMEÇAR (cria vistoria + salva skeleton no IndexedDB)
// ============================================================

async function validarEComecar() {
  const elAval = document.getElementById("avaliador");
  const elLocal = document.getElementById("local");
  const elData = document.getElementById("data_visita");
  const elColab = document.getElementById("colaborador");

  const avaliador = (elAval?.value || "").trim();
  const local = (elLocal?.value || "").trim();
  const data = (elData?.value || "").trim();
  const colab = (elColab?.value || "").trim();

  if (!avaliador || !local || !data) {
    alert("Preencha Avaliador, Local e Data!");
    return;
  }

  if (!window.DB_API?.saveVisita) {
    alert("ERRO: IndexedDB não carregado (DB_API.saveVisita indisponível).");
    LOG.err("DB_API.saveVisita não disponível. Verifique indexedDB.js antes do app.js.");
    return;
  }

  // id legível
  const localFormatado = String(local)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toUpperCase();

  const id = `VIST_${Date.now()}_${localFormatado || "SEMLOCAL"}`;

  APP_STATE.avaliador = avaliador;
  APP_STATE.local = local;
  APP_STATE.data = data;
  APP_STATE.colaborador = colab;

  APP_STATE.id_vistoria = id;
  APP_STATE.tipoRoteiro = null;
  APP_STATE.sublocal = "";
  APP_STATE.roteiro = [];
  APP_STATE.respostas ||= { geral: {}, pge: {}, aa: {} };
  APP_STATE.respostas.geral ||= {};
  APP_STATE.respostas.pge ||= {};
  APP_STATE.respostas.aa ||= {};

  localStorage.setItem("id_vistoria", id);
  localStorage.setItem("avaliador", avaliador);
  localStorage.setItem("local", local);
  localStorage.setItem("data", data);

  try {
    await window.DB_API.saveVisita({
      id_vistoria: id,
      avaliador,
      local,
      data,
      tipoRoteiro: "geral",
      respostas: APP_STATE.respostas,
      sincronizado: false
    });
    LOG.info("✅ Vistoria iniciada e salva no IndexedDB:", id);
  } catch (e) {
    LOG.err("❌ Falha ao salvar metadados no IndexedDB:", e?.message || e);
    alert("ERRO: não foi possível iniciar a vistoria (falha ao gravar no IndexedDB).");
    return;
  }

  showScreen("screen-select-roteiro");
}

// ============================================================
// 8) REGISTRAR RESPOSTA (offline-first)
// ============================================================

function registrarResposta(idPergunta, valor, tipoRoteiro) {
  const idFinal = APP_STATE.id_vistoria || localStorage.getItem("id_vistoria") || `VIST_${Date.now()}`;
  APP_STATE.id_vistoria = idFinal;
  localStorage.setItem("id_vistoria", idFinal);

  const roteiroAlvo = tipoRoteiro || APP_STATE.tipoRoteiro || "geral";

  APP_STATE.respostas ||= { geral: {}, pge: {}, aa: {} };
  APP_STATE.respostas[roteiroAlvo] ||= {};

  if (idPergunta !== null && idPergunta !== undefined) {
    if (roteiroAlvo === "pge") {
      const sub = APP_STATE.sublocal || "Geral";
      const chaveComposta = `${idPergunta}_${sub}`;
      APP_STATE.respostas.pge[chaveComposta] = valor;
    } else {
      APP_STATE.respostas[roteiroAlvo][idPergunta] = valor;
    }
  }

  if (window.DB_API?.saveVisita) {
    const payload = {
      id_vistoria: idFinal,
      avaliador: APP_STATE.avaliador || "",
      local: APP_STATE.local || "",
      data: APP_STATE.data || new Date().toISOString(),
      tipoRoteiro: roteiroAlvo,
      respostas: APP_STATE.respostas,
      sincronizado: false
    };

    window.DB_API.saveVisita(payload)
      .then(() => { if (DEBUG_MODE) LOG.info("✅ IndexedDB: visita atualizada:", idFinal); })
      .catch(err => LOG.err("❌ IndexedDB: erro ao salvar visita:", err?.message || err));
  } else {
    LOG.warn("DB_API.saveVisita indisponível — salvando apenas backup leve no LocalStorage.");
  }

  try {
    const backupLeve = {
      id_vistoria: idFinal,
      avaliador: APP_STATE.avaliador || "",
      local: APP_STATE.local || "",
      data: APP_STATE.data || "",
      tipoRoteiro: roteiroAlvo,
      respostas: APP_STATE.respostas
    };
    delete backupLeve.roteiro;
    localStorage.setItem("APP_STATE_BACKUP", JSON.stringify(backupLeve));
  } catch (_) {
    LOG.warn("LocalStorage cheio — mantendo apenas id_vistoria.");
    localStorage.setItem("id_vistoria", idFinal);
  }
}

// ============================================================
// 9) SELEÇÃO DE ROTEIRO
// ============================================================

async function selectRoteiro(tipo) {
  const mapeamento = {
    geral: window.ROTEIRO_GERAL,
    pge: window.ROTEIRO_PGE,
    aa: window.ROTEIRO_AA
  };

  const selSecao = document.getElementById("secao_select");
  if (selSecao) selSecao.innerHTML = `<option value="">Todas as seções</option>`;

  const dados = mapeamento[tipo];
  if (!dados) return alert("Erro: Roteiro não encontrado.");

  // remove imagem apoio antiga
  const img = document.getElementById("container_imagem_apoio_sublocal");
  if (img) img.remove();

  APP_STATE.tipoRoteiro = tipo;
  APP_STATE.roteiro = dados;
  APP_STATE.respostas[tipo] ||= {};

  const label = document.getElementById("roteiro-atual-label");
  if (label) label.textContent = tipo.toUpperCase();

  const boxSub = document.getElementById("sublocal_box");
  if (boxSub) boxSub.classList.toggle("hidden", tipo !== "pge");

  const form = document.getElementById("conteudo_formulario");
  if (form) form.innerHTML = "";

  if (tipo === "pge") {
    montarSublocaisFiltrados(APP_STATE.local);

    if (APP_STATE.sublocal) {
      const elSub = document.getElementById("sublocal_select");
      if (elSub) elSub.value = APP_STATE.sublocal;
      exibirImagemApoioSublocal(APP_STATE.sublocal);
      montarSecoes();
      renderFormulario();
    }
  } else {
    APP_STATE.sublocal = "";
    montarSecoes();
    renderFormulario();
  }

  // salva atualização de tipo de roteiro
  registrarResposta(null, null, tipo);

  showScreen("screen-formulario");
}

// ============================================================
// 10) SUBLOCAL + SEÇÕES
// ============================================================

function montarSecoes() {
  const sel = document.getElementById("secao_select");
  if (!sel) return;

  let dados = APP_STATE.roteiro;

  if (APP_STATE.tipoRoteiro === "pge") {
    const sub = document.getElementById("sublocal_select")?.value;
    if (!sub) return;
    dados = dados.filter(p => p.Local === APP_STATE.local && p.Sublocal === sub);
  }

  const secoes = [...new Set(dados.map(p => p.Secao || p["Seção"]))].filter(Boolean).sort();

  sel.innerHTML =
    `<option value="">Todas as seções (${secoes.length})</option>` +
    secoes.map(s => `<option value="${s}">${s}</option>`).join("");

  sel.onchange = () => renderFormulario(sel.value);
}

function montarSublocaisFiltrados(localEscolhido) {
  const selSub = document.getElementById("sublocal_select");
  if (!selSub) return;

  const base = window.ROTEIRO_PGE || [];
  const subs = [...new Set(
    base.filter(p => p.Local === localEscolhido).map(p => p.Sublocal)
  )].filter(Boolean).sort();

  selSub.innerHTML = subs.length === 0
    ? `<option value="">Nenhum sublocal</option>`
    : `<option value="">Selecione o Sublocal...</option>` +
      subs.map(s => `<option value="${s}">${s}</option>`).join("");

  const form = document.getElementById("conteudo_formulario");
  if (form) form.innerHTML = "";

  const img = document.getElementById("container_imagem_apoio_sublocal");
  if (img) img.remove();

  selSub.onchange = () => {
    if (selSub.value) {
      APP_STATE.sublocal = selSub.value;

      // salva estado do sublocal
      registrarResposta(null, null, "pge");

      if (form) form.innerHTML = "";
      exibirImagemApoioSublocal(selSub.value);
      montarSecoes();
      renderFormulario();

      if (typeof applyConditionalLogic === "function") applyConditionalLogic();
    }
  };
}

// ============================================================
// 11) IMAGEM DE APOIO (PGE)
// ============================================================

function exibirImagemApoioSublocal(sublocal) {
  const containerForm = document.getElementById("conteudo_formulario");
  if (!containerForm) return;

  const existente = document.getElementById("container_imagem_apoio_sublocal");
  if (existente) existente.remove();

  if (APP_STATE.tipoRoteiro !== "pge" || !sublocal) return;

  const limpar = (str) => {
    if (!str) return "";
    return str.toString().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  };

  const localAlvo = limpar(APP_STATE.local);
  const sublocalAlvo = limpar(sublocal);

  const base = window.ROTEIRO_PGE || [];
  const itemComImagem = base.find(p => {
    const localJSON = limpar(p.Local);
    const sublocalJSON = limpar(p.Sublocal);
    const ehMesmoLugar = (localJSON === localAlvo && sublocalJSON === sublocalAlvo);

    const temImagem = (
      (p.ImagemApoio && p.ImagemApoio.length > 100) ||
      (p["Imagem Apoio"] && p["Imagem Apoio"].length > 100)
    );

    return ehMesmoLugar && temImagem;
  });

  if (itemComImagem) {
    let base64Data = itemComImagem.ImagemApoio || itemComImagem["Imagem Apoio"];
    if (!base64Data.startsWith("data:image")) base64Data = "data:image/jpeg;base64," + base64Data;

    const divImg = document.createElement("div");
    divImg.id = "container_imagem_apoio_sublocal";
    divImg.className = "bg-white p-2 rounded-2xl shadow-sm mb-6 border-2 border-blue-400 animate-in mt-2";

    divImg.innerHTML = `
      <p class="text-[10px] font-bold text-blue-600 mb-1 uppercase">ℹ️ Orientação: ${sublocal}</p>
      <img src="${base64Data}"
           class="w-full h-auto rounded-lg shadow-md block"
           style="max-height: 350px; object-fit: contain; background-color: #f8f8f8;"
           onclick="window.open(this.src, '_blank')">
    `;

    containerForm.prepend(divImg);
    LOG.info("✅ Imagem inserida no topo para:", sublocal);
  } else {
    LOG.warn("⚠️ Nenhuma imagem de apoio encontrada para:", sublocal);
  }
}

// ============================================================
// 12) RENDERIZAÇÃO DO FORMULÁRIO
// ============================================================

function renderFormulario(secaoFiltrada = null) {
  const container = document.getElementById("conteudo_formulario");
  if (!container) return;

  // limpa grupos anteriores
  const gruposAntigos = container.querySelectorAll('[id^="group_"]');
  gruposAntigos.forEach(el => el.remove());

  let perguntas = APP_STATE.roteiro || [];

  if (APP_STATE.tipoRoteiro === "pge") {
    const sub = document.getElementById("sublocal_select")?.value;
    if (!sub) {
      container.innerHTML = `<div class="text-center p-12 text-slate-400 italic bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200">Selecione um sublocal para carregar as perguntas.</div>`;
      return;
    }
    perguntas = perguntas.filter(p => p.Sublocal === sub);
  }

  if (secaoFiltrada) {
    perguntas = perguntas.filter(p => (p.Secao || p["Seção"]) === secaoFiltrada);
  }

  perguntas.forEach(p => {
    const div = document.createElement("div");
    div.id = `group_${p.id}`;
    div.className = "bg-white p-7 rounded-[2rem] shadow-sm border border-slate-100 mb-6 animate-in transition-all";

    let valorSalvo = "";

    if (APP_STATE.tipoRoteiro === "pge") {
      const subAtual = document.getElementById("sublocal_select")?.value || APP_STATE.sublocal || "Geral";
      const chaveComposta = `${p.id}_${subAtual}`;
      valorSalvo = APP_STATE.respostas.pge?.[chaveComposta] ?? "";
    } else {
      valorSalvo = APP_STATE.respostas[APP_STATE.tipoRoteiro]?.[p.id] ?? "";
    }

    div.innerHTML = `
      <label class="block font-black text-slate-700 text-[13px] uppercase tracking-tight mb-5 leading-tight">
        <span class="text-[#0067ac] mr-1">●</span> ${p.Pergunta}
      </label>
      <div id="input-root-${p.id}" class="space-y-3"></div>
    `;

    container.appendChild(div);

    if (typeof renderInput === "function") {
      renderInput(p, document.getElementById(`input-root-${p.id}`), valorSalvo);
    }
  });

  if (typeof applyConditionalLogic === "function") applyConditionalLogic();
}

// ============================================================
// 13) INPUTS
// ============================================================

function renderInput(p, container, valorSalvo) {
  if (!container) return;

  const tipoInput = p.TipoInput;
  container.innerHTML = "";

  if (tipoInput === "text" || tipoInput === "textarea") {
    const input = document.createElement(tipoInput === "text" ? "input" : "textarea");
    input.className = "w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:border-[#0067ac]/30 focus:ring-4 focus:ring-blue-500/5 outline-none transition-all";
    input.value = valorSalvo || "";
    input.placeholder = "Digite aqui...";
    input.oninput = (e) => registrarResposta(p.id, e.target.value);
    container.appendChild(input);

  } else if (tipoInput === "radio" || tipoInput === "checkboxGroup") {
    const opcoes = (p.Opcoes || "").split(";").filter(Boolean);
    const marcados = tipoInput === "checkboxGroup"
      ? (valorSalvo || "").split(";").map(v => v.trim()).filter(Boolean)
      : [valorSalvo];

    container.className = (opcoes.length <= 3) ? "grid grid-cols-1 gap-3" : "space-y-3";

    opcoes.forEach(opt => {
      const optTrim = opt.trim();
      const isChecked = marcados.includes(optTrim);
      const inputType = tipoInput === "radio" ? "radio" : "checkbox";

      const label = document.createElement("label");

      const atualizarEstiloCard = (el, active) => {
        if (active) {
          el.classList.add("border-[#0067ac]", "bg-blue-50/50", "shadow-inner");
          el.classList.remove("border-slate-50", "bg-slate-50/50");
        } else {
          el.classList.remove("border-[#0067ac]", "bg-blue-50/50", "shadow-inner");
          el.classList.add("border-slate-50", "bg-slate-50/50");
        }
      };

      label.className = `flex items-center gap-4 p-4 border-2 rounded-2xl cursor-pointer transition-all active:scale-95 ${
        isChecked ? "border-[#0067ac] bg-blue-50/50 shadow-inner" : "border-slate-50 bg-slate-50/50 hover:bg-slate-100"
      }`;

      label.innerHTML = `
        <div class="relative flex items-center justify-center pointer-events-none">
          <input type="${inputType}" name="${p.id}" value="${optTrim}" ${isChecked ? "checked" : ""}
            class="w-6 h-6 border-2 border-slate-300 ${tipoInput === 'radio' ? 'rounded-full' : 'rounded'} text-[#0067ac] focus:ring-0 checked:border-[#0067ac] transition-all">
        </div>
        <span class="text-sm font-bold ${isChecked ? 'text-[#0067ac]' : 'text-slate-600'} pointer-events-none">${optTrim}</span>
      `;

      label.onclick = () => {
        const input = label.querySelector("input");

        if (tipoInput === "radio") {
          container.querySelectorAll("label").forEach(l => atualizarEstiloCard(l, false));
          atualizarEstiloCard(label, true);
          input.checked = true;
          registrarResposta(p.id, optTrim);
        } else {
          input.checked = !input.checked;
          atualizarEstiloCard(label, input.checked);
          gerenciarMudancaCheckbox(p.id);
        }

        if (typeof applyConditionalLogic === "function") applyConditionalLogic();
      };

      container.appendChild(label);
    });

  } else if (tipoInput === "file") {
    // camera.js deve prover abrirCamera + atualizarListaFotos
    container.innerHTML = `
      <div class="space-y-3">
        <button type="button" onclick="abrirCamera('${p.id}')"
          class="w-full bg-slate-800 hover:bg-black text-white py-5 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg shadow-slate-200">
          <span aria-hidden="true" class="text-base leading-none">📷</span>
          Anexar Evidência
        </button>

        <div class="flex items-center justify-between">
          <span id="foto_status_${p.id}" class="text-[10px] text-gray-400">Nenhuma evidência.</span>

          <button type="button"
            class="!min-h-0 w-auto px-3 py-2 text-[10px] font-bold bg-gray-100 text-gray-600 rounded-full"
            onclick="(function(){
              const el = document.getElementById('fotos_${p.id}');
              if (!el) return;
              el.classList.toggle('hidden');
              if (typeof atualizarListaFotos === 'function') atualizarListaFotos('${p.id}');
            })();">
            Detalhes
          </button>
        </div>

        <div id="fotos_${p.id}" class="hidden grid grid-cols-3 gap-3"></div>
      </div>
    `;

    if (typeof atualizarListaFotos === "function") setTimeout(() => atualizarListaFotos(p.id), 50);
    else LOG.warn("camera.js: atualizarListaFotos não existe (ok no diagnóstico).");
  }
}

function gerenciarMudancaCheckbox(idPergunta) {
  const checkboxes = document.querySelectorAll(`input[name="${idPergunta}"]:checked`);
  const valores = Array.from(checkboxes).map(cb => cb.value.trim());
  registrarResposta(idPergunta, valores.join(";"));
}

// stubs defensivos (evita ReferenceError em diagnóstico)
if (typeof window.abrirCamera !== "function") {
  window.abrirCamera = function (pid) {
    alert("⚠️ camera.js não carregou (abrirCamera ausente).");
    LOG.warn("abrirCamera chamada sem camera.js, pid=", pid);
  };
}
if (typeof window.atualizarListaFotos !== "function") {
  window.atualizarListaFotos = function () {};
}

// ============================================================
// 14) CONDICIONAIS
// ============================================================

function applyConditionalLogic() {
  const tipo = APP_STATE.tipoRoteiro;
  if (!APP_STATE.roteiro) return;

  APP_STATE.roteiro.forEach(p => {
    const cond = p.Condicao || p["Condição"];
    const pai = p.Pai;
    if (cond && pai) {
      const el = document.getElementById(`group_${p.id}`);
      if (!el) return;

      const valorPai = (APP_STATE.tipoRoteiro === "pge")
        ? (APP_STATE.respostas.pge?.[`${pai}_${APP_STATE.sublocal || "Geral"}`])
        : (APP_STATE.respostas[tipo]?.[pai]);

      el.classList.toggle("hidden", valorPai !== cond);
    }
  });
}

// ============================================================
// 15) EXCEL (mantido)
// ============================================================

async function baixarExcelConsolidado() {
  if (!window.ExcelJS) {
    alert("ExcelJS não carregou.");
    LOG.err("ExcelJS ausente. Verifique lib/exceljs.min.js");
    return;
  }
  if (!window.DB_API?.getFotosPergunta) {
    alert("DB_API.getFotosPergunta indisponível (IndexedDB incompleto).");
    return;
  }

  const workbook = new ExcelJS.Workbook();

  const configuracao = [
    { nome: "Geral", id: "geral", fonte: window.ROTEIRO_GERAL },
    { nome: "PGE", id: "pge", fonte: window.ROTEIRO_PGE },
    { nome: "Acid. Ambientais", id: "aa", fonte: window.ROTEIRO_AA }
  ];

  for (const config of configuracao) {
    if (!config.fonte) continue;

    const sheet = workbook.addWorksheet(config.nome);

    sheet.columns = [
      { header: "SEÇÃO", key: "secao", width: 20 },
      { header: "SUBLOCAL", key: "sublocal", width: 25 },
      { header: "PERGUNTA", key: "pergunta", width: 50 },
      { header: "RESPOSTA", key: "resposta", width: 40 },

      { header: "FOTO 1", key: "foto1", width: 22 },
      { header: "FOTO 2", key: "foto2", width: 22 },
      { header: "FOTO 3", key: "foto3", width: 22 },

      { header: "QTD_FOTOS", key: "qtd_fotos", width: 10 }
    ];

    const respostasDoTipo = APP_STATE.respostas[config.id] || {};

    for (const p of config.fonte) {
      const chaveResposta = (config.id === "pge") ? `${p.id}_${p.Sublocal}` : p.id;
      const respostaTexto = respostasDoTipo[chaveResposta] || "";

      const chaveFoto = (config.id === "pge") ? `${p.id}_${p.Sublocal}` : p.id;

      const fotosFiltradas = await window.DB_API.getFotosPergunta(APP_STATE.id_vistoria, chaveFoto);

      if (!respostaTexto && (!fotosFiltradas || fotosFiltradas.length === 0)) continue;

      const novaLinha = sheet.addRow({
        secao: p.Secao || p["Seção"] || "",
        sublocal: p.Sublocal || "Geral",
        pergunta: p.Pergunta,
        resposta: String(respostaTexto),

        foto1: "",
        foto2: "",
        foto3: "",
        qtd_fotos: fotosFiltradas.length || 0
      });

      if (fotosFiltradas.length > 0) {
        const fotosExcel = fotosFiltradas.slice(0, 3);
        novaLinha.height = 120;

        for (let i = 0; i < fotosExcel.length; i++) {
          const foto = fotosExcel[i];

          try {
            const blobFoto = foto.blob_data || foto.blob;

            let imageId = null;

            if (blobFoto) {
              const mime = String(foto.mime_type || blobFoto.type || "").toLowerCase();

              let ext = "jpeg";
              if (mime.includes("png")) ext = "png";
              else if (mime.includes("jpg") || mime.includes("jpeg")) ext = "jpeg";
              else if (mime.includes("webp")) ext = "webp";

              if (ext !== "webp") {
                const arrayBuffer = await blobFoto.arrayBuffer();
                imageId = workbook.addImage({ buffer: arrayBuffer, extension: ext });
              } else {
                imageId = null; // evita falha silenciosa do ExcelJS
              }
            } else if (foto.base64) {
              const base64Limpo = foto.base64.includes(",") ? foto.base64.split(",")[1] : foto.base64;
              imageId = workbook.addImage({ base64: base64Limpo, extension: "jpeg" });
            }

            if (imageId) {
              const baseCol = sheet.getColumn("foto1").number - 1;
              sheet.addImage(imageId, {
                tl: { col: baseCol + i, row: novaLinha.number - 1 },
                ext: { width: 140, height: 140 },
                editAs: "oneCell"
              });
            }
          } catch (errFoto) {
            LOG.warn("Erro ao inserir imagem no Excel:", errFoto?.message || errFoto);
          }
        }
      }
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const outBlob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });

  const url = URL.createObjectURL(outBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Relatorio_${APP_STATE.local || "Vistoria"}_${Date.now()}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);

  marcarComoConcluidoUI("excel");
}

// ============================================================
// 16) UI SET LOADING + MARCAR CONCLUÍDO
// ============================================================

function UI_setLoading(action, isLoading, config = {}) {
  const btn = document.getElementById(`btn-${action}`);
  const textSpan = document.getElementById(`${action}-text`);
  const spinner = document.getElementById(`${action}-spinner`);
  if (!btn) return;

  btn.disabled = isLoading;
  btn.style.opacity = isLoading ? "0.7" : "1";

  if (isLoading) {
    if (textSpan) textSpan.innerText = config.loadingText || "PROCESSANDO...";
    if (spinner) spinner.classList.remove("hidden");
  } else {
    if (textSpan) textSpan.innerText = config.defaultText || (action === "sync" ? "ENVIAR PARA O SERVIDOR ☁️" : "BAIXAR RELATÓRIO EXCEL 📊");
    if (spinner) spinner.classList.add("hidden");
  }
}

function marcarComoConcluidoUI(metodo, payloadExtra = {}) {
  const circle = document.getElementById("status-icon-circle");
  const symbol = document.getElementById("status-icon-symbol");
  const title = document.getElementById("status-final-title");
  const text = document.getElementById("status-final-text");

  if (!circle || !symbol) return;

  circle.classList.add("scale-110");
  setTimeout(() => circle.classList.remove("scale-110"), 200);

  circle.classList.replace("bg-amber-100", "bg-green-500");
  circle.classList.replace("text-amber-600", "text-white");
  symbol.innerText = "✓";

  if (metodo === "excel") {
    if (title) title.innerText = "RELATÓRIO GERADO!";
    if (text) text.innerText = "A planilha local foi gerada com sucesso.";
    return;
  }

  if (title) title.innerText = "SINCRONIZADO!";
  if (text) {
    const atividade = APP_STATE.atividade || "Vistoria";
    const idVistoria = APP_STATE.id_vistoria;
    text.innerHTML = `
      <strong>${atividade} enviada com sucesso!</strong><br>
      <span class="text-sm opacity-75">ID: ${idVistoria}</span><br>
      Os dados e fotos já estão disponíveis no Painel de Supervisão.
    `;
  }

  const btnSync = document.getElementById("btn-sync");
  if (btnSync) {
    btnSync.innerHTML = "ENVIADO ✓";
    btnSync.classList.add("bg-green-600");
    btnSync.disabled = true;
  }
}

// ============================================================
// 17) SINCRONIZAÇÃO (AINDA AQUI, MAS COM DIAGNÓSTICOS)
// Depois vamos extrair para sync_manager.js
// ============================================================

const SYNC_ENDPOINT = "https://strapless-christi-unspread.ngrok-free.dev/vistorias/sincronizar";

// CRÍTICO: NUNCA deixe isso indefinido
const SYNC_HEADERS = {}; // evite preflight; depois podemos habilitar header do ngrok se necessário
// const SYNC_HEADERS = { "ngrok-skip-browser-warning": "true" };

let __SYNC_LOCK = false;

function _toFlatRespostas(respostas) {
  const flat = {};
  const blocos = respostas || {};
  if (!blocos || typeof blocos !== "object") return flat;

  for (const k of Object.keys(blocos)) {
    const obj = blocos[k];
    if (obj && typeof obj === "object") {
      for (const pid of Object.keys(obj)) {
        flat[String(pid)] = obj[pid];
      }
    }
  }
  return flat;
}

function _localTextoParaId(localTexto) {
  if (typeof localTexto !== "string" || !localTexto.trim()) return 1;
  const idx = LOCAIS_VISITA.indexOf(localTexto.trim());
  return idx >= 0 ? (idx + 1) : 1;
}

async function _buildFormDataFromVisita(visita) {
  const id_vistoria = String(visita?.id_vistoria || "");
  if (!id_vistoria) throw new Error("Visita sem id_vistoria.");

  const fotosNoBanco = (window.DB_API?.getAllFotosVistoria)
    ? await window.DB_API.getAllFotosVistoria(id_vistoria)
    : [];

  const respostasFlat = _toFlatRespostas(visita.respostas);
  const local_id = String(_localTextoParaId(visita.local));

  const fd = new FormData();
  const fotos_manifest = [];

  for (const f of (Array.isArray(fotosNoBanco) ? fotosNoBanco : [])) {
    const blob = f.blob_data || f.blob;
    if (!blob) continue;

    const foto_id = String(
      f.foto_id ||
      (crypto?.randomUUID?.() ?? `foto_${Date.now()}_${Math.random().toString(16).slice(2)}`)
    );

    const pergunta_id = String(f.pergunta_id || "foto_geral");
    const filename = `${_safeSlug(foto_id)}__${_safeSlug(pergunta_id)}.jpg`;

    fotos_manifest.push({ foto_id, pergunta_id, filename });
    fd.append("files", blob, filename);
  }

  const payloadParaR = {
    metadata: { id_vistoria, origem: "pwa_android" },
    core: {
      data_execucao: visita.data_hora || visita.data || new Date().toISOString(),
      local_id,
      tecnico: String(visita.tecnico || visita.avaliador || "Não Informado"),
      atividade: visita.tipoRoteiro || "supervisao",
      usuario_id: visita.usuario_id || null
    },
    dados: { respostas: respostasFlat, fotos_manifest }
  };

  fd.set("payload", JSON.stringify(payloadParaR));

  // logs diagnósticos (amostrais)
  if (DEBUG_MODE) {
    LOG.info("SYNC buildFormData:", { id_vistoria, fotos: fotos_manifest.length, respostas: Object.keys(respostasFlat).length });
  }

  return { fd, fotos_manifest_len: fotos_manifest.length };
}

async function _fetchJsonOrText(response) {
  const rawText = await response.text();
  try {
    return rawText ? JSON.parse(rawText) : {};
  } catch {
    return { status: "erro", message: rawText || "Resposta não-JSON do servidor." };
  }
}

async function sincronizarUmaVistoria(visita) {
  const id = String(visita?.id_vistoria || "");
  if (!id) throw new Error("Vistoria sem id_vistoria.");

  const { fd, fotos_manifest_len } = await _buildFormDataFromVisita(visita);

  if (DEBUG_MODE) {
    LOG.info("🟢 Enviando vistoria:", id, "endpoint:", SYNC_ENDPOINT);
    for (const [k, v] of fd.entries()) {
      if (k === "payload") {
        try { LOG.info("payload(JSON):", JSON.parse(v)); } catch { LOG.info("payload(raw):", v); }
        continue;
      }
      // v pode não ser File em alguns webviews; log defensivo
      LOG.info(`fd[${k}]`, (v && v.name) ? `FILE name=${v.name} size=${v.size} type=${v.type}` : v);
    }
  }

  const resp = await fetch(SYNC_ENDPOINT, {
    method: "POST",
    headers: SYNC_HEADERS,
    body: fd
  });

  const resultado = await _fetchJsonOrText(resp);

  if (!resp.ok || resultado.status !== "sucesso") {
    throw new Error(resultado.message || `Erro no servidor (HTTP ${resp.status})`);
  }

  if (window.DB_API?.marcarComoSincronizado) {
    await window.DB_API.marcarComoSincronizado(id);
  } else {
    LOG.warn("DB_API.marcarComoSincronizado indisponível (vai ficar pendente).");
  }

  return { id_vistoria: id, fotos_enviadas: fotos_manifest_len };
}

async function sincronizarPendentes({ showUI = true } = {}) {
  if (__SYNC_LOCK) return;
  __SYNC_LOCK = true;

  try {
    // diagnóstico: clique + status
    LOG.info("🧪 Clique sync detectado. onLine=", navigator.onLine);

    if (!navigator.onLine) {
      if (showUI) alert("Sem conexão! Os dados permanecem protegidos no IndexedDB.");
      _updateStatusSafe("Sem conexão.");
      return;
    }

    if (!window.DB_API?.getVistoriasPendentes) {
      throw new Error("DB_API.getVistoriasPendentes não disponível.");
    }

    if (showUI && typeof UI_setLoading === "function") {
      UI_setLoading("sync", true, { loadingText: "A ENVIAR PENDÊNCIAS..." });
    }

    _updateStatusSafe("Verificando pendências...");

    const pendentes = await window.DB_API.getVistoriasPendentes();
    const total = Array.isArray(pendentes) ? pendentes.length : 0;

    LOG.info("SYNC pendentes total =", total);

    if (!total) {
      _updateStatusSafe("Sem pendências.");
      if (showUI && typeof UI_setLoading === "function") {
        UI_setLoading("sync", false, { defaultText: "SEM PENDÊNCIAS ✓" });
      }
      return;
    }

    _updateStatusSafe(`Enviando ${total} vistoria(s)...`);

    let ok = 0;
    let falhas = 0;

    for (let i = 0; i < total; i++) {
      const visita = pendentes[i];
      const id = String(visita?.id_vistoria || "sem_id");

      try {
        _updateStatusSafe(`Enviando ${i + 1}/${total} (ID: ${id})...`);
        const r = await sincronizarUmaVistoria(visita);
        ok++;
        LOG.info("✅ Sincronizada:", r);
      } catch (e) {
        falhas++;
        LOG.warn(`⚠️ Falha ao sincronizar ${id}:`, e?.message || e);
      }
    }

    const msgFinal = falhas === 0
      ? `Sincronização concluída: ${ok}/${total} enviadas.`
      : `Sincronização concluída: ${ok}/${total} enviadas, ${falhas} falharam.`;

    _updateStatusSafe(msgFinal);

    if (showUI) {
      if (falhas === 0 && typeof marcarComoConcluidoUI === "function") {
        marcarComoConcluidoUI("servidor");
      }
      if (typeof UI_setLoading === "function") {
        UI_setLoading("sync", false, { defaultText: falhas === 0 ? "ENVIADO ✓" : "REVISAR FALHAS" });
      }
    }

  } catch (err) {
    LOG.err("❌ Erro geral na sincronização:", err?.message || err);

    if (showUI) {
      alert("Falha na Sincronização: " + (err?.message || err));
      if (typeof UI_setLoading === "function") {
        UI_setLoading("sync", false, { defaultText: "TENTAR NOVAMENTE" });
      }
    }

    _updateStatusSafe("Falha na sincronização.");
  } finally {
    __SYNC_LOCK = false;
  }
}

async function handleSincronizacao() {
  // você pode manter este alert temporário
  // alert("SYNC: clique detectado ✅");

  if (__SYNC_LOCK) return;
  __SYNC_LOCK = true;
  try {
    await sincronizarPendentes({ showUI: true });
  } finally {
    __SYNC_LOCK = false;
  }
}

window.addEventListener("online", () => {
  LOG.info("🌐 Online novamente — auto-sync pendências.");
  sincronizarPendentes({ showUI: false });
});

// ============================================================
// 18) NOVA VISTORIA (mantido)
// ============================================================

function _resetarCadastroUI() {
  const elAval = document.getElementById("avaliador");
  const elColab = document.getElementById("colaborador");
  const elLocal = document.getElementById("local");
  const elData = document.getElementById("data_visita");

  if (elAval) elAval.value = "";
  if (elColab) elColab.value = "";
  if (elLocal) elLocal.value = "";
  if (elData) elData.value = "";

  const elSecao = document.getElementById("secao_select");
  if (elSecao) elSecao.innerHTML = `<option value="">Todas as seções</option>`;

  const elSublocal = document.getElementById("sublocal_select");
  if (elSublocal) elSublocal.innerHTML = `<option value="">Selecione o Sublocal...</option>`;

  const form = document.getElementById("conteudo_formulario");
  if (form) form.innerHTML = "";
}

async function confirmarNovaVistoria() {
  if (!confirm("Deseja FINALIZAR esta vistoria e iniciar uma nova?")) return;

  try {
    if (!window.DB_API?.saveVisita) throw new Error("DB_API.saveVisita não disponível.");

    const idAtual = APP_STATE.id_vistoria || localStorage.getItem("id_vistoria");
    if (!idAtual) throw new Error("Sem id_vistoria atual para salvar.");

    await window.DB_API.saveVisita({
      id_vistoria: String(idAtual),
      avaliador: APP_STATE.avaliador || "",
      local: APP_STATE.local || "",
      data: APP_STATE.data || new Date().toISOString(),
      tipoRoteiro: APP_STATE.tipoRoteiro || "geral",
      respostas: APP_STATE.respostas || { geral: {}, pge: {}, aa: {} }
    });

    LOG.info("✅ Vistoria finalizada e mantida no IndexedDB:", idAtual);

    const novoId = `VIST_${Date.now()}`;
    localStorage.setItem("id_vistoria", novoId);

    localStorage.removeItem("APP_STATE_BACKUP");
    localStorage.removeItem("APP_META");
    localStorage.removeItem("avaliador");
    localStorage.removeItem("local");
    localStorage.removeItem("data");

    APP_STATE = {
      avaliador: "",
      colaborador: "",
      local: "",
      data: "",
      tipoRoteiro: null,
      sublocal: "",
      roteiro: [],
      respostas: { geral: {}, pge: {}, aa: {} },
      id_vistoria: novoId
    };

    // opcional: esqueleto
    await window.DB_API.saveVisita({
      id_vistoria: String(novoId),
      avaliador: "",
      local: "",
      data: new Date().toISOString(),
      tipoRoteiro: "geral",
      respostas: { geral: {}, pge: {}, aa: {} }
    });

    _resetarCadastroUI();
    showScreen("screen-cadastro");
    alert("Nova vistoria iniciada. Preencha o cadastro novamente.");

  } catch (err) {
    LOG.err("❌ Erro ao iniciar nova vistoria:", err?.message || err);
    alert("ERRO CRÍTICO: não foi possível iniciar nova vistoria. Veja o console.");
  }
}

// ============================================================
// 19) SERVICE WORKER (recomendação: preferir registrar no index.html)
// ============================================================

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js")
    .then(reg => {
      LOG.info("SW registrado!");
      reg.update?.();
    })
    .catch(err => LOG.warn("Erro ao registrar SW:", err?.message || err));
}

// ============================================================
// 20) ERROS GLOBAIS (diagnóstico)
// ============================================================

window.onerror = function (msg, url, line) {
  if (msg && String(msg).includes("Script error")) return;
  LOG.err("window.onerror:", { msg, url, line });
  alert("ERRO NO APP: " + msg + "\nLinha: " + line);
  return false;
};

window.addEventListener("unhandledrejection", (event) => {
  LOG.err("unhandledrejection:", event?.reason?.message || event?.reason || event);
});

// ============================================================
// 21) VINCULAÇÕES GLOBAIS (compat index.html)
// ============================================================

window.showScreen = showScreen;
window.selectRoteiro = selectRoteiro;
window.registrarResposta = registrarResposta;
window.baixarExcelConsolidado = baixarExcelConsolidado;
window.confirmarNovaVistoria = confirmarNovaVistoria;
window.sincronizarPendentes = sincronizarPendentes;
window.handleSincronizacao = handleSincronizacao;
window.sincronizarInterfaceComEstado = sincronizarInterfaceComEstado;
window.validarEComecar = validarEComecar;
window.atualizarStatusTexto = atualizarStatusTexto;

// Inicialização
document.addEventListener("DOMContentLoaded", initApp);