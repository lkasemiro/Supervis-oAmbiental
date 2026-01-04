// ===========================================
// APP.JS – PWA MODULAR COMPLETO
// ===========================================

// -------------------------------------------
// ESTADO GLOBAL
// -------------------------------------------
const LOCAIS_VISITA = [
  "Selecionar Local...",
  "Rio D'Ouro",
  "São Pedro",
  "Tinguá - Barrelão",
  "Tinguá - Serra Velha",
  "Tinguá - Brava/Macucuo",
  "Tinguá - Colomi",
  "Tinguá - Boa Esperança",
  "Mantiquira - T1",
  "Mantiquira - T2",
  "Xerém I - João Pinto",
  "Xerém II - Entrada",
  "Xerém III - Plano",
  "Xerém III - Registro"
];


const APP_STATE = {
  avaliador: "",
  local: "",
  colaborador: "",
  data: "",

  tipoRoteiro: null, // 'geral' | 'pge' | 'aa'
  roteiro: null,

  respostas: {},   // { idPergunta: valor }
  fotos: {},       // { idPergunta: [fotoId,...] }
  fotoIndex: {}    // { idPergunta: proximoNumero }
};

let mapa = null;
let stream = null;
let currentPhotoInputId = null;
// -------------------------------------------
// ESTADO GEOESPACIAL DA VISITA
// -------------------------------------------
const GEO_STATE = {
  latitude: null,
  longitude: null,
  accuracy: null,
  timestamp: null
};

let userMarker = null;
let accuracyCircle = null;

// URLs criadas para miniaturas do topo (para revogar depois)
let topPhotoUrls = [];

// -------------------------------------------
// UI UTILITIES / NAVEGAÇÃO ENTRE TELAS
// -------------------------------------------
function showScreen(id) {
  const telas = [
    "screen-cadastro",
    "screen-select-roteiro",
    "screen-formulario",
    "screen-final"
  ];

  telas.forEach((t) => {
    const el = document.getElementById(t);
    if (el) el.classList.toggle("hidden", t !== id);
  });
}

let currentScreenIndex = 0;
const SCREEN_FLOW = [
  "screen-cadastro",
  "screen-select-roteiro",
  "screen-formulario",
  "screen-final"
];

function nextScreen() {
  if (currentScreenIndex < SCREEN_FLOW.length - 1) {
    currentScreenIndex++;
    showScreen(SCREEN_FLOW[currentScreenIndex]);
  }
}

function prevScreen() {
  if (currentScreenIndex > 0) {
    currentScreenIndex--;
    showScreen(SCREEN_FLOW[currentScreenIndex]);
  }
}

function showMessage(msg, ok = false) {
  const box = document.getElementById("message-box");
  if (!box) {
    alert(msg);
    return;
  }
  box.textContent = msg;
  box.classList.remove("hidden");
  box.classList.toggle("bg-red-500", !ok);
  box.classList.toggle("bg-green-600", ok);
  setTimeout(() => box.classList.add("hidden"), 3500);
}

function showSpinner() {
  document.getElementById("loading-spinner")?.classList.remove("hidden");
}

function hideSpinner() {
  document.getElementById("loading-spinner")?.classList.add("hidden");
}

// -------------------------------------------
// CADASTRO INICIAL
// -------------------------------------------
function carregarMetaDoLocalStorage() {
  APP_STATE.avaliador = localStorage.getItem("avaliador") || "";
  APP_STATE.local = localStorage.getItem("local") || "";
  APP_STATE.colaborador = localStorage.getItem("colaborador") || "";
  APP_STATE.data = localStorage.getItem("data") || "";

  document.getElementById("avaliador").value = APP_STATE.avaliador;
  document.getElementById("local").value = APP_STATE.local;
  document.getElementById("colaborador").value = APP_STATE.colaborador;
  document.getElementById("data_visita").value = APP_STATE.data;
}

function initLocaisSelect() {
  const sel = document.getElementById("local");
  if (!sel) return;
  sel.innerHTML = LOCAIS_VISITA
    .map((l) => `<option value="${l}">${l}</option>`)
    .join("");
}

