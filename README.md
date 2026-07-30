# Site de Estudos — CEFET-MG Varginha 2027 (Rayane)

Site pessoal de estudos para o processo seletivo do CEFET-MG (Ensino Médio Integrado
ao Técnico, campus Varginha), com um perfil para a Rayane estudar e um perfil de
administrador para acompanhar o progresso dela.

Feito com Node.js + Express + EJS. Usa **SQLite** como banco de dados através da
biblioteca `@libsql/client`: rodando localmente, ela usa um arquivo comum
(`data/estudos.db`), sem precisar de conta nem serviço externo; publicado no Vercel
(seção 7), ela passa a usar um banco remoto no Turso, compatível com SQLite — a
mesma linguagem SQL, sem reescrever nada do site.

## 1. Pré-requisitos

- **Node.js versão 18 ou mais recente**. Baixe em https://nodejs.org caso ainda não
  tenha. Para conferir a versão instalada: `node --version`

## 2. Instalação (primeira vez)

Abra um terminal dentro da pasta `estudos-app` e rode, em ordem:

```
npm install
npm run seed
npm start
```

- `npm install` baixa as bibliotecas (Express, EJS, cliente do banco de dados etc.).
  **Se você já usava uma versão anterior do site**, rode `npm install` de novo agora —
  as bibliotecas mudaram nesta atualização (troca de `express-session` por cookie
  assinado, e de `node:sqlite` por `@libsql/client`, para viabilizar a publicação
  no Vercel).
- `npm run seed` cria o banco de dados (`data/estudos.db`) já populado com as
  matérias, temas priorizados, conteúdos curados e o banco de questões.
  **Atenção:** o banco já vem pronto e populado neste momento (765 questões) —
  **não é necessário rodar `npm run seed` de novo**. Rodar esse comando **apaga
  o histórico de respostas da Rayane, o cronograma e os simulados já feitos**,
  recriando tudo do zero. Só rode de novo se quiser mesmo resetar o progresso
  dela, ou se for adicionar questões novas nos arquivos de `src/questions/`.
- `npm start` inicia o site.

Depois de `npm start`, abra o navegador em **http://localhost:3000**.

Nas próximas vezes, só é preciso rodar `npm start` (não precisa repetir `npm install`
nem `npm run seed`, a menos que queira atualizar o conteúdo).

## 3. Login

A tela inicial pede para escolher o perfil (Rayane ou Admin) e um PIN.

| Perfil | PIN padrão |
|---|---|
| Rayane | `1234` |
| Admin  | `4321` |

**Para trocar os PINs**, defina variáveis de ambiente antes de rodar `npm start`:

```
RAYANE_PIN=novosenha ADMIN_PIN=outrasenha npm start
```

(No Windows, no PowerShell: `$env:RAYANE_PIN="novosenha"; $env:ADMIN_PIN="outrasenha"; npm start`)

## 4. O que tem em cada perfil

**Rayane:**
- `Hoje` — sugestão do que estudar agora (com base no peso da matéria na prova e no
  que ainda não foi dominado) + o plano de estudo do dia.
- Trilha por matéria — todos os temas, ordenados do que mais cai na prova para o
  que menos cai, com selo de domínio (🔴🟠🟡🟢) para cada um.
- Página de cada tema — resumo, vídeos e artigos selecionados, e botão para praticar.
- Exercícios — cada questão respondida mostra a explicação da alternativa certa
  **e de todas as erradas**, e entra num sistema de revisão espaçada (volta a
  aparecer em 1, 3, 7, 15 ou 30 dias, dependendo do desempenho).
- `Progresso` — visão consolidada de domínio por matéria e tema.
- `Cronograma` — ela mesma pode adicionar/ajustar blocos de estudo por data.

**Admin:**
- `Visão geral` — dias até a prova, aproveitamento geral, mapa de domínio por
  matéria, aderência ao cronograma na última semana e alertas automáticos de temas
  prioritários sem prática há mais de 7 dias.
- `Atividade` — histórico de tentativas da Rayane, questão a questão.
- `Cronograma` — pode montar/editar o cronograma da Rayane.
- `Ver como Rayane` — abre as telas dela em modo leitura (sem poder responder
  exercícios em nome dela).

## 5. Sobre as questões

