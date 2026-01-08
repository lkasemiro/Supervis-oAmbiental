// ===========================================
// APP.JS – PWA MODULAR OTIMIZADO (V13)
// ===========================================

const LOCAIS_VISITA = [
  "Selecionar Local...", "Rio D'Ouro", "São Pedro", "Tinguá - Barrelão",
  "Tinguá - Serra Velha", "Tinguá - Brava/Macucuo", "Tinguá - Colomi",
  "Tinguá - Boa Esperança", "Mantiquira - T1", "Mantiquira - T2",
  "Xerém I - João Pinto", "Xerém II - Entrada", "Xerém III - Plano", "Xerém III - Registro"
];

const APP_STATE = {
  avaliador: "",
  local: "",
  colaborador: "",
  data_visita: "",
  eventosEspaciais: [],
  tipoRoteiro: null,
  roteiro: [],
  respostas: {},
  fotos: {},
  fotoIndex: {}
};

let mapa = null;
let userMarker = null;
let accuracyCircle = null;

const GEO_STATE = {
  latitude: null,
  longitude: null,
  accuracy: null,
  timestamp: null
};

// -------------------------------------------
// UI
// -------------------------------------------
const showScreen = (id) => {
  ["screen-cadastro", "screen-select-roteiro", "screen-formulario", "screen-final"]
    .forEach(s => {
      const el = document.getElementById(s);
      if (el) el.classList.toggle("hidden", s !== id);
    });
};

const showMessage = (msg, ok = false) => {
  const box = document.getElementById("message-box");
  if (!box) return alert(msg);
  box.textContent = msg;
  box.className = `fixed top-4 left-1/2 -translate-x-1/2 p-4 rounded shadow-lg z-50
    ${ok ? "bg-green-600" : "bg-red-600"} text-white`;
  box.classList.remove("hidden");
  setTimeout(() => box.classList.add("hidden"), 3000);
};

// -------------------------------------------
// GEOLOCALIZAÇÃO
// -------------------------------------------
function obterLocalizacaoAtual() {
  if (!navigator.geolocation) {
    showMessage("GPS não suportado.", false);
    return;
  }

  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude, longitude, accuracy } = pos.coords;

    Object.assign(GEO_STATE, {
      latitude,
      longitude,
      accuracy,
      timestamp: new Date().toISOString()
    });

    // evita duplicação excessiva
    if (!APP_STATE.eventosEspaciais.length) {
      APP_STATE.eventosEspaciais.push({
        ...GEO_STATE,
        contexto: APP_STATE.tipoRoteiro
      });
    }

    if (mapa) {
      if (userMarker) mapa.removeLayer(userMarker);
      if (accuracyCircle) mapa.removeLayer(accuracyCircle);

      userMarker = L.marker([latitude, longitude])
        .addTo(mapa)
        .bindPopup("Posição registrada")
        .openPopup();

      accuracyCircle = L.circle([latitude, longitude], {
        radius: accuracy,
        color: "#2563eb"
      }).addTo(mapa);

      mapa.setView([latitude, longitude], 16);
    }
  }, err => {
    console.warn("Erro GPS:", err);
    showMessage("Erro ao obter localização.", false);
  }, { enableHighAccuracy: true });
}

// -------------------------------------------
// CADASTRO
// -------------------------------------------
function initCadastro() {
  const btn = document.getElementById("btn-cadastro-continuar");
  if (!btn) return;

  btn.onclick = () => {
    const campos = ["avaliador", "local", "colaborador", "data_visita"];
    const valores = {};

    for (const c of campos) {
      const el = document.getElementById(c);
      valores[c] = el ? el.value.trim() : "";
    }

    if (Object.values(valores).some(v => !v || v === "Selecionar Local...")) {
      showMessage("Preencha todos os campos corretamente.", false);
      return;
    }

    Object.assign(APP_STATE, valores);
    campos.forEach(c => localStorage.setItem(c, valores[c]));

    showScreen("screen-select-roteiro");
    obterLocalizacaoAtual();
  };
}

// -------------------------------------------
// ROTEIROS
// -------------------------------------------
async function selectRoteiro(tipo) {
  try {
    APP_STATE.tipoRoteiro = tipo;

    const dados = window.ROTEIROS_DATA?.[tipo];
    if (!Array.isArray(dados)) {
      showMessage("Roteiro não encontrado.", false);
      return;
    }

    APP_STATE.roteiro = dados;

    if (typeof initIndexedDB === "function") {
      await initIndexedDB(tipo);
    }

    const labels = { pge: "PGE", geral: "Geral", aa: "Acidentes Ambientais" };
    const label = document.getElementById("roteiro-atual-label");
    if (label) label.textContent = labels[tipo] || tipo;

    renderFormulario();
    showScreen("screen-formulario");
  } catch (e) {
    console.error(e);
    showMessage("Erro ao carregar roteiro.", false);
  }
}

