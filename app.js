// APP.JS – main10 (ajustado)
// ✅ Remove sincronização interna (vai para sync_manager.js)
// ✅ Mantém câmera intacta
// ✅ Mantém Excel intacto
// ✅ Corrige _toDateInputValue (era usado antes de existir)

// CONFIGURAÇÃO DE DEBUG (DESATIVAR LOGS NO ANDROID PARA EVITAR ERROS DE MEMÓRIA)
const DEBUG_MODE = true; // true no PC / false no Android

if (!DEBUG_MODE) {
  console.log = function () {};
  console.warn = function () {};
  // Mantemos console.error
}

// ============================================================
// HELPERS GERAIS (ficam no app.js)
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

// ============================================================
// 1. CONSTANTES E ESTADO GLOBAL
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

let stream = null;
let currentPhotoInputId = null;

// ============================================================
// 2. CONTROLE DE TELAS E NAVEGAÇÃO
// ============================================================

function showScreen(id) {
  ["screen-cadastro", "screen-select-roteiro", "screen-formulario", "screen-final"]
    .forEach(t => document.getElementById(t)?.classList.toggle("hidden", t !== id));
  window.scrollTo(0, 0);
}

// ============================================================
// 3. BOOTSTRAP DO APLICATIVO
// ============================================================

function carregarMetaDoLocalStorage() {
  const metaStr = localStorage.getItem("APP_META");
  if (metaStr) {
    try {
      const meta = JSON.parse(metaStr);
      APP_STATE.avaliador = meta.avaliador || "";
      APP_STATE.local = meta.local || "";
      APP_STATE.id_vistoria = meta.id_vistoria || meta.id_visita || "";
      APP_STATE.data = meta.data || "";

      const elAval = document.getElementById("avaliador");
      const elLocal = document.getElementById("local");
      const elData = document.getElementById("data_visita");

      if (elAval) elAval.value = APP_STATE.avaliador;
      if (elLocal) elLocal.value = APP_STATE.local;
      if (elData) elData.value = APP_STATE.data;
    } catch (e) {
      console.error("Erro ao ler APP_META:", e);
    }
  }
}

// Sincroniza estado -> UI (cadastro)
function sincronizarInterfaceComEstado() {
  const elAval = document.getElementById("avaliador");
  const elLocal = document.getElementById("local");
  const elData = document.getElementById("data_visita");

  // Defesa: garante opções do SELECT
  if (elLocal && elLocal.tagName === "SELECT" && elLocal.options.length === 0) {
    elLocal.innerHTML =
      `<option value="">Selecionar Local...</option>` +
      LOCAIS_VISITA.map(l => `<option value="${l}">${l}</option>`).join("");
  }

  if (elAval) elAval.value = APP_STATE.avaliador || "";
  if (elLocal) elLocal.value = APP_STATE.local || "";
  if (elData) elData.value = _toDateInputValue(APP_STATE.data);
}

