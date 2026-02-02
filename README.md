Formulário Técnico – Supervisão Ambiental

Aplicação web desenvolvida para padronizar e agilizar a coleta de dados em campo durante atividades de Supervisão Ambiental. O sistema permite registrar informações, fotos e localização geográfica, consolidando os resultados em um único arquivo estruturado.

Funcionalidades:
  Envio de formulários padronizados (mobile e desktop)
  Registro de imagens e coordenadas
  Consolidação automática das respostas em arquivo XLSX integrado
  Visualização geográfica com Leaflet
  Suporte offline por meio de Service Worker (PWA)

Tecnologias: 
  HTML, JavaScript
  TailwindCSS
  Leaflet
  Service Worker
  Exportação e tratamento de dados em XLSX

Objetivo:
  Centralizar e estruturar os dados coletados em campo, permitindo maior controle, rastreabilidade e preparação para integração futura com banco de dados ou geração automática de relatórios.

Próximos Passos:
  Otimização de performance em dispositivos móveis
  Ajustes de acessibilidade e boas práticas
  Redução do tamanho dos assets e otimização de imagens
  Ampliação das funcionalidades de relatório

Estrutura do Projeto:
  /root
    index.html
    index.js
    style.css
    /roteiros
    /imagens
    manifest.json
    service-worker.js
