// =====================================================
// indexedDB.js – BANCO UNIFICADO PARA GERAL / PGE / AA
// =====================================================

let dbPromise = null;

// -----------------------------------------------------
// ABRIR BANCO
// -----------------------------------------------------
function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open("cedae_pwa_db", 2);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains("respostas")) {
        const store = db.createObjectStore("respostas", { keyPath: "key" });
        store.createIndex("tipo", "tipo", { unique: false });
        store.createIndex("idPergunta", "idPergunta", { unique: false });
      }

      if (!db.objectStoreNames.contains("fotos")) {
        const store = db.createObjectStore("fotos", { keyPath: "fotoId" });
        store.createIndex("tipo", "tipo", { unique: false });
        store.createIndex("idPergunta", "idPergunta", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

// -----------------------------------------------------
// CHAMADO PELO app.js (pode ser NO-OP além de abrir DB)
// -----------------------------------------------------
async function initIndexedDB(tipo) {
  await openDB();
}

// -----------------------------------------------------
// SALVAR RESPOSTA (autosave)
// -----------------------------------------------------
async function saveAnswerToDB(idPergunta, valor) {
  const tipo = APP_STATE.tipoRoteiro;
  const key = `${tipo}_${idPergunta}`;

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("respostas", "readwrite");
    const store = tx.objectStore("respostas");

    store.put({
      key,
      tipo,
      idPergunta,
      valor
    });

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

// -----------------------------------------------------
// SALVAR FOTO
// -----------------------------------------------------
async function savePhotoToDB(fotoId, blob, idPergunta) {
  const tipo = APP_STATE.tipoRoteiro;

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("fotos", "readwrite");
    const store = tx.objectStore("fotos");

    store.put({
      fotoId,
      tipo,
      idPergunta,
      blob
    });

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

// -----------------------------------------------------
// BUSCAR TODAS AS FOTOS *DO TIPO ATUAL*
// -----------------------------------------------------
async function getAllPhotosFromDB() {
  const tipo = APP_STATE.tipoRoteiro;
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction("fotos", "readonly");
    const store = tx.objectStore("fotos");
    const index = store.index("tipo");
    const req = index.getAll(IDBKeyRange.only(tipo));

    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// -----------------------------------------------------
// APAGAR SOMENTE 1 FORMULÁRIO (Geral / PGE / AA)
// -----------------------------------------------------
async function clearFormData(tipo) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(["respostas", "fotos"], "readwrite");

    const respostasIndex = tx.objectStore("respostas").index("tipo");
    const fotosIndex = tx.objectStore("fotos").index("tipo");

    respostasIndex.openCursor(IDBKeyRange.only(tipo)).onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    fotosIndex.openCursor(IDBKeyRange.only(tipo)).onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

// -----------------------------------------------------
// APAGAR TUDO (Finalizar visita geral)
// -----------------------------------------------------
async function clearAllData() {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(["respostas", "fotos"], "readwrite");
    tx.objectStore("respostas").clear();
    tx.objectStore("fotos").clear();

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

// -----------------------------------------------------
// BUSCAR TODAS AS RESPOSTAS E FOTOS (para XLSX Único)
// -----------------------------------------------------
async function getAllAnswersAndPhotos() {
  const db = await openDB();

  const result = {
    geral: { respostas: {}, fotos: {} },
    pge: { respostas: {}, fotos: {} },
    aa: { respostas: {}, fotos: {} }
  };

  await new Promise((resolve, reject) => {
    const tx = db.transaction("respostas", "readonly");
    const store = tx.objectStore("respostas");
    const req = store.getAll();

    req.onsuccess = () => {
      (req.result || []).forEach((r) => {
        if (!result[r.tipo]) return;
        result[r.tipo].respostas[r.idPergunta] = r.valor;
      });
      resolve();
    };
    req.onerror = () => reject(req.error);
  });

  await new Promise((resolve, reject) => {
    const tx = db.transaction("fotos", "readonly");
    const store = tx.objectStore("fotos");
    const req = store.getAll();

    req.onsuccess = () => {
      (req.result || []).forEach((f) => {
        if (!result[f.tipo]) return;
        if (!result[f.tipo].fotos[f.idPergunta]) {
          result[f.tipo].fotos[f.idPergunta] = [];
        }
        result[f.tipo].fotos[f.idPergunta].push(f);
      });
      resolve();
    };
    req.onerror = () => reject(req.error);
  });

  return result;
}

// -----------------------------------------------------
// BUSCAR SOMENTE RESPOSTAS DE UM TIPO (se quiser CSV por tipo)
// -----------------------------------------------------
async function getAnswersMapFromDB(tipo) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const respostas = {};

    const tx = db.transaction("respostas", "readonly");
    const store = tx.objectStore("respostas").index("tipo");

    const req = store.getAll(IDBKeyRange.only(tipo));
    req.onsuccess = () => {
      (req.result || []).forEach((r) => {
        respostas[r.idPergunta] = r.valor;
      });
      resolve(respostas);
    };
    req.onerror = () => reject(req.error);
  });
}
