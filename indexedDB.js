// ============================================================
// INDEXEDDB.JS – PERSISTÊNCIA OFFLINE (CEDAE) - VERSÃO V9
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
                if (!db.objectStoreNames.contains(STORE_RESPOSTAS)) {
                    db.createObjectStore(STORE_RESPOSTAS, { keyPath: "id_vistoria" });
                }
                if (!db.objectStoreNames.contains(STORE_FOTOS)) {
                    const store = db.createObjectStore(STORE_FOTOS, { keyPath: "foto_id" });
                    store.createIndex("pergunta_id", "pergunta_id", { unique: false });
                    store.createIndex("id_vistoria", "id_vistoria", { unique: false });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    // Esta é a função que o seu app.js estava a tentar chamar e dava erro
    async getAllFotosVistoria(idVistoria) {
        const db = await this.openDB();
        const tx = db.transaction([STORE_FOTOS], 'readonly');
        const store = tx.objectStore(STORE_FOTOS);
        const index = store.index("id_vistoria");
        const req = index.getAll(idVistoria);

        return new Promise((resolve) => {
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
    },

    async saveVisita(estado) {
        const db = await this.openDB();
        const tx = db.transaction(STORE_RESPOSTAS, "readwrite");
        const store = tx.objectStore(STORE_RESPOSTAS);
        const dados = JSON.parse(JSON.stringify(estado));
        dados.id_vistoria = estado.id_vistoria || estado.id_visita;
        dados.ultima_atualizacao = new Date().toISOString();
        return new Promise((resolve) => {
            const req = store.put(dados);
            req.onsuccess = () => resolve(true);
        });
    },

    async loadVisita(id) {
        if (!id) return null;
        const db = await this.openDB();
        const tx = db.transaction(STORE_RESPOSTAS, "readonly");
        const store = tx.objectStore(STORE_RESPOSTAS);
        const req = store.get(id);
        return new Promise((resolve) => {
            req.onsuccess = () => resolve(req.result || null);
        });
    }
};

window.DB_API = DB_API;