function initMapa() {
  const div = document.getElementById("mapa_local");
  if (!div) return;

  const defaultLat = -22.9035;
  const defaultLng = -43.2096;

  mapa = L.map("mapa_local").setView([defaultLat, defaultLng], 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap"
  }).addTo(mapa);

  // Garante render correto quando o mapa aparece
  setTimeout(() => mapa.invalidateSize(), 250);

  // Tenta obter localização automaticamente
  obterLocalizacaoAtual();
}
// -------------------------------------------
// GEOLOCALIZAÇÃO
// -------------------------------------------
function obterLocalizacaoAtual() {
  if (!navigator.geolocation) {
    showMessage("Geolocalização não suportada neste dispositivo.", false);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;

      GEO_STATE.latitude = latitude;
      GEO_STATE.longitude = longitude;
      GEO_STATE.accuracy = accuracy;
      GEO_STATE.timestamp = new Date().toISOString();

      atualizarMapaComLocalizacao(latitude, longitude, accuracy);
    },
    (err) => {
      console.warn("Erro de geolocalização:", err);
      showMessage(
        "Não foi possível obter a localização. Verifique o GPS.",
        false
      );
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    }
  );
}

function atualizarMapaComLocalizacao(lat, lng, accuracy) {
  if (!mapa) return;

  // Remove marcador anterior
  if (userMarker) mapa.removeLayer(userMarker);
  if (accuracyCircle) mapa.removeLayer(accuracyCircle);

  userMarker = L.marker([lat, lng], {
    title: "Local da visita"
  })
    .addTo(mapa)
    .bindPopup("📍 Localização atual da visita")
    .openPopup();

  accuracyCircle = L.circle([lat, lng], {
    radius: accuracy,
    color: "#2563eb",
    fillColor: "#3b82f6",
    fillOpacity: 0.2
  }).addTo(mapa);

  mapa.setView([lat, lng], 16);
}


function initCadastro() {
  const btn = document.getElementById("btn-cadastro-continuar");
  if (!btn) return;

  btn.onclick = () => {
    APP_STATE.avaliador = document.getElementById("avaliador").value.trim();
    APP_STATE.local = document.getElementById("local").value.trim();
    APP_STATE.colaborador = document
      .getElementById("colaborador")
      .value.trim();
    APP_STATE.data = document.getElementById("data_visita").value.trim();

    if (
      !APP_STATE.avaliador ||
      !APP_STATE.local ||
      APP_STATE.local === "Selecionar Local..." ||
      !APP_STATE.colaborador ||
      !APP_STATE.data
    ) {
      showMessage("Preencha todos os campos.", false);
      return;
    }

    localStorage.setItem("avaliador", APP_STATE.avaliador);
    localStorage.setItem("local", APP_STATE.local);
    localStorage.setItem("colaborador", APP_STATE.colaborador);
    localStorage.setItem("data", APP_STATE.data);

    showMessage("Informações salvas! Próxima etapa.", true);
    currentScreenIndex = 1;
    showScreen("screen-select-roteiro");

    // Guarda coordenadas no estado da visita (se disponíveis)
if (GEO_STATE.latitude && GEO_STATE.longitude) {
  APP_STATE.coordenadas = {
    lat: GEO_STATE.latitude,
    lng: GEO_STATE.longitude,
    accuracy: GEO_STATE.accuracy,
    timestamp: GEO_STATE.timestamp
  };
}

  };
}

// -------------------------------------------
// SELEÇÃO DO ROTEIRO
// -------------------------------------------
function voltarParaCadastro() {
  currentScreenIndex = 0;
  showScreen("screen-cadastro");
}

