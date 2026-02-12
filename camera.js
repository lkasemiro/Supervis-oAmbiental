// camera.js
// ============================================================
// SUBSISTEMA DE FOTOS (CÂMERA + BLOB + INDEXEDDB + UI LEVE)
// Requisitos:
// - Mantém nomes globais (abrirCamera, processarFoto, etc.) para não quebrar o app.
// - Padroniza campos: blob_data + mime_type (mantém compatibilidade com blob/tipo).
// - UI: indicador sutil + miniaturas só quando a lista estiver expandida.
// - Evita vazamento de ObjectURL: revoga URLs antigas a cada re-render.
// ============================================================

/**
 * Cache local de ObjectURLs por pergunta para liberar memória com segurança
 * (revoga antes de re-renderizar, sem timeout que pode "sumir" durante visualização)
 */
const __PHOTO_URL_CACHE__ = new Map(); // key: perguntaId -> array<string>

/**
 * Revoga ObjectURLs antigos de uma pergunta
 */
function __revokeOldUrls(perguntaId) {
    const urls = __PHOTO_URL_CACHE__.get(perguntaId);
    if (urls && urls.length) {
        for (const u of urls) {
            try { URL.revokeObjectURL(u); } catch (_) {}
        }
    }
    __PHOTO_URL_CACHE__.set(perguntaId, []);
}

/**
 * Registra um ObjectURL para revogação futura
 */
function __trackUrl(perguntaId, url) {
    const arr = __PHOTO_URL_CACHE__.get(perguntaId) || [];
    arr.push(url);
    __PHOTO_URL_CACHE__.set(perguntaId, arr);
}

/**
 * 1) ABRE A CÂMERA NATIVA
 * - Mantém captura ambiente (Android)
 */
async function abrirCamera(idPergunta) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";

    input.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (file) {
            await processarFoto(idPergunta, file);
        }
    };

    input.click();
}

/**
 * 2) REDUZ IMAGEM E RETORNA BLOB OTIMIZADO (JPEG)
 * - Garante JPEG para compatibilidade com ExcelJS e sync
 */
async function reduzirImagemParaBlob(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();

        reader.onload = (e) => { img.src = e.target.result; };
        reader.onerror = () => reject(reader.error);

        img.onload = () => {
            const canvas = document.createElement("canvas");

            const MAX_WIDTH = 1280; // equilíbrio qualidade x peso
            let width = img.width;
            let height = img.height;

            if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
            }

            canvas.width = Math.round(width);
            canvas.height = Math.round(height);

            const ctx = canvas.getContext("2d");
            if (!ctx) return reject("Falha ao obter contexto 2D");

            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            canvas.toBlob(
                (blob) => {
                    if (!blob) return reject("Falha ao gerar blob");
                    resolve(blob);
                },
                "image/jpeg",
                0.80
            );
        };

        img.onerror = () => reject("Falha ao carregar imagem");
        reader.readAsDataURL(file);
    });
}

/**
 * 3) PROCESSA E SALVA COMO BLOB NO INDEXEDDB
 * - Padroniza blob_data/mime_type, mantendo compatibilidade blob/tipo
 * - (Opcional) limite por pergunta para não explodir storage/memória
 */
async function processarFoto(idPergunta, file) {
    try {
        if (!APP_STATE?.id_vistoria) {
            alert("Vistoria não inicializada.");
            return;
        }

        // (Opcional, mas recomendado): limite por pergunta
        const LIMITE_FOTOS_POR_PERGUNTA = 15;

        // Busca quantidade atual (se DB_API existir)
        if (typeof DB_API?.getFotosPergunta === "function") {
            const fotosAtuais = await DB_API.getFotosPergunta(APP_STATE.id_vistoria, idPergunta);
            if ((fotosAtuais?.length || 0) >= LIMITE_FOTOS_POR_PERGUNTA) {
                alert(`Limite de ${LIMITE_FOTOS_POR_PERGUNTA} evidências atingido para esta pergunta.`);
                return;
            }
        }

        const blobOtimizado = await reduzirImagemParaBlob(file);
        const fotoId = crypto.randomUUID();

        await DB_API.salvarFoto({
            foto_id: fotoId,
            id_vistoria: APP_STATE.id_vistoria,
            pergunta_id: idPergunta,

            // ✅ padrão
            blob_data: blobOtimizado,
            mime_type: blobOtimizado.type,

            // ✅ compatibilidade (se algum trecho ainda usar)
            blob: blobOtimizado,
            tipo: blobOtimizado.type,

            nome_original: file.name,
            tamanho: blobOtimizado.size,
            timestamp: Date.now(),
            sincronizado: false
        });

        await atualizarListaFotos(idPergunta);

        console.log("📸 Foto salva (BLOB IndexedDB).");
    } catch (err) {
        console.error("Erro ao processar foto:", err);
        alert("Erro ao salvar foto.");
    }
}

/**
 * 4) ATUALIZA STATUS / MINIATURAS
 * - Sempre atualiza texto (indicador sutil)
 * - Só renderiza miniaturas se lista estiver expandida
 * - Revoga ObjectURLs antigos antes de re-renderizar
 */
async function atualizarListaFotos(perguntaId) {
    const listEl = document.getElementById(`fotos_${perguntaId}`);
    const statusEl = document.getElementById(`foto_status_${perguntaId}`);

    if (!statusEl) return;

    try {
        const fotos = await DB_API.getFotosPergunta(APP_STATE.id_vistoria, perguntaId);
        const n = (fotos || []).length;

        if (n === 0) {
            statusEl.innerText = "Nenhuma evidência.";
            if (listEl) {
                __revokeOldUrls(perguntaId);
                listEl.innerHTML = "";
            }
            return;
        }

        statusEl.innerText = `📷 ${n} evidência(s) salva(s) no aparelho ✅`;

        // Se não existir lista na UI, acabou
        if (!listEl) return;

        // Se estiver colapsada, não renderiza miniaturas
        if (listEl.classList.contains("hidden")) {
            __revokeOldUrls(perguntaId);
            listEl.innerHTML = "";
            return;
        }

        // Vai renderizar: primeiro limpa URLs antigas
        __revokeOldUrls(perguntaId);

        listEl.innerHTML = fotos.map((f) => {
            let src = "";

            const blob = f.blob_data || f.blob;
            if (blob) {
                src = URL.createObjectURL(blob);
                __trackUrl(perguntaId, src);
            } else if (f.base64) {
                src = f.base64;
            }

            return `
                <div class="relative">
                    <img src="${src}" class="w-full aspect-square object-cover rounded-xl shadow border" alt="foto">
                    <button onclick="removerFoto('${f.foto_id}', '${perguntaId}')"
                        class="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-[10px] shadow-lg">
                        ✕
                    </button>
                </div>
            `;
        }).join("");

    } catch (err) {
        console.error("Erro ao atualizar fotos:", err);
        statusEl.innerText = "Erro ao carregar evidências.";
    }
}

/**
 * 5) REMOVE FOTO
 */
async function removerFoto(fotoId, idPergunta) {
    if (!confirm("Deseja excluir esta foto?")) return;

    try {
        await DB_API.removerFoto(fotoId);

        // Atualiza UI e limpa URLs antigas
        __revokeOldUrls(idPergunta);
        await atualizarListaFotos(idPergunta);

        console.log("🗑️ Foto removida do IndexedDB.");
    } catch (err) {
        console.error("Erro ao remover:", err);
        alert("Erro ao remover foto.");
    }
}
