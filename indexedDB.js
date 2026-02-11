const DB_NAME = "CEDAE_VistoriasDB";
const DB_VERSION = 17; 
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
                    store.createIndex("id_vistoria", "id_vistoria", { unique: false });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    // 1. SALVAMENTO: Alinhado com a estrutura do R
    async saveVisita(estado) {
        const db = await this.openDB();
        const tx = db.transaction(STORE_RESPOSTAS, "readwrite");
        const store = tx.objectStore(STORE_RESPOSTAS);

        // Alinhamento exato com os campos que o seu api_sinc.R espera
        const payloadParaSalvar = {
            id_vistoria: estado.id_vistoria || `VIST_${Date.now()}`,
            tecnico: estado.avaliador || "Técnico Local",
            local: estado.local || "Não Informado",
            data_hora: estado.data || new Date().toISOString(),
            tipoRoteiro: estado.tipoRoteiro || "geral",
            respostas: estado.respostas || {}, // Garante que nunca seja null
            sincronizado: false,
            ultima_atualizacao: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const req = store.put(payloadParaSalvar);
            req.onsuccess = () => resolve(payloadParaSalvar); // Retorna o objeto salvo
            req.onerror = () => reject(req.error);
        });
    },

    // 2. BUSCA FOTOS: Filtra por vistoria
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

    // 3. SINCRONIZADOR: Monta o "Pacote Completo" para o R
    async prepararPacoteSincronizacao() {
        const db = await this.openDB();
        const tx = db.transaction([STORE_RESPOSTAS], 'readonly');
        const store = tx.objectStore(STORE_RESPOSTAS);
        const req = store.getAll();

        return new Promise((resolve) => {
            req.onsuccess = async () => {
                const vistorias = req.result.filter(v => !v.sincronizado);
                
                // Aqui acontece a mágica: anexa as fotos antes de enviar para o R
                const pacotes = await Promise.all(vistorias.map(async (v) => {
                    const fotos = await this.getAllFotosVistoria(v.id_vistoria);
                    return {
                        metadata: { id_vistoria: v.id_vistoria },
                        core: {
                            data_execucao: v.data_hora,
                            local_id: v.local
                        },
                        dados: {
                            respostas: v.respostas,
                            fotos_payload: fotos.map(f => ({
                                pergunta_id: f.pergunta_id,
                                base64: f.base64_data || f.base64 // suporte a ambos os nomes
                            }))
                        }
                    };
                }));
                resolve(pacotes);
            };
        });
    },

    // 4. LIMPEZA: Roda após o R retornar Sucesso (201)
    async marcarComoSincronizado(idVistoria) {
        const db = await this.openDB();
        const tx = db.transaction([STORE_RESPOSTAS], 'readwrite');
        const store = tx.objectStore(STORE_RESPOSTAS);
        const req = store.get(idVistoria);

        req.onsuccess = () => {
            const data = req.result;
            if(data) {
                data.sincronizado = true;
                store.put(data);
            }
        };
    }
};

window.DB_API = DB_API;