async function selectRoteiro(tipo) {
  APP_STATE.tipoRoteiro = tipo;
  APP_STATE.roteiro = ROTEIROS[tipo]; // definido em roteiros.js
  APP_STATE.respostas = {};
  APP_STATE.fotos = {};
  APP_STATE.fotoIndex = {};

  showSpinner();
  await initIndexedDB(tipo); // definido em indexedDB.js
  hideSpinner();

  const label = document.getElementById("roteiro-atual-label");
  if (label) {
    label.textContent =
      tipo === "pge"
        ? "Programa de Gerenciamento de Efluentes (PGE)"
        : tipo === "geral"
        ? "Formulário Geral"
        : "Acidentes Ambientais";
  }

  montarSecoes();

  if (tipo === "pge") {
    montarLocaisPGE();
    document.getElementById("local_pge_box")?.classList.remove("hidden");
    document.getElementById("sublocal_box")?.classList.remove("hidden");
  } else {
    document.getElementById("local_pge_box")?.classList.add("hidden");
    document.getElementById("sublocal_box")?.classList.add("hidden");
  }

  renderFormulario();
  currentScreenIndex = 2;
  showScreen("screen-formulario");
}

// -------------------------------------------
// PGE: LOCAL + SUBLOCAL
// -------------------------------------------
function montarLocaisPGE() {
  const sel = document.getElementById("local_pge_select");
  const roteiro = APP_STATE.roteiro || [];
  if (!sel) return;

  const locais = [...new Set(roteiro.map((p) => p.Local))]
    .filter(Boolean)
    .sort();

  sel.innerHTML = `
    <option value="">Selecione o local</option>
    ${locais.map((l) => `<option value="${l}">${l}</option>`).join("")}
  `;

  sel.onchange = () => {
    montarSublocaisPGE();
    renderFormulario();
  };

  const subSel = document.getElementById("sublocal_select");
  if (subSel) {
    subSel.innerHTML = `<option value="">Selecione o local primeiro</option>`;
  }
}

function montarSublocaisPGE() {
  const selLocal = document.getElementById("local_pge_select");
  const selSub = document.getElementById("sublocal_select");
  const roteiro = APP_STATE.roteiro || [];
  if (!selLocal || !selSub) return;

  const local = selLocal.value;
  if (!local) {
    selSub.innerHTML = `<option value="">Selecione o local primeiro</option>`;
    return;
  }

  const subs = [
    ...new Set(
      roteiro.filter((p) => p.Local === local).map((p) => p.Sublocal)
    )
  ]
    .filter(Boolean)
    .sort();

  selSub.innerHTML = `
    <option value="">Selecione o sublocal</option>
    ${subs.map((s) => `<option value="${s}">${s}</option>`).join("")}
  `;

  selSub.onchange = () => renderFormulario();
}

// -------------------------------------------
// SEÇÕES
// -------------------------------------------
function montarSecoes() {
  const sel = document.getElementById("secao_select");
  const roteiro = APP_STATE.roteiro || [];
  if (!sel) return;

  const secoes = [
    ...new Set(roteiro.map((p) => p.Secao || p["Seção"] || p.secao))
  ].filter(Boolean);

  sel.innerHTML = `
    <option value="">Todas as seções</option>
    ${secoes.map((s) => `<option value="${s}">${s}</option>`).join("")}
  `;

  sel.onchange = () => renderFormulario(sel.value || null);
}

