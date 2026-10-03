# Site de Estudos — CEFET-MG 2027 (Rayane)

App de estudos para o Processo Seletivo 2027 do CEFET-MG (Ensino Técnico **Integrado**,
edital 491/2026; prova em **29/11/2026**, 50 questões: Português 15, Matemática 15,
Ciências 8, História 6, Geografia 6; menos de 10 acertos elimina). **Meta: 35+ acertos.**

Tem um perfil para a Rayane estudar e um perfil Admin para acompanhar o progresso.
Funciona junto com o **Professor CEFET** (agente no chat): os dois usam a mesma
metodologia e o mesmo padrão de questões.

Feito com Node.js + Express + EJS. Banco SQLite via `@libsql/client`: localmente é um
arquivo (`data/estudos.db`); publicado no Vercel (seção 7) usa um banco Turso remoto.

## 1. Pré-requisitos

- **Node.js 18 ou mais recente** (https://nodejs.org). Conferir: `node --version`

## 2. Instalação e uso local

Dentro da pasta `estudos-app`:

```
npm install
npm start
```

Abra **http://localhost:3000**. Não precisa rodar `npm run seed`: ao iniciar, o site
sincroniza sozinho o conteúdo (tópicos, teoria e questões) com os arquivos de
`src/content/`, **sem apagar** respostas, revisões, simulados nem cronograma.

Antes de entregar o site à Rayane, apague a pasta `data/` se você fez testes — ela guarda o
progresso e será recriada limpa na próxima execução.

## 3. Login

| Perfil | PIN padrão |
|---|---|
| Rayane | `1234` |
| Admin  | `4321` |

Para trocar: `RAYANE_PIN=novo ADMIN_PIN=outro npm start`
(PowerShell: `$env:RAYANE_PIN="novo"; $env:ADMIN_PIN="outro"; npm start`)

## 4. Metodologia (a mesma do Professor CEFET)

1. **Foco no que mais cai.** Os 53 tópicos foram mapeados contra as provas de 2016–2026.
   **42 tópicos do núcleo** cobrem ~86–89% das questões dos últimos 10 anos (Pareto:
   é o que a trilha prioriza); 11 tópicos de **complemento** só entram depois.
2. **Todas as questões no padrão da prova**: texto de apoio (tabelas, gráficos, mapas,
   tirinhas), enunciado contextualizado, 4 alternativas A–D, formatos reais (direta,
   cálculo, "julgue as afirmativas I–IV", "NÃO/incorreta", associação, asserção–razão).
3. **Duas origens, sempre identificadas na tela:**
   - **Real** — questão que de fato caiu (2016–2026), com ano/número;
   - **Autoral** — escrita no estilo da prova.
   Cada questão tem **nível N1 / N2 / N3** (base, prova típica, mais difícil).
4. **O Alienista (livro de 2027)**: todas as questões da obra são **autorais** (nenhuma
   questão real de livros de edições anteriores é usada).
5. **Explicação de todas as alternativas**, errada ou certa, em linguagem de 9º ano.
6. **Revisão espaçada** (1, 3, 7, 15, 30 dias) e **domínio por tópico** guiam o "Hoje".
7. **Plano de 8 semanas** ancorado na data da prova, com simulados semanais.

## 5. O que tem em cada perfil

**Rayane:**
- `Hoje` — o que estudar agora (núcleo primeiro, revisões vencidas, erros pendentes).
- `Trilha` / página de matéria / página de tópico — teoria curta + prática, ordenados do
  que mais cai para o que menos cai, com selo de domínio.
- `Praticar` — sessões de 10 questões por tópico ("praticar mais 10"); cada resposta mostra a explicação.
- `Erros` — caderno de erros com refazer.
- `Plano` — as 8 semanas, com tópicos, meta e simulado de cada semana.
- `Simulado` — **completo** (50 questões, 3 h, proporção real), **rápido** (20 questões,
  72 min) ou **por matéria**; resultado com nota, desempenho por matéria, diagnóstico por tópico/nível,
  projeção de acertos em 50 e comparação com a meta de 35.
- `Progresso` — evolução, aproveitamento por matéria e por nível, notas dos simulados.
- `Cronograma` — blocos de estudo por data.

**Admin:** visão geral (dias até a prova, aproveitamento, domínio por matéria, aderência,
alertas), atividade questão a questão, cronograma, e "Ver como Rayane" (somente leitura).

## 6. Banco de questões

**685 questões**: 202 reais (2016–2026) + 483 autorais (40 delas sobre O Alienista).
Todos os 42 tópicos do núcleo têm ao menos 12 questões e os de complemento ao menos 6.
O gabarito fica equilibrado (A/B/C/D ≈ 168/180/172/165). As alternativas **não** são
embaralhadas na hora: a ordem A–D é a definida na escrita (em questões como "I e II
apenas" a ordem tem de ser fixa).

### Estrutura do conteúdo (`src/content/`)

```
topics.json          # 53 tópicos (código, nome, matéria, núcleo/complemento, peso)
theory/*.txt         # teoria curta por matéria
real.json            # metadados das questões reais (ano, nº, tópico, nível)
real-ex/*.txt        # texto das questões reais
questions/*.txt      # questões autorais (inclui alienista.txt)
check.js  parse.js  index.js  theory.js
```

### Como adicionar questões autorais

Edite um arquivo de `src/content/questions/`. Cada questão tem cabeçalho e campos:

```
@A-M12-31 N2 cálculo
sup: <p class="src">Fonte…</p> (HTML opcional: tabela, SVG)
stem: Enunciado em texto simples.
o1: alternativa …
o2: …
o3: …
o4: …
key: B
a: explicação da alternativa o1 (na ordem original, sem citar letras)
b: …
c: …
d: …
```

- Código `A-<TÓPICO>-<nº>`; nível `N1|N2|N3`; formato opcional (`cálculo`,
  `julgar afirmativas`, `NÃO/incorreta`, `associação`, `asserção–razão`); questões da obra levam `obra`
  no cabeçalho (e o tópico PT09 só aceita questões com `obra`).
- Rode **`npm run check`**: valida (ids únicos, tópico existente, 4 alternativas
  distintas, gabarito A–D) e mostra a cobertura por tópico e o equilíbrio do gabarito.
- Ao reiniciar o site (`npm start`) o conteúdo novo é sincronizado automaticamente.
  Para forçar: `npm run seed -- --force` (também não-destrutivo).

## 6.1. Estrutura do projeto

```
estudos-app/
  api/index.js        # entrada do Vercel (serverless)
  src/
    server.js         # entrada local (npm start)
    db.js             # conexão (arquivo local ou Turso) + schema
    seed.js           # sincronização manual do conteúdo (não destrutiva)
    content/          # tópicos, teoria e questões (ver acima)
    lib/              # content-sync, srs, mastery, plan (8 semanas), planner, simulado, analytics
    middleware/auth.js
    routes/           # auth, rayane, admin, api
    views/            # páginas EJS
  public/             # CSS e JS do navegador
  data/               # SQLite local (criado sozinho; não versionar)
  vercel.json
```

## 7. Publicar o site na internet de graça (Vercel + Turso)

O site pode continuar rodando só no seu computador (seções 1 a 6) **ou** ser
publicado de graça na internet, para a Rayane acessar de qualquer lugar/celular,
sem precisar do seu computador ligado. Isso é feito com duas contas gratuitas:

- **Turso** — hospeda o banco de dados (compatível com SQLite, plano grátis
  generoso: ~5 GB, mais que suficiente para este site).
- **Vercel** — hospeda o site em si (plano grátis, ideal para projetos pessoais).

Nenhuma das duas exige cartão de crédito para o plano gratuito.

### 7.1. Criar o banco de dados no Turso

1. Acesse **https://turso.tech** e crie uma conta gratuita (dá para entrar direto
   com GitHub ou Google).
2. Depois de logada, crie um banco de dados novo (botão "Create Database"). Dê um
   nome como `cefet-estudos` e escolha a região mais próxima do Brasil disponível.
3. Na página do banco criado, procure as informações de conexão:
   - **Database URL** — algo como `libsql://cefet-estudos-seuusuario.turso.io`
   - **Auth Token** — clique em "Create Token" (ou "Generate Token") para gerar um
     token de acesso. Copie o token assim que ele aparecer (geralmente só é
     mostrado uma vez).
4. Guarde essas duas informações (URL e token) — vamos usá-las no próximo passo.

### 7.2. Colocar o código no GitHub

1. Crie uma conta gratuita em **https://github.com** (se ainda não tiver).
2. Crie um repositório novo (pode ser privado), por exemplo `cefet-estudos`.
3. No seu computador, dentro da pasta `estudos-app`, rode:
   ```
   git init
   git add .
   git commit -m "Site de estudos CEFET-MG"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/cefet-estudos.git
   git push -u origin main
   ```
   (Troque `SEU-USUARIO` pelo seu usuário do GitHub. O GitHub Desktop também
   funciona, se preferir uma interface gráfica em vez de comandos.)

   **Atenção:** o arquivo `data/estudos.db` (o banco local) e a pasta
   `node_modules` não devem subir para o GitHub — normalmente já ficam de fora
   automaticamente por um arquivo `.gitignore`; se o projeto ainda não tiver um,
   crie um arquivo chamado `.gitignore` na pasta `estudos-app` com este conteúdo:
   ```
   node_modules/
   data/
   ```

### 7.3. Publicar no Vercel

1. Acesse **https://vercel.com** e crie uma conta gratuita entrando com sua
   conta do GitHub (assim o Vercel já pede autorização para ver seus repositórios).
2. Clique em "Add New… → Project", e escolha o repositório `cefet-estudos` que
   você acabou de subir.
3. O Vercel deve detectar automaticamente que é um projeto Node.js. Antes de
   clicar em "Deploy", abra a seção **"Environment Variables"** e adicione:

   | Nome | Valor |
   |---|---|
   | `TURSO_DATABASE_URL` | a Database URL copiada no passo 7.1 |
   | `TURSO_AUTH_TOKEN` | o Auth Token copiado no passo 7.1 |
   | `SESSION_SECRET` | qualquer frase longa e secreta, ex.: `rayane-cefet-2027-xyz123` |
   | `RAYANE_PIN` | (opcional) troque o PIN padrão da Rayane |
   | `ADMIN_PIN` | (opcional) troque o PIN padrão do admin |

4. Clique em **Deploy**. Depois de alguns segundos, o Vercel mostra um link
   parecido com `https://cefet-estudos-seuusuario.vercel.app` — esse é o
   endereço definitivo do site, acessível de qualquer navegador ou celular.

### 7.4. Popular o banco publicado

O banco no Turso começa vazio. Rode a sincronização **apontando para o Turso**, uma vez,
a partir do seu computador:

```
TURSO_DATABASE_URL="sua-url-aqui" TURSO_AUTH_TOKEN="seu-token-aqui" npm run seed
```

(PowerShell: `$env:TURSO_DATABASE_URL="sua-url-aqui"; $env:TURSO_AUTH_TOKEN="seu-token-aqui"; npm run seed`)

A sincronização **não apaga o progresso** da Rayane, então pode ser repetida sempre que
você adicionar ou corrigir questões. (O site publicado também sincroniza sozinho quando
a versão do conteúdo muda.)

### 7.5. Atualizações depois de publicado

Qualquer novo `git push` para o `main` faz o Vercel publicar a nova versão
automaticamente, em menos de um minuto — não precisa repetir nada dos passos
7.1 a 7.3, só o `git push`.
