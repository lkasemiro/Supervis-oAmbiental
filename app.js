/// ============================================================
// APP.JS – VERSÃO INTEGRAL CORRIGIDA (ORGANIZADA POR FLUXO)
// ============================================================

// ============================================================
// 1. CONSTANTES E ESTADO GLOBAL
// ============================================================

const LOCAIS_VISITA = [
    "Rio D'Ouro", "São Pedro", "Tinguá - Barrelão", "Tinguá - Serra Velha",
    "Tinguá - Brava/Macucuo", "Tinguá - Colomi", "Tinguá - Boa Esperança",
    "Mantiquira - T1", "Mantiquira - T2", "Xerém I - João Pinto",
    "Xerém II - Entrada", "Xerém III - Plano", "Xerém III - Registro"
];

let APP_STATE = {
    avaliador: "",
    local: "",
    colaborador: "",
    data: "",
    tipoRoteiro: null,
    sublocal: "",
    roteiro: [],
    respostas: {
        geral: {},
        pge: {},
        aa: {}
    },
    fotos: {}
};

let stream = null;
let currentPhotoInputId = null;



// ============================================================
// 2. CONTROLE DE TELAS E NAVEGAÇÃO
// ============================================================

function showScreen(id) {
    const telas = ["screen-cadastro", "screen-select-roteiro", "screen-formulario", "screen-final"];
    telas.forEach(t => {
        const el = document.getElementById(t);
        if (el) el.classList.toggle("hidden", t !== id);
    });
    window.scrollTo(0, 0);
}