// -------------------------------------------
// FORMULÁRIO
// -------------------------------------------
function renderFormulario(secao = null) {
  const container = document.getElementById("conteudo_formulario");
  if (!container) return;

  let perguntas = [...APP_STATE.roteiro];

  if (secao) {
    perguntas = perguntas.filter(p => p.secao === secao);
  }

  const frag = document.createDocumentFragment();

  perguntas.forEach(p => {
    const div = document.createElement("div");
    div.id = `group_${p.id}`;
    div.className = "mb-6 p-4 bg-white rounded shadow border-l-4 border-blue-500";

    div.innerHTML = `
      <label class="block font-bold mb-2">${p.pergunta}</label>
      <div id="input_${p.id}"></div>
    `;

    div.querySelector(`#input_${p.id}`)
      .appendChild(criarInputParaPergunta(p));

    frag.appendChild(div);
  });

  container.innerHTML = "";
  container.appendChild(frag);

  applyConditionalLogic(perguntas);
}

function criarInputParaPergunta(p) {
  const tipo = (p.tipo || "text").toLowerCase();
  const valor = APP_STATE.respostas[p.id] || "";
  const wrapper = document.createElement("div");

  if (tipo === "radio" || tipo === "checkboxgroup") {
    wrapper.innerHTML = p.opcoes.map(op => `
      <label class="inline-flex items-center mr-4 mt-2">
        <input type="${tipo === "radio" ? "radio" : "checkbox"}"
               name="${p.id}"
               value="${op}"
               ${valor.split(";").includes(op) ? "checked" : ""}>
        <span class="ml-2">${op}</span>
      </label>
    `).join("");

    wrapper.querySelectorAll("input").forEach(i => {
      i.onchange = () => {
        const marcado = [...wrapper.querySelectorAll("input:checked")]
          .map(c => c.value)
          .join(";");
        autosave(p.id, marcado);
      };
    });

  } else if (tipo === "textarea") {
    const t = document.createElement("textarea");
    t.value = valor;
    t.className = "w-full border rounded p-2";
    t.oninput = e => autosave(p.id, e.target.value);
    wrapper.appendChild(t);

  } else {
    const i = document.createElement("input");
    i.type = tipo;
    i.value = valor;
    i.className = "w-full border rounded p-2";
    i.oninput = e => autosave(p.id, e.target.value);
    wrapper.appendChild(i);
  }

  return wrapper;
}

function autosave(id, valor) {
  APP_STATE.respostas[id] = valor;
  if (typeof saveAnswerToDB === "function") {
    saveAnswerToDB(id, valor);
  }
  applyConditionalLogic(APP_STATE.roteiro);
}

function applyConditionalLogic(perguntas = []) {
  perguntas.forEach(p => {
    const cond = p.condicao || p.Condicao;
    const pai = p.pai || p.Pai;
    if (!cond || !pai) return;

    const resposta = APP_STATE.respostas[pai] || "";
    const ativo = resposta.split(";").includes(cond);

    const el = document.getElementById(`group_${p.id}`);
    if (el) el.classList.toggle("hidden", !ativo);
  });
}

// -------------------------------------------
// MAPA OFFLINE (Leaflet)
// -------------------------------------------
function initMapa() {
  if (mapa) return;

  mapa = L.map("mapa").setView([-22.9068, -43.1729], 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap",
    crossOrigin: true
  }).addTo(mapa);
}

// -------------------------------------------
// INIT
// -------------------------------------------
function initApp() {
  const sel = document.getElementById("local");
  if (sel) sel.innerHTML = LOCAIS_VISITA.map(l => `<option>${l}</option>`).join("");

  ["avaliador", "local", "colaborador", "data_visita"].forEach(f => {
    const v = localStorage.getItem(f);
    if (v && document.getElementById(f)) {
      document.getElementById(f).value = v;
      APP_STATE[f] = v;
    }
  });

  initMapa();
  initCadastro();
  showScreen("screen-cadastro");
}

window.selectRoteiro = selectRoteiro;
document.addEventListener("DOMContentLoaded", initApp);