async function initApp() {
  console.log("🚀 Iniciando App com Proteção Android (Foco IndexedDB)...");

  // Passo A: ID da vistoria (sempre existe)
  const idSalvo = localStorage.getItem("id_vistoria");
  const idAtual = idSalvo || `VIST_${Date.now()}`;
  APP_STATE.id_vistoria = idAtual;
  if (!idSalvo) localStorage.setItem("id_vistoria", idAtual);

  // Passo B: Carregar do IndexedDB (fonte da verdade)
  try {
    if (window.DB_API && typeof DB_API.loadVisita === "function") {
      const dadosDoBanco = await DB_API.loadVisita(idAtual);

      if (dadosDoBanco) {
        console.log("♻️ Estado carregado do IndexedDB:", idAtual);

        APP_STATE = {
          ...APP_STATE,
          ...dadosDoBanco,
          id_vistoria: idAtual,
        };

        // normalizações (compat)
        if (dadosDoBanco.tecnico && !APP_STATE.avaliador) APP_STATE.avaliador = dadosDoBanco.tecnico;
        if (dadosDoBanco.data_hora && !APP_STATE.data) APP_STATE.data = dadosDoBanco.data_hora;

        // garante estrutura de respostas
        if (!APP_STATE.respostas || typeof APP_STATE.respostas !== "object") {
          APP_STATE.respostas = { geral: {}, pge: {}, aa: {} };
        } else {
          APP_STATE.respostas.geral = APP_STATE.respostas.geral || {};
          APP_STATE.respostas.pge = APP_STATE.respostas.pge || {};
          APP_STATE.respostas.aa = APP_STATE.respostas.aa || {};
        }
      } else {
        // fallback leve
        const backup = localStorage.getItem("APP_STATE_BACKUP");
        if (backup) {
          try {
            const b = JSON.parse(backup);
            APP_STATE = { ...APP_STATE, ...b, id_vistoria: idAtual };

            if (!APP_STATE.respostas || typeof APP_STATE.respostas !== "object") {
              APP_STATE.respostas = { geral: {}, pge: {}, aa: {} };
            } else {
              APP_STATE.respostas.geral = APP_STATE.respostas.geral || {};
              APP_STATE.respostas.pge = APP_STATE.respostas.pge || {};
              APP_STATE.respostas.aa = APP_STATE.respostas.aa || {};
            }

            console.log("⚠️ Usando backup emergencial do LocalStorage.");
          } catch {}
        }
      }
    } else {
      console.warn("DB_API.loadVisita indisponível — iniciando sem carregar IndexedDB.");
    }
  } catch (e) {
    console.error("Erro crítico no carregamento inicial:", e);
  }

  // Passo C: Configuração do seletor de local + persistência limpa
  const selLocal = document.getElementById("local");
  if (selLocal) {
    selLocal.innerHTML =
      `<option value="">Selecionar Local...</option>` +
      LOCAIS_VISITA.map(l => `<option value="${l}">${l}</option>`).join("");

    if (APP_STATE.local) selLocal.value = APP_STATE.local;

    selLocal.onchange = async () => {
      APP_STATE.local = selLocal.value;

      if (window.DB_API && typeof DB_API.saveVisita === "function") {
        const id = APP_STATE.id_vistoria || localStorage.getItem("id_vistoria") || `VIST_${Date.now()}`;
        APP_STATE.id_vistoria = id;
        localStorage.setItem("id_vistoria", id);

        try {
          await DB_API.saveVisita({
            id_vistoria: id,
            avaliador: APP_STATE.avaliador || "",
            local: APP_STATE.local || "",
            data: APP_STATE.data || new Date().toISOString(),
            tipoRoteiro: APP_STATE.tipoRoteiro || "geral",
            respostas: APP_STATE.respostas || { geral: {}, pge: {}, aa: {} },
            sincronizado: false
          });
          if (DEBUG_MODE) console.log("✅ IndexedDB: metadados atualizados (local).", id);
        } catch (err) {
          console.error("❌ IndexedDB: falha ao salvar metadados no onchange do local:", err);
        }
      }
    };
  }

  // Preenche inputs
  sincronizarInterfaceComEstado();

  // Passo D: Direcionamento de tela
  if (APP_STATE.local && APP_STATE.avaliador) {
    showScreen("screen-select-roteiro");
  } else {
    showScreen("screen-cadastro");
  }

  // Diagnóstico do subsistema de sync (externo)
  if (window.SYNC && typeof window.SYNC.handleSincronizacao === "function") {
    console.log("✅ SYNC subsystem detectado (sync_manager.js).");
  } else {
    console.warn("⚠️ SYNC subsystem NÃO detectado. Verifique se sync_manager.js está carregando antes do app.js.");
  }
}

// ============================================================
// VALIDAR E COMEÇAR
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

  if (!window.DB_API || typeof DB_API.saveVisita !== "function") {
    alert("ERRO: IndexedDB não carregado (DB_API.saveVisita indisponível).");
    console.error("DB_API.saveVisita não disponível. Verifique se indexedDB.js foi carregado antes do app.js.");
    return;
  }

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
  if (!APP_STATE.respostas || typeof APP_STATE.respostas !== "object") {
    APP_STATE.respostas = { geral: {}, pge: {}, aa: {} };
  }

  localStorage.setItem("id_vistoria", id);
  localStorage.setItem("avaliador", avaliador);
  localStorage.setItem("local", local);
  localStorage.setItem("data", data);

  try {
    await DB_API.saveVisita({
      id_vistoria: id,
      avaliador,
      local,
      data,
      tipoRoteiro: "geral",
      respostas: APP_STATE.respostas,
      sincronizado: false
    });

    console.log("✅ Vistoria iniciada e salva no IndexedDB (metadados):", id);
  } catch (e) {
    console.error("❌ Falha ao salvar metadadados no IndexedDB:", e);
    alert("ERRO: não foi possível iniciar a vistoria (falha ao gravar no IndexedDB).");
    return;
  }

  showScreen("screen-select-roteiro");
}

