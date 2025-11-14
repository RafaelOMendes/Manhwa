# 📚 Manhwa Tracker

Um aplicativo completo para gerenciar seus manhwas favoritos, acompanhar o que você está lendo, o que já leu, avaliar e adicionar notas.

## 🚀 Tecnologias

### Frontend
- **Next.js 14** - Framework React
- **TypeScript** - Tipagem estática
- **Tailwind CSS** - Estilização
- **Lucide React** - Ícones

### Backend
- **FastAPI** - Framework Python de alta performance
- **Pydantic** - Validação de dados
- **JSON File Storage** - Armazenamento simples (pode ser migrado para PostgreSQL/SQLite)

## 📋 Funcionalidades

- ✅ Adicionar manhwas com informações detalhadas
- ✅ Gerenciar status (Lendo, Completo, Planejo Ler)
- ✅ Avaliar com sistema de estrelas (1-5)
- ✅ Acompanhar capítulos lidos
- ✅ Adicionar notas pessoais
- ✅ Filtrar por status
- ✅ Interface moderna e responsiva

## 🛠️ Instalação e Execução

### Backend (FastAPI)

1. Navegue até a pasta do backend:
```powershell
cd backend
```

2. Crie um ambiente virtual Python:
```powershell
python -m venv venv
```

3. Ative o ambiente virtual:
```powershell
.\venv\Scripts\activate
```

4. Instale as dependências:
```powershell
pip install -r requirements.txt
```

5. Execute o servidor:
```powershell
python main.py
```

O backend estará rodando em: `http://localhost:8000`
Documentação interativa (Swagger): `http://localhost:8000/docs`

### Frontend (Next.js)

1. Abra um novo terminal e navegue até a pasta do frontend:
```powershell
cd frontend
```

2. Instale as dependências:
```powershell
npm install
```

3. Execute o servidor de desenvolvimento:
```powershell
npm run dev
```

O frontend estará rodando em: `http://localhost:3000`

## 📁 Estrutura do Projeto

```
Manhwa/
├── backend/
│   ├── main.py              # API FastAPI
│   ├── requirements.txt     # Dependências Python
│   ├── manhwas.json        # Arquivo de dados (gerado automaticamente)
│   └── README.md
│
└── frontend/
    ├── app/
    │   ├── layout.tsx       # Layout principal
    │   ├── page.tsx         # Página inicial
    │   └── globals.css      # Estilos globais
    ├── components/
    │   ├── ManhwaCard.tsx   # Card de manhwa
    │   └── AddManhwaModal.tsx # Modal para adicionar
    ├── types/
    │   └── manhwa.ts        # Tipos TypeScript
    ├── package.json
    ├── tsconfig.json
    ├── tailwind.config.ts
    └── next.config.js
```

## 🔧 Próximas Melhorias

- [ ] Migrar para banco de dados (PostgreSQL/SQLite)
- [ ] Autenticação de usuários
- [ ] Upload de capas de manhwas
- [ ] Sistema de busca avançada
- [ ] Estatísticas de leitura
- [ ] Dark/Light mode toggle
- [ ] Exportar/Importar lista
- [ ] Integração com APIs de manhwas (MAL, AniList, etc)
- [ ] PWA (Progressive Web App)

## 📝 API Endpoints

### GET /api/manhwas
Retorna todos os manhwas (opcional: filtrar por status)

### GET /api/manhwas/{id}
Retorna um manhwa específico

### POST /api/manhwas
Cria um novo manhwa

### PUT /api/manhwas/{id}
Atualiza um manhwa existente

### DELETE /api/manhwas/{id}
Deleta um manhwa

## 🎨 Screenshots

*Screenshots serão adicionados após a primeira execução*

## 📄 Licença

Este projeto é open source e está disponível sob a licença MIT.

## 👤 Autor

Rafael Mendes

---

Feito com ❤️ para amantes de Manhwas!