// -------------------------------------------
// RENDERIZAÇÃO DO FORMULÁRIO
// -------------------------------------------
function renderFormulario(secaoFiltrada = null) {
  const container = document.getElementById("conteudo_formulario");
  if (!container) return;
  container.innerHTML = "";

  const roteiro = APP_STATE.roteiro || [];
  let perguntas = roteiro;

  // 1. Filtro PGE
  if (APP_STATE.tipoRoteiro === "pge") {
    const selLocal = document.getElementById("local_pge_select");
    const selSub = document.getElementById("sublocal_select");
    const local = selLocal ? selLocal.value : "";
    const sublocal = selSub ? selSub.value : "";

    if (!local) {
      container.innerHTML =
        `<div class="bg-gray-100 text-gray-500 text-center py-10 rounded-xl shadow">` +
        `Selecione o local do PGE.</div>`;
      atualizarFotosTopo(); // limpa topo
      return;
    }
    perguntas = perguntas.filter((p) => p.Local === local);

    if (!sublocal) {
      container.innerHTML =
        `<div class="bg-gray-100 text-gray-500 text-center py-10 rounded-xl shadow">` +
        `Selecione o sublocal.</div>`;
      atualizarFotosTopo(); // limpa topo
      return;
    }
    perguntas = perguntas.filter((p) => p.Sublocal === sublocal);
  }

  // 2. Filtro por Seção
  if (secaoFiltrada) {
    perguntas = perguntas.filter(
      (p) => (p.Secao || p["Seção"] || p.secao) === secaoFiltrada
    );
  }

  if (!perguntas.length) {
    container.innerHTML =
      `<div class="bg-gray-100 text-gray-500 text-center py-10 rounded-xl shadow">` +
      `Nenhuma pergunta encontrada.</div>`;
    atualizarFotosTopo();
    return;
  }

  const card = document.createElement("div");
  card.className = "bg-white rounded-xl shadow p-4";

  perguntas.forEach((p) => {
    const id = p.id;
    const g = document.createElement("div");
    g.className = "form-group mb-6 pb-4 border-b";
    g.id = `group_${id}`;

    const imgSrc = p.ImagemApoio || p["Imagem Apoio"] || "";
    if (imgSrc) {
      const img = document.createElement("img");
      img.src = imgSrc;
      img.className =
        "mb-3 max-h-48 rounded border shadow object-cover support-img";
      g.appendChild(img);
    }

    const lb = document.createElement("label");
    lb.className = "block font-medium text-gray-800 mb-1";
    lb.textContent = p.Pergunta;
    g.appendChild(lb);

    const inputEl = criarInputParaPergunta(p);
    g.appendChild(inputEl);

    card.appendChild(g);
  });

  container.appendChild(card);
  applyConditionalLogic();

  if (APP_STATE.tipoRoteiro === "pge") {
    atualizarFotosTopo();
  } else {
    limparFotosTopo();
  }
}

// -------------------------------------------
// INPUTS
// -------------------------------------------
function criarInputParaPergunta(p) {
  const tipoRaw = p.TipoInput || p.Tipoinput || p.tipoinput || "";
  const tipo = tipoRaw.toLowerCase();
  const idPerg = p.id;
  const valorSalvo = APP_STATE.respostas[idPerg] || "";
  const wrapper = document.createElement("div");
  wrapper.className = "mt-2";

  const opcoesStr =
    p.Opcoes || p["Opções"] || p.opcoes || p.opcao || p.opções || "";
  const opcoes = opcoesStr
    .split(";")
    .map((o) => o.trim())
    .filter(Boolean);

  if (tipo === "radio") {
    opcoes.forEach((op) => {
      const lbl = document.createElement("label");
      lbl.className = "inline-flex items-center mr-4 mb-1";

      const inp = document.createElement("input");
      inp.type = "radio";
      inp.name = idPerg;
      inp.value = op;
      inp.className = "mr-1 form-radio text-blue-600";
      if (valorSalvo === op) inp.checked = true;

      inp.addEventListener("change", () => autosave(idPerg, op));

      lbl.appendChild(inp);
      lbl.appendChild(document.createTextNode(op));
      wrapper.appendChild(lbl);
    });
  } else if (tipo === "checkboxgroup") {
    const marcados = String(valorSalvo || "")
      .split(";")
      .map((v) => v.trim())
      .filter(Boolean);

    opcoes.forEach((op) => {
      const lbl = document.createElement("label");
      lbl.className = "block mb-1";

      const inp = document.createElement("input");
      inp.type = "checkbox";
      inp.name = idPerg;
      inp.value = op;
      inp.className = "mr-2 form-checkbox text-blue-600";
      if (marcados.includes(op)) inp.checked = true;

      inp.addEventListener("change", () => {
        const selecionados = [
          ...document.querySelectorAll(`input[name='${idPerg}']:checked`)
        ].map((i) => i.value);
        autosave(idPerg, selecionados.join(";"));
      });

      lbl.appendChild(inp);
      lbl.appendChild(document.createTextNode(op));
      wrapper.appendChild(lbl);
    });
  } else if (tipo === "textarea") {
    const ta = document.createElement("textarea");
    ta.rows = 3;
    ta.className = "w-full border rounded p-2 text-sm";
    ta.value = valorSalvo;
    ta.addEventListener("input", () => autosave(idPerg, ta.value));
    wrapper.appendChild(ta);
  } else if (tipo === "number") {
    const inp = document.createElement("input");
    inp.type = "number";
    inp.className = "w-32 border rounded p-2 text-sm";
    inp.value = valorSalvo;
    inp.addEventListener("input", () => autosave(idPerg, inp.value));
    wrapper.appendChild(inp);
  } else if (tipo === "file") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Abrir Câmera";
    btn.className =
      "bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded text-sm transition btn";
    btn.addEventListener("click", () => abrirCamera(idPerg));
    wrapper.appendChild(btn);

    const lista = document.createElement("div");
    lista.id = `fotos_${idPerg}`;
    lista.className = "mt-2 space-y-1 text-xs text-gray-600 foto-lista-item";
    wrapper.appendChild(lista);

    atualizarListaFotos(idPerg);
  } else {
    const inp = document.createElement("input");
    inp.type = "text";
    inp.className = "w-full border rounded p-2 text-sm";
    inp.value = valorSalvo;
    inp.addEventListener("input", () => autosave(idPerg, inp.value));
    wrapper.appendChild(inp);
  }

  return wrapper;
}