// ============================================================
// 3. BOOTSTRAP DO APLICATIVO
// ============================================================
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
    
    // 1. Carrega Metadados primeiro (rápido)
    carregarMetaDoLocalStorage();

    // 2. Carrega progresso do IndexedDB (completo)
    if (window.DB_API && window.DB_API.loadVisita) {
        try {
            const dadosSalvos = await DB_API.loadVisita();
            if (dadosSalvos) {
                // Preserva o roteiro estático, carrega apenas respostas e estado
                APP_STATE.respostas = dadosSalvos.respostas || APP_STATE.respostas;
                APP_STATE.id_visita = dadosSalvos.id_visita || APP_STATE.id_visita;
            }
        } catch (err) {
            console.warn("Nenhum dado prévio no IndexedDB encontrado.");
        }
    }

    // 3. Garante ID Único (Segurança de Chave Primária)
    if (!APP_STATE.id_visita) {
        APP_STATE.id_visita = `VIST_${Date.now()}`;
    }

    // 4. Configura Seletor de Locais
    const selLocal = document.getElementById("local");
    if (selLocal) {
        selLocal.innerHTML = `<option disabled selected value="">Selecionar Local...</option>` +
            LOCAIS_VISITA.map(l => `<option value="${l}">${l}</option>`).join("");
        
        if (APP_STATE.local) selLocal.value = APP_STATE.local;
        selLocal.onchange = () => {
            APP_STATE.local = selLocal.value;
            registrarResposta(null, null); // Força um salvamento do estado
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
    const avaliador = document.getElementById("avaliador").value;
    const local = document.getElementById("local").value;
    const data = document.getElementById("data_visita").value;

    if (!avaliador || !local || !data) {
        alert("Por favor, preencha o Avaliador, Local e Data antes de iniciar.");
        return;
    }

    // Salva os dados no APP_STATE
    APP_STATE.avaliador = avaliador;
    APP_STATE.local = local;
    APP_STATE.data = data;
    APP_STATE.colaborador = document.getElementById("colaborador").value;

    // Persiste imediatamente
    registrarResposta(null, null); 

    // Muda de tela
    showScreen("screen-select-roteiro");
}

// Garante que a função esteja disponível globalmente
window.validarEComecar = validarEComecar;
// ============================================================
// 4. PERSISTÊNCIA DE RESPOSTAS
// ============================================================

function registrarResposta(idPergunta, valor, tipoRoteiro) {
    // 1. Atualiza o estado em memória
    const roteiroAlvo = tipoRoteiro || APP_STATE.tipoRoteiro;
    if (!APP_STATE.respostas[roteiroAlvo]) {
        APP_STATE.respostas[roteiroAlvo] = {};
    }

    if (roteiroAlvo === "pge") {
        const chaveComposta = `${idPergunta}_${APP_STATE.sublocal}`;
        APP_STATE.respostas.pge[chaveComposta] = valor;
    } else {
        APP_STATE.respostas[roteiroAlvo][idPergunta] = valor;
    }

    // 2. SEGURANÇA: Salva no LocalStorage APENAS o essencial (metadados)
    // Criamos um clone para não deletar os dados do objeto original em uso
    const metaData = {
        avaliador: APP_STATE.avaliador,
        local: APP_STATE.local,
        id_visita: APP_STATE.id_visita,
        data: APP_STATE.data,
        sublocal: APP_STATE.sublocal,
        tipoRoteiro: APP_STATE.tipoRoteiro
    };
    
    try {
        localStorage.setItem("APP_META", JSON.stringify(metaData));
    } catch (e) {
        console.error("Falha ao salvar metadados no LocalStorage");
    }

    // 3. PERSISTÊNCIA REAL: Salva o estado completo no IndexedDB (Capacidade GIGANTE)
    // O IndexedDB não tem o limite de 5MB do LocalStorage
    if (window.DB_API && window.DB_API.saveVisita) {
        window.DB_API.saveVisita(APP_STATE); 
    }
}

initApp();
// ============================================================
// 5. SELEÇÃO DE ROTEIRO (FLUXO PRINCIPAL)
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
// 6. SUBLOCAL + SEÇÕES
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
// 7. IMAGEM DE APOIO (PGE)
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
// 8. RENDERIZAÇÃO DO FORMULÁRIO
// ============================================================

function renderFormulario(secaoFiltrada = null) {
    const container = document.getElementById("conteudo_formulario");
    if (!container) return;

    // 1. Em vez de limpar TUDO, removemos apenas as perguntas (as divs de grupo)
    // Isso preserva o "container_imagem_apoio_sublocal" se ele já estiver lá
    const gruposAntigos = container.querySelectorAll('[id^="group_"]');
    gruposAntigos.forEach(el => el.remove());

    // Se o container estiver com a mensagem de "selecione sublocal", limpamos ela
    if (container.innerText.includes("Selecione um sublocal")) {
        container.innerHTML = "";
    }

    let perguntas = APP_STATE.roteiro;
    
    // Limpeza de imagem se mudar de roteiro
    if (APP_STATE.tipoRoteiro !== "pge") {
        const img = document.getElementById("container_imagem_apoio_sublocal");
        if (img) img.remove();
    }

    if (APP_STATE.tipoRoteiro === "pge") {
        const sub = document.getElementById("sublocal_select").value;
        if (!sub) {
            container.innerHTML = `<div class="text-center p-10 text-gray-400 italic">Selecione um sublocal.</div>`;
            return;
        }
        perguntas = perguntas.filter(p => p.Local === APP_STATE.local && p.Sublocal === sub);
    }

    if (secaoFiltrada) {
        perguntas = perguntas.filter(p => (p.Secao || p["Seção"]) === secaoFiltrada);
    }

    // 2. Adiciona as perguntas sem resetar o innerHTML do container pai
    perguntas.forEach(p => {
        const div = document.createElement("div");
        div.id = `group_${p.id}`;
        div.className = "bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-4 animate-in";
        
        const valorSalvo = APP_STATE.respostas[APP_STATE.tipoRoteiro]?.[p.id] ?? "";

        div.innerHTML = `
            <label class="block font-bold text-gray-800 mb-3">${p.Pergunta}</label>
            <div id="input-root-${p.id}"></div>
        `;
        container.appendChild(div); // Usa appendChild para colocar DEPOIS da imagem
        renderInput(p, document.getElementById(`input-root-${p.id}`), valorSalvo); 
    });

    applyConditionalLogic();
}

// ============================================================
// 9. INPUTS
// ============================================================
function renderInput(p, container, valorSalvo) {
    const tipoInput = p.TipoInput; 
    container.innerHTML = ""; // Limpa container interno

    if (tipoInput === "text" || tipoInput === "textarea") {
        const input = document.createElement(tipoInput === "text" ? "input" : "textarea");
        input.className = "w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none";
        input.value = valorSalvo || ""; // Garante que não seja undefined
        input.oninput = (e) => registrarResposta(p.id, e.target.value);
        container.appendChild(input);

    } else if (tipoInput === "radio") {
        const opcoes = (p.Opcoes || "").split(";").filter(Boolean);
        opcoes.forEach(opt => {
            const optTrim = opt.trim();
            const checked = valorSalvo === optTrim ? "checked" : "";
            const label = document.createElement("label");
            label.className = "flex items-center gap-3 p-3 border rounded-xl mb-2 hover:bg-gray-50 cursor-pointer";
            label.innerHTML = `
                <input type="radio" name="${p.id}" value="${optTrim}" ${checked} 
                       onchange="registrarResposta('${p.id}', '${optTrim}')" class="w-5 h-5 text-blue-600">
                <span class="text-sm font-medium text-gray-700">${optTrim}</span>
            `;
            container.appendChild(label);
        });

    } else if (tipoInput === "checkboxGroup") {
        const opcoes = (p.Opcoes || "").split(";").filter(Boolean);
        const marcados = (valorSalvo || "").split(";").map(v => v.trim());
        
        opcoes.forEach(opt => {
            const optTrim = opt.trim();
            const isChecked = marcados.includes(optTrim) ? "checked" : "";
            const label = document.createElement("label");
            label.className = "flex items-center gap-3 p-3 border rounded-xl mb-2 hover:bg-gray-50 cursor-pointer";
            label.innerHTML = `
                <input type="checkbox" name="${p.id}" value="${optTrim}" ${isChecked} 
                       onchange="gerenciarMudancaCheckbox('${p.id}')" class="w-5 h-5 text-green-600 rounded">
                <span class="text-sm font-medium text-gray-700">${optTrim}</span>
            `;
            container.appendChild(label);
        }); 

    } else if (tipoInput === "file") {
        container.innerHTML = `
            <div class="space-y-3">
                <button type="button" onclick="abrirCamera('${p.id}')" 
                    class="w-full bg-amber-500 hover:bg-amber-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-sm">
                    <span>📷</span> Capturar Foto
                </button>
                <div id="fotos_${p.id}" class="grid grid-cols-4 gap-2 empty:hidden"></div>
            </div>
        `;
        if (typeof atualizarListaFotos === "function") {
            atualizarListaFotos(p.id);
        }
    }
}

function gerenciarMudancaCheckbox(idPergunta) {
    const checkboxes = document.querySelectorAll(`input[name="${idPergunta}"]:checked`);
    const valores = Array.from(checkboxes).map(cb => cb.value.trim());
    registrarResposta(idPergunta, valores.join(";"));
}


// ============================================================
// 10. CONDICIONAIS
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
// SISTEMA DE CÂMERA E PROCESSAMENTO DE IMAGENS
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
// Iniciar cadastro
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
// 12. EXPORTAÇÃO E RESET
// ============================================================
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
                // CORREÇÃO PGE: Busca pela chave composta ID + Sublocal
                let respostaTexto = "";
                if (config.id === "pge") {
                    const chaveComposta = `${p.id}_${p.Sublocal}`;
                    respostaTexto = respostasDoTipo[chaveComposta] || "";
                } else {
                    respostaTexto = respostasDoTipo[p.id] || "";
                }
                
                // Busca fotos filtrando pelo id da pergunta (e opcionalmente sublocal)
                const fotosNoBanco = await window.DB_API.getFotosPergunta(p.id);
                // Filtra fotos apenas desta visita e deste sublocal se for PGE
                const fotosFiltradas = fotosNoBanco.filter(f => 
                    f.id_visita === APP_STATE.id_visita && 
                    (config.id !== "pge" || f.sublocal === p.Sublocal)
                );

                if (!respostaTexto && fotosFiltradas.length === 0) continue;

                const novaLinha = sheet.addRow({
                    secao: p.Secao || p["Seção"] || "",
                    sublocal: p.Sublocal || "Geral",
                    pergunta: p.Pergunta,
                    resposta: String(respostaTexto)
                });

                if (fotosFiltradas.length > 0) {
                    novaLinha.height = 100;
                    for (let i = 0; i < fotosFiltradas.length; i++) {
                        const arrayBuffer = await fotosFiltradas[i].blob.arrayBuffer();
                        const imageId = workbook.addImage({ buffer: arrayBuffer, extension: 'jpeg' });
                        sheet.addImage(imageId, {
                            tl: { col: 4, row: novaLinha.number - 1 },
                            ext: { width: 120, height: 120 }
                        });
                    }
                }
            }
        }
        // ... (Download XLSX permanece igual ao seu código)
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Relatorio_${APP_STATE.local}_${new Date().getTime()}.xlsx`;
        a.click();
    } catch (err) { console.error(err); }
}
// ============================================================
// 12. EXPORTAÇÃO E SINCRONIZAÇÃO (REVISADO PARA R/PLUMBER)
// ============================================================
async function sincronizarComBanco() {
    if (!navigator.onLine) return alert("Sem internet!");
    const statusEl = document.getElementById('status-sinc');
    if(statusEl) statusEl.innerText = "Iniciando sincronização...";

    const db = await DB_API.openDB();
    
    // 1. Pega vistorias pendentes com tratamento de erro
    const vistorias = await new Promise(res => {
        const req = db.transaction("vistorias", "readonly").objectStore("vistorias").getAll();
        req.onsuccess = () => res(req.result || []);
    });

    const pendentes = vistorias.filter(v => !v.sincronizado);
    if (pendentes.length === 0) return alert("Nada para sincronizar!");

    // 2. Carrega TODAS as fotos uma única vez (Otimização)
    const todasFotos = await new Promise(res => {
        const req = db.transaction("fotos", "readonly").objectStore("fotos").getAll();
        req.onsuccess = () => res(req.result || []);
    });

    for (let visita of pendentes) {
        try {
            if(statusEl) statusEl.innerText = `Sincronizando: ${visita.id_vistoria}...`;
            
            // Vincula fotos específicas
            visita.fotos_coletadas = todasFotos.filter(f => f.id_visita === visita.id_vistoria);

            const res = await fetch('https://strapless-christi-unspread.ngrok-free.dev/vistorias/sincronizar', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'ngrok-skip-browser-warning': 'true' 
                },
                body: JSON.stringify(visita)
            });

            if (res.ok) {
                const respostaServidor = await res.json();
                if (respostaServidor.status === "sucesso") {
                    visita.sincronizado = true;
                    // Salva o status de sincronizado no banco local
                    const txUp = db.transaction("vistorias", "readwrite");
                    await txUp.objectStore("vistorias").put(visita);
                    console.log(`✅ ${visita.id_vistoria} sincronizada.`);
                }
            }
        } catch (e) {
            console.error("Falha ao sincronizar item:", e);
        }
    }
    if(statusEl) statusEl.innerText = "Sincronização Finalizada!";
    alert("Processo concluído!");
}
// ============================================================
// 13. SINCRONIZAÇÃO AUTOMÁTICA AO VOLTAR ONLINE
// ============================================================
async function sincronizarVisitasPendentes() {
    if (!navigator.onLine) return;

    const db = await DB_API.openDB();
    const tx = db.transaction("vistorias", "readonly");
    const store = tx.objectStore("vistorias");
    const visitas = await new Promise(res => {
        const req = store.getAll();
        req.onsuccess = () => res(req.result);
    });

    for (let visita of visitas) {
        if (visita.sincronizado) continue;

        try {
            const res = await fetch('https://strapless-christi-unspread.ngrok-free.dev/vistorias/sincronizar',{
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(visita)
            });

            if (res.ok) {
                visita.sincronizado = true;
                await DB_API.saveVisita(visita);
                console.log("✅ Visita pendente sincronizada automaticamente.");
            }
        } catch (e) {
            console.warn("Tentativa de sincronização automática falhou.");
        }
    }
}

// Ouvinte para quando a internet retornar
window.addEventListener('online', sincronizarVisitasPendentes);
// CONFIRMAR NOVA VISTORIA
async function confirmarNovaVistoria() {
    if (!confirm("Deseja salvar esta vistoria na fila e iniciar uma nova?")) return;

    try {
        const db = await DB_API.openDB();
        const tx = db.transaction(["vistorias"], "readwrite");
        
        // GARANTIA: O id_vistoria DEVE estar na raiz do objeto
        const objetoParaSalvar = {
            id_vistoria: APP_STATE.id_visita || `VIST_${Date.now()}`,
            avaliador: APP_STATE.avaliador,
            local: APP_STATE.local,
            data: APP_STATE.data,
            tipoRoteiro: APP_STATE.tipoRoteiro,
            dados: JSON.parse(JSON.stringify(APP_STATE)),
            sincronizado: false,
            timestamp: Date.now()
        };

        await tx.objectStore("vistorias").put(objetoParaSalvar);

        tx.oncomplete = () => {
            localStorage.clear();
            // Mantém apenas o avaliador para facilitar a próxima
            localStorage.setItem("avaliador", APP_STATE.avaliador);
            location.reload(); 
        };
    } catch (err) {
        console.error("Erro ao arquivar:", err);
        alert("Erro crítico ao salvar no banco local!");
    }
}
window.savePhotoToDB = async (fotoId, blob, idPergunta, base64) => {
    const db = await DB_API.openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['fotos'], 'readwrite');
        const store = tx.objectStore('fotos');

        store.put({
            foto_id: fotoId,
            id_visita: APP_STATE.id_visita, // NOVO: Vínculo com a vistoria
            pergunta_id: idPergunta,
            sublocal: APP_STATE.sublocal || "Geral", // NOVO: Para o PGE
            blob,
            base64,
            timestamp: Date.now()
        });
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e);
    });
};
// Exemplo de como seu getFotosPergunta pode ser ajustado:
DB_API.getFotosPergunta = async (idPergunta) => {
    const db = await DB_API.openDB();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(['fotos'], 'readonly');
        const store = tx.objectStore('fotos');
        const req = store.getAll();

        req.onsuccess = () => {
            resolve(req.result.filter(f => f.pergunta_id === idPergunta));
        };

        req.onerror = (e) => reject(e);
    });
};

// ------------------------------------------------------------
// VINCULAÇÕES GLOBAIS (FINAL DO ARQUIVO) - Versão Blindada
// ------------------------------------------------------------
window.showScreen = showScreen;
window.selectRoteiro = selectRoteiro;
window.abrirCamera = abrirCamera;
window.removerFoto = removerFoto; // Faltava esta!
window.registrarResposta = registrarResposta;
window.gerenciarMudancaCheckbox = gerenciarMudancaCheckbox;
window.baixarExcelConsolidado = baixarExcelConsolidado; 
window.sincronizarComBanco = sincronizarComBanco;
window.confirmarNovaVistoria = confirmarNovaVistoria;

document.addEventListener("DOMContentLoaded", initApp);
document.getElementById('status-sinc').innerText = "Sincronizando..."