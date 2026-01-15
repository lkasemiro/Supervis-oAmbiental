// ============================================================
// INDEXEDDB.JS – PERSISTÊNCIA OFFLINE (CEDAE)
// ============================================================

// ------------------------------------------------------------
// 1. CONSTANTES DO BANCO
// ------------------------------------------------------------
const DB_NAME = "CEDAE_VistoriasDB";
const DB_VERSION = 2;

const STORE_RESPOSTAS = "vistorias";
const STORE_FOTOS = "fotos";

// ------------------------------------------------------------
// 2. API CENTRAL DO BANCO
// ------------------------------------------------------------
const DB_API = {

    // --------------------------------------------------------
    // ABERTURA / UPGRADE DO BANCO
    // --------------------------------------------------------
    async openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Store principal: estado completo da vistoria
                if (!db.objectStoreNames.contains(STORE_RESPOSTAS)) {
                    db.createObjectStore(STORE_RESPOSTAS, { keyPath: "db_id" });
                }

                // Store de fotos
                if (!db.objectStoreNames.contains(STORE_FOTOS)) {
                    const store = db.createObjectStore(STORE_FOTOS, { keyPath: "foto_id" });
                    store.createIndex("pergunta_id", "pergunta_id", { unique: false });
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject("Erro ao abrir IndexedDB");
        });
    },

    // --------------------------------------------------------
    // SALVAR ESTADO COMPLETO DA VISTORIA
    // --------------------------------------------------------
    async saveVisita(estado) {
        try {
            const db = await this.openDB();
            const tx = db.transaction(STORE_RESPOSTAS, "readwrite");
            const store = tx.objectStore(STORE_RESPOSTAS);

            // Clonagem defensiva
            const dados = JSON.parse(JSON.stringify(estado));
            dados.db_id = "visita_atual";
            dados.ultima_atualizacao = new Date().toISOString();

            return new Promise((resolve, reject) => {
                const req = store.put(dados);
                req.onsuccess = () => resolve(true);
                req.onerror = () => reject("Erro ao salvar vistoria");
            });

        } catch (err) {
            console.error("Erro ao salvar vistoria:", err);
        }
    },

    // --------------------------------------------------------
    // CARREGAR ÚLTIMA VISTORIA SALVA
    // --------------------------------------------------------
    async loadVisita() {
        const db = await this.openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_RESPOSTAS, "readonly");
            const store = tx.objectStore(STORE_RESPOSTAS);
            const req = store.get("visita_atual");

            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    },

    // --------------------------------------------------------
    // SALVAR FOTO
    // --------------------------------------------------------
    async saveFoto(fotoId, blob, idPergunta) {
        const db = await this.openDB();
        const tx = db.transaction(STORE_FOTOS, "readwrite");
        const store = tx.objectStore(STORE_FOTOS);

        return store.put({
            foto_id: fotoId,
            pergunta_id: idPergunta,
            blob,
            timestamp: new Date().toISOString()
        });
    },

    // --------------------------------------------------------
    // OBTER FOTOS DE UMA PERGUNTA
    // --------------------------------------------------------
    async getFotosPergunta(idPergunta) {
        const db = await this.openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_FOTOS, "readonly");
            const store = tx.objectStore(STORE_FOTOS);
            const index = store.index("pergunta_id");
            const req = index.getAll(idPergunta);

            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
    }
};

// ------------------------------------------------------------
// 3. FUNÇÕES GLOBAIS USADAS PELO APP.JS
// ------------------------------------------------------------

// 🔁 Backup automático do estado (respostas, sublocal, fotos refs)
window.saveAnswerToDB = () => {
    if (typeof APP_STATE === "undefined") return;

    DB_API.saveVisita(APP_STATE)
        .then(() => console.log("💾 Backup automático salvo"))
        .catch(err => console.error("Erro no backup:", err));
};

// 📸 Persistência de fotos
window.savePhotoToDB = (fotoId, blob, idPergunta) => {
    DB_API.saveFoto(fotoId, blob, idPergunta)
        .then(() => console.log("📸 Foto salva no IndexedDB"))
        .catch(err => console.error("Erro ao salvar foto:", err));
};

// ------------------------------------------------------------
// 4. EXPOSIÇÃO GLOBAL (SE NECESSÁRIO)
// ------------------------------------------------------------
window.DB_API = DB_API;
window.DB_NAME = DB_NAME;
