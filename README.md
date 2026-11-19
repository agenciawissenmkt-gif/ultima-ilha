# Última Ilha

Battle royale online em 3D, direto no navegador, com câmera em terceira pessoa (inspirado em Free Fire e Call of Duty).
Até 50 jogadores por partida, com bots completando as vagas. Mapa com montanhas, casas com porta e janelas, árvores e pedras.
Miras: ponto vermelho, 2x, 4x e sniper 8x, com sensibilidade separada para cada uma.
Modos: solo, dupla, trio, squad (4) e quinteto (5). Sem cadastro: qualquer pessoa entra só com um apelido.

## Como funciona

- `server/index.js`: entrega o site, faz a entrada por apelido, cuida dos grupos (código de 5 letras), da fila e das partidas.
- `server/match.js`: simula a partida no servidor (movimento, tiros, dano, bots, tempestade, caídos e reanimação). 30 passos por segundo.
- `public/shared.js`: gera o mapa a partir de uma semente e faz o movimento. Usado pelo servidor e pelo navegador.
- `public/client.js`: lobby, conexão, controles (PC e celular), câmera, miras, previsão do próprio movimento e interpolação dos outros jogadores.
- `public/gfx.js`: parte visual em three.js (céu, sombras, relevo com textura, grama, casas, soldados, armas, clarão de tiro).
- `public/vendor/three.min.js`: three.js r128, servido pelo próprio jogo.

O servidor é quem decide tudo, então o navegador não consegue trapacear mudando vida ou munição.
As estatísticas (partidas, vitórias, abates) ficam em `data/stats.json`.

## Controles

- PC: clique na tela para controlar a câmera. WASD anda, Shift ou Ctrl corre, Espaço pula, C agacha (correndo + C = deslize),
  Z deita, botão direito mira, botão esquerdo atira, 1 e 2 escolhem a arma, 3 deixa de mão livre (corre mais e dá soco),
  Q alterna, R recarrega, H cura, E pega arma do chão, F reanima, M abre o mapa.
- Celular: joystick à esquerda, arraste à direita para olhar, botões de atirar, mirar, pular, agachar, deitar e correr.
- Assistência de mira (liga e desliga em Ajustes): a mira gruda no inimigo e, atirando, puxa do peito para a cabeça.
- Skins no lobby: Soldado, Guerreiro, Bruxa, Ninja e Pirata, com 6 cores de calça. Mochilas Nv.1 a 3 aumentam a munição e a cura que dá para carregar.

## Rodar no seu computador

```bash
npm install
npm run dev      # abre em http://localhost:3000
```

Abra duas abas para testar grupo e partida juntos.

## Publicar no Render

1. Crie uma conta em https://render.com e conecte o GitHub.
2. Clique em **New → Blueprint** e escolha este repositório. O `render.yaml` já configura tudo.
3. Espere aparecer **Live** e abra o link do topo.

No plano grátis do Render o servidor dorme depois de 15 minutos sem ninguém e leva uns 50 segundos para acordar,
e o arquivo de estatísticas é apagado a cada nova publicação. Para jogar sério, use o plano Starter (US$ 7/mês) com um disco
e defina `DATA_DIR` para a pasta do disco.

## Variáveis de ambiente

| Nome | Para que serve |
| --- | --- |
| `LOBBY_WAIT` | Segundos esperando jogadores antes de completar com bots (padrão 25). |
| `DATA_DIR` | Pasta onde salvar as estatísticas (padrão `./data`). |
