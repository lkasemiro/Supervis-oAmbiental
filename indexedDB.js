// indexedDB.js

// ======================================
// CONFIGURAÇÕES
// ======================================

const DB_NAME = "CEDAE_VistoriasDB";
const DB_VERSION = 19;

const STORE_RESPOSTAS = "respostas";
const STORE_FOTOS = "fotos";


// ======================================
// DB_API
// ======================================

const DB_API = {

    // ==================================
    // ABERTURA DO BANCO
    // ==================================
    async openDB() {
        return new Promise((resolve, reject) => {

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // ===== STORE RESPOSTAS =====
                if (!db.objectStoreNames.contains(STORE_RESPOSTAS)) {
                    db.createObjectStore(STORE_RESPOSTAS, {
                        keyPath: "id_vistoria"
                    });
                }

                // ===== STORE FOTOS =====
                if (!db.objectStoreNames.contains(STORE_FOTOS)) {
                    const store = db.createObjectStore(STORE_FOTOS, {
                        keyPath: "foto_id"
                    });

                    store.createIndex("id_vistoria", "id_vistoria", { unique: false });
                    store.createIndex("pergunta_id", "pergunta_id", { unique: false });
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    // ==================================
    // RESPOSTAS
    // ==================================

    async saveVisita(estado) {

        const db = await this.openDB();
        const tx = db.transaction(STORE_RESPOSTAS, "readwrite");
        const store = tx.objectStore(STORE_RESPOSTAS);

        const payload = {
            id_vistoria: estado.id_vistoria || `VIST_${Date.now()}`,
            tecnico: estado.avaliador || "Técnico Local",
            local: estado.local || "Não Informado",
            data_hora: estado.data || new Date().toISOString(),
            tipoRoteiro: estado.tipoRoteiro || "geral",
            respostas: estado.respostas || {},

            status_sync: "pendente",
            excel_gerado: false,
            fotos_confirmadas: false,

            ultima_atualizacao: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const req = store.put(payload);
            req.onsuccess = () => resolve(payload);
            req.onerror = () => reject(req.error);
        });
    },

    // Carrega uma vistoria por id_vistoria
    async loadVisita(idVistoria) {

        const db = await this.openDB();
        const tx = db.transaction(STORE_RESPOSTAS, "readonly");
        const store = tx.objectStore(STORE_RESPOSTAS);

        return new Promise((resolve, reject) => {
            const req = store.get(idVistoria);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    },

    async getVistoriasPendentes() {

        const db = await this.openDB();
        const tx = db.transaction(STORE_RESPOSTAS, "readonly");
        const store = tx.objectStore(STORE_RESPOSTAS);

        return new Promise((resolve, reject) => {

            const req = store.getAll();

            req.onsuccess = () => {
                const all = req.result || [];
                const pendentes = all.filter(v => v.status_sync === "pendente");
                resolve(pendentes);
            };

            req.onerror = () => reject(req.error);
        });
    },

    async marcarComoSincronizado(idVistoria) {

        const db = await this.openDB();
        const tx = db.transaction(STORE_RESPOSTAS, "readwrite");
        const store = tx.objectStore(STORE_RESPOSTAS);

        return new Promise((resolve, reject) => {

            const reqGet = store.get(idVistoria);

            reqGet.onsuccess = () => {

                const visita = reqGet.result;

                if (!visita) {
                    resolve(false);
                    return;
                }

                visita.status_sync = "sincronizado";
                visita.ultima_atualizacao = new Date().toISOString();

                const reqPut = store.put(visita);

                reqPut.onsuccess = () => resolve(true);
                reqPut.onerror = () => reject(reqPut.error);
            };

            reqGet.onerror = () => reject(reqGet.error);
        });
    },


    // ==================================
    // FOTOS
    // ==================================

    async salvarFoto(fotoObj) {

        const db = await this.openDB();
        const tx = db.transaction(STORE_FOTOS, "readwrite");
        const store = tx.objectStore(STORE_FOTOS);

        const blob = fotoObj.blob_data || fotoObj.blob;

        const foto = {
            foto_id: fotoObj.foto_id || crypto.randomUUID(),
            id_vistoria: fotoObj.id_vistoria,
            pergunta_id: fotoObj.pergunta_id,
            blob_data: blob, // BLOB (fonte de verdade)
            mime_type: fotoObj.mime_type || (blob ? blob.type : "application/octet-stream"),
            size: fotoObj.size || (blob ? blob.size : null),
            created_at: fotoObj.created_at || new Date().toISOString()
        };

        return new Promise((resolve, reject) => {

            const req = store.put(foto);

            tx.oncomplete = () => resolve(foto);
            tx.onerror = () => reject(tx.error);
            req.onerror = () => reject(req.error);
        });
    },

    async getAllFotosVistoria(idVistoria) {

        const db = await this.openDB();
        const tx = db.transaction(STORE_FOTOS, "readonly");
        const store = tx.objectStore(STORE_FOTOS);
        const index = store.index("id_vistoria");

        return new Promise((resolve, reject) => {

            const req = index.getAll(idVistoria);

            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    },

    async getFotosPergunta(idVistoria, perguntaId) {

        const todas = await this.getAllFotosVistoria(idVistoria);

        return (todas || []).filter(f => f.pergunta_id === perguntaId);
    },

    // Remove uma foto por foto_id
    async removerFoto(fotoId) {

        const db = await this.openDB();
        const tx = db.transaction(STORE_FOTOS, "readwrite");
        const store = tx.objectStore(STORE_FOTOS);

        return new Promise((resolve, reject) => {
            const req = store.delete(fotoId);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    },

    async limparFotosVistoria(idVistoria) {

        const fotos = await this.getAllFotosVistoria(idVistoria);
        if (!fotos.length) return true;

        const db = await this.openDB();
        const tx = db.transaction(STORE_FOTOS, "readwrite");
        const store = tx.objectStore(STORE_FOTOS);

        return new Promise((resolve, reject) => {

            fotos.forEach(f => store.delete(f.foto_id));

            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    }
};
window.DB_API = DB_API;
