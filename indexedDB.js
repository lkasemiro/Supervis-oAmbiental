// ============================================================
// INDEXEDDB.JS – PERSISTÊNCIA OFFLINE (CEDAE) - VERSÃO V8
// ============================================================

const DB_NAME = "CEDAE_VistoriasDB";
const DB_VERSION = 9;
const STORE_RESPOSTAS = "vistorias";
const STORE_FOTOS = "fotos";

const DB_API = {
    async openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // STORE DE VISTORIAS
                if (!db.objectStoreNames.contains(STORE_RESPOSTAS)) {
                    db.createObjectStore(STORE_RESPOSTAS, { keyPath: "id_vistoria" });
                }

                // STORE DE FOTOS
                if (!db.objectStoreNames.contains(STORE_FOTOS)) {
                    const store = db.createObjectStore(STORE_FOTOS, { keyPath: "foto_id" });
                    // Índice para buscar fotos de uma pergunta específica
                    store.createIndex("pergunta_id", "pergunta_id", { unique: false });
                    // Índice para buscar todas as fotos de uma vistoria completa
                    store.createIndex("id_vistoria", "id_vistoria", { unique: false });
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    // SALVA A VISTORIA (Rascunho ou Finalizada)
    async saveVisita(estado) {
        const db = await this.openDB();
        const tx = db.transaction(STORE_RESPOSTAS, "readwrite");
        const store = tx.objectStore(STORE_RESPOSTAS);

        // Deep copy para evitar problemas de referência
        const dados = JSON.parse(JSON.stringify(estado));
        
        // Garante que o ID usado é o id_vistoria oficial do APP_STATE
        dados.id_vistoria = estado.id_vistoria || estado.id_visita;
        
        if (!dados.id_vistoria) {
            console.error("❌ Erro: Tentativa de salvar sem id_vistoria");
            return;
        }

        dados.ultima_atualizacao = new Date().toISOString();

        return new Promise((resolve, reject) => {
            const req = store.put(dados);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject("Erro ao salvar no IndexedDB");
        });
    },

    // CARREGA A VISTORIA ATUAL
    async loadVisita(id) {
        if (!id) return null;
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
    },

    // BUSCA FOTOS DE UMA PERGUNTA (Usado na Galeria e no Excel)
    async getFotosPergunta(idPergunta) {
        const db = await this.openDB();
        const tx = db.transaction([STORE_FOTOS], 'readonly');
        const store = tx.objectStore(STORE_FOTOS);
        const index = store.index("pergunta_id");
        const req = index.getAll(idPergunta);

        return new Promise((resolve) => {
            req.onsuccess = () => {
                // Filtra para garantir que as fotos pertencem à vistoria atual
                const fotos = req.result.filter(f => f.id_vistoria === APP_STATE.id_vistoria);
                resolve(fotos);
            };
            req.onerror = () => resolve([]);
        });
    }
};

// --- INTERFACE GLOBAL PARA O APP.JS ---

window.savePhotoToDB = async (fotoId, blob, idPergunta, base64) => {
    const db = await DB_API.openDB();
    const tx = db.transaction([STORE_FOTOS], 'readwrite');
    const store = tx.objectStore(STORE_FOTOS);

    return new Promise((resolve, reject) => {
        store.put({
            foto_id: fotoId,
            id_vistoria: APP_STATE.id_vistoria, // Sincronizado com a store principal
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

// Vincula a API ao objeto window para o app.js acessar
window.DB_API = DB_API;