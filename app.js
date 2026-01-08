// ===========================================
// APP.JS – PWA MODULAR OTIMIZADO (V11)
// ===========================================

const LOCAIS_VISITA = [
  "Selecionar Local...", "Rio D'Ouro", "São Pedro", "Tinguá - Barrelão", 
  "Tinguá - Serra Velha", "Tinguá - Brava/Macucuo", "Tinguá - Colomi", 
  "Tinguá - Boa Esperança", "Mantiquira - T1", "Mantiquira - T2", 
  "Xerém I - João Pinto", "Xerém II - Entrada", "Xerém III - Plano", "Xerém III - Registro"
];

const APP_STATE = {
  avaliador: "", local: "", colaborador: "", data: "",
  eventosEspaciais: [], tipoRoteiro: null, roteiro: null,
  respostas: {}, fotos: {}, fotoIndex: {}
};

let mapa = null, stream = null, currentPhotoInputId = null;
const GEO_STATE = { latitude: null, longitude: null, accuracy: null, timestamp: null };
let userMarker = null, accuracyCircle = null, topPhotoUrls = [];

// --- NAVEGAÇÃO E UI ---
const showScreen = (id) => {
  ["screen-cadastro", "screen-select-roteiro", "screen-formulario", "screen-final"]
    .forEach(t => document.getElementById(t)?.classList.toggle("hidden", t !== id));
};

const showMessage = (msg, ok = false) => {
  const box = document.getElementById("message-box");
  if (!box) return alert(msg);
  box.textContent = msg;
  box.className = `fixed top-4 left-1/2 -translate-x-1/2 p-4 rounded shadow-lg z-50 ${ok ? 'bg-green-600' : 'bg-red-500'} text-white`;
  box.classList.remove("hidden");
  setTimeout(() => box.classList.add("hidden"), 3000);
};

// --- GEOLOCALIZAÇÃO ---
function obterLocalizacaoAtual() {
  if (!navigator.geolocation) return showMessage("GPS não suportado", false);

  navigator.geolocation.getCurrentPosition((pos) => {
    const { latitude, longitude, accuracy } = pos.coords;
    Object.assign(GEO_STATE, { latitude, longitude, accuracy, timestamp: new Date().toISOString() });

    APP_STATE.eventosEspaciais.push({ ...GEO_STATE, contexto: APP_STATE.tipoRoteiro });
    
    if (mapa) {
      if (userMarker) mapa.removeLayer(userMarker);
      if (accuracyCircle) mapa.removeLayer(accuracyCircle);
      userMarker = L.marker([latitude, longitude]).addTo(mapa).bindPopup("Sua posição").openPopup();
      accuracyCircle = L.circle([latitude, longitude], { radius: accuracy, color: '#3b82f6' }).addTo(mapa);
      mapa.setView([latitude, longitude], 16);
    }
  }, (err) => console.warn("Erro GPS:", err), { enableHighAccuracy: true });
}

// --- CADASTRO ---
function initCadastro() {
  const btn = document.getElementById("btn-cadastro-continuar");
  if (!btn) return;

  btn.onclick = () => {
    const fields = ["avaliador", "local", "colaborador", "data_visita"];
    const values = fields.reduce((acc, f) => ({ ...acc, [f]: document.getElementById(f).value.trim() }), {});

    if (Object.values(values).some(v => !v || v === "Selecionar Local...")) {
      return showMessage("Preencha todos os campos corretamente.", false);
    }

    Object.assign(APP_STATE, values);
    fields.forEach(f => localStorage.setItem(f, values[f]));
    
    showScreen("screen-select-roteiro");
  }; // Fechamento corrigido aqui
}

// --- ROTEIROS E FORMULÁRIO ---
async function selectRoteiro(tipo) {
  APP_STATE.tipoRoteiro = tipo;
  // Busca roteiros no objeto global preenchido pelo index.html
  APP_STATE.roteiro = window.ROTEIROS[tipo]; 
  
  await initIndexedDB(tipo);
  
  const labels = { pge: "PGE", geral: "Geral", aa: "Acidentes Ambientais" };
  document.getElementById("roteiro-atual-label").textContent = labels[tipo];

  // Mostra/Esconde seções específicas de PGE
  const isPGE = tipo === "pge";
  document.getElementById("local_pge_box")?.classList.toggle("hidden", !isPGE);
  document.getElementById("sublocal_box")?.classList.toggle("hidden", !isPGE);

  if (isPGE) montarLocaisPGE();
  montarSecoes();
  renderFormulario();
  showScreen("screen-formulario");
}