O banco tem **765 questões**, escritas especialmente para este site, no mesmo
estilo e nível de dificuldade das provas reais do CEFET-MG. Elas **não reproduzem**
nenhuma questão oficial. A quantidade de questões por tema segue a mesma lógica de
prioridade da trilha de estudo: mais questões nos temas que mais caíram nas provas
de 2014 a 2025 (ex.: 20 questões sobre "O Alienista", 20 sobre Geometria Plana) e
menos nos temas de baixa prioridade (ex.: 4 a 8 questões em Lógica Matemática,
Trigonometria, História Antiga/Medieval, e nos temas de reforço de Ciências
adicionados depois — Mecânica/Newton, Óptica, Hidrostática, Leis Ponderais,
Misturas/Separação, Tabela Periódica, Zoologia/Bioquímica). Cada questão tem
também um nível de dificuldade (fácil/médio/difícil), usado no gráfico de
"aproveitamento por nível" da página Progresso.

Além disso, cobrindo lacunas identificadas na análise das provas dos últimos 10
anos, foram adicionados os temas **Geografia da África** e **Escravidão e
diáspora africana** (História), ambos com prioridade média/alta e conteúdo
curado próprio. Questões escritas a partir desse ponto seguem também o formato
de "texto de apoio" compartilhado entre questões e blocos de "analise as
afirmativas I, II, III, IV", no mesmo estilo das provas reais mais recentes.

## 5.1. Simulados, dashboard e mais

Além da prática por tema (sessões de até 10 questões por vez, para não cansar),
o site agora tem:

- **Simulados cronometrados** (`/rayane/simulado`): uma prova completa de 50
  questões (15 Português, 15 Matemática, 8 Ciências, 6 Geografia, 6 História),
  com 3 horas de cronômetro, igual à estrutura real da prova.
- **Dashboard de progresso** com gráficos de evolução, aproveitamento por
  matéria, por nível de dificuldade, domínio dos temas e notas nos simulados.
- **Plano automático**: o cronograma nunca fica vazio — se um dia não tiver
  nada marcado, o site sugere automaticamente o que estudar, sem sobrescrever
  o que já foi ajustado manualmente.
- **Contador de tempo de estudo**, visível só no perfil Admin (Visão geral).

As questões ficam organizadas por matéria em `src/questions/` (`portugues.js`,
`matematica.js`, `ciencias.js`, `geografia.js`, `historia.js`). Para adicionar mais
questões, edite o arquivo da matéria correspondente seguindo o mesmo padrão
(pergunta + 4 alternativas + explicação de cada uma) e depois rode `npm run seed`
de novo.

## 6. Estrutura do projeto

```
estudos-app/
  api/
    index.js          # ponto de entrada usado pelo Vercel (função serverless)
  src/
    server.js        # ponto de entrada local (npm start)
    db.js             # conexão com o banco (arquivo local ou Turso) + schema
    seed.js           # popula matérias/temas/conteúdos
    seed-questions.js # banco de questões
    lib/              # spaced repetition, cálculo de domínio, sugestão do dia
    middleware/auth.js
    routes/           # auth, rayane, admin, api
    views/            # páginas EJS
  public/             # CSS e JS do navegador
  data/               # banco SQLite local (criado automaticamente, não versionar)
  vercel.json         # configuração de publicação no Vercel
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

### 7.4. Popular o banco publicado com as questões

O banco no Turso começa vazio. Para colocá-lo no mesmo estado do site local
(765 questões, matérias, temas etc.), rode o seed **apontando para o Turso**,
uma única vez, a partir do seu computador:

```
TURSO_DATABASE_URL="sua-url-aqui" TURSO_AUTH_TOKEN="seu-token-aqui" npm run seed
```

(No PowerShell: `$env:TURSO_DATABASE_URL="sua-url-aqui"; $env:TURSO_AUTH_TOKEN="seu-token-aqui"; npm run seed`)

Depois disso, o site publicado no Vercel já aparece com tudo funcionando. Sempre
que adicionar questões novas nos arquivos de `src/questions/` **e quiser
atualizar o site publicado**, rode esse mesmo comando de novo (lembre-se: ele
reseta o progresso registrado, então combine com a Rayane antes).

### 7.5. Atualizações depois de publicado

Qualquer novo `git push` para o `main` faz o Vercel publicar a nova versão
automaticamente, em menos de um minuto — não precisa repetir nada dos passos
7.1 a 7.3, só o `git push`.