// -------------------------------------------
// AUTOSAVE – RESPOSTAS
// -------------------------------------------
function autosave(idPergunta, valor) {
  APP_STATE.respostas[idPergunta] = valor;
  saveAnswerToDB(idPergunta, valor); // em indexedDB.js
  applyConditionalLogic();
}

// -------------------------------------------
// LÓGICA CONDICIONAL
// -------------------------------------------
function applyConditionalLogic() {
  const roteiro = APP_STATE.roteiro || [];
  roteiro.forEach((p) => {
    const cond = p.Condicao || p["Condição"] || p.condicao || p.cond || "";
    const pai = p.Pai || p.pai || "";

    if (!cond || !pai) return;

    const groupEl = document.getElementById(`group_${p.id}`);
    if (!groupEl) return;

    const valorPai = APP_STATE.respostas[pai];

    if (valorPai === cond) {
      groupEl.classList.remove("hidden");
    } else {
      groupEl.classList.add("hidden");
    }
  });
}

// -------------------------------------------
// CÂMERA E FOTOS
// -------------------------------------------
function abrirCamera(idPergunta) {
  currentPhotoInputId = idPergunta;
  const modal = document.getElementById("camera-modal");
  if (!modal) {
    showMessage("Modal de câmera não encontrado no HTML.", false);
    return;
  }
  modal.classList.remove("hidden");
  startCamera();
}

async function startCamera() {
  const video = document.getElementById("video");
  const placeholder = document.getElementById("camera-placeholder");
  const btnText = document.getElementById("camera-btn-text");
  const captureBtn = document.getElementById("capture-photo");
  if (!video || !placeholder || !btnText || !captureBtn) return;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
  } catch (err) {
    showMessage("Não foi possível acessar a câmera.", false);
    console.error(err);
    return;
  }

  video.srcObject = stream;
  video.classList.remove("hidden");
  placeholder.classList.add("hidden");
  btnText.textContent = "Desligar Câmera";
  captureBtn.disabled = false;
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  const video = document.getElementById("video");
  const placeholder = document.getElementById("camera-placeholder");
  const btnText = document.getElementById("camera-btn-text");
  const captureBtn = document.getElementById("capture-photo");
  if (video) video.classList.add("hidden");
  if (placeholder) placeholder.classList.remove("hidden");
  if (btnText) btnText.textContent = "Iniciar Câmera";
  if (captureBtn) captureBtn.disabled = true;
}

function closeCameraModal() {
  const modal = document.getElementById("camera-modal");
  if (modal) modal.classList.add("hidden");
  stopCamera();
}

document.getElementById("start-camera")?.addEventListener("click", () => {
  if (stream) {
    stopCamera();
  } else {
    startCamera();
  }
});

document.getElementById("close-modal")?.addEventListener("click", closeCameraModal);

document.getElementById("capture-photo")?.addEventListener("click", () => {
  const video = document.getElementById("video");
  const canvas = document.getElementById("canvas");
  if (!video || !canvas || !stream) {
    showMessage("Câmera não está ativa.", false);
    return;
  }

  const ctx = canvas.getContext("2d");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.toBlob(
    (blob) => {
      if (!blob) {
        showMessage("Falha ao capturar imagem.", false);
        return;
      }
      salvarFotoBlob(currentPhotoInputId, blob);
    },
    "image/jpeg",
    0.7
  );
});