function renderFormulario(secaoFiltrada = null) {
  const container = document.getElementById("conteudo_formulario");
  if (!container) return;
  
  let perguntas = APP_STATE.roteiro || [];

  // Filtros PGE
  if (APP_STATE.tipoRoteiro === "pge") {
    const local = document.getElementById("local_pge_select")?.value;
    const sublocal = document.getElementById("sublocal_select")?.value;
    if (!local || !sublocal) {
      container.innerHTML = `<div class="p-8 text-center text-gray-400">Selecione Local e Sublocal acima.</div>`;
      return;
    }
    perguntas = perguntas.filter(p => p.Local === local && p.Sublocal === sublocal);
  }

  if (secaoFiltrada) {
    perguntas = perguntas.filter(p => (p.Secao || p["Seção"]) === secaoFiltrada);
  }

  // Renderização performática usando DocumentFragment
  const fragment = document.createDocumentFragment();
  perguntas.forEach(p => {
    const div = document.createElement("div");
    div.className = "mb-6 p-4 bg-white rounded-lg shadow-sm border-l-4 border-blue-500";
    div.id = `group_${p.id}`;
    
    div.innerHTML = `
      ${p.ImagemApoio ? `<img src="${p.ImagemApoio}" class="mb-2 rounded max-h-40">` : ''}
      <label class="block font-bold text-gray-700 mb-2">${p.Pergunta}</label>
      <div id="input_container_${p.id}"></div>
    `;
    
    const inputWrapper = div.querySelector(`#input_container_${p.id}`);
    inputWrapper.appendChild(criarInputParaPergunta(p));
    fragment.appendChild(div);
  });

  container.innerHTML = "";
  container.appendChild(fragment);
  applyConditionalLogic();
}

function criarInputParaPergunta(p) {
  const val = APP_STATE.respostas[p.id] || "";
  const tipo = (p.TipoInput || "text").toLowerCase();
  const el = document.createElement("div");

  if (tipo === "radio" || tipo === "checkboxgroup") {
    const ops = (p.Opcoes || "").split(";").filter(Boolean);
    el.innerHTML = ops.map(op => `
      <label class="inline-flex items-center mt-2 mr-4">
        <input type="${tipo === 'radio' ? 'radio' : 'checkbox'}" name="${p.id}" value="${op}" 
        ${val.includes(op) ? 'checked' : ''} class="w-5 h-5 text-blue-600">
        <span class="ml-2 text-gray-700">${op}</span>
      </label>
    `).join("");
    
    el.querySelectorAll('input').forEach(i => i.onchange = (e) => {
      let result = e.target.value;
      if (tipo === 'checkboxgroup') {
        result = [...el.querySelectorAll('input:checked')].map(c => c.value).join(";");
      }
      autosave(p.id, result);
    });
  } else if (tipo === "file") {
    el.innerHTML = `
      <button onclick="abrirCamera('${p.id}')" class="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2">
        📸 Capturar Foto
      </button>
      <div id="fotos_${p.id}" class="mt-2 text-xs text-gray-500"></div>
    `;
  } else {
    const input = document.createElement(tipo === "textarea" ? "textarea" : "input");
    input.className = "w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none";
    input.value = val;
    if (tipo === "number") input.type = "number";
    input.oninput = (e) => autosave(p.id, e.target.value);
    el.appendChild(input);
  }
  return el;
}

function autosave(id, valor) {
  APP_STATE.respostas[id] = valor;
  saveAnswerToDB(id, valor); // No indexedDB.js
  applyConditionalLogic();
}

function applyConditionalLogic() {
  APP_STATE.roteiro?.forEach(p => {
    const cond = p.Condicao || p["Condição"];
    const pai = p.Pai;
    if (cond && pai) {
      const el = document.getElementById(`group_${p.id}`);
      el?.classList.toggle("hidden", APP_STATE.respostas[pai] !== cond);
    }
  });
}

// --- FINALIZAÇÃO ---
function initApp() {
  const sel = document.getElementById("local");
  if (sel) sel.innerHTML = LOCAIS_VISITA.map(l => `<option value="${l}">${l}</option>`).join("");
  
  ["avaliador", "local", "colaborador", "data_visita"].forEach(f => {
    const val = localStorage.getItem(f);
    if (val) {
      document.getElementById(f).value = val;
      APP_STATE[f] = val;
    }
  });

  initMapa();
  initCadastro();
  showScreen("screen-cadastro");
}

// Exposição Global
window.selectRoteiro = selectRoteiro;
window.abrirCamera = abrirCamera;
window.initApp = initApp;

document.addEventListener("DOMContentLoaded", initApp);
