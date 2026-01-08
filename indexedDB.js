// =====================================================
// indexedDB.js – BANCO UNIFICADO OTIMIZADO
// =====================================================

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    // Versão incrementada para garantir que os índices existam
    const request = indexedDB.open("cedae_pwa_db", 3);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Criação/Atualização das tabelas de forma atômica
      const stores = [
        { name: "respostas", key: "key" },
        { name: "fotos", key: "fotoId" }
      ];

      stores.forEach(s => {
        if (!db.objectStoreNames.contains(s.name)) {
          const store = db.createObjectStore(s.name, { keyPath: s.key });
          store.createIndex("tipo", "tipo", { unique: false });
          store.createIndex("idPergunta", "idPergunta", { unique: false });
        }
      });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null; // Reseta se falhar para tentar de novo
      reject(request.error);
    };
  });

  return dbPromise;
}

// Inicializador usado pelo app.js
async function initIndexedDB(tipo) {
  try {
    const db = await openDB();
    if (!tipo) return; // Não tenta carregar se não houver tipo definido
    
    const respostas = await getAnswersMapFromDB(tipo);
    // Garante que APP_STATE existe antes de atribuir
    if (window.APP_STATE) {
      Object.assign(APP_STATE.respostas, respostas);
    }
    console.log(`DB: Dados carregados para o roteiro ${tipo}`);
  } catch (err) {
    console.error("Erro ao iniciar DB (o app continuará em memória):", err);
  }
}

// Otimização: Função genérica para transações de escrita
async function performWrite(storeName, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(data);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function saveAnswerToDB(idPergunta, valor) {
  const tipo = APP_STATE.tipoRoteiro;
  return performWrite("respostas", {
    key: `${tipo}_${idPergunta}`,
    tipo,
    idPergunta,
    valor
  });
}

async function savePhotoToDB(fotoId, blob, idPergunta) {
  return performWrite("fotos", {
    fotoId,
    tipo: APP_STATE.tipoRoteiro,
    idPergunta,
    blob
  });
}

// Busca rápida usando o índice "tipo"
async function getAllPhotosFromDB() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("fotos", "readonly");
    const req = tx.objectStore("fotos").index("tipo").getAll(APP_STATE.tipoRoteiro);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// Busca unificada mais eficiente (Executa em paralelo)
async function getAllAnswersAndPhotos() {
  const db = await openDB();
  const result = {
    geral: { respostas: {}, fotos: {} },
    pge: { respostas: {}, fotos: {} },
    aa: { respostas: {}, fotos: {} }
  };

  const [respostas, fotos] = await Promise.all([
    new Promise(r => db.transaction("respostas").objectStore("respostas").getAll().onsuccess = e => r(e.target.result)),
    new Promise(r => db.transaction("fotos").objectStore("fotos").getAll().onsuccess = e => r(e.target.result))
  ]);

  respostas?.forEach(r => {
    if (result[r.tipo]) result[r.tipo].respostas[r.idPergunta] = r.valor;
  });

  fotos?.forEach(f => {
    if (result[f.tipo]) {
      if (!result[f.tipo].fotos[f.idPergunta]) result[f.tipo].fotos[f.idPergunta] = [];
      result[f.tipo].fotos[f.idPergunta].push(f);
    }
  });

  return result;
}

// Limpeza com Cursor (mais seguro para grandes volumes de dados)
async function clearFormData(tipo) {
  const db = await openDB();
  const tx = db.transaction(["respostas", "fotos"], "readwrite");
  
  ["respostas", "fotos"].forEach(store => {
    const index = tx.objectStore(store).index("tipo");
    index.openKeyCursor(IDBKeyRange.only(tipo)).onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        tx.objectStore(store).delete(cursor.primaryKey);
        cursor.continue();
      }
    };
  });

  return new Promise((res) => tx.oncomplete = () => res(true));
}

async function getAnswersMapFromDB(tipo) {
  const db = await openDB();
  return new Promise((resolve) => {
    const respostas = {};
    const req = db.transaction("respostas").objectStore("respostas").index("tipo").getAll(tipo);
    req.onsuccess = () => {
      req.result.forEach(r => respostas[r.idPergunta] = r.valor);
      resolve(respostas);
    };
  });
}

async function clearAllData() {
  const db = await openDB();
  const tx = db.transaction(["respostas", "fotos"], "readwrite");
  tx.objectStore("respostas").clear();
  tx.objectStore("fotos").clear();
  return new Promise(res => tx.oncomplete = () => res(true));
}