function salvarFotoBlob(idPergunta, blob) {
  if (!idPergunta) return;

  if (!APP_STATE.fotoIndex[idPergunta]) APP_STATE.fotoIndex[idPergunta] = 1;
  const idx = APP_STATE.fotoIndex[idPergunta]++;
  const fotoId = `${idPergunta}_foto_${String(idx).padStart(3, "0")}`;

  savePhotoToDB(fotoId, blob, idPergunta); // indexedDB.js

  if (!APP_STATE.fotos[idPergunta]) APP_STATE.fotos[idPergunta] = [];
  APP_STATE.fotos[idPergunta].push(fotoId);

  atualizarListaFotos(idPergunta);
  showMessage(`Foto ${fotoId} salva!`, true);

  if (APP_STATE.tipoRoteiro === "pge") {
    atualizarFotosTopo();
  }
}

function atualizarListaFotos(idPergunta) {
  const box = document.getElementById(`fotos_${idPergunta}`);
  if (!box) return;
  const arr = APP_STATE.fotos[idPergunta] || [];
  box.innerHTML = arr
    .map((id) => `<div class="foto-lista-item">📸 ${id}</div>`)
    .join("");
}

// -------------------------------------------
// FOTOS NO TOPO (PGE – por Sublocal)
// -------------------------------------------
function limparFotosTopo() {
  const topo = document.getElementById("fotos_sublocal_topo");
  if (!topo) return;

  topPhotoUrls.forEach((u) => URL.revokeObjectURL(u));
  topPhotoUrls = [];
  topo.innerHTML = "";
  topo.classList.add("hidden");
}

async function atualizarFotosTopo() {
  const topo = document.getElementById("fotos_sublocal_topo");
  if (!topo) return;

  limparFotosTopo();

  if (APP_STATE.tipoRoteiro !== "pge") return;

  const selLocal = document.getElementById("local_pge_select");
  const selSub = document.getElementById("sublocal_select");
  if (!selLocal || !selSub) return;

  const local = selLocal.value;
  const sublocal = selSub.value;
  if (!local || !sublocal) return;

  const fotos = await getAllPhotosFromDB(); // {fotoId, tipo, idPergunta, blob}
  if (!fotos || !fotos.length) return;

  const perguntas = APP_STATE.roteiro || [];

  const fotosFiltradas = fotos.filter((f) => {
    const p = perguntas.find((q) => q.id === f.idPergunta);
    return p && p.Local === local && p.Sublocal === sublocal;
  });

  if (!fotosFiltradas.length) return;

  topo.classList.remove("hidden");

  fotosFiltradas.forEach((f) => {
    const url = URL.createObjectURL(f.blob);
    topPhotoUrls.push(url);

    const img = document.createElement("img");
    img.src = url;
    img.alt = f.fotoId;
    img.className =
      "h-20 w-auto rounded-md border shadow-sm object-cover flex-shrink-0";
    topo.appendChild(img);
  });
}

