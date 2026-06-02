# Jogo da Velha

## Multiplayer local

1. No aparelho que vai ser o servidor, rode:

```bash
npm run dev
```

2. O terminal vai mostrar endereços como:

```text
http://localhost:3000
http://192.168.0.10:3000
```

3. Abra o endereço da rede local nos dois aparelhos, por exemplo `http://192.168.0.10:3000`.

4. Clique em **Conectar** nos dois navegadores. O primeiro jogador vira **X** e o segundo vira **O**.

Os aparelhos precisam estar na mesma rede Wi-Fi. Se não conectar, libere a porta `3000` no firewall do computador que está servindo o jogo.

Se a porta `3000` já estiver ocupada, rode em outra porta:

```powershell
$env:PORT=3010; npm run dev
```
