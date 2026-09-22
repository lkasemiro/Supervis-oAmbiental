// sync_manager.js — Conexão Direta Nuvem/Neon (sem ngrok)
(function () {
  const SYNC = {};

  // =========================
  // CONFIG
  // =========================
  // Substitua pela URL da sua API hospedada na nuvem que grava no Neon:
  SYNC.ENDPOINT = "https://api-supervisao-ambiental.onrender.com/vistorias/sincronizar";

  // Cabeçalhos padrão (ngrok removido)
  SYNC.HEADERS = {};

  // DEBUG: Deixe true durante o desenvolvimento
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
  // BUILD FORMDATA
  // =========================
  async function buildFormData(visita) {
    const id_vistoria = String(visita?.id_vistoria || "");
    if (!id_vistoria) throw new Error("Sem id_vistoria.");

    // 1) Fotos (BLOB) — busca direto do IndexedDB
    const fotos = (window.DB_API && typeof window.DB_API.getAllFotosVistoria === "function")
      ? await window.DB_API.getAllFotosVistoria(id_vistoria)
      : [];

    // 2) Payload JSON estruturado para o schema do Neon
    const payload = {
      codigo_vistoria: id_vistoria,
      tecnico: visita?.tecnico || visita?.avaliador || "Não Informado",
      colaborador: visita?.colaborador || "",
      localidade: visita?.local || "Não Informado",
      data_vistoria: visita?.data_hora || visita?.data || new Date().toISOString(),
      tipo_roteiro: visita?.tipoRoteiro || "geral",
      respostas: visita?.respostas || {},
      respostas_flat: toFlatRespostas(visita?.respostas || {})
    };

    // 3) Instancia o FormData
    const fd = new FormData();
    fd.set("payload", JSON.stringify(payload));

    // 4) Anexa os arquivos binários das fotos
    let anexadas = 0;
    for (const f of (Array.isArray(fotos) ? fotos : [])) {
      const blob = f?.blob_data || f?.blob;
      if (!blob) continue;

      const foto_id = String(f?.foto_id || crypto.randomUUID());
      const pergunta_id = String(f?.pergunta_id || "foto_geral");

      const mime = String(f?.mime_type || blob.type || "image/jpeg").toLowerCase();
      const ext =
        mime.includes("png") ? "png" :
        (mime.includes("jpg") || mime.includes("jpeg")) ? "jpg" :
        mime.includes("webp") ? "webp" : "jpg";

      const filename = `${safeSlug(foto_id)}__${safeSlug(pergunta_id)}.${ext}`;

      const file = new File([blob], filename, { type: blob.type || mime || "image/jpeg" });
      fd.append("files", file);
      anexadas++;
    }

    return { fd, payload, anexadas };
  }

  async function fetchJsonOrText(resp) {
    const raw = await resp.text();
    try { return raw ? JSON.parse(raw) : {}; }
    catch { return { status: "erro", message: raw || "Resposta não-JSON do servidor." }; }
  }

  // =========================
  // SYNC — ENVIO ÚNICO
  // =========================
  SYNC.sincronizarUma = async function (visita) {
    const id = String(visita?.id_vistoria || "");
    if (!id) throw new Error("Vistoria sem id_vistoria.");

    const { fd, payload, anexadas } = await buildFormData(visita);

    log.i("→ Enviando para a nuvem:", { codigo_vistoria: id, fotos_anexadas: anexadas, endpoint: SYNC.ENDPOINT });

    let resp;
    try {
      resp = await fetch(SYNC.ENDPOINT, {
        method: "POST",
        headers: { ...SYNC.HEADERS },
        body: fd
      });
    } catch (e) {
      throw new Error(`Falha de conexão com a API: ${e?.message || e}`);
    }

    const out = await fetchJsonOrText(resp);

    if (!resp.ok || out.status !== "sucesso") {
      throw new Error(out.message || `Erro HTTP ${resp.status}`);
    }

    // Marca o registro local como sincronizado no IndexedDB
    if (window.DB_API && typeof window.DB_API.marcarComoSincronizado === "function") {
      await window.DB_API.marcarComoSincronizado(id);
    } else {
      log.w("DB_API.marcarComoSincronizado não está definido.");
    }

    return out;
  };

  // =========================
  // SYNC — PROCESSA TODAS AS PENDÊNCIAS
  // =========================
  SYNC.sincronizarPendentes = async function ({ showUI = true } = {}) {
    if (__LOCK) return;
    __LOCK = true;

    try {
      if (!navigator.onLine) {
        setStatus("Sem conexão.");
        if (showUI) alert("Sem conexão à internet. Os dados permanecem salvos com segurança no aparelho.");
        return;
      }

      if (!window.DB_API || typeof window.DB_API.getVistoriasPendentes !== "function") {
        throw new Error("DB_API.getVistoriasPendentes não disponível.");
      }

      if (showUI) setLoading(true, { loadingText: "A ENVIAR PENDÊNCIAS..." });
      setStatus("Verificando pendências no banco local...");

      const pendentes = await window.DB_API.getVistoriasPendentes();
      const total = Array.isArray(pendentes) ? pendentes.length : 0;

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
          log.w("Falha ao sincronizar vistoria:", id, e?.message || e);
        }
      }

      const msg = falhas === 0
        ? `Sincronização concluída: ${ok}/${total} enviadas.`
        : `Sincronização concluída: ${ok}/${total} enviadas, ${falhas} falhas.`;

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

  // Dispara automaticamente quando a conexão é restabelecida
  window.addEventListener("online", () => {
    log.i("Conexão detectada — iniciando auto-sync em segundo plano.");
    SYNC.sincronizarPendentes({ showUI: false });
  });

  window.SYNC = SYNC;
  window.handleSincronizacao = SYNC.handleSincronizacao;

  log.i("✅ sync_manager.js carregado (Pronto para conexão direta com o Neon).");
})();