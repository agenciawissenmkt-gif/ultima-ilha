# Última Ilha

Battle royale online em 3D, direto no navegador, com câmera em terceira pessoa (inspirado em Free Fire e Call of Duty).
Até 50 jogadores por partida, com bots completando as vagas. Mapa com montanhas, casas com porta e janelas, árvores e pedras.
Miras: ponto vermelho, 2x, 4x e sniper 8x, com sensibilidade separada para cada uma.
Modos: solo, dupla, trio, squad (4) e quinteto (5). Login somente com conta Google.

## Como funciona

- `server/index.js`: entrega o site, confirma o login Google, cuida dos grupos (código de 5 letras), da fila e das partidas.
- `server/match.js`: simula a partida no servidor (movimento, tiros, dano, bots, tempestade, caídos e reanimação). 30 passos por segundo.
- `public/shared.js`: gera o mapa a partir de uma semente e faz o movimento. Usado pelo servidor e pelo navegador.
- `public/client.js`: lobby, conexão, controles (PC e celular), câmera, miras, previsão do próprio movimento e interpolação dos outros jogadores.
- `public/gfx.js`: parte visual em three.js (céu, sombras, relevo com textura, grama, casas, soldados, armas, clarão de tiro).
- `public/vendor/three.min.js`: three.js r128, servido pelo próprio jogo.

O servidor é quem decide tudo, então o navegador não consegue trapacear mudando vida ou munição.
As estatísticas (partidas, vitórias, abates) ficam em `data/stats.json`.

## Controles

- PC: clique na tela para controlar a câmera. WASD anda, Shift corre, Espaço pula, C agacha, botão direito mira, botão esquerdo atira, R recarrega, H cura, Q troca de arma, E pega arma, F reanima, M abre o mapa.
- Celular: joystick à esquerda, arraste à direita para olhar, botões de atirar, mirar, pular e agachar.

## Rodar no seu computador

```bash
npm install
npm run dev      # abre em http://localhost:3000 com login de teste (sem Google)
```

Abra duas abas para testar grupo e partida juntos.

## Criar o login com Google (uma vez)

1. Acesse https://console.cloud.google.com/ e crie um projeto (por exemplo "Ultima Ilha").
2. Vá em **APIs e serviços → Tela de consentimento OAuth**, escolha **Externo**, preencha nome do app e e-mail e salve.
3. Vá em **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**.
4. Tipo de aplicativo: **Aplicativo da Web**.
5. Em **Origens JavaScript autorizadas**, adicione o endereço do site, por exemplo `https://ultima-ilha.onrender.com` (e `http://localhost:3000` para testes).
6. Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`). Ele não é segredo.

## Publicar no Render

1. Crie uma conta em https://render.com e conecte o GitHub.
2. Clique em **New → Blueprint** e escolha este repositório. O `render.yaml` já configura tudo.
3. Quando pedir, cole o ID do cliente Google em `GOOGLE_CLIENT_ID`.
4. Depois que o site subir, confira se o endereço dele está nas origens autorizadas do Google (passo 5 acima).

No plano grátis do Render o servidor dorme depois de 15 minutos sem ninguém e leva uns 50 segundos para acordar,
e o arquivo de estatísticas é apagado a cada nova publicação. Para jogar sério, use o plano Starter (US$ 7/mês) com um disco
e defina `DATA_DIR` para a pasta do disco.

## Variáveis de ambiente

| Nome | Para que serve |
| --- | --- |
| `GOOGLE_CLIENT_ID` | ID do cliente OAuth do Google. Obrigatório em produção. |
| `LOBBY_WAIT` | Segundos esperando jogadores antes de completar com bots (padrão 25). |
| `DATA_DIR` | Pasta onde salvar as estatísticas (padrão `./data`). |
| `DEV_LOGIN` | `1` libera login sem Google. Use só no seu computador. |