// -------------------------------------------
// XLSX ÚNICO – GERAL + PGE + AA COM FOTOS
// -------------------------------------------
async function exportarXlsxCompleto() {
  if (typeof ExcelJS === "undefined") {
    showMessage("Biblioteca ExcelJS não foi carregada.", false);
    return;
  }

  if (typeof getAllAnswersAndPhotos !== "function") {
    showMessage(
      "Função getAllAnswersAndPhotos() não está implementada no indexedDB.js.",
      false
    );
    return;
  }

  try {
    showSpinner();

    const dados = await getAllAnswersAndPhotos(); // em indexedDB.js
    const workbook = new ExcelJS.Workbook();

    const tipos = ["geral", "pge", "aa"];
    const nomesAbas = {
      geral: "Geral",
      pge: "PGE",
      aa: "Acid. Ambientais"
    };

    for (const tipo of tipos) {
      const ws = workbook.addWorksheet(nomesAbas[tipo]);

      ws.columns = [
        { header: "local", key: "local", width: 25 },
        { header: "secao", key: "secao", width: 40 },
        { header: "formulario", key: "formulario", width: 18 },
        { header: "id_pergunta", key: "id", width: 15 },
        { header: "pergunta", key: "pergunta", width: 60 },
        { header: "resposta", key: "resposta", width: 40 },
        { header: "fotos", key: "fotos", width: 30 }
      ];

      const roteiro = ROTEIROS[tipo] || [];
      const respostasTipo = dados[tipo]?.respostas || {};
      const fotosTipo = dados[tipo]?.fotos || {};

      for (const p of roteiro) {
        const id = p.id;
        const secaoBase = p.Secao || p["Seção"] || p.secao || "";
        let secaoStr = secaoBase;

        if (tipo === "pge") {
          const sub = p.Sublocal || "";
          if (sub) secaoStr = `${sub} / ${secaoBase}`;
        }

        const resposta = respostasTipo[id] || "";
        const fotosArr = fotosTipo[id] || [];
        const fotosIds = fotosArr.map((f) => f.fotoId).join("; ");

        const row = ws.addRow({
          local: APP_STATE.local,
          secao: secaoStr,
          formulario: tipo,
          id: id,
          pergunta: p.Pergunta || "",
          resposta: resposta,
          fotos: fotosIds
        });

        const primeiraFoto = fotosArr[0];
        if (primeiraFoto && primeiraFoto.blob) {
          const buffer = await primeiraFoto.blob.arrayBuffer();
          const imageId = workbook.addImage({
            buffer: buffer,
            extension: "jpeg"
          });

          const rowIndex = row.number - 1;
          const colIndex = 6; // 0-based

          ws.addImage(imageId, {
            tl: { col: colIndex, row: rowIndex },
            ext: { width: 120, height: 120 }
          });

          ws.getRow(row.number).height = 90;
        }
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });

    const localSafe = (APP_STATE.local || "local").replace(/\s+/g, "_");
    const dataSafe = APP_STATE.data || "data";

    const nomeArquivo = `visita_completa_${localSafe}_${dataSafe}.xlsx`;
    saveAs(blob, nomeArquivo);

    showMessage("Planilha XLSX com fotos gerada com sucesso!", true);
  } catch (err) {
    console.error(err);
    showMessage("Erro ao gerar XLSX com fotos.", false);
  } finally {
    hideSpinner();
  }
}

