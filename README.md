# FastWeb

Landing page de conversão do **FastWeb** — a plataforma onde o restaurante monta o próprio site de delivery e libera o app de caixa/PDV para a equipe usando apenas um **código do restaurante**.

Stack: **React + TypeScript + Vite** (front) · **Node + Express + TypeScript** (API) · **MongoDB + Mongoose** (banco).

> A copy completa e a direção de arte de cada seção estão em [`DESIGN.md`](DESIGN.md).
> Dados de empresa, depoimentos, preços e links são **fictícios** — substituir pelos reais.

---

## Estrutura

```
FastWeb/
├─ apps/
│  ├─ api/                     # Backend + banco de dados
│  │  ├─ src/
│  │  │  ├─ config/            # env.ts, db.ts e mongoUri.ts (monta a connection string)
│  │  │  ├─ models/            # Plan, Lead, DemoStore, SupportRequest
│  │  │  ├─ controllers/       # regras de cada recurso (validação com Zod)
│  │  │  ├─ routes/            # mapa de rotas /api
│  │  │  ├─ middlewares/       # erros e rate limit
│  │  │  ├─ services/          # imageStorage.ts (Cloudinary / disco)
│  │  │  ├─ utils/             # gerador do código do restaurante, slug
│  │  │  ├─ seed/              # planos (fonte da verdade dos preços)
│  │  │  ├─ app.ts             # Express app
│  │  │  └─ index.ts           # bootstrap (conecta o banco e sobe o servidor)
│  │  └─ .env.example
│  └─ web/                     # Frontend (landing page)
│     ├─ src/
│     │  ├─ data/content.ts    # TODA a copy da página
│     │  ├─ data/plans.fallback.ts
│     │  ├─ sections/          # Hero, Advantages, DemoBuilder, Support, Pricing, Faq...
│     │  ├─ components/        # PhonePreview, Reveal, SectionHeading, WhatsAppFloat
│     │  ├─ lib/               # api.ts, format.ts, image.ts
│     │  └─ styles/            # base.css (tokens) + sections.css
│     └─ .env.example
├─ DESIGN.md                   # copy + instruções visuais seção a seção
└─ package.json                # workspaces + scripts
```

---

## Como rodar

**1. Pré-requisitos:** Node 20+ e um MongoDB (local ou Atlas).

**2. Instalar dependências** (na raiz, instala os dois apps):

```bash
npm install
```

**3. Criar os arquivos `.env`** a partir dos exemplos:

```bash
cp apps/api/.env.example apps/api/.env
```

```bash
cp apps/web/.env.example apps/web/.env
```

Todos os valores já vêm preenchidos com **exemplos** — troque pelos reais quando tiver (URI do Mongo, WhatsApp, CNPJ, links das lojas).

**Sobre a conexão com o Mongo:** `config/mongoUri.ts` monta a string final e aceita três formatos —
URI completa com credenciais, URI limpa + `MONGODB_USERNAME`/`MONGODB_PASSWORD`, ou a URI colada do Atlas
ainda com os placeholders `<db_username>:<db_password>`. Ele também **acrescenta o nome do banco**
(`MONGODB_DB`, padrão `vapt`) e as opções `retryWrites=true&w=majority`, que o Atlas não entrega ao copiar
a string do painel — sem isso o Mongoose grava tudo no banco `test`. Senha com caractere especial é
codificada automaticamente, e o log de boot mostra a URI com a senha mascarada.

**4. Popular os planos no banco:**

```bash
npm run seed
```

**5. Subir API + front juntos:**

```bash
npm run dev
```

- Front: http://localhost:5173
- API: http://localhost:4000/api

O Vite já faz proxy de `/api` para a porta 4000 — não há CORS em desenvolvimento.

**Build de produção:**

```bash
npm run build
```

---

## Endpoints da API

| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/api/health` | Status do serviço |
| `GET` | `/api/company` | Dados públicos da empresa (rodapé, WhatsApp) |
| `GET` | `/api/plans` | Planos ativos; se o banco estiver vazio, devolve o fallback do seed |
| `POST` | `/api/leads` | Captura de lead (exige e-mail **ou** WhatsApp) |
| `POST` | `/api/demo/stores` | Cria a loja de demonstração e **gera o código do restaurante** |
| `GET` | `/api/demo/stores/:code` | Busca a loja pelo código (é o que o app parceiro faria) |
| `POST` | `/api/demo/stores/:code/products` | Adiciona item ao cardápio da demo (máx. 20) |
| `DELETE` | `/api/demo/stores/:code/products/:productId` | Remove item |
| `POST` | `/api/support/requests` | Pedido de atendimento humano; devolve link pronto do WhatsApp |

Exemplo:

```bash
curl -X POST http://localhost:4000/api/demo/stores -H "Content-Type: application/json" -d "{\"restaurantName\":\"Cantina do Ze\",\"brandColor\":\"#FF6B2C\",\"products\":[{\"name\":\"Smash Duplo\",\"price\":32.9}]}"
```

Resposta: `{ "ok": true, "data": { "code": "FW-8K2M4", "slug": "cantina-do-ze", ... } }`

### Decisões de implementação

- **Tipo de negócio e mesas**: a loja demo guarda `businessType` (restaurante, bar, lanchonete, pizzaria, cafeteria, mercado) e um array `tables` com rótulo, lugares, área e status — é o salão que o dono desenha no passo 3 e testa na telinha.
- **Código do restaurante** (`utils/codes.ts`): alfabeto sem `0/O/1/I`, para o dono conseguir ditar por telefone sem erro. Formato `FW-XXXXX`.
- **Validação com Zod** em toda entrada; erros voltam por campo (`{ field, message }`), prontos para exibir no formulário.
- **Rate limit** de 15 gravações/minuto por IP nas rotas que criam lead, demo e suporte.
- **Imagens nunca ficam no MongoDB.** O navegador ainda envia `data:URL` (depois de redimensionar em `lib/image.ts`), mas a API converte para arquivo em `services/imageStorage.ts` antes de salvar: o banco guarda só `imageUrl` + `imagePublicId`. Detalhes na seção "Armazenamento de imagens".
- **A landing nunca quebra sem a API**: os planos têm fallback local e o demo gera um código no navegador se o servidor não responder, exibindo um aviso com convite para o WhatsApp.
- **Lojas demo expiram em 30 dias** (`expiresAt`) — quando virar conta paga, é só converter em loja real.

---

## Armazenamento de imagens

O construtor de demonstração envia logo e fotos do cardápio como `data:URL` (base64). Guardar isso no
MongoDB inchava o documento (uma única loja passava de 700KB), ameaçava o teto de 16MB por documento em
cardápios grandes e deixava a leitura lenta. Agora **a imagem vira arquivo e o banco guarda só a URL** —
um documento de loja com logo e produto ficou em ~900 caracteres.

Quem faz isso é `apps/api/src/services/imageStorage.ts`, com dois drivers escolhidos automaticamente:

| Driver | Quando é usado | Onde a imagem fica |
|---|---|---|
| `cloudinary` | Credenciais reais preenchidas no `.env` | CDN do Cloudinary, com `quality:auto`, `fetch_format:auto` e limite de 1200px |
| `local` | Fallback automático (padrão em dev) | `apps/api/uploads/`, servido pela própria API em `/uploads` |

Regras que valem nos dois drivers:

- `null`/vazio → nada é salvo; URL `http(s)` já pronta → passa direto, sem reupload;
- só PNG, JPG, WEBP, GIF e AVIF são aceitos (SVG é recusado com 400, por ser vetor de XSS);
- limite de `MAX_IMAGE_BYTES` (padrão 2MB) validado **depois** de decodificar o base64;
- se o upload para o Cloudinary falhar (cota, credencial, rede), a API cai para o disco em vez de derrubar
  a criação da loja — o visitante não pode perder o "momento uau" por causa de storage;
- remover um produto (`DELETE .../products/:id`) apaga também o arquivo, para não deixar lixo pago para trás.

**Valores de exemplo no `.env` são ignorados de propósito.** `config/env.ts` trata qualquer valor contendo
"exemplo", "trocar", "seu_" etc. como *não configurado* — assim ninguém sobe o servidor achando que o
Cloudinary está ativo por causa de um placeholder copiado do `.env.example`.

Para ativar o Cloudinary, crie a conta gratuita, copie os três valores do Dashboard e preencha:

```bash
CLOUDINARY_CLOUD_NAME=seu_cloud_name
```

Depois reinicie a API: o log de boot informa qual driver está ativo.

> **Pendência conhecida:** o índice TTL apaga a loja demo depois de 30 dias, mas o arquivo da imagem
> continua no storage. Falta uma rotina de limpeza (job diário lendo os `publicId` órfãos, ou a
> auto-expiração por tag no Cloudinary). Está no backlog, não no caminho crítico.

---

## Onde trocar os dados fictícios

| O que | Onde |
|---|---|
| Depoimentos, nomes de clientes, métricas | `apps/web/src/data/content.ts` → `socialProof` |
| Textos de qualquer seção | `apps/web/src/data/content.ts` |
| Preços e recursos dos planos | `apps/api/src/seed/plans.data.ts` (rode `npm run seed`) e o espelho em `apps/web/src/data/plans.fallback.ts` |
| WhatsApp, e-mail, CNPJ, endereço | `.env` dos dois apps + `footer.addressLines` em `content.ts` |
| Links da Play Store / App Store | `.env` do web (`VITE_ANDROID_APP_URL`, `VITE_IOS_APP_URL`) |
| Credenciais do storage de imagens | `.env` da api (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`) |
