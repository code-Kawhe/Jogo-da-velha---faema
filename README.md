# Jogo da Velha

## Multiplayer local por codigo

1. No computador que vai ser o servidor, rode:

```bash
npm run dev
```

2. Abra o jogo no servidor:

```text
http://localhost:3000
```

3. A tela vai mostrar um codigo numerico do servidor.

4. Envie esse codigo para o outro jogador. Ele cola o codigo no campo de conexao e clica em **Conectar**.

5. O primeiro jogador conectado vira **X** e o segundo vira **O**.

Para o multiplayer local, abra o jogo pelo endereco do servidor local, como `http://localhost:3000` ou o IP do computador na rede. Se abrir por um dominio HTTPS estatico, como `https://velha.kawhe.top`, o navegador nao consegue conectar no servidor local via WebSocket.

Os aparelhos precisam estar na mesma rede Wi-Fi. Se nao conectar, libere a porta `3000` no firewall do computador que esta servindo o jogo.

Se a porta `3000` ja estiver ocupada, rode em outra porta:

```powershell
$env:PORT=3010; npm run dev
```

## Autores

Desenvolvido por:

- Kawhe Alves dos Santos
- Vitor
- Carlos
- Nykolas
- Samuel

Curso: Engenharia Civil
Disciplina: Algoritmo e Programacao
Ano: 2026