// ============================================================
// REGISTRAR RESPOSTA
// ============================================================

function registrarResposta(idPergunta, valor, tipoRoteiro) {
  const idFinal = APP_STATE.id_vistoria || localStorage.getItem("id_vistoria") || `VIST_${Date.now()}`;
  APP_STATE.id_vistoria = idFinal;
  localStorage.setItem("id_vistoria", idFinal);

  const roteiroAlvo = tipoRoteiro || APP_STATE.tipoRoteiro || "geral";

  if (!APP_STATE.respostas || typeof APP_STATE.respostas !== "object") {
    APP_STATE.respostas = { geral: {}, pge: {}, aa: {} };
  }
  if (!APP_STATE.respostas[roteiroAlvo]) APP_STATE.respostas[roteiroAlvo] = {};

  if (idPergunta !== null && idPergunta !== undefined) {
    if (roteiroAlvo === "pge") {
      const sub = APP_STATE.sublocal || "Geral";
      const chaveComposta = `${idPergunta}_${sub}`;
      APP_STATE.respostas.pge[chaveComposta] = valor;
    } else {
      APP_STATE.respostas[roteiroAlvo][idPergunta] = valor;
    }
  }

  // persistência IndexedDB
  if (window.DB_API && typeof DB_API.saveVisita === "function") {
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
      .then(() => { if (DEBUG_MODE) console.log("✅ IndexedDB: visita atualizada:", idFinal); })
      .catch(err => console.error("❌ IndexedDB: erro ao salvar visita:", err));
  } else {
    console.warn("DB_API.saveVisita indisponível — mantendo apenas backup no localStorage.");
  }

  // backup leve
  try {
    const backupLeve = {
      id_vistoria: idFinal,
      avaliador: APP_STATE.avaliador || "",
      local: APP_STATE.local || "",
      data: APP_STATE.data || "",
      tipoRoteiro: roteiroAlvo,
      respostas: APP_STATE.respostas
    };
    if (backupLeve.respostas?.fotos) delete backupLeve.respostas.fotos;
    delete backupLeve.roteiro;

    localStorage.setItem("APP_STATE_BACKUP", JSON.stringify(backupLeve));
  } catch (e) {
    console.warn("LocalStorage cheio — mantendo apenas id_vistoria.");
    localStorage.setItem("id_vistoria", idFinal);
  }
}

// ============================================================
// 6. SELEÇÃO DE ROTEIRO
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

  const img = document.getElementById("container_imagem_apoio_sublocal");
  if (img) img.remove();

  APP_STATE.tipoRoteiro = tipo;
  APP_STATE.roteiro = dados;
  if (!APP_STATE.respostas[tipo]) APP_STATE.respostas[tipo] = {};

  const lbl = document.getElementById("roteiro-atual-label");
  if (lbl) lbl.textContent = tipo.toUpperCase();

  const boxSub = document.getElementById("sublocal_box");
  if (boxSub) boxSub.classList.toggle("hidden", tipo !== "pge");

  const conteudo = document.getElementById("conteudo_formulario");
  if (conteudo) conteudo.innerHTML = "";

  if (tipo === "pge") {
    montarSublocaisFiltrados(APP_STATE.local);

    if (APP_STATE.sublocal) {
      const sel = document.getElementById("sublocal_select");
      if (sel) sel.value = APP_STATE.sublocal;
      exibirImagemApoioSublocal(APP_STATE.sublocal);
      montarSecoes();
      renderFormulario();
    }
  } else {
    APP_STATE.sublocal = "";
    montarSecoes();
    renderFormulario();
  }

  registrarResposta(null, null, tipo);
  showScreen("screen-formulario");
}

