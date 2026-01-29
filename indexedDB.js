// ============================================================
// INDEXEDDB.JS – PERSISTÊNCIA OFFLINE (CEDAE)
// ============================================================

const DB_NAME = "CEDAE_VistoriasDB";
const DB_VERSION = 7; // Subi a versão para forçar a atualização da estrutura

const STORE_RESPOSTAS = "vistorias";
const STORE_FOTOS = "fotos";

const DB_API = {

    async openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // STORE DE VISTORIAS (HISTÓRICO E ATUAL)
                if (!db.objectStoreNames.contains(STORE_RESPOSTAS)) {
                    // Mudamos para id_vistoria para alinhar com o app.js e o Servidor R
                    db.createObjectStore(STORE_RESPOSTAS, { keyPath: "id_vistoria" });
                }

                // STORE DE FOTOS
                if (!db.objectStoreNames.contains(STORE_FOTOS)) {
                    const store = db.createObjectStore(STORE_FOTOS, { keyPath: "foto_id" });
                    store.createIndex("pergunta_id", "pergunta_id", { unique: false });
                    store.createIndex("id_visita", "id_visita", { unique: false });
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    // SALVA O ESTADO ATUAL (Rascunho)
    async saveVisita(estado) {
        const db = await this.openDB();
        const tx = db.transaction(STORE_RESPOSTAS, "readwrite");
        const store = tx.objectStore(STORE_RESPOSTAS);

        const dados = JSON.parse(JSON.stringify(estado));
        
        // Garante que o ID da visita seja a chave primária
        // Se não houver ID ainda, usamos um temporário para o rascunho
        dados.id_vistoria = estado.id_visita || "rascunho_atual";
        dados.ultima_atualizacao = new Date().toISOString();

        return new Promise((resolve, reject) => {
            const req = store.put(dados);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject("Erro ao salvar no IndexedDB");
        });
    },

    // CARREGA O RASCUNHO OU UMA VISTORIA ESPECÍFICA
    async loadVisita(id = "rascunho_atual") {
        try {
            const db = await this.openDB();
            const tx = db.transaction(STORE_RESPOSTAS, "readonly");
            const store = tx.objectStore(STORE_RESPOSTAS);
            const req = store.get(id);

            return new Promise((resolve) => {
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            });
        } catch (e) { return null; }
    }
};

// --- FUNÇÕES DE INTERFACE PARA O APP.JS ---

let saveTimer = null;
const SAVE_DELAY = 2000; // Reduzi para 2 segundos para ser mais ágil

window.saveAnswerToDB = (idPergunta, valor) => {
    if (typeof APP_STATE === "undefined") return;
    if (saveTimer) clearTimeout(saveTimer);

    saveTimer = setTimeout(() => {
        console.log("⏱️ Auto-save rascunho...");
        DB_API.saveVisita(APP_STATE).catch(err => console.error(err));
    }, SAVE_DELAY);
};

window.savePhotoToDB = async (fotoId, blob, idPergunta, base64) => {
    const db = await DB_API.openDB();
    const tx = db.transaction([STORE_FOTOS], 'readwrite');
    const store = tx.objectStore(STORE_FOTOS);

    return new Promise((resolve, reject) => {
        store.put({
            foto_id: fotoId,
            id_visita: APP_STATE.id_visita,
            pergunta_id: idPergunta,
            sublocal: APP_STATE.sublocal || "Geral",
            blob: blob,
            base64: base64,
            timestamp: new Date().toISOString()
        });
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e);
    });
};

window.DB_API = DB_API;