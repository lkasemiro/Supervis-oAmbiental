/// ===========================================================
// APP.JS – VERSÃO INTEGRAL CORRIGIDA (ORGANIZADA POR FLUXO)
// ============================================================

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
id_vistoria: null,
sincronizado: false
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
// Função de suporte para recuperar metadados leves
function carregarMetaDoLocalStorage() {
    const metaStr = localStorage.getItem("APP_META");
    const idSolto = localStorage.getItem("id_vistoria"); // Recupera o ID que salvamos fora do JSON

    if (metaStr) {
        try {
            const meta = JSON.parse(metaStr);
            APP_STATE.avaliador = meta.avaliador || "";
            APP_STATE.local = meta.local || "";
            APP_STATE.data = meta.data || "";
            
            // UNIFICAÇÃO: Prioriza o ID que estiver disponível
            APP_STATE.id_vistoria = idSolto || meta.id_vistoria || meta.id_visita || "";

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
function gerarFormulario(tipo) {
    const container = document.getElementById("container-perguntas");
    if (!container) return;

    // Limpa o formulário anterior
    container.innerHTML = "";
    APP_STATE.tipoRoteiro = tipo;

    // Define qual roteiro usar
    let perguntas = [];
    if (tipo === 'geral') perguntas = window.ROTEIRO_GERAL || [];
    if (tipo === 'pge') perguntas = window.ROTEIRO_PGE || [];
    if (tipo === 'aa') perguntas = window.ROTEIRO_AA || [];

    if (perguntas.length === 0) {
        container.innerHTML = "<p class='text-red-500'>Erro: Roteiro não carregado ou vazio.</p>";
        return;
    }

    // Renderiza cada pergunta
    perguntas.forEach((p) => {
        const div = document.createElement("div");
        div.className = "mb-6 p-4 bg-white rounded-lg shadow-sm border-l-4 border-blue-600";
        
        // Recupera resposta existente se houver (para retomada)
        let valorSalvo = "";
        if (tipo === "pge") {
            valorSalvo = APP_STATE.respostas.pge[`${p.id}_${p.Sublocal}`] || "";
        } else {
            valorSalvo = APP_STATE.respostas[tipo][p.id] || "";
        }

        div.innerHTML = `
            <label class="block font-bold text-gray-700 mb-2">${p.Pergunta}</label>
            ${p.Sublocal ? `<small class="text-blue-500 block mb-2 font-medium">📍 ${p.Sublocal}</small>` : ""}
            
            <textarea 
                class="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-400" 
                rows="2" 
                placeholder="Sua resposta..."
                onchange="registrarResposta('${p.id}', this.value, '${tipo}')"
            >${valorSalvo}</textarea>

            <div class="mt-3 flex items-center gap-3">
                <button type="button" onclick="abrirCamera('${p.id}')" class="bg-gray-100 p-2 rounded-md hover:bg-gray-200">
                    📸 Tirar Foto
                </button>
                <div id="foto-container-${p.id}" class="flex gap-2 flex-wrap">
                    </div>
            </div>
        `;
        container.appendChild(div);
        
        // Se houver fotos, carrega-as agora
        atualizarListaFotos(p.id);
    });

    // Atualiza o título da tela
    const titulo = document.getElementById("titulo-roteiro");
    if (titulo) titulo.innerText = tipo.toUpperCase();
}
async function initApp() {
    console.log("🚀 Iniciando App...");
    
    // 1. Carrega metadados básicos
    carregarMetaDoLocalStorage();

    // 2. Tenta recuperar o progresso pesado (Respostas) do IndexedDB
    if (window.DB_API && APP_STATE.id_vistoria) {
        try {
            console.log("🔍 Buscando dados para ID:", APP_STATE.id_vistoria);
            const dadosSalvos = await DB_API.loadVisita(APP_STATE.id_vistoria);
            
            if (dadosSalvos) {
                // Restaura respostas e roteiro
                APP_STATE.respostas = dadosSalvos.respostas || APP_STATE.respostas;
                APP_STATE.tipoRoteiro = dadosSalvos.tipoRoteiro || null;
                console.log("✅ Progresso recuperado com sucesso.");
            }
        } catch (err) {
            console.warn("Nenhum dado prévio no banco para este ID.");
        }
    }

    // 3. SE NÃO EXISTIR ID (Primeira vez absoluta), CRIA AGORA
    if (!APP_STATE.id_vistoria) {
        APP_STATE.id_vistoria = `CEDAE_${Date.now()}`;
        localStorage.setItem("id_vistoria", APP_STATE.id_vistoria);
    }

    // 4. Configura o seletor de locais (Populando o HTML)
    const selLocal = document.getElementById("local");
    if (selLocal) {
        selLocal.innerHTML = `<option disabled selected value="">Selecionar Local...</option>` +
            LOCAIS_VISITA.map(l => `<option value="${l}">${l}</option>`).join("");
        if (APP_STATE.local) selLocal.value = APP_STATE.local;
    }

    // 5. Direcionamento de Tela Inteligente
    if (APP_STATE.local && APP_STATE.avaliador) {
        // Se já escolheu o roteiro antes, vai direto pro formulário
        if (APP_STATE.tipoRoteiro) {
            gerarFormulario(APP_STATE.tipoRoteiro);
            showScreen("screen-formulario");
        } else {
            showScreen("screen-select-roteiro");
        }
    } else {
        showScreen("screen-cadastro");
    }
}
function validarEComecar() {
    const elAval = document.getElementById("avaliador");
    const elLocal = document.getElementById("local");
    const elData = document.getElementById("data_visita");
    const elColab = document.getElementById("colaborador");

    if (!elAval.value || !elLocal.value || !elData.value) {
        alert("Preencha Avaliador, Local e Data!");
        return;
    }

    // 1. ATUALIZA ESTADO GLOBAL
    APP_STATE.avaliador = elAval.value;
    APP_STATE.local = elLocal.value;
    APP_STATE.data = elData.value;
    APP_STATE.colaborador = elColab ? elColab.value : "";

    // 2. SÓ CRIA NOVO ID SE NÃO EXISTIR UM ATIVO (Crucial para o Service/Retomada)
    if (!APP_STATE.id_vistoria) {
        APP_STATE.id_vistoria = `VIST_${Date.now()}`;
        localStorage.setItem("id_vistoria", APP_STATE.id_vistoria);
        console.log("🆕 Novo ID gerado:", APP_STATE.id_vistoria);
    } else {
        console.log("🔄 Retomando ID existente:", APP_STATE.id_vistoria);
    }

    // 3. PERSISTÊNCIA DOS METADADOS
    const metaData = {
        avaliador: APP_STATE.avaliador,
        local: APP_STATE.local,
        data: APP_STATE.data,
        colaborador: APP_STATE.colaborador,
        id_vistoria: APP_STATE.id_vistoria
    };
    localStorage.setItem("APP_META", JSON.stringify(metaData));
    
    // Salva no IndexedDB
    registrarResposta(null, null); 
    
    // 4. DIRECIOMANENTO
    // Se o usuário já tinha selecionado um roteiro antes de fechar o app, vai direto pra ele
    if (APP_STATE.tipoRoteiro) {
        gerarFormulario(APP_STATE.tipoRoteiro);
        showScreen("screen-formulario");
    } else {
        showScreen("screen-select-roteiro");
    }
}

/// ============================================================
// 4. PERSISTÊNCIA DE RESPOSTAS (REVISADA)
// ============================================================

function registrarResposta(idPergunta, valor, tipoRoteiro) {
    const roteiroAlvo = tipoRoteiro || APP_STATE.tipoRoteiro;
    if (!roteiroAlvo) return;

    if (!APP_STATE.respostas[roteiroAlvo]) {
        APP_STATE.respostas[roteiroAlvo] = {};
    }

    // 1. Registro no estado global (Memória)
    if (idPergunta !== null) {
        if (roteiroAlvo === "pge") {
            const chaveComposta = `${idPergunta}_${APP_STATE.sublocal || 'Geral'}`;
            APP_STATE.respostas.pge[chaveComposta] = valor;
        } else {
            APP_STATE.respostas[roteiroAlvo][idPergunta] = valor;
        }
    }

    // 2. Garantia do Identificador Único
    const idFinal = APP_STATE.id_vistoria || localStorage.getItem("id_vistoria");
    if (!idFinal) {
        console.error("Erro: id_vistoria não encontrado no momento do registro.");
        return;
    }

    // 3. Preparação do Objeto Limpo (Deep Copy)
    // Isso evita erros de 'Clone Algorithm' no IndexedDB e limpa campos nulos
    const dadosParaSalvar = {
        id_vistoria: idFinal,
        avaliador: APP_STATE.avaliador || "",
        local: APP_STATE.local || "",
        data_hora: APP_STATE.data || new Date().toISOString(),
        tipoRoteiro: roteiroAlvo,
        respostas: JSON.parse(JSON.stringify(APP_STATE.respostas)), // Limpeza profunda
        sincronizado: false,
        ultima_atualizacao: new Date().toISOString()
    };

    // 4. Persistência em LocalStorage (Metadados rápidos)
    localStorage.setItem("APP_META", JSON.stringify({
        avaliador: dadosParaSalvar.avaliador,
        local: dadosParaSalvar.local,
        id_vistoria: idFinal,
        data: dadosParaSalvar.data_hora
    }));

    // 5. Persistência Robusta no IndexedDB
    if (window.DB_API && window.DB_API.saveVisita) {
        window.DB_API.saveVisita(dadosParaSalvar)
            .then(() => console.log(`💾 Progresso salvo: ${idPergunta || 'Metadados'}`))
            .catch(err => {
                console.error("❌ Erro Crítico IndexedDB:", err);
                // Alerta visual apenas se estiver no celular e falhar feio
                if (window.innerWidth < 768) alert("Erro ao salvar progresso localmente.");
            });
    }
}
// ============================================================
// 6. SELEÇÃO DE ROTEIRO (FLUXO PRINCIPAL)
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
        
        // 1. Limpa o que tiver de pergunta velha primeiro
        document.getElementById("conteudo_formulario").innerHTML = ""; 
        
        // 2. Coloca a imagem (ela dará o prepend no container vazio)
        exibirImagemApoioSublocal(selSub.value);
        
        // 3. Monta as seções e renderiza (o novo renderFormulario não vai apagar a imagem)
        montarSecoes();
        renderFormulario();
    }
};
}
// ============================================================
// 8. IMAGEM DE APOIO (PGE)
// ============================================================

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
        
        const valorSalvo = APP_STATE.respostas[APP_STATE.tipoRoteiro]?.[p.id] ?? "";

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
// 10. INPUTS
// ============================================================
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
            <div class="space-y-4">
                <button type="button" onclick="abrirCamera('${p.id}')" 
                    class="w-full bg-slate-800 hover:bg-black text-white py-5 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg shadow-slate-200">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    Anexar Evidência
                </button>
                <div id="fotos_${p.id}" class="grid grid-cols-3 gap-3 empty:hidden"></div>
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
                const valorPai = APP_STATE.respostas[tipo][pai];
                el.classList.toggle("hidden", valorPai !== cond);
            }
        }
    });
}

