// APP.JS – VERSÃO INTEGRAL CORRIGIDA (ORGANIZADA POR FLUXO)- main10

// CONFIGURAÇÃO DE DEBUG (DESATIVAR LOGS NO ANDROID PARA EVITAR ERROS DE MEMÓRIA)
const DEBUG_MODE = true; // Mude para true quando estiver testando no PC

if (!DEBUG_MODE) {
    console.log = function() {};
    console.warn = function() {};
    // Mantemos o console.error para saber se algo realmente quebrou
}
// 1. CONSTANTES E ESTADO GLOBAL
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

// 2. CONTROLE DE TELAS E NAVEGAÇÃO
function showScreen(id) {
["screen-cadastro", "screen-select-roteiro", "screen-formulario", "screen-final"]
.forEach(t => document.getElementById(t)?.classList.toggle("hidden", t !== id));
window.scrollTo(0, 0);
}

// 3. BOOTSTRAP DO APLICATIVO

// Função de suporte para recuperar metadados leves
function carregarMetaDoLocalStorage() {
    const metaStr = localStorage.getItem("APP_META");
    if (metaStr) {
        try {
            const meta = JSON.parse(metaStr);
            APP_STATE.avaliador = meta.avaliador || "";
            APP_STATE.local = meta.local || "";
            APP_STATE.id_vistoria = meta.id_vistoria || meta.id_visita || "";
            APP_STATE.data = meta.data || "";

            // Preenche os campos da tela de cadastro se existirem
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
// 1. Função de suporte ajustada: Foca em sincronizar o estado com a UI
function sincronizarInterfaceComEstado() {
    const elAval = document.getElementById("avaliador");
    const elLocal = document.getElementById("local");
    // Defesa: garante que o seletor tenha opções mesmo se algo falhar antes
    if (elLocal && elLocal.tagName === 'SELECT' && elLocal.options.length === 0) {
        elLocal.innerHTML = `<option value="">Selecionar Local...</option>` +
            LOCAIS_VISITA.map(l => `<option value="${l}">${l}</option>`).join("");
    }
    const elData = document.getElementById("data_visita");
    
    if (elAval) elAval.value = APP_STATE.avaliador || "";
    if (elLocal) elLocal.value = APP_STATE.local || "";
    if (elData) elData.value = _toDateInputValue(APP_STATE.data);

}


/// 2. InitApp com prioridade total ao IndexedDB  ✅ (EDITADO)
async function initApp() {
  console.log("🚀 Iniciando App com Proteção Android (Foco IndexedDB)...");

  // ------------------------------------------------------------
  // Passo A: ID da vistoria (sempre existe)
  // ------------------------------------------------------------
  const idSalvo = localStorage.getItem("id_vistoria");
  const idAtual = idSalvo || `VIST_${Date.now()}`;
  APP_STATE.id_vistoria = idAtual;
  if (!idSalvo) localStorage.setItem("id_vistoria", idAtual);

  // ------------------------------------------------------------
  // Passo B: Carregar do IndexedDB (fonte da verdade)
  // ------------------------------------------------------------
  try {
    if (window.DB_API && typeof DB_API.loadVisita === "function") {
      const dadosDoBanco = await DB_API.loadVisita(idAtual);

      if (dadosDoBanco) {
        console.log("♻️ Estado carregado do IndexedDB:", idAtual);

        // mescla sem trazer lixo pesado do state atual
        APP_STATE = {
          ...APP_STATE,
          ...dadosDoBanco,
          id_vistoria: idAtual, // garante
        };

        // normalizações (compat)
        if (dadosDoBanco.tecnico && !APP_STATE.avaliador) APP_STATE.avaliador = dadosDoBanco.tecnico;
        if (dadosDoBanco.data_hora && !APP_STATE.data) APP_STATE.data = dadosDoBanco.data_hora;

        // garante estrutura de respostas
        if (!APP_STATE.respostas || typeof APP_STATE.respostas !== "object") {
          APP_STATE.respostas = { geral: {}, pge: {}, aa: {} };
        } else {
          APP_STATE.respostas.geral = APP_STATE.respostas.geral || {};
          APP_STATE.respostas.pge   = APP_STATE.respostas.pge   || {};
          APP_STATE.respostas.aa    = APP_STATE.respostas.aa    || {};
        }

      } else {
        // fallback leve (último recurso)
        const backup = localStorage.getItem("APP_STATE_BACKUP");
        if (backup) {
          try {
            const b = JSON.parse(backup);
            APP_STATE = {
              ...APP_STATE,
              ...b,
              id_vistoria: idAtual
            };

            // garante estrutura respostas também no fallback
            if (!APP_STATE.respostas || typeof APP_STATE.respostas !== "object") {
              APP_STATE.respostas = { geral: {}, pge: {}, aa: {} };
            } else {
              APP_STATE.respostas.geral = APP_STATE.respostas.geral || {};
              APP_STATE.respostas.pge   = APP_STATE.respostas.pge   || {};
              APP_STATE.respostas.aa    = APP_STATE.respostas.aa    || {};
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

  // ------------------------------------------------------------
  // Passo C: Configuração do seletor de local + persistência limpa
  // ------------------------------------------------------------
  const selLocal = document.getElementById("local");
  if (selLocal) {
    // garante opções
    selLocal.innerHTML =
      `<option value="">Selecionar Local...</option>` +
      LOCAIS_VISITA.map(l => `<option value="${l}">${l}</option>`).join("");

    if (APP_STATE.local) selLocal.value = APP_STATE.local;

    selLocal.onchange = async () => {
      APP_STATE.local = selLocal.value;

      // ✅ salva SOMENTE payload limpo (não salva APP_STATE cru!)
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

  // Preenche inputs (avaliador/local/data) com APP_STATE
  sincronizarInterfaceComEstado();

  // ------------------------------------------------------------
  // Passo D: Direcionamento de tela
  // ------------------------------------------------------------
  if (APP_STATE.local && APP_STATE.avaliador) {
    showScreen("screen-select-roteiro");
  } else {
    showScreen("screen-cadastro");
  }
}

// ============================================================
// VALIDAR E COMEÇAR — versão robusta (offline-first real)
// - valida campos
// - cria id_vistoria único
// - salva METADADOS no IndexedDB imediatamente (sem depender de roteiro)
// - limpa estado de formulário e vai para seleção de roteiro
// ============================================================
async function validarEComecar() {
  const elAval  = document.getElementById("avaliador");
  const elLocal = document.getElementById("local");
  const elData  = document.getElementById("data_visita");
  const elColab = document.getElementById("colaborador");

  const avaliador = (elAval?.value || "").trim();
  const local     = (elLocal?.value || "").trim();
  const data      = (elData?.value || "").trim();
  const colab     = (elColab?.value || "").trim();

  if (!avaliador || !local || !data) {
    alert("Preencha Avaliador, Local e Data!");
    return;
  }

  if (!window.DB_API || typeof DB_API.saveVisita !== "function") {
    alert("ERRO: IndexedDB não carregado (DB_API.saveVisita indisponível).");
    console.error("DB_API.saveVisita não disponível. Verifique se indexedDB.js foi carregado antes do app.js.");
    return;
  }

  // 1) cria um ID único e estável (inclui local para ficar legível)
  const localFormatado = String(local)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toUpperCase();

  const id = `VIST_${Date.now()}_${localFormatado || "SEMLOCAL"}`;

  // 2) atualiza APP_STATE (zera o que é do formulário)
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

  // 3) persiste mínimos no localStorage (recuperação pós reload)
  localStorage.setItem("id_vistoria", id);
  localStorage.setItem("avaliador", avaliador);
  localStorage.setItem("local", local);
  localStorage.setItem("data", data);

  // 4) SALVA METADADOS NO INDEXEDDB AGORA (não depende de roteiro)
  //    cria um "esqueleto" persistente que já aparece como pendente
  try {
    await DB_API.saveVisita({
      id_vistoria: id,
      avaliador,
      local,
      data,
      tipoRoteiro: "geral", // placeholder; será atualizado quando escolher roteiro
      respostas: APP_STATE.respostas,
      sincronizado: false
    });

    console.log("✅ Vistoria iniciada e salva no IndexedDB (metadados):", id);
  } catch (e) {
    console.error("❌ Falha ao salvar metadados no IndexedDB:", e);
    alert("ERRO: não foi possível iniciar a vistoria (falha ao gravar no IndexedDB).");
    return;
  }

  showScreen("screen-select-roteiro");
}


// ============================================================
// REGISTRAR RESPOSTA — versão robusta (offline-first real)
// - atualiza APP_STATE
// - salva no IndexedDB sempre (com tipoRoteiro válido ou placeholder)
// - mantém backup leve no localStorage
// ============================================================
function registrarResposta(idPergunta, valor, tipoRoteiro) {
  // 0) garante id_vistoria
  const idFinal = APP_STATE.id_vistoria || localStorage.getItem("id_vistoria") || `VIST_${Date.now()}`;
  APP_STATE.id_vistoria = idFinal;
  localStorage.setItem("id_vistoria", idFinal);

  // 1) define roteiro alvo (se ainda não houver, usa placeholder "geral")
  const roteiroAlvo = tipoRoteiro || APP_STATE.tipoRoteiro || "geral";

  // 2) garante estrutura respostas
  if (!APP_STATE.respostas || typeof APP_STATE.respostas !== "object") {
    APP_STATE.respostas = { geral: {}, pge: {}, aa: {} };
  }
  if (!APP_STATE.respostas[roteiroAlvo]) {
    APP_STATE.respostas[roteiroAlvo] = {};
  }

  // 3) escreve a resposta no estado (se veio uma pergunta)
  if (idPergunta !== null && idPergunta !== undefined) {
    if (roteiroAlvo === "pge") {
      // PGE: chave composta por sublocal (para não sobrescrever)
      const sub = APP_STATE.sublocal || "Geral";
      const chaveComposta = `${idPergunta}_${sub}`;
      APP_STATE.respostas.pge[chaveComposta] = valor;
    } else {
      APP_STATE.respostas[roteiroAlvo][idPergunta] = valor;
    }
  }

  // 4) persiste no IndexedDB (fonte da verdade)
  if (window.DB_API && typeof DB_API.saveVisita === "function") {
    const payload = {
      id_vistoria: idFinal,
      avaliador: APP_STATE.avaliador || "",
      local: APP_STATE.local || "",
      data: APP_STATE.data || new Date().toISOString(),
      tipoRoteiro: roteiroAlvo,          // agora sempre tem algo
      respostas: APP_STATE.respostas,    // manda o objeto todo
      sincronizado: false
    };

    window.DB_API.saveVisita(payload)
      .then(() => {
        if (DEBUG_MODE) console.log("✅ IndexedDB: visita atualizada:", idFinal);
      })
      .catch(err => console.error("❌ IndexedDB: erro ao salvar visita:", err));
  } else {
    console.warn("DB_API.saveVisita indisponível — mantendo apenas backup no localStorage.");
  }

  // 5) backup leve no localStorage (sem fotos / sem roteiro pesado)
  try {
    const backupLeve = {
      id_vistoria: idFinal,
      avaliador: APP_STATE.avaliador || "",
      local: APP_STATE.local || "",
      data: APP_STATE.data || "",
      tipoRoteiro: roteiroAlvo,
      respostas: APP_STATE.respostas
    };

    // nunca guardar coisas pesadas
    if (backupLeve.respostas?.fotos) delete backupLeve.respostas.fotos;
    delete backupLeve.roteiro;

    localStorage.setItem("APP_STATE_BACKUP", JSON.stringify(backupLeve));
  } catch (e) {
    console.warn("LocalStorage cheio — mantendo apenas id_vistoria.");
    localStorage.setItem("id_vistoria", idFinal);
  }
}

// 6. SELEÇÃO DE ROTEIRO (FLUXO PRINCIPAL)
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


    // DEVERIA REMOVER A IMAGEM DE APOIO 
    const img = document.getElementById("container_imagem_apoio_sublocal");
    if (img) img.remove();

    APP_STATE.tipoRoteiro = tipo;
    APP_STATE.roteiro = dados;
    if (!APP_STATE.respostas[tipo]) APP_STATE.respostas[tipo] = {};

    document.getElementById("roteiro-atual-label").textContent = tipo.toUpperCase();

    const boxSub = document.getElementById("sublocal_box");
    if (boxSub) boxSub.classList.toggle("hidden", tipo !== "pge");

    document.getElementById("conteudo_formulario").innerHTML = "";

    if (tipo === "pge") {
        montarSublocaisFiltrados(APP_STATE.local);

        if (APP_STATE.sublocal) {
            document.getElementById("sublocal_select").value = APP_STATE.sublocal;
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
        const sub = document.getElementById("sublocal_select").value;
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

    const subs = [...new Set(
        ROTEIRO_PGE
            .filter(p => p.Local === localEscolhido)
            .map(p => p.Sublocal)
    )].filter(Boolean).sort();

    selSub.innerHTML = subs.length === 0
        ? `<option value="">Nenhum sublocal</option>`
        : `<option value="">Selecione o Sublocal...</option>` +
          subs.map(s => `<option value="${s}">${s}</option>`).join("");

    document.getElementById("conteudo_formulario").innerHTML = "";

    const img = document.getElementById("container_imagem_apoio_sublocal");
    if (img) img.remove();

    selSub.onchange = () => {
  if (selSub.value) {
    APP_STATE.sublocal = selSub.value;

    registrarResposta(null, null, "pge"); // 👈 salva estado do sublocal

    document.getElementById("conteudo_formulario").innerHTML = "";
    exibirImagemApoioSublocal(selSub.value);
    montarSecoes();
    renderFormulario();

    if (typeof applyConditionalLogic === "function") applyConditionalLogic(); // opcional e leve
  }
};

}

// 8. IMAGEM DE APOIO (PGE)
function exibirImagemApoioSublocal(sublocal) {
    const containerForm = document.getElementById("conteudo_formulario");
    if (!containerForm) return;

    // 1. Limpa a imagem anterior para não duplicar
    const existente = document.getElementById("container_imagem_apoio_sublocal");
    if (existente) existente.remove();

    // Só executa se for roteiro PGE e houver um sublocal selecionado
    if (APP_STATE.tipoRoteiro !== "pge" || !sublocal) return;

    // 2. Normalização rigorosa para evitar erros de digitação/acentos no JSON
    const limpar = (str) => {
        if (!str) return "";
        return str.toString().toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove acentos (São -> Sao)
            .replace(/[^a-z0-9]/g, ""); // Remove tudo que não é letra ou número
    };

    const localAlvo = limpar(APP_STATE.local);
    const sublocalAlvo = limpar(sublocal);

    // 3. Busca em TODAS as linhas do sublocal até achar a que contém a imagem
    const itemComImagem = window.ROTEIRO_PGE.find(p => {
        const localJSON = limpar(p.Local);
        const sublocalJSON = limpar(p.Sublocal);
        
        // Verifica se Local e Sublocal batem
        const ehMesmoLugar = (localJSON === localAlvo && sublocalJSON === sublocalAlvo);
        
        // Verifica se esta linha específica tem a imagem (em qualquer uma das duas chaves possíveis)
        const temImagem = (
            (p.ImagemApoio && p.ImagemApoio.length > 100) || 
            (p["Imagem Apoio"] && p["Imagem Apoio"].length > 100)
        );

        return ehMesmoLugar && temImagem;
    });

    // 4. Renderiza se encontrar
    if (itemComImagem) {
        let base64Data = itemComImagem.ImagemApoio || itemComImagem["Imagem Apoio"];
        
        // Garante que o Base64 tenha o prefixo correto para o navegador exibir
        if (!base64Data.startsWith("data:image")) {
            base64Data = "data:image/jpeg;base64," + base64Data;
        }

        const divImg = document.createElement("div");
        divImg.id = "container_imagem_apoio_sublocal";
        // Estilização com margem superior para não ficar colado no cabeçalho
        divImg.className = "bg-white p-2 rounded-2xl shadow-sm mb-6 border-2 border-blue-400 animate-in mt-2";
        
        divImg.innerHTML = `
            <p class="text-[10px] font-bold text-blue-600 mb-1 uppercase">ℹ️ Orientação: ${sublocal}</p>
            <img src="${base64Data}" 
                 class="w-full h-auto rounded-lg shadow-md block" 
                 style="max-height: 350px; object-fit: contain; background-color: #f8f8f8;"
                 onclick="window.open(this.src, '_blank')">
        `;
        
        // Usa prepend para garantir que fique no TOPO, acima das perguntas
        containerForm.prepend(divImg);
        console.log("✅ Imagem inserida no topo para:", sublocal);
    } else {
        console.warn("⚠️ Nenhuma imagem de apoio encontrada nas perguntas de:", sublocal);
    }
}
// 9. RENDERIZAÇÃO DO FORMULÁRIO
function renderFormulario(secaoFiltrada = null) {
    const container = document.getElementById("conteudo_formulario");
    if (!container) return;

    const gruposAntigos = container.querySelectorAll('[id^="group_"]');
    gruposAntigos.forEach(el => el.remove());

    let perguntas = APP_STATE.roteiro || [];

    if (APP_STATE.tipoRoteiro === "pge") {
        const sub = document.getElementById("sublocal_select").value;
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
            const subAtual =
                document.getElementById("sublocal_select")?.value ||
                APP_STATE.sublocal ||
                "Geral";

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

// 10. INPUT
function renderInput(p, container, valorSalvo) {
    const tipoInput = p.TipoInput; 
    container.innerHTML = "";

    if (tipoInput === "text" || tipoInput === "textarea") {
        const input = document.createElement(tipoInput === "text" ? "input" : "textarea");
        // Input estilo 'Industrial': fundo cinza claro, borda foca em azul
        input.className = "w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:border-[#0067ac]/30 focus:ring-4 focus:ring-blue-500/5 outline-none transition-all";
        input.value = valorSalvo || "";
        input.placeholder = "Digite aqui...";
        input.oninput = (e) => registrarResposta(p.id, e.target.value);
        container.appendChild(input);

    } else if (tipoInput === "radio" || tipoInput === "checkboxGroup") {
        const opcoes = (p.Opcoes || "").split(";").filter(Boolean);
        const marcados = tipoInput === "checkboxGroup" ? (valorSalvo || "").split(";").map(v => v.trim()) : [valorSalvo];
        
        // Grid de 2 colunas se houver poucas opções (ex: Sim/Não)
        const gridClass = opcoes.length <= 3 ? "grid grid-cols-1 gap-3" : "space-y-3";
        container.className = gridClass;

      opcoes.forEach(opt => {
            const optTrim = opt.trim();
            const isChecked = marcados.includes(optTrim);
            const inputType = tipoInput === "radio" ? "radio" : "checkbox";
            
            const label = document.createElement("label");
            // Função interna para atualizar as cores dos cards sem dar scroll
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

            label.onclick = (e) => {
                const input = label.querySelector('input');
                
                if (tipoInput === "radio") {
                    // Limpa estilo de todos os outros labels do mesmo grupo
                    container.querySelectorAll('label').forEach(l => atualizarEstiloCard(l, false));
                    atualizarEstiloCard(label, true);
                    input.checked = true;
                    registrarResposta(p.id, optTrim);
                } else {
                    // Lógica para Checkbox
                    input.checked = !input.checked;
                    atualizarEstiloCard(label, input.checked);
                    gerenciarMudancaCheckbox(p.id);
                }
                
                // Dispara a lógica condicional (ex: mostrar campo de foto) sem dar re-render
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

            <!-- Indicador sutil (sempre leve) -->
            <div class="flex items-center justify-between">
                <span id="foto_status_${p.id}" class="text-[10px] text-gray-400">
                    Nenhuma evidência.
                </span>

                <!-- Botão discreto para expandir lista -->
                <button type="button"
                    class="!min-h-0 w-auto px-3 py-2 text-[10px] font-bold bg-gray-100 text-gray-600 rounded-full"
                    onclick="
                        (function(){
                            const el = document.getElementById('fotos_${p.id}');
                            if (!el) return;
                            el.classList.toggle('hidden');
                            if (typeof atualizarListaFotos === 'function') {
                                atualizarListaFotos('${p.id}');
                            }
                        })();
                    ">
                    Detalhes
                </button>
            </div>

            <!-- Lista colapsável (fica escondida por padrão) -->
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
// 14. EXPORTAÇÃO EXCEL (ALINHADO AO FLUXO BLOB)
// ============================================================

async function handleExcelReativo() {
    UI_setLoading('excel', true, { loadingText: "A GERAR FICHEIRO..." });

    try {
        await baixarExcelConsolidado();
    } catch (error) {
        console.error("Erro no Excel:", error);
        alert("Erro ao gerar o Excel.");
    } finally {
        UI_setLoading('excel', false, { defaultText: "BAIXAR NOVAMENTE 📊" });
    }
}


/// ============================================================
// GERA EXCEL OFFLINE COM IMAGENS BLOB
// ============================================================
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
            // Chave da resposta
            const chaveResposta = (config.id === "pge")
                ? `${p.id}_${p.Sublocal}`
                : p.id;

            const respostaTexto = respostasDoTipo[chaveResposta] || "";

            // Chave da foto (precisa bater com o que foi salvo no IndexedDB)
            const chaveFoto = (config.id === "pge")
                ? `${p.id}_${p.Sublocal}`
                : p.id;

            const fotosFiltradas = await DB_API.getFotosPergunta(
                APP_STATE.id_vistoria,
                chaveFoto
            );

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

            // =====================================================
            // INSERÇÃO DE IMAGENS (até 3) — BLOB → ARRAYBUFFER
            // (robusto para mime_type; evita WEBP quando ExcelJS não suporta)
            // =====================================================
            if (fotosFiltradas.length > 0) {
                const fotosExcel = fotosFiltradas.slice(0, 3);
                novaLinha.height = 120;

                for (let i = 0; i < fotosExcel.length; i++) {
                    const foto = fotosExcel[i];

                    try {
                        console.log("FOTO i=", i, "mime=", foto.mime_type, "blob.type=", (foto.blob_data || foto.blob)?.type);

                        let imageId = null;

                        const blobFoto = foto.blob_data || foto.blob;

                        if (blobFoto) {
                            const mime = String(foto.mime_type || blobFoto.type || "").toLowerCase();

                            // ExcelJS: confiável com jpeg/png; WEBP costuma falhar
                            let ext = "jpeg";
                            if (mime.includes("png")) ext = "png";
                            else if (mime.includes("jpg") || mime.includes("jpeg")) ext = "jpeg";
                            else if (mime.includes("webp")) ext = "webp";

                            if (ext !== "webp") {
                                const arrayBuffer = await blobFoto.arrayBuffer();
                                imageId = workbook.addImage({
                                    buffer: arrayBuffer,
                                    extension: ext
                                });
                            } else {
                                // WEBP: não tenta inserir no Excel (evita falha silenciosa)
                                imageId = null;
                            }

                        } else if (foto.base64) {
                            // Fallback legado
                            const base64Limpo = foto.base64.includes(",")
                                ? foto.base64.split(",")[1]
                                : foto.base64;

                            imageId = workbook.addImage({
                                base64: base64Limpo,
                                extension: "jpeg"
                            });
                        }

                        if (imageId) {
                        const baseCol = sheet.getColumn("foto1").number - 1;
                            // 0-based: SEÇÃO(0) SUBLOCAL(1) PERGUNTA(2) RESPOSTA(3) FOTO1(4) FOTO2(5) FOTO3(6)
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

    // =====================================================
    // DOWNLOAD
    // =====================================================
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



/** Gerencia estados de botões e spinners */
function UI_setLoading(action, isLoading, config = {}) {
    const btn = document.getElementById(`btn-${action}`);
    const textSpan = document.getElementById(`${action}-text`);
    const spinner = document.getElementById(`${action}-spinner`);
    if (!btn) return;

    btn.disabled = isLoading;
    btn.style.opacity = isLoading ? "0.7" : "1";

    if (isLoading) {
        if (textSpan) textSpan.innerText = config.loadingText || "PROCESSANDO...";
        if (spinner) spinner.classList.remove('hidden');
    } else {
        if (textSpan) textSpan.innerText = config.defaultText;
        if (spinner) spinner.classList.add('hidden');
    }
}

/** Atualização visual após sucesso */
/** Atualização visual após sucesso na integração com o Plumber */
function marcarComoConcluidoUI(metodo, payloadExtra = {}) {
    const circle = document.getElementById('status-icon-circle');
    const symbol = document.getElementById('status-icon-symbol');
    const title  = document.getElementById('status-final-title');
    const text   = document.getElementById('status-final-text');

    if (!circle || !symbol) return;

    // pulso leve
    circle.classList.add('scale-110');
    setTimeout(() => circle.classList.remove('scale-110'), 200);

    // base visual de sucesso (ok para excel e sync)
    circle.classList.replace('bg-amber-100', 'bg-green-500');
    circle.classList.replace('text-amber-600', 'text-white');
    symbol.innerText = "✓";

    // ✅ 1) Excel: NÃO mexe no botão de sync
    if (metodo === 'excel') {
        if (title) title.innerText = "RELATÓRIO GERADO!";
        if (text)  text.innerText  = "A planilha local foi gerada com sucesso.";
        return; // <- CRÍTICO: sai aqui
    }

    // ✅ 2) Sync/Servidor: aí sim bloqueia e pinta btn-sync
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

    const btnSync = document.getElementById('btn-sync');
    if (btnSync) {
        btnSync.innerHTML = "ENVIADO ✓";
        btnSync.classList.add('bg-green-600');
        btnSync.disabled = true;
    }
}


// ============================================================
// SINCRONIZAÇÃO ONLINE — VERSÃO ÚNICA (OFFLINE-FIRST REAL)
// Fonte da verdade: IndexedDB (DB_API)
// - Lê TODAS as vistorias pendentes em STORE "respostas"
// - Busca fotos em STORE "fotos" por id_vistoria
// - Envia para o backend (FormData: payload + files)
// - Marca como sincronizado (NÃO APAGA NADA)
// ============================================================

// -----------------------------
// CONFIG
// -----------------------------
const SYNC_ENDPOINT = "https://strapless-christi-unspread.ngrok-free.dev/vistorias/sincronizar";
const SYNC_HEADERS = { "ngrok-skip-browser-warning": "true" };

// trava anti-duplo clique / evento online repetido
let __SYNC_LOCK = false;

// -----------------------------
// HELPERS
// -----------------------------

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

function _toFlatRespostas(respostas) {
  const flat = {};
  const blocos = respostas || {};
  if (!blocos || typeof blocos !== "object") return flat;

  for (const k of Object.keys(blocos)) {
    const obj = blocos[k];
    if (obj && typeof obj === "object") {
      for (const pid of Object.keys(obj)) {
        // mantém como string para backend
        flat[String(pid)] = obj[pid];
      }
    }
  }
  return flat;
}

function _localTextoParaId(localTexto) {
  if (typeof localTexto !== "string" || !localTexto.trim()) return 1;
  const idx = (typeof LOCAIS_VISITA !== "undefined") ? LOCAIS_VISITA.indexOf(localTexto.trim()) : -1;
  return idx >= 0 ? (idx + 1) : 1;
}

async function _buildFormDataFromVisita(visita) {
  const id_vistoria = String(visita.id_vistoria || "");
  if (!id_vistoria) throw new Error("Visita sem id_vistoria.");

  // 1) fotos da vistoria
  const fotosNoBanco = (window.DB_API && typeof DB_API.getAllFotosVistoria === "function")
    ? await DB_API.getAllFotosVistoria(id_vistoria)
    : [];

  // 2) respostas flat
  const respostasFlat = _toFlatRespostas(visita.respostas);

  // 3) local_id
  const local_id = String(_localTextoParaId(visita.local));

  // 4) FormData + manifest
  const fd = new FormData();
  const fotos_manifest = [];

  for (const f of (Array.isArray(fotosNoBanco) ? fotosNoBanco : [])) {
    const blob = f.blob_data || f.blob;
    if (!blob) continue;

    const foto_id = String(f.foto_id || crypto.randomUUID());
    const pergunta_id = String(f.pergunta_id || "foto_geral");
    const filename = `${_safeSlug(foto_id)}__${_safeSlug(pergunta_id)}.jpg`;

    fotos_manifest.push({ foto_id, pergunta_id, filename });
    fd.append("files", blob, filename);
  }

  // 5) payload padrão para o R (Plumber)
  const payloadParaR = {
    metadata: {
      id_vistoria,
      origem: "pwa_android"
    },
    core: {
      data_execucao: visita.data_hora || visita.data || new Date().toISOString(),
      local_id,
      tecnico: String(visita.tecnico || visita.avaliador || "Não Informado"),
      atividade: visita.tipoRoteiro || "supervisao",
      usuario_id: visita.usuario_id || null
    },
    dados: {
      respostas: respostasFlat,
      fotos_manifest
    }
  };

  fd.set("payload", JSON.stringify(payloadParaR));
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

function _updateStatusSafe(msg) {
  if (typeof atualizarStatusTexto === "function") atualizarStatusTexto(msg);
  else console.log("Status:", msg);
}

// -----------------------------
// CORE SYNC — 1 VISTORIA
// -----------------------------
async function sincronizarUmaVistoria(visita) {
  const id = String(visita?.id_vistoria || "");
  if (!id) throw new Error("Vistoria sem id_vistoria.");

  const { fd, fotos_manifest_len } = await _buildFormDataFromVisita(visita);

  console.log("🟢 Enviando vistoria:", id);
  for (const [k, v] of fd.entries()) {
  if (k === "payload") {
    try { console.log("payload(JSON):", JSON.parse(v)); } catch { console.log("payload(raw):", v); }
    continue;
  }
  if (v instanceof File) console.log(` - ${k}: FILE name=${v.name} size=${v.size} type=${v.type}`);
  else console.log(` - ${k}:`, v);
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

  // marca como sincronizado (NÃO APAGA NADA)
  if (window.DB_API && typeof DB_API.marcarComoSincronizado === "function") {
    await DB_API.marcarComoSincronizado(id);
  }

  return { id_vistoria: id, fotos_enviadas: fotos_manifest_len };
}

// -----------------------------
// CORE SYNC — TODAS PENDENTES
// -----------------------------
async function sincronizarPendentes({ showUI = true } = {}) {
  if (__SYNC_LOCK) return;
  __SYNC_LOCK = true;

  try {
    if (!navigator.onLine) {
      if (showUI) alert("Sem conexão! Os dados permanecem protegidos no IndexedDB.");
      _updateStatusSafe("Sem conexão.");
      return;
    }

    if (!window.DB_API || typeof DB_API.getVistoriasPendentes !== "function") {
      throw new Error("DB_API.getVistoriasPendentes não disponível.");
    }

    if (showUI && typeof UI_setLoading === "function") {
      UI_setLoading("sync", true, { loadingText: "A ENVIAR PENDÊNCIAS..." });
    }

    _updateStatusSafe("Verificando pendências...");

    const pendentes = await DB_API.getVistoriasPendentes();
    const total = pendentes.length;

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
        console.log("✅ Sincronizada:", r);
      } catch (e) {
        falhas++;
        console.warn(`⚠️ Falha ao sincronizar ${id}:`, e?.message || e);
        // segue para as próximas
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
    console.error("❌ Erro geral na sincronização:", err);

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

// -----------------------------
// BOTÃO / UI
// -----------------------------
async function handleSincronizacao() {
  if (__SYNC_LOCK) return;
  __SYNC_LOCK = true;

  try {
    await sincronizarPendentes({ showUI: true });
  } finally {
    __SYNC_LOCK = false;
  }
}


// -----------------------------
// AUTO-SYNC AO VOLTAR ONLINE
// -----------------------------
window.addEventListener("online", () => {
  console.log("🌐 Online novamente — auto-sync pendências.");
  // auto-sync sem alerts/spinners invasivos
  sincronizarPendentes({ showUI: false });
});


// Função segura para atualizar status
function atualizarStatusTexto(msg) {
    const el = document.getElementById('status-sinc');
    if (el) {
        el.innerText = msg;
    } else {
        console.log("Status log:", msg);
    }
}

// Monitor global de erros
window.onerror = function (msg, url, line) {
    if (msg && msg.includes("Script error")) return;

    alert("ERRO NO APP: " + msg + "\nLinha: " + line);
    return false;
};

/// ============================================================
// NOVA VISTORIA (OFFLINE-FIRST, SEM PERDER DADOS)
// - salva a vistoria atual no IndexedDB (respostas/fotos permanecem lá)
// - limpa campos do cadastro e volta para screen-cadastro
// - cria um novo id_vistoria para a próxima vistoria
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

  // limpa selects auxiliares caso existam
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

    // 1) GARANTE que a vistoria atual fica salva no IndexedDB (respostas)
    //    (fotos já estão na store fotos por id_vistoria)
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

    // 2) NOVO ID para a próxima vistoria
    const novoId = `VIST_${Date.now()}`;
    localStorage.setItem("id_vistoria", novoId);

    // 3) LIMPA TUDO do cadastro (para voltar ao início e permitir escolher outro local/acompanhante)
    //    CRÍTICO: remove backup que poderia repopular o estado antigo
    localStorage.removeItem("APP_STATE_BACKUP");
    localStorage.removeItem("APP_META");
    localStorage.removeItem("avaliador");
    localStorage.removeItem("local");
    localStorage.removeItem("data");

    // 4) Reseta estado em memória para a nova vistoria (vazia)
    APP_STATE.avaliador = "";
    APP_STATE.colaborador = "";
    APP_STATE.local = "";
    APP_STATE.data = "";
    APP_STATE.tipoRoteiro = null;
    APP_STATE.sublocal = "";
    APP_STATE.roteiro = [];
    APP_STATE.respostas = { geral: {}, pge: {}, aa: {} };
    APP_STATE.id_vistoria = novoId;

    // (opcional, mas bom) cria “esqueleto” da nova vistoria no IndexedDB
    await DB_API.saveVisita({
      id_vistoria: String(novoId),
      avaliador: "",
      local: "",
      data: new Date().toISOString(),
      tipoRoteiro: "geral",
      respostas: { geral: {}, pge: {}, aa: {} }
    });

    // 5) volta para o INÍCIO (sem reload)
    _resetarCadastroUI();
    showScreen("screen-cadastro");

    alert("Nova vistoria iniciada. Preencha o cadastro novamente.");

  } catch (err) {
    console.error("❌ Erro ao iniciar nova vistoria:", err);
    alert("ERRO CRÍTICO: não foi possível iniciar nova vistoria. Veja o console.");
  }
}

// ============================================================
// SERVICE WORKER
// ============================================================

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then(reg => {
       console.log('SW registrado!');
       reg.update();
    })
    .catch(err => console.log('Erro ao registrar SW:', err));
}

// ============================================================
// VINCULAÇÕES GLOBAIS
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

// Inicialização principal
document.addEventListener("DOMContentLoaded", initApp);
