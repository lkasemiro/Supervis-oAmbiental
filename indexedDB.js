const DB_NAME = "CEDAE_VistoriasDB";
const DB_VERSION = 10; // Subimos a versão para aplicar os novos índices
const STORE_RESPOSTAS = "vistorias";
const STORE_FOTOS = "fotos";

const DB_API = {
    async openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Loja de Vistorias
                if (!db.objectStoreNames.contains(STORE_RESPOSTAS)) {
                    db.createObjectStore(STORE_RESPOSTAS, { keyPath: "id_vistoria" });
                }
                
                // Loja de Fotos com índices reforçados
                if (!db.objectStoreNames.contains(STORE_FOTOS)) {
                    const store = db.createObjectStore(STORE_FOTOS, { keyPath: "foto_id" });
                    store.createIndex("id_vistoria", "id_vistoria", { unique: false });
                    store.createIndex("pergunta_id", "pergunta_id", { unique: false });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    // BUSCA INTELIGENTE: Pega fotos vinculadas especificamente a uma vistoria
    async getAllFotosVistoria(idVistoria) {
        if (!idVistoria) return [];
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

    // SALVAMENTO NORMALIZADO: Prepara os dados para o R antes de guardar
    async saveVisita(estado) {
        const db = await this.openDB();
        const tx = db.transaction(STORE_RESPOSTAS, "readwrite");
        const store = tx.objectStore(STORE_RESPOSTAS);

        // Criamos uma cópia limpa para não afetar o app em tempo real
        const payloadParaSalvar = {
            id_vistoria: estado.id_vistoria || estado.id_visita,
            tecnico: estado.avaliador || estado.tecnico,
            local: estado.local,
            data_hora: estado.data_hora || new Date().toISOString(),
            tipoRoteiro: estado.tipoRoteiro || estado.roteiro_id,
            respostas: estado.respostas || {}, // Onde o pivot do R vai trabalhar
            sincronizado: estado.sincronizado || false,
            ultima_atualizacao: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const req = store.put(payloadParaSalvar);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
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
            req.onerror = () => resolve(null);
        });
    }
};

window.DB_API = DB_API;