// ============================================================
// 7. SUBLOCAL + SEÇÕES
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

  const subs = [...new Set(
    window.ROTEIRO_PGE
      .filter(p => p.Local === localEscolhido)
      .map(p => p.Sublocal)
  )].filter(Boolean).sort();

  selSub.innerHTML = subs.length === 0
    ? `<option value="">Nenhum sublocal</option>`
    : `<option value="">Selecione o Sublocal...</option>` +
      subs.map(s => `<option value="${s}">${s}</option>`).join("");

  const conteudo = document.getElementById("conteudo_formulario");
  if (conteudo) conteudo.innerHTML = "";

  const img = document.getElementById("container_imagem_apoio_sublocal");
  if (img) img.remove();

  selSub.onchange = () => {
    if (selSub.value) {
      APP_STATE.sublocal = selSub.value;
      registrarResposta(null, null, "pge");

      if (conteudo) conteudo.innerHTML = "";
      exibirImagemApoioSublocal(selSub.value);
      montarSecoes();
      renderFormulario();

      if (typeof applyConditionalLogic === "function") applyConditionalLogic();
    }
  };
}

// ============================================================
// 8. IMAGEM DE APOIO (PGE) — mantém base64 do roteiro (ok)
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

  const itemComImagem = window.ROTEIRO_PGE.find(p => {
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
    if (!base64Data.startsWith("data:image")) {
      base64Data = "data:image/jpeg;base64," + base64Data;
    }

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
    console.log("✅ Imagem inserida no topo para:", sublocal);
  } else {
    console.warn("⚠️ Nenhuma imagem de apoio encontrada nas perguntas de:", sublocal);
  }
}

// ============================================================
// 9. RENDERIZAÇÃO DO FORMULÁRIO
// ============================================================

function renderFormulario(secaoFiltrada = null) {
  const container = document.getElementById("conteudo_formulario");
  if (!container) return;

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
}

// ============================================================
// 10. INPUT
// ============================================================