// ============================================================
// 12 SISTEMA DE CÂMERA E PROCESSAMENTO DE IMAGENS
// ============================================================

/**
 * 1. ACIONA A CÂMERA NATIVA
 */
async function abrirCamera(idPergunta) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment'; // Abre a câmera traseira preferencialmente

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            // Inicia o processamento da imagem capturada
            await processarFoto(idPergunta, file);
        }
    };
    input.click();
}

/**
 * 2. REDUZ E COMPRIME A IMAGEM (Otimização de Armazenamento)
 */
async function reduzirImagem(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800;
                let width = img.width;
                let height = img.height;

                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Retorna Base64 em formato JPEG com 70% de qualidade
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

/**
 * 3. PROCESSA, CONVERTE E SALVA
 */
async function processarFoto(idPergunta, file) {
    try {
        // Redução para Base64 (usado para visualização rápida e Excel)
        const base64Reduzido = await reduzirImagem(file); 
        
        // Conversão para Blob (Armazenamento mais eficiente no IndexedDB)
        const res = await fetch(base64Reduzido);
        const blob = await res.blob();
        
        const fotoId = `${idPergunta}_${Date.now()}`;

        // Salva no Banco de Dados
        if (window.savePhotoToDB) {
            await window.savePhotoToDB(fotoId, blob, idPergunta, base64Reduzido);
        }

        // Atualiza a galeria na tela
        await atualizarListaFotos(idPergunta);
        
        console.log("📸 Foto processada e salva com sucesso.");
    } catch (err) {
        console.error("Erro no processamento da foto:", err);
    }
}

/**
 * 4. INTERFACE: ATUALIZA A LISTA DE FOTOS NA TELA
 */
async function atualizarListaFotos(idPergunta) {
    const container = document.getElementById(`fotos_${idPergunta}`);
    if (!container) return;

    // Busca fotos diretamente do IndexedDB
    const fotosNoBanco = await DB_API.getFotosPergunta(idPergunta);
    container.innerHTML = "";

    fotosNoBanco.forEach(foto => {
        const imgDiv = document.createElement("div");
        imgDiv.className = "relative w-20 h-20";
        
        // Prioriza o Base64 salvo para performance, senão cria URL temporária do Blob
        const src = foto.base64 || (foto.blob ? URL.createObjectURL(foto.blob) : "");
        
        imgDiv.innerHTML = `
            <img src="${src}" class="w-full h-full object-cover rounded-xl border shadow-sm">
            <button onclick="removerFoto('${foto.foto_id}', '${idPergunta}')" 
                    class="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center border-2 border-white shadow-md active:scale-90 transition-transform">
                ✕
            </button>
        `;
        container.appendChild(imgDiv);
    });
}

/**
 * 5. REMOVE FOTO DO BANCO E DA TELA
 */
async function removerFoto(fotoId, idPergunta) {
    if (!confirm("Deseja excluir esta foto definitivamente?")) return;

    try {
        const db = await DB_API.openDB();
        const tx = db.transaction(['fotos'], 'readwrite');
        const store = tx.objectStore('fotos');

        store.delete(fotoId);

        await tx.complete;
        await atualizarListaFotos(idPergunta);
    } catch (err) {
        console.error("Erro ao remover foto:", err);
        alert("Erro ao excluir a foto.");
    }
}

// ============================================================
//  13 Iniciar cadastro
// ============================================================
function initCadastro() {
    document.getElementById("btn-cadastro-continuar").onclick = () => {
        APP_STATE.avaliador = document.getElementById("avaliador").value;
        APP_STATE.local = document.getElementById("local").value;
        APP_STATE.data = document.getElementById("data_visita").value;
        // GERAÇÃO DO ID ÚNICO PARA ESTA VISTORIA
        APP_STATE.id_visita = `VIST_${Date.now()}_${APP_STATE.local.replace(/\s+/g, '')}`;

        if (!APP_STATE.avaliador || !APP_STATE.local || !APP_STATE.data) return alert("Preencha tudo!");

        localStorage.setItem("avaliador", APP_STATE.avaliador);
        localStorage.setItem("colaborador", APP_STATE.colaborador);
        localStorage.setItem("local", APP_STATE.local);
        localStorage.setItem("data", APP_STATE.data);
        localStorage.setItem("id_visita", APP_STATE.id_visita);
        
        showScreen("screen-select-roteiro");
    };

    if (APP_STATE.local && APP_STATE.avaliador) {
        // Recupera o ID se a página recarregar
        APP_STATE.id_visita = localStorage.getItem("id_visita") || `VIST_${Date.now()}`;
        showScreen("screen-select-roteiro");
    } else {
        showScreen("screen-cadastro");
    }
}

// ============================================================
// 14. EXPORTAÇÃO EXCEL (REATIVO)
// ============================================================
async function handleExcelReativo() {
    UI_setLoading('excel', true, { loadingText: "A GERAR FICHEIRO..." });
    try {
        await baixarExcelConsolidado();
        // O marcarComoConcluidoUI já é chamado dentro da baixarExcelConsolidado no sucesso
    } catch (error) {
        console.error("Erro no Excel:", error);
        alert("Erro ao gerar o Excel.");
    } finally {
        UI_setLoading('excel', false, { defaultText: "BAIXAR NOVAMENTE 📊" });
    }
}

async function baixarExcelConsolidado() {
    try {
        const workbook = new ExcelJS.Workbook();
        const configuracao = [
            { nome: "Geral", id: "geral", fonte: window.ROTEIRO_GERAL },
            { nome: "PGE", id: "pge", fonte: window.ROTEIRO_PGE },
            { nome: "Acid. Ambientais", id: "aa", fonte: window.ROTEIRO_AA }
        ];

        for (const config of configuracao) {
            if (!config.fonte) continue;
            const sheet = workbook.addWorksheet(config.nome);
            
            // Estilização básica das colunas
            sheet.columns = [
                { header: 'SEÇÃO', key: 'secao', width: 20 },
                { header: 'SUBLOCAL', key: 'sublocal', width: 25 },
                { header: 'PERGUNTA', key: 'pergunta', width: 50 },
                { header: 'RESPOSTA', key: 'resposta', width: 40 },
                { header: 'FOTOS (ANEXOS)', key: 'fotos', width: 30 }
            ];

            const respostasDoTipo = APP_STATE.respostas[config.id] || {};

            for (const p of config.fonte) {
                let respostaTexto = (config.id === "pge") 
                    ? respostasDoTipo[`${p.id}_${p.Sublocal}`] || "" 
                    : respostasDoTipo[p.id] || "";
                
                // Busca fotos usando a função unificada do DB_API
                const fotosFiltradas = await DB_API.getFotosPergunta(p.id);

                // Se não tem resposta nem foto, pula a linha
                if (!respostaTexto && fotosFiltradas.length === 0) continue;

                const novaLinha = sheet.addRow({
                    secao: p.Secao || p["Seção"] || "",
                    sublocal: p.Sublocal || "Geral",
                    pergunta: p.Pergunta,
                    resposta: String(respostaTexto)
                });

                // Lógica de Inserção de Imagens Corrigida
                if (fotosFiltradas.length > 0) {
                    novaLinha.height = 90; // Ajusta altura da linha para a foto caber

                    for (let i = 0; i < fotosFiltradas.length; i++) {
                        const foto = fotosFiltradas[i];
                        
                        // CORREÇÃO: Converter Base64 para Buffer em vez de usar .blob
                        if (foto.base64) {
                            try {
                                // Remove o cabeçalho "data:image/jpeg;base64," se existir
                                const base64Data = foto.base64.split(',')[1] || foto.base64;
                                
                                const imageId = workbook.addImage({
                                    base64: base64Data,
                                    extension: 'jpeg',
                                });

                                sheet.addImage(imageId, {
                                    tl: { col: 4, row: novaLinha.number - 1 },
                                    ext: { width: 100, height: 100 },
                                    editAs: 'oneCell'
                                });
                            } catch (imgErr) {
                                console.error("Erro ao processar imagem para Excel:", imgErr);
                            }
                        }
                    }
                }
            }
        }

        // Geração do arquivo
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Relatorio_${APP_STATE.local || 'Vistoria'}_${Date.now()}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        marcarComoConcluidoUI('excel');
    } catch (err) {
        console.error("Erro detalhado no Excel:", err);
        throw err;
    }
}
// ============================================================
// 15. SINCRONIZAÇÃO UNIFICADA (R/PLUMBER)
// ============================================================
async function handleSincronizacao() {
    if (!navigator.onLine) {
        alert("Sem conexão! Dados salvos localmente.");
        return;
    }

    UI_setLoading('sync', true, { loadingText: "A ENVIAR DADOS..." });

    try {
        const fotosParaEnviar = await DB_API.getAllFotosVistoria(APP_STATE.id_vistoria);
        
        // MAPEAMENTO PARA O SQL DA CEDAE
        const dadosCompletos = {
            id_vistoria: String(APP_STATE.id_vistoria),
            tecnico: String(APP_STATE.avaliador || "Não Informado"), // Mapeado para 'tecnico'
            local: String(APP_STATE.local || "Não Informado"),       // Mapeado para 'local'
            atividade: String(APP_STATE.atividade || "Supervisão Ambiental"), // Sua nova coluna mestra
            roteiro_id: String(APP_STATE.tipoRoteiro),               // Mapeado para 'roteiro_id'
            data_hora: APP_STATE.data || new Date().toISOString(),
            respostas: APP_STATE.respostas,
            fotos: fotosParaEnviar.map(f => f.base64)
        };

        const response = await fetch('https://strapless-christi-unspread.ngrok-free.dev/vistorias/sincronizar', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true' 
            },
            body: JSON.stringify(dadosCompletos)
        });

        const resultado = await response.json();

        if (response.ok && resultado.status === "sucesso") {
            marcarComoConcluidoUI('servidor');
            UI_setLoading('sync', false, { defaultText: "ENVIADO COM SUCESSO ✓" });
            
            // Marca sincronizado no IndexedDB
            const db = await DB_API.openDB();
            const tx = db.transaction("vistorias", "readwrite");
            APP_STATE.sincronizado = true;
            await tx.objectStore("vistorias").put(JSON.parse(JSON.stringify(APP_STATE)));
        } else {
            throw new Error(resultado.message || "Erro no servidor");
        }

    } catch (error) {
        console.error("Erro:", error);
        alert("Falha: " + error.message);
        UI_setLoading('sync', false, { defaultText: "TENTAR NOVAMENTE" });
    }
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
function marcarComoConcluidoUI(metodo) {
    const circle = document.getElementById('status-icon-circle');
    const symbol = document.getElementById('status-icon-symbol');
    const title = document.getElementById('status-final-title');
    const text = document.getElementById('status-final-text');

    if (!circle || !symbol) return;

    circle.classList.add('scale-110');
    setTimeout(() => circle.classList.remove('scale-110'), 200);

    circle.classList.replace('bg-amber-100', 'bg-green-500');
    circle.classList.replace('text-amber-600', 'text-white');
    
    symbol.innerText = "✓";
    if (title) title.innerText = "SUCESSO!";
    
    if (text) {
        if (metodo === 'excel') {
            text.innerText = "A planilha foi gerada e o download iniciado.";
        } else {
            const atividade = APP_STATE.atividade || "Supervisão Ambiental";
            text.innerText = `Os dados de ${atividade} foram enviados ao servidor da CEDAE.`;
        }
    }
}
// ============================================================
// SINCRONIZAÇÃO MANUAL (BOTÃO ENVIAR)
// ============================================================
async function sincronizarComBanco() {
    // 1. Verifica conexão antes de começar
    if (!navigator.onLine) {
        alert("Sem conexão à internet para enviar.");
        return;
    }

    // 2. Ativa estado de carregamento no botão 'sync'
    UI_setLoading('sync', true, { loadingText: "ENVIANDO AO SERVIDOR..." });

    try {
        const db = await DB_API.openDB();
        
        // Busca vistorias do IndexedDB
        const vistorias = await new Promise((res) => {
            const tx = db.transaction("vistorias", "readonly");
            tx.objectStore("vistorias").getAll().onsuccess = (e) => res(e.target.result);
        });

        // Filtra a vistoria específica que está aberta no estado do app
        const pendentes = vistorias.filter(v => v.id_vistoria === APP_STATE.id_vistoria && !v.sincronizado);

        if (pendentes.length === 0) {
            alert("Esta vistoria já foi enviada ou não foi encontrada.");
            UI_setLoading('sync', false, { defaultText: "ENVIAR PARA O SERVIDOR" });
            return;
        }

        for (const visita of pendentes) {
            // Buscamos as fotos vinculadas
            const fotos = await DB_API.getAllFotosVistoria(visita.id_vistoria);
            
            // Montamos o pacote final normalizado
            const payload = {
                ...visita,
                tecnico: visita.avaliador || visita.tecnico,
                local: visita.local,
                atividade: visita.atividade || "Supervisão Ambiental",
                roteiro_id: visita.tipoRoteiro,
                fotos_base64: fotos.map(f => f.base64) 
            };

            const response = await fetch('https://strapless-christi-unspread.ngrok-free.dev/vistorias/sincronizar', {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "ngrok-skip-browser-warning": "true" 
                },
                body: JSON.stringify(payload)
            });

            const resposta = await response.json();

            // SUCESSO OU JÁ SINCRONIZADA
            if (response.ok || (resposta.mensagem && resposta.mensagem.includes("sincronizada"))) {
                visita.sincronizado = true;
                const txUp = db.transaction("vistorias", "readwrite");
                await txUp.objectStore("vistorias").put(visita);
                
                marcarComoConcluidoUI('sync');
            } else {
                throw new Error(resposta.mensagem || "Erro no processamento do servidor");
            }
        }

        UI_setLoading('sync', false, { defaultText: "ENVIADO COM SUCESSO ✓" });

    } catch (err) {
        console.error("Erro na sincronização:", err);
        alert("Erro: " + err.message);
        UI_setLoading('sync', false, { defaultText: "TENTAR ENVIAR NOVAMENTE" });
    }
}
async function sincronizarVisitasPendentes() {
    if (!navigator.onLine) return;
    console.log("🌐 Conexão restaurada! Iniciando sincronização em segundo plano...");

    const db = await DB_API.openDB();
    const tx = db.transaction("vistorias", "readonly");
    const store = tx.objectStore("vistorias");
    
    const visitas = await new Promise(res => {
        const req = store.getAll();
        req.onsuccess = () => res(req.result);
    });

    for (let visita of visitas) {
        // Pula se já foi enviado ou se não tem ID
        if (visita.sincronizado || !visita.id_vistoria) continue;

        try {
            // [ADADEQUAÇÃO 1] Buscar as fotos vinculadas a esta visita específica
            const fotos = await DB_API.getAllFotosVistoria(visita.id_vistoria);
            
            // [ADEQUAÇÃO 2] Normalizar o objeto para o padrão do Banco SQL (Atividade/Local/Tecnico)
            const payload = {
                id_vistoria: visita.id_vistoria,
                tecnico: visita.avaliador || visita.tecnico || "Não identificado",
                local: visita.local || "Não informado",
                atividade: visita.atividade || "Supervisão Ambiental", // Valor padrão ou do estado
                roteiro_id: visita.tipoRoteiro,
                data_hora: visita.data || new Date().toISOString(),
                respostas: visita.respostas,
                fotos_base64: fotos.map(f => f.base64), // Inclui as imagens agora!
                origem: "sincronizacao_automatica"
            };

            const res = await fetch('https://strapless-christi-unspread.ngrok-free.dev/vistorias/sincronizar', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'ngrok-skip-browser-warning': 'true' // [ADEQUAÇÃO 3] Essencial para o ngrok
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const resultado = await res.json();
                if (resultado.status === "sucesso") {
                    // Atualiza no IndexedDB para não reenviar
                    visita.sincronizado = true;
                    const txUpdate = db.transaction("vistorias", "readwrite");
                    await txUpdate.objectStore("vistorias").put(visita);
                    console.log(`✅ Sincronização automática com sucesso: ${visita.id_vistoria}`);
                }
            }
        } catch (e) {
            console.error(`❌ Falha ao sincronizar visita ${visita.id_vistoria}:`, e);
            // Não fazemos nada, tentará novamente na próxima vez que ficar online
        }
    }
}
// ============================================================
/**
 * Retorna para a tela de formulário mantendo o roteiro que estava selecionado
 */
