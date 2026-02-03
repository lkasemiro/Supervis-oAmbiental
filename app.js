// APP.JS – VERSÃO INTEGRAL CORRIGIDA (ORGANIZADA POR FLUXO)

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
            APP_STATE.id_visita = meta.id_visita || "";
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
async function initApp() {
    console.log("🚀 Iniciando App...");
    
    // 1. Carrega o que estiver no LocalStorage (Metadados rápidos)
    carregarMetaDoLocalStorage();

    // 2. Carrega o progresso pesado do IndexedDB
    if (window.DB_API && window.DB_API.loadVisita) {
        try {
            const dadosSalvos = await DB_API.loadVisita();
            if (dadosSalvos) {
                // Sincroniza respostas
                APP_STATE.respostas = dadosSalvos.respostas || APP_STATE.respostas;
                
                // UNIFICAÇÃO DE CHAVE: Garante que id_vistoria seja a oficial
                APP_STATE.id_vistoria = dadosSalvos.id_vistoria || dadosSalvos.id_visita || localStorage.getItem("id_vistoria");
            }
        } catch (err) {
            console.warn("Sem dados no IndexedDB, iniciando limpo.");
        }
    }

    // 3. SE NÃO EXISTIR ID, CRIA AGORA (Evita o erro de Chave Nula no celular)
    if (!APP_STATE.id_vistoria) {
        APP_STATE.id_vistoria = `VIST_${Date.now()}`;
        localStorage.setItem("id_vistoria", APP_STATE.id_vistoria);
    }

    // 4. Configuração do Seletor (Mantido seu código original)
    const selLocal = document.getElementById("local");
    if (selLocal) {
        selLocal.innerHTML = `<option disabled selected value="">Selecionar Local...</option>` +
            LOCAIS_VISITA.map(l => `<option value="${l}">${l}</option>`).join("");
        
        if (APP_STATE.local) selLocal.value = APP_STATE.local;
        
        selLocal.onchange = () => {
            APP_STATE.local = selLocal.value;
            registrarResposta(null, null); 
        };
    }

    // 5. Direcionamento de Tela
    if (APP_STATE.local && APP_STATE.avaliador) {
        showScreen("screen-select-roteiro");
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

    // Atualiza Estado Global
    APP_STATE.avaliador = elAval.value;
    APP_STATE.local = elLocal.value;
    APP_STATE.data = elData.value;
    APP_STATE.colaborador = elColab ? elColab.value : "";
    APP_STATE.id_vistoria = `VIST_${Date.now()}`; // Cria o ID único aqui
    localStorage.setItem("id_vistoria", APP_STATE.id_vistoria);
    
    registrarResposta(null, null); // Salva os metadados iniciais
    showScreen("screen-select-roteiro");
}

// 4. PERSISTÊNCIA DE RESPOSTAS (REVISADA)
function registrarResposta(idPergunta, valor, tipoRoteiro) {
    // 1. Identifica o roteiro ativo
    const roteiroAlvo = tipoRoteiro || APP_STATE.tipoRoteiro;
    if (!roteiroAlvo) return; // Segurança contra chamadas prematuras

    if (!APP_STATE.respostas[roteiroAlvo]) {
        APP_STATE.respostas[roteiroAlvo] = {};
    }

    // 2. Registra o valor (se houver idPergunta)
    if (idPergunta !== null) {
        if (roteiroAlvo === "pge") {
            const chaveComposta = `${idPergunta}_${APP_STATE.sublocal || 'Geral'}`;
            APP_STATE.respostas.pge[chaveComposta] = valor;
        } else {
            APP_STATE.respostas[roteiroAlvo][idPergunta] = valor;
        }
    }

    // 3. SEGURANÇA DE CHAVE PRIMÁRIA (O Pulo do Gato)
    // Forçamos o APP_STATE a ter a chave exata que o IndexedDB v7 espera: id_vistoria
    const idFinal = APP_STATE.id_vistoria || APP_STATE.id_visita || localStorage.getItem("id_vistoria");
    
    // 4. Salva Metadados Leves (LocalStorage)
    const metaData = {
        avaliador: APP_STATE.avaliador,
        local: APP_STATE.local,
        id_vistoria: idFinal, // Padronizado
        data: APP_STATE.data,
        sublocal: APP_STATE.sublocal,
        tipoRoteiro: APP_STATE.tipoRoteiro
    };
    
    try {
        localStorage.setItem("APP_META", JSON.stringify(metaData));
        localStorage.setItem("id_vistoria", idFinal); // redundância de segurança
    } catch (e) {
        console.warn("LocalStorage cheio ou bloqueado.");
    }

    // 5. PERSISTÊNCIA NO INDEXEDDB
    // Criamos o objeto final garantindo que id_vistoria exista
    if (window.DB_API && window.DB_API.saveVisita) {
        const dadosParaSalvar = {
            ...APP_STATE,
            id_vistoria: idFinal // Injeção obrigatória para o keyPath
        };
        
        // Removemos id_visita (opcional) para evitar confusão no futuro
        delete dadosParaSalvar.id_visita;

        window.DB_API.saveVisita(dadosParaSalvar).catch(err => {
            console.error("Erro ao salvar no IndexedDB:", err);
            // No celular, mostramos o erro real se falhar
            if(navigator.userAgent.includes("Mobi")) {
                console.log("Falha no put: Verifique se o keyPath 'id_vistoria' é nulo.");
            }
        });
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
        localStorage.setItem("id_vistoria", APP_STATE.id_vistoria);
        
        showScreen("screen-select-roteiro");
    };

    if (APP_STATE.local && APP_STATE.avaliador) {
        // Recupera o ID se a página recarregar
        APP_STATE.id_vistoria = localStorage.getItem("id_vistoria") || `VIST_${Date.now()}`;
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
            sheet.columns = [
                { header: 'SEÇÃO', key: 'secao', width: 20 },
                { header: 'SUBLOCAL', key: 'sublocal', width: 25 },
                { header: 'PERGUNTA', key: 'pergunta', width: 50 },
                { header: 'RESPOSTA', key: 'resposta', width: 40 },
                { header: 'FOTOS (ANEXOS)', key: 'fotos', width: 25 }
            ];

            const respostasDoTipo = APP_STATE.respostas[config.id] || {};

            for (const p of config.fonte) {
                let respostaTexto = (config.id === "pge") 
                    ? respostasDoTipo[`${p.id}_${p.Sublocal}`] || "" 
                    : respostasDoTipo[p.id] || "";
                
                // Busca fotos usando a função unificada do DB_API
                const fotosFiltradas = await DB_API.getFotosPergunta(p.id);

                if (!respostaTexto && fotosFiltradas.length === 0) continue;

                const novaLinha = sheet.addRow({
                    secao: p.Secao || p["Seção"] || "",
                    sublocal: p.Sublocal || "Geral",
                    pergunta: p.Pergunta,
                    resposta: String(respostaTexto)
                });

                if (fotosFiltradas.length > 0) {
    novaLinha.height = 110; // Aumenta a linha para a foto caber
    
    for (const [index, foto] of fotosFiltradas.entries()) {
        try {
            // Verifica se temos o base64 (que é o que estamos salvando no savePhotoToDB)
            if (foto.base64) {
                // Remove o cabeçalho "data:image/png;base64," se existir
                const base64Limpo = foto.base64.includes(',') ? foto.base64.split(',')[1] : foto.base64;
                
                const imageId = workbook.addImage({
                    base64: base64Limpo,
                    extension: 'png' // ou 'jpeg', dependendo da sua câmera
                });

                sheet.addImage(imageId, {
                    // col: 4 é a coluna E. 
                    // Se houver mais de uma foto, elas serão sobrepostas. 
                    // Dica: use { col: 4 + index } se quiser uma foto por coluna.
                    tl: { col: 4, row: novaLinha.number - 1 },
                    ext: { width: 140, height: 140 },
                    editAs: 'oneCell'
                });
            } else if (foto.blob) {
                // Caso você mude para Blob no futuro, este fallback continua funcionando
                const arrayBuffer = await foto.blob.arrayBuffer();
                const imageId = workbook.addImage({ 
                    buffer: arrayBuffer, 
                    extension: 'jpeg' 
                });
                sheet.addImage(imageId, {
                    tl: { col: 4, row: novaLinha.number - 1 },
                    ext: { width: 140, height: 140 }
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
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Relatorio_${APP_STATE.local || 'Vistoria'}_${Date.now()}.xlsx`;
        a.click();
        
        marcarComoConcluidoUI('excel');
    } catch (err) {
        throw err;
    }
}

// 15. SINCRONIZAÇÃO UNIFICADA (R/PLUMBER)
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

// SINCRONIZAÇÃO MANUAL (BOTÃO ENVIAR)
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

    // Feedback visual de processamento
    if(circle) circle.className = "w-20 h-20 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse";
    if(symbol) symbol.innerText = "⏳";

    try {
        const db = await DB_API.openDB();
        // Garante um ID único para a nova entrada
        const idAtual = APP_STATE.id_vistoria || APP_STATE.id_visita || `VIST_${Date.now()}`;

        const pacoteParaArquivar = {
            id_vistoria: String(idAtual),
            tecnico: String(APP_STATE.avaliador || APP_STATE.tecnico || "Não Informado"),
            local: String(APP_STATE.local || "Não Informado"),
            atividade: String(APP_STATE.atividade || "Supervisão Ambiental"),
            data: APP_STATE.data || new Date().toISOString().split('T')[0],
            respostas: JSON.parse(JSON.stringify(APP_STATE.respostas || {})), 
            tipoRoteiro: APP_STATE.tipoRoteiro,
            sincronizado: APP_STATE.sincronizado ? 1 : 0,
            timestamp: Date.now()
        };

        // Salva no IndexedDB
        const tx = db.transaction(["vistorias"], "readwrite");
        const store = tx.objectStore("vistorias");
        await store.put(pacoteParaArquivar);

        tx.oncomplete = () => {
            // --- LIMPEZA CRÍTICA ---
            // 1. Remove IDs da sessão atual para que o reload gere novos
            localStorage.removeItem("id_vistoria");
            localStorage.removeItem("id_visita");
            localStorage.removeItem("APP_META");
            
            // 2. Preserva apenas o nome do avaliador para facilitar a próxima entrada
            const avaliadorOld = APP_STATE.avaliador || APP_STATE.tecnico;
            if (avaliadorOld) localStorage.setItem("avaliador", avaliadorOld);

            // 3. Limpa visualmente os containers de fotos antes do reload (prevenção extra)
            document.querySelectorAll('[id^="foto-container-"]').forEach(el => el.innerHTML = '');

            alert("Vistoria arquivada com sucesso!");
            
            // 4. Reinicia o app limpo
            location.reload(); 
        };
    } catch (err) {
        console.error("Erro ao arquivar:", err);
        alert("ERRO CRÍTICO: Verifique a conexão com o banco local.");
        // Restaura ícone em caso de erro
        if(circle) circle.classList.remove('animate-pulse');
        if(symbol) symbol.innerText = "⚠️";
    }
}
window.savePhotoToDB = async (fotoId, _blob, idPergunta, base64) => {
    const db = await DB_API.openDB();
    
    // 1. Recupera o ID (Garantindo que não seja nulo)
    const idFinal = APP_STATE.id_vistoria || APP_STATE.id_visita || localStorage.getItem("id_vistoria");

    if (!idFinal) {
        console.error("ERRO: Sem ID de vistoria!");
        return;
    }

    return new Promise((resolve, reject) => {
        const tx = db.transaction(['fotos'], 'readwrite');
        const store = tx.objectStore('fotos');

        // 2. Salva no IndexedDB (Para o R/Sincronização)
        store.put({
            foto_id: fotoId,
            id_vistoria: idFinal, 
            pergunta_id: idPergunta,
            base64, 
            timestamp: Date.now()
        });

        tx.oncomplete = () => {
            // 🚀 O PULO DO GATO: Atualiza o estado para a miniatura e o Excel
            if (!APP_STATE.respostas.fotos) APP_STATE.respostas.fotos = {};
            APP_STATE.respostas.fotos[idPergunta] = base64; 

            // Avisa o console e renderiza a miniatura
            console.log(`✅ Foto exibida e salva: ${fotoId}`);
            
            // Chama a função que desenha a miniatura na tela (se ela existir no seu app.js)
            if (typeof renderizarMiniatura === "function") {
                renderizarMiniatura(idPergunta, base64);
            }
            
            resolve();
        };
        tx.onerror = (e) => reject(e);
    });
};
DB_API.getFotosPergunta = async (idPergunta) => {
    const db = await DB_API.openDB();
    const idAtual = APP_STATE.id_vistoria || localStorage.getItem("id_vistoria");

    return new Promise((resolve, reject) => {
        const tx = db.transaction(['fotos'], 'readonly');
        const store = tx.objectStore('fotos');
        
        // 🚀 O SEGREDO: Usar o índice "id_vistoria" que você criou na versão 10
        const index = store.index("id_vistoria");
        const req = index.getAll(idAtual);

        req.onsuccess = () => {
            const todasDaVistoria = req.result || [];
            // Agora filtramos apenas pela pergunta, pois o ID da vistoria o índice já resolveu
            const fotosFiltradas = todasDaVistoria.filter(f => f.pergunta_id === idPergunta);
            
            console.log(`📸 Fotos encontradas para ${idPergunta}:`, fotosFiltradas.length);
            resolve(fotosFiltradas);
        };
        req.onerror = (e) => reject(e);
    });
};
// ============================================================
// TRATAMENTO DE ERROS E STATUS
// ============================================================
// Monitora a volta da internet para disparar a sincronização silenciosa
window.addEventListener('online', () => {
    console.log("Sinal recuperado! Iniciando sincronização...");
    sincronizarVisitasPendentes(); 
});
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

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js') // Certifique-se que o nome aqui é o nome real do arquivo
    .then(reg => {
       console.log('SW registrado!');
       // Força a atualização se encontrar um novo
       reg.update(); 
    })
    .catch(err => console.log('Erro ao registrar SW:', err));
}
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