function renderInput(p, container, valorSalvo) {
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
      ? (valorSalvo || "").split(";").map(v => v.trim())
      : [valorSalvo];

    const gridClass = opcoes.length <= 3 ? "grid grid-cols-1 gap-3" : "space-y-3";
    container.className = gridClass;

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
            class="w-6 h-6 border-2 border-slate-300 ${tipoInput === "radio" ? "rounded-full" : "rounded"} text-[#0067ac] focus:ring-0 checked:border-[#0067ac] transition-all">
        </div>
        <span class="text-sm font-bold ${isChecked ? "text-[#0067ac]" : "text-slate-600"} pointer-events-none">${optTrim}</span>
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
            onclick="
              (function(){
                const el = document.getElementById('fotos_${p.id}');
                if (!el) return;
                el.classList.toggle('hidden');
                if (typeof atualizarListaFotos === 'function') atualizarListaFotos('${p.id}');
              })();
            ">
            Detalhes
          </button>
        </div>

        <div id="fotos_${p.id}" class="hidden grid grid-cols-3 gap-3"></div>
      </div>
    `;

    if (typeof atualizarListaFotos === "function") {
      setTimeout(() => atualizarListaFotos(p.id), 50);
    }
  }
}

function gerenciarMudancaCheckbox(idPergunta) {
  const checkboxes = document.querySelectorAll(`input[name="${idPergunta}"]:checked`);
  const valores = Array.from(checkboxes).map(cb => cb.value.trim());
  registrarResposta(idPergunta, valores.join(";"));
}

// ============================================================
// 11. CONDICIONAIS
// ============================================================

function applyConditionalLogic() {
  const tipo = APP_STATE.tipoRoteiro;
  if (!APP_STATE.roteiro) return;

  APP_STATE.roteiro.forEach(p => {
    const cond = p.Condicao || p["Condição"];
    const pai = p.Pai;
    if (cond && pai) {
      const el = document.getElementById(`group_${p.id}`);
      if (el) {
        const valorPai = (APP_STATE.tipoRoteiro === "pge")
          ? (APP_STATE.respostas.pge?.[`${pai}_${APP_STATE.sublocal || "Geral"}`])
          : (APP_STATE.respostas[tipo]?.[pai]);

        el.classList.toggle("hidden", valorPai !== cond);
      }
    }
  });
}

// ============================================================
// 14. EXPORTAÇÃO EXCEL (BLOB)
// ============================================================

async function handleExcelReativo() {
  UI_setLoading("excel", true, { loadingText: "A GERAR FICHEIRO..." });

  try {
    await baixarExcelConsolidado();
  } catch (error) {
    console.error("Erro no Excel:", error);
    alert("Erro ao gerar o Excel.");
  } finally {
    UI_setLoading("excel", false, { defaultText: "BAIXAR NOVAMENTE 📊" });
  }
}

async function baixarExcelConsolidado() {
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

      const fotosFiltradas = await DB_API.getFotosPergunta(APP_STATE.id_vistoria, chaveFoto);

      if (!respostaTexto && fotosFiltradas.length === 0) continue;

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
            if (DEBUG_MODE) {
              console.log("FOTO i=", i, "mime=", foto.mime_type, "blob.type=", (foto.blob_data || foto.blob)?.type);
            }

            let imageId = null;
            const blobFoto = foto.blob_data || foto.blob;

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
                imageId = null;
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
            console.warn("Erro ao inserir imagem no Excel:", errFoto);
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
// UI HELPERS
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
    if (textSpan) textSpan.innerText = config.defaultText;
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
// BOTÃO DE SINCRONIZAÇÃO (agora chama subsistema externo)
// ============================================================

async function handleSincronizacao() {
  console.log("🧩 Botão SYNC clicado (app.js). Delegando para sync_manager.js...");

  if (window.SYNC && typeof window.SYNC.handleSincronizacao === "function") {
    return window.SYNC.handleSincronizacao();
  }

  // fallback claro pro usuário (não fica “silencioso”)
  atualizarStatusTexto("Sync indisponível (sync_manager.js não carregou).");
  alert("Sync indisponível: verifique se sync_manager.js foi carregado antes do app.js.");
}

// Função segura para atualizar status
function atualizarStatusTexto(msg) {
  const el = document.getElementById("status-sinc");
  if (el) el.innerText = msg;
  else console.log("Status log:", msg);
}

// Monitor global de erros
window.onerror = function (msg, url, line) {
  if (msg && msg.includes("Script error")) return;
  alert("ERRO NO APP: " + msg + "\nLinha: " + line);
  return false;
};

// ============================================================
// NOVA VISTORIA
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
    if (!window.DB_API || typeof DB_API.saveVisita !== "function") {
      throw new Error("DB_API.saveVisita não disponível.");
    }

    const idAtual = APP_STATE.id_vistoria || localStorage.getItem("id_vistoria");
    if (!idAtual) throw new Error("Sem id_vistoria atual para salvar.");

    await DB_API.saveVisita({
      id_vistoria: String(idAtual),
      avaliador: APP_STATE.avaliador || "",
      local: APP_STATE.local || "",
      data: APP_STATE.data || new Date().toISOString(),
      tipoRoteiro: APP_STATE.tipoRoteiro || "geral",
      respostas: APP_STATE.respostas || { geral: {}, pge: {}, aa: {} }
    });

    console.log("✅ Vistoria finalizada e mantida no IndexedDB:", idAtual);

    const novoId = `VIST_${Date.now()}`;
    localStorage.setItem("id_vistoria", novoId);

    localStorage.removeItem("APP_STATE_BACKUP");
    localStorage.removeItem("APP_META");
    localStorage.removeItem("avaliador");
    localStorage.removeItem("local");
    localStorage.removeItem("data");

    APP_STATE.avaliador = "";
    APP_STATE.colaborador = "";
    APP_STATE.local = "";
    APP_STATE.data = "";
    APP_STATE.tipoRoteiro = null;
    APP_STATE.sublocal = "";
    APP_STATE.roteiro = [];
    APP_STATE.respostas = { geral: {}, pge: {}, aa: {} };
    APP_STATE.id_vistoria = novoId;

    await DB_API.saveVisita({
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
    console.error("❌ Erro ao iniciar nova vistoria:", err);
    alert("ERRO CRÍTICO: não foi possível iniciar nova vistoria. Veja o console.");
  }
}

// ============================================================
// SERVICE WORKER (mantém)
// ============================================================

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js")
    .then(reg => {
      console.log("SW registrado!");
      reg.update();
    })
    .catch(err => console.log("Erro ao registrar SW:", err));
}

// ============================================================
// VINCULAÇÕES GLOBAIS (mantém)
// ============================================================

window.showScreen = showScreen;
window.selectRoteiro = selectRoteiro;
window.registrarResposta = registrarResposta;
window.baixarExcelConsolidado = baixarExcelConsolidado;
window.confirmarNovaVistoria = confirmarNovaVistoria;

// ✅ agora o sync é “delegado”
window.handleSincronizacao = handleSincronizacao;

window.sincronizarInterfaceComEstado = sincronizarInterfaceComEstado;
window.validarEComecar = validarEComecar;
window.atualizarStatusTexto = atualizarStatusTexto;

// Inicialização principal
document.addEventListener("DOMContentLoaded", initApp);