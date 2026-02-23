// sync_manager.js — v2 (BLOB + multipart/form-data) + TESTE DE FORMDATA
// - Lê pendentes no IndexedDB
// - Monta FormData: payload(JSON) + files(BLOB)
// - Faz POST para Plumber
// - Marca como sincronizado no IndexedDB
// - Inclui teste REAL do body (fd instanceof FormData + dump entries)
// Obs: NÃO defina Content-Type manualmente em multipart (o browser coloca boundary)

(function () {
  const SYNC = {};

  // =========================
  // CONFIG
  // =========================
  SYNC.ENDPOINT = "https://strapless-christi-unspread.ngrok-free.dev/vistorias/sincronizar";

  // Se você precisar pular a warning do ngrok:
  SYNC.HEADERS = { "ngrok-skip-browser-warning": "true" };

  // DEBUG: deixe true para diagnosticar no PC; no Android pode desligar
  SYNC.DEBUG = true;

  let __LOCK = false;

  const log = {
    i: (...a) => console.log("[SYNC]", ...a),
    w: (...a) => console.warn("[SYNC]", ...a),
    e: (...a) => console.error("[SYNC]", ...a),
  };

  function setStatus(msg) {
    if (typeof window.atualizarStatusTexto === "function") window.atualizarStatusTexto(msg);
    else log.i("STATUS:", msg);
  }

  function setLoading(isLoading, opts = {}) {
    if (typeof window.UI_setLoading === "function") {
      window.UI_setLoading("sync", isLoading, {
        loadingText: opts.loadingText || "SINCRONIZANDO...",
        defaultText: opts.defaultText || "ENVIAR PARA O SERVIDOR ☁️"
      });
    }
  }

  function safeSlug(s) {
    return String(s || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  // ✅ Mantém o "label estável" que você já vinha usando
  function toFlatRespostas(respostas) {
    const flat = {};
    const blocos = respostas || {};
    if (!blocos || typeof blocos !== "object") return flat;

    for (const bloco of Object.keys(blocos)) {
      const obj = blocos[bloco];
      if (!obj || typeof obj !== "object") continue;

      for (const pid of Object.keys(obj)) {
        flat[`${bloco}:${String(pid)}`] = obj[pid];
      }
    }
    return flat;
  }

  // =========================
  // TESTE REAL DO FORMDATA
  // =========================
  function debugDumpFormData(fd) {
    log.i("body é FormData?", (fd instanceof FormData));

    if (!(fd instanceof FormData)) return;

    let totalFiles = 0;

    for (const [k, v] of fd.entries()) {
      if (k === "payload") {
        log.i("payload(raw) len=", String(v).length);
        if (SYNC.DEBUG) {
          try { log.i("payload(JSON)", JSON.parse(v)); } catch { log.w("payload não é JSON parseável"); }
        }
      } else if (v instanceof File) {
        totalFiles++;
        log.i(`file field=${k} name=${v.name} size=${v.size} type=${v.type}`);
      } else if (v instanceof Blob) {
        // Alguns browsers podem registrar como Blob (sem name)
        totalFiles++;
        log.i(`blob field=${k} size=${v.size} type=${v.type}`);
      } else {
        log.i(`field=${k}`, v);
      }
    }

    log.i("Total de arquivos/blobs anexados:", totalFiles);
  }

  // =========================
  // BUILD FORMDATA
  // =========================
  async function buildFormData(visita) {
    const id_vistoria = String(visita?.id_vistoria || "");
    if (!id_vistoria) throw new Error("Sem id_vistoria.");

    // 1) Fotos (BLOB) — fonte da verdade: IndexedDB
    const fotos = (window.DB_API && typeof window.DB_API.getAllFotosVistoria === "function")
      ? await window.DB_API.getAllFotosVistoria(id_vistoria)
      : [];

    // 2) Payload JSON — alinhado ao backend atual (API “antiga” de JSON puro)
    // A ideia aqui é: mesmo usando multipart, o payload mantém as chaves esperadas
    const payload = {
      id_vistoria,
      tecnico: visita?.tecnico || visita?.avaliador || "Não Informado",
      avaliador: visita?.avaliador || visita?.tecnico || "Não Informado",
      local: visita?.local || "Não Informado",
      data_hora: visita?.data_hora || visita?.data || new Date().toISOString(),
      tipoRoteiro: visita?.tipoRoteiro || "geral",

      // sua API atual espera isso:
      respostas_detalhadas: toFlatRespostas(visita?.respostas || {})
    };

    // 3) FormData
    const fd = new FormData();
    fd.set("payload", JSON.stringify(payload));

    // 4) Anexar arquivos como "files"
    // ✅ IMPORTANTÍSSIMO: anexar como File com nome garante compatibilidade melhor no backend
    let anexadas = 0;

    for (const f of (Array.isArray(fotos) ? fotos : [])) {
      const blob = f?.blob_data || f?.blob;
      if (!blob) continue;

      const foto_id = String(f?.foto_id || crypto.randomUUID());
      const pergunta_id = String(f?.pergunta_id || "foto_geral");

      // camera.js gera jpeg; mas se vier diferente, tenta respeitar
      const mime = String(f?.mime_type || blob.type || "image/jpeg").toLowerCase();
      const ext =
        mime.includes("png") ? "png" :
        (mime.includes("jpg") || mime.includes("jpeg")) ? "jpg" :
        mime.includes("webp") ? "webp" : "bin";

      const filename = `${safeSlug(foto_id)}__${safeSlug(pergunta_id)}.${ext}`;

      // Converte Blob -> File (nome + type)
      const file = new File([blob], filename, { type: blob.type || mime || "application/octet-stream" });

      fd.append("files", file);
      anexadas++;
    }

    return { fd, payload, anexadas };
  }

  async function fetchJsonOrText(resp) {
    const raw = await resp.text();
    try { return raw ? JSON.parse(raw) : {}; }
    catch { return { status: "erro", message: raw || "Resposta não-JSON." }; }
  }

  // =========================
  // SYNC — 1
  // =========================
  SYNC.sincronizarUma = async function (visita) {
    const id = String(visita?.id_vistoria || "");
    if (!id) throw new Error("Vistoria sem id_vistoria.");

    const { fd, payload, anexadas } = await buildFormData(visita);

    log.i("→ Enviando", { id_vistoria: id, anexadas, endpoint: SYNC.ENDPOINT });
    log.i("Payload keys:", Object.keys(payload));

    // ✅ TESTE REAL AQUI (antes do fetch)
    if (SYNC.DEBUG) debugDumpFormData(fd);

    let resp;
    try {
      resp = await fetch(SYNC.ENDPOINT, {
        method: "POST",
        // NÃO setar Content-Type em FormData: o browser define boundary
        headers: { ...SYNC.HEADERS },
        body: fd
      });
    } catch (e) {
      throw new Error(`Falha de rede (ngrok/API fora do ar?): ${e?.message || e}`);
    }

    const out = await fetchJsonOrText(resp);

    log.i("Resposta servidor:", { http: resp.status, out });

    if (!resp.ok || out.status !== "sucesso") {
      throw new Error(out.message || `Erro HTTP ${resp.status}`);
    }

    // marca como sincronizado no IndexedDB
    if (window.DB_API && typeof window.DB_API.marcarComoSincronizado === "function") {
      await window.DB_API.marcarComoSincronizado(id);
    } else {
      log.w("DB_API.marcarComoSincronizado indisponível.");
    }

    return out;
  };

  // =========================
  // SYNC — pendentes
  // =========================
  SYNC.sincronizarPendentes = async function ({ showUI = true } = {}) {
    if (__LOCK) return;
    __LOCK = true;

    try {
      log.i("Disparo sync. onLine =", navigator.onLine);

      if (!navigator.onLine) {
        setStatus("Sem conexão.");
        if (showUI) alert("Sem conexão. Os dados permanecem no aparelho.");
        return;
      }

      if (!window.DB_API || typeof window.DB_API.getVistoriasPendentes !== "function") {
        throw new Error("DB_API.getVistoriasPendentes não disponível.");
      }

      if (showUI) setLoading(true, { loadingText: "A ENVIAR PENDÊNCIAS..." });
      setStatus("Verificando pendências...");

      const pendentes = await window.DB_API.getVistoriasPendentes();
      const total = Array.isArray(pendentes) ? pendentes.length : 0;

      log.i("Pendentes:", total);

      if (!total) {
        setStatus("Sem pendências.");
        if (showUI) setLoading(false, { defaultText: "SEM PENDÊNCIAS ✓" });
        return;
      }

      let ok = 0, falhas = 0;

      for (let i = 0; i < total; i++) {
        const visita = pendentes[i];
        const id = String(visita?.id_vistoria || "sem_id");

        try {
          setStatus(`Enviando ${i + 1}/${total} (ID: ${id})...`);
          await SYNC.sincronizarUma(visita);
          ok++;
        } catch (e) {
          falhas++;
          log.w("Falha vistoria:", id, e?.message || e);
          // segue adiante
        }
      }

      const msg = falhas === 0
        ? `Sincronização concluída: ${ok}/${total} enviadas.`
        : `Sincronização concluída: ${ok}/${total} enviadas, ${falhas} falharam.`;

      setStatus(msg);

      if (showUI) {
        if (falhas === 0 && typeof window.marcarComoConcluidoUI === "function") {
          window.marcarComoConcluidoUI("servidor");
        }
        setLoading(false, { defaultText: falhas === 0 ? "ENVIADO ✓" : "REVISAR FALHAS" });
      }
    } finally {
      __LOCK = false;
    }
  };

  SYNC.handleSincronizacao = () => SYNC.sincronizarPendentes({ showUI: true });

  // Auto-sync ao voltar online
  window.addEventListener("online", () => {
    log.i("Online novamente — auto-sync silencioso.");
    SYNC.sincronizarPendentes({ showUI: false });
  });

  // Expor global
  window.SYNC = SYNC;
  window.handleSincronizacao = SYNC.handleSincronizacao;

  log.i("✅ sync_manager.js carregado (multipart+BLOB) + teste FormData.");
})();