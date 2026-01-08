// ===========================================
// APP.JS – PWA MODULAR OTIMIZADO (V12)
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

let mapa = null, stream = null;
const GEO_STATE = { latitude: null, longitude: null, accuracy: null, timestamp: null };
let userMarker = null, accuracyCircle = null;

// --- NAVEGAÇÃO E UI ---
const showScreen = (id) => {
  ["screen-cadastro", "screen-select-roteiro", "screen-formulario", "screen-final"]
    .forEach(t => {
      const el = document.getElementById(t);
      if (el) el.classList.toggle("hidden", t !== id);
    });
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
    const values = fields.reduce((acc, f) => {
      const el = document.getElementById(f);
      return { ...acc, [f]: el ? el.value.trim() : "" };
    }, {});

    if (Object.values(values).some(v => !v || v === "Selecionar Local...")) {
      return showMessage("Preencha todos os campos corretamente.", false);
    }

    Object.assign(APP_STATE, values);
    fields.forEach(f => localStorage.setItem(f, values[f]));
    
    showScreen("screen-select-roteiro");
    obterLocalizacaoAtual();
  };
}

// --- ROTEIROS E FORMULÁRIO ---
async function selectRoteiro(tipo) {
  try {
    APP_STATE.tipoRoteiro = tipo;
    const dadosRoteiro = window.ROTEIROS_DATA ? window.ROTEIROS_DATA[tipo] : null;
    
    if (!dadosRoteiro) {
        console.error("Erro: Roteiro não encontrado.");
        return;
    }

    APP_STATE.roteiro = dadosRoteiro; 
    await initIndexedDB(tipo);
    
    const labels = { pge: "PGE", geral: "Geral", aa: "Acidentes Ambientais" };
    const labelEl = document.getElementById("roteiro-atual-label");
    if (labelEl) labelEl.textContent = labels[tipo];

    const isPGE = tipo === "pge";
    document.getElementById("local_pge_box")?.classList.toggle("hidden", !isPGE);
    document.getElementById("sublocal_box")?.classList.toggle("hidden", !isPGE);

    if (isPGE) montarLocaisPGE();
    
    renderFormulario();
    showScreen("screen-formulario");
  } catch (err) {
    console.error("Erro crítico em selectRoteiro:", err);
  }
}

function renderFormulario(secaoFiltrada = null) {
  const container = document.getElementById("conteudo_formulario");
  if (!container) return;
  
  let perguntas = APP_STATE.roteiro || [];

  if (APP_STATE.tipoRoteiro === "pge") {
    const localSel = document.getElementById("local_pge_select")?.value;
    const sublocalSel = document.getElementById("sublocal_select")?.value;
    if (!localSel || !sublocalSel) {
      container.innerHTML = `<div class="p-8 text-center text-gray-400">Selecione Local e Sublocal acima.</div>`;
      return;
    }
    perguntas = perguntas.filter(p => p.local === localSel && p.sublocal === sublocalSel);
  }

  if (secaoFiltrada) {
    perguntas = perguntas.filter(p => p.secao === secaoFiltrada);
  }

  const fragment = document.createDocumentFragment();
  
  perguntas.forEach(p => {
    const div = document.createElement("div");
    div.className = "mb-6 p-4 bg-white rounded-lg shadow-sm border-l-4 border-blue-500";
    div.id = `group_${p.id}`;
    
    div.innerHTML = `
      ${p.imagemApoio ? `<img src="${p.imagemApoio}" class="mb-2 rounded max-h-40 border shadow-sm">` : ''}
      <label class="block font-bold text-gray-700 mb-2">${p.pergunta}</label>
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
  const tipo = (p.tipo || "text").toLowerCase();
  const el = document.createElement("div");

  if (tipo === "radio" || tipo === "checkboxgroup") {
    const ops = Array.isArray(p.opcoes) ? p.opcoes : [];
    
    el.innerHTML = ops.map(op => `
      <label class="inline-flex items-center mt-2 mr-4 cursor-pointer">
        <input type="${tipo === 'radio' ? 'radio' : 'checkbox'}" 
               name="${p.id}" 
               value="${op}" 
               ${val.toString().split(";").includes(op) ? 'checked' : ''} 
               class="w-5 h-5 text-blue-600">
        <span class="ml-2 text-gray-700">${op}</span>
      </label>
    `).join("");
    
    el.querySelectorAll('input').forEach(i => {
      i.onchange = (e) => {
        let result = tipo === 'checkboxgroup' 
          ? [...el.querySelectorAll('input:checked')].map(c => c.value).join(";")
          : e.target.value;
        autosave(p.id, result);
      };
    });
  } else if (tipo === "file") {
    el.innerHTML = `
      <button type="button" onclick="abrirCamera('${p.id}')" 
              class="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2">
        📸 Capturar Foto
      </button>
      <div id="fotos_${p.id}" class="mt-2 text-xs text-gray-500 italic">Nenhuma foto capturada</div>
    `;
  } else {
    const input = document.createElement(tipo === "textarea" ? "textarea" : "input");
    input.className = "w-full border rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500";
    input.value = val;
    if (tipo === "number") input.type = "number";
    input.oninput = (e) => autosave(p.id, e.target.value);
    el.appendChild(input);
  }
  return el;
}

function autosave(id, valor) {
  APP_STATE.respostas[id] = valor;
  if (typeof saveAnswerToDB === "function") saveAnswerToDB(id, valor);
  applyConditionalLogic();
}

function applyConditionalLogic() {
  APP_STATE.roteiro?.forEach(p => {
    const cond = p.condicao || p.Condicao; 
    const pai = p.pai || p.Pai;
    if (cond && pai) {
      const el = document.getElementById(`group_${p.id}`);
      if (el) el.classList.toggle("hidden", APP_STATE.respostas[pai] !== cond);
    }
  });
}

function initMapa() {
  const mapContainer = document.getElementById("mapa");
  if (!mapContainer || mapa) return;
  mapa = L.map('mapa').setView([-22.9068, -43.1729], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapa);
}

function initApp() {
  const sel = document.getElementById("local");
  if (sel) sel.innerHTML = LOCAIS_VISITA.map(l => `<option value="${l}">${l}</option>`).join("");
  
  ["avaliador", "local", "colaborador", "data_visita"].forEach(f => {
    const val = localStorage.getItem(f);
    const el = document.getElementById(f);
    if (val && el) {
      el.value = val;
      APP_STATE[f] = val;
    }
  });

  initMapa();
  initCadastro();
  showScreen("screen-cadastro");
}

// Inicialização Global
window.selectRoteiro = selectRoteiro;
window.initApp = initApp;

document.addEventListener("DOMContentLoaded", initApp);
