Formulário Técnico – Supervisão Ambiental

Aplicação Web Progressiva (PWA) desenvolvida para coleta de dados offline em campo durante atividades de Supervisão Ambiental. O sistema permite registrar informações, fotos e localização geográfica, consolidando os resultados em um único arquivo estruturado. 

Funcionalidades:
  Envio de formulários padronizados (mobile e desktop)
  Registro de imagens e coordenadas
  Sincronização com banco de dados online
  Armazenamento local de dados via indexedDB.js
  Consolidação automática das respostas em arquivo XLSX integrado
  Suporte offline por meio de sw.js (Service Worker)

Tecnologias: 
  JavaScript; HTML; R; SQL; CSS; JSON; Tailwind; Excel.js
  

Objetivo:
  Centralizar e estruturar os dados coletados em campo, permitindo maior controle, rastreabilidade e preparação para integração futura com banco de dados ou geração automática de relatórios.

Próximos Passos:
  Otimização de performance em dispositivos móveis
  Ajustes de acessibilidade e boas práticas
  Ampliação das funcionalidades de relatório

Estrutura do Projeto:
  /root
    index.html
    indexedDB.js
    style.css
    /roteiros
    icon.png
    app.js
    manifest.json
    sw.js
    /lib/tailwind.js
    /lib/excel.min.js
    
    manifest.json
    service-worker.js