function voltarParaFormulario() {
    if (APP_STATE.tipoRoteiro) {
        showScreen('screen-formulario');
    } else {
        showScreen('screen-select-roteiro');
    }
}

//** * Finaliza a vistoria atual, salva no histórico (IndexedDB) e limpa a interface
async function confirmarNovaVistoria() {
    const circle = document.getElementById('status-icon-circle');
    const symbol = document.getElementById('status-icon-symbol');
    
    if (!confirm("Deseja arquivar esta vistoria e iniciar uma nova?")) return;

    if(circle) circle.className = "w-20 h-20 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse";
    if(symbol) symbol.innerText = "⏳";

    try {
        const db = await DB_API.openDB();
        // UNIFICAÇÃO: Usamos apenas id_vistoria
        const idAtual = APP_STATE.id_vistoria || localStorage.getItem("id_vistoria") || `VIST_${Date.now()}`;

        const pacoteParaArquivar = {
            id_vistoria: String(idAtual),
            tecnico: String(APP_STATE.avaliador || "Não Informado"),
            local: String(APP_STATE.local || "Não Informado"),
            atividade: "Supervisão Ambiental",
            data: APP_STATE.data || new Date().toISOString().split('T')[0],
            respostas: JSON.parse(JSON.stringify(APP_STATE.respostas || {})), 
            tipoRoteiro: APP_STATE.tipoRoteiro,
            sincronizado: APP_STATE.sincronizado ? 1 : 0,
            timestamp: Date.now()
        };

        const tx = db.transaction(["vistorias"], "readwrite");
        await tx.objectStore("vistorias").put(pacoteParaArquivar);

        tx.oncomplete = () => {
            // LIMPEZA DE SESSÃO
            localStorage.removeItem("id_vistoria");
            localStorage.removeItem("id_visita"); // Limpa o nome antigo por segurança
            localStorage.removeItem("APP_META");
            
            // Preserva o técnico para não precisar digitar de novo
            if (APP_STATE.avaliador) localStorage.setItem("avaliador_nome", APP_STATE.avaliador);

            alert("Vistoria arquivada com sucesso!");
            location.reload(); 
        };
    } catch (err) {
        console.error("Erro ao arquivar:", err);
        alert("Erro ao acessar banco local.");
    }
}
window.savePhotoToDB = async (fotoId, blob, idPergunta, base64) => {
    const db = await DB_API.openDB();
    
    // Pegamos o ID de qualquer uma das fontes disponíveis
    const idAtivo = APP_STATE.id_vistoria || localStorage.getItem("id_vistoria");

    if (!idAtivo) {
        alert("Erro: ID de vistoria não encontrado. Tire a foto novamente.");
        return;
    }

    return new Promise((resolve, reject) => {
        const tx = db.transaction(['fotos'], 'readwrite');
        const store = tx.objectStore('fotos');

        store.put({
            foto_id: fotoId,
            id_vistoria: idAtivo, // Campo unificado
            pergunta_id: idPergunta,
            sublocal: APP_STATE.sublocal || "Geral", 
            base64: base64,
            timestamp: Date.now()
        });

        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e);
    });
};