// -------------------------------------------
// EXPORTAÇÃO – CSV (formulário atual)
// -------------------------------------------
function baixarRelatorioCSV() {
  if (!APP_STATE.roteiro) {
    showMessage("Nenhum roteiro selecionado.", false);
    return;
  }

  const cabecalho = [
    "local_visita",
    "data_visita",
    "avaliador",
    "colaborador",
    "tipo_formulario",
    "local_roteiro",
    "sublocal",
    "secao",
    "id_pergunta",
    "pergunta",
    "resposta"
  ];

  const linhas = APP_STATE.roteiro.map((p) => {
    const secao = p.Secao || p["Seção"] || p.secao || "";
    const localR = p.Local || "";
    const sublocalR = p.Sublocal || "";
    const id = p.id;

    const pergunta = (p.Pergunta || "").replace(/"/g, '""');
    const resposta = String(APP_STATE.respostas[p.id] || "").replace(
      /"/g,
      '""'
    );

    return [
      `"${APP_STATE.local}"`,
      `"${APP_STATE.data}"`,
      `"${APP_STATE.avaliador}"`,
      `"${APP_STATE.colaborador}"`,
      `"${APP_STATE.tipoRoteiro}"`,
      `"${localR}"`,
      `"${sublocalR}"`,
      `"${secao}"`,
      `"${id}"`,
      `"${pergunta}"`,
      `"${resposta}"`
    ].join(",");
  });

  const csv = cabecalho.join(",") + "\n" + linhas.join("\n");
  const blob = new Blob(["\ufeff" + csv], {
    type: "text/csv;charset=utf-8;"
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  const localSafe = (APP_STATE.local || "local").replace(/\s+/g, "_");
  const dataSafe = APP_STATE.data || "data";
  a.href = url;
  a.download = `respostas_${localSafe}_${dataSafe}_${APP_STATE.tipoRoteiro}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showMessage("Exportação pronta! CSV compatível com R.", true);
}

// -------------------------------------------
// EXPORTAÇÃO – ZIP DE FOTOS (formulário atual)
// -------------------------------------------
async function baixarFotosZip() {
  try {
    showSpinner();
    const fotos = await getAllPhotosFromDB(); // tipo atual
    if (!fotos || !fotos.length) {
      showMessage("Não há fotos salvas neste roteiro.", false);
      return;
    }

    const zip = new JSZip();
    const pasta = zip.folder("fotos");
    fotos.forEach((f) => {
      const nome = `FOTO_${f.fotoId}.jpeg`;
      pasta.file(nome, f.blob);
    });

    const conteudo = await zip.generateAsync({ type: "blob" });
    const localSafe = (APP_STATE.local || "local").replace(/\s+/g, "_");
    const dataSafe = APP_STATE.data || "data";

    saveAs(
      conteudo,
      `fotos_${localSafe}_${dataSafe}_${APP_STATE.tipoRoteiro}.zip`
    );
    showMessage("ZIP de fotos gerado com sucesso!", true);
  } catch (e) {
    console.error(e);
    showMessage("Erro ao gerar ZIP de fotos.", false);
  } finally {
    hideSpinner();
  }
}

// -------------------------------------------
// RECOMEÇAR (somente formulário atual)
// -------------------------------------------
async function recomeçar() {
  if (!APP_STATE.tipoRoteiro) return;
  if (
    !confirm(
      "Deseja descartar as respostas deste formulário e reiniciar o mesmo tipo?"
    )
  )
    return;

  await clearFormData(APP_STATE.tipoRoteiro); // indexedDB.js

  APP_STATE.roteiro = ROTEIROS[APP_STATE.tipoRoteiro];
  APP_STATE.respostas = {};
  APP_STATE.fotos = {};
  APP_STATE.fotoIndex = {};

  renderFormulario();
  showMessage("Formulário reiniciado.", true);
}

// -------------------------------------------
// BOTÕES – TELA FINAL / GERAL
// -------------------------------------------
function initFormButtons() {
  const btnFinalVoltar = document.getElementById("final-voltar");
  if (btnFinalVoltar) {
    btnFinalVoltar.onclick = () => {
      currentScreenIndex = 2;
      showScreen("screen-formulario");
    };
  }

  const btnXlsx = document.getElementById("btn-xlsx-completo");
  if (btnXlsx) {
    btnXlsx.onclick = () => exportarXlsxCompleto();
  }

  const btnFinalizarVisita = document.getElementById("finalizar-visita");
  if (btnFinalizarVisita) {
    btnFinalizarVisita.onclick = async () => {
      if (
        !confirm(
          "Finalizar visita? Todos os dados (Geral, PGE e AA) serão apagados."
        )
      )
        return;

      await clearAllData(); // indexedDB.js

      APP_STATE.tipoRoteiro = null;
      APP_STATE.roteiro = null;
      APP_STATE.respostas = {};
      APP_STATE.fotos = {};
      APP_STATE.fotoIndex = {};
      APP_STATE.local = "";
      APP_STATE.data = "";

      localStorage.removeItem("local");
      localStorage.removeItem("data");

      limparFotosTopo();
      currentScreenIndex = 0;
      showScreen("screen-cadastro");

      showMessage("Visita finalizada! Você pode iniciar uma nova.", true);
    };
  }
}

// -------------------------------------------
// INIT GERAL
// -------------------------------------------
function initApp() {
  initLocaisSelect();
  carregarMetaDoLocalStorage();
  initMapa();
  initCadastro();
  initFormButtons();

  showScreen("screen-cadastro");
}

// ------------------------------------------------------------------
// Funções globais para uso em onclick="" no HTML
// ------------------------------------------------------------------
window.selectRoteiro = selectRoteiro;
window.voltarParaCadastro = voltarParaCadastro;
window.recomeçar = recomeçar;
window.nextScreen = nextScreen;
window.prevScreen = prevScreen;

// Inicialização da aplicação após o carregamento total
window.addEventListener("load", initApp);