DB_API.getFotosPergunta = async (idPergunta) => {
    const db = await DB_API.openDB();
    const idAtivo = APP_STATE.id_vistoria || localStorage.getItem("id_vistoria");

    return new Promise((resolve) => {
        const tx = db.transaction(['fotos'], 'readonly');
        const store = tx.objectStore('fotos');
        const req = store.getAll();

        req.onsuccess = () => {
            // Filtra garantindo que a foto pertence a ESTA vistoria e a ESTA pergunta
            const fotos = req.result.filter(f => 
                f.id_vistoria === idAtivo && 
                f.pergunta_id === idPergunta
            );
            resolve(fotos);
        };
        req.onerror = () => resolve([]);
    });
};
// ============================================================
// TRATAMENTO DE ERROS E STATUS
// ============================================================

// 1. Função segura para atualizar status de texto
function atualizarStatusTexto(msg) {
    const el = document.getElementById('status-sinc');
    if (el) {
        el.innerText = msg;
    } else {
        // Se o elemento não existe, apenas logamos no console para não travar o app
        console.log("Status log:", msg);
    }
}

// 2. Monitor de Erros Globais (ajudará a debugar no celular)
window.onerror = function (msg, url, line) {
    // Ignora erros irrelevantes de extensões ou conexões repetidas
    if (msg.includes("Script error")) return; 
    
    alert("ERRO NO APP: " + msg + "\nLinha: " + line);
    return false; // Permite que o erro apareça no console também
};

// 3. Inicialização de status ao carregar
document.addEventListener("DOMContentLoaded", () => {
    atualizarStatusTexto("Sistema Pronto");
});
// ------------------------------------------------------------
// VINCULAÇÕES GLOBAIS (FINAL DO ARQUIVO) - Versão Blindada
// ------------------------------------------------------------
window.showScreen = showScreen;
window.selectRoteiro = selectRoteiro;
window.abrirCamera = abrirCamera;
window.removerFoto = removerFoto; 
window.registrarResposta = registrarResposta;
window.gerenciarMudancaCheckbox = gerenciarMudancaCheckbox;
window.baixarExcelConsolidado = baixarExcelConsolidado; 
window.sincronizarComBanco = sincronizarComBanco;
window.confirmarNovaVistoria = confirmarNovaVistoria;
window.voltarParaFormulario = voltarParaFormulario;
window.validarEComecar = validarEComecar;
window.atualizarStatusTexto = atualizarStatusTexto;

document.addEventListener("DOMContentLoaded", initApp);

