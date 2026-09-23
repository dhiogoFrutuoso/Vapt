# Personalização nativa

O aplicativo solicita uma compilação autenticada; **nenhuma chave de assinatura está no APK/EXE**. O mesmo código serve Android, Windows e web, mas a instalação personalizada só aparece nos dois ambientes nativos.

## Identidade e sessão

- Android: `com.vapt.equipe`, certificado original, versão base inalterada na personalização. O Android permite atualizar para o mesmo `versionCode` com a mesma assinatura.
- Windows: `appId=com.vapt.equipe`, executável `Vapt Equipe.exe`, GUID NSIS derivado do mesmo appId, perfil `Vapt Equipe` preservado. Nome exibido, ícone e nome do acesso instalado mudam; não existe gerador de atalhos no aplicativo.
- A marca instalada vem de `native-branding.json`, embutido no pacote, não de uma preferência que finge que a instalação aconteceu.
- Logout não altera os arquivos instalados. Primeira oferta opcional; o X fica salvo por restaurante e a opção continua no perfil. Uma marca instalada diferente da conta abre uma tela obrigatória, com saída da conta e sem fechamento por Escape.
- Personalização da mesma versão preserva sessão. Atualizações da versão base mantêm a regra de reautenticação do produto.

## Compilação

`POST /device/native-build` usa exclusivamente o restaurante autenticado. Nome/logo enviados pelo cliente são ignorados. A fila é deduplicada pelo hash da marca + versão base. Não há fallback silencioso para ícone genérico. São permitidas no máximo cinco marcas novas por restaurante/dia e três tentativas por marca.

O workflow privado `.github/workflows/personalized-apps.yml` consulta a fila a cada cinco minutos (o GitHub pode atrasar execuções agendadas). Só inicia o Windows runner quando existe trabalho. Cada job tem uma concessão de 60 minutos e processamento serial. Uma falha de infraestrutura pode aguardar o vencimento da concessão antes de tentar novamente.

Segredos no repositório privado Vapt:

- `VAPT_BUILD_WORKER_KEY`: HMAC-SHA256 do JWT_SECRET de produção com a mensagem `vapt:native-branding-worker:v1`. Capacidade específica para claim/complete; não autoriza sessões de funcionários. Rotacionar ao trocar JWT_SECRET.
- `VAPT_ANDROID_KEYSTORE_BASE64`, `VAPT_ANDROID_KEYSTORE_PASSWORD`, `VAPT_ANDROID_KEY_ALIAS`, `VAPT_ANDROID_KEY_PASSWORD`: a assinatura **existente**. Não gerar outro debug.keystore no runner.
- `VAPT_RELEASES_TOKEN`: fine-grained PAT somente para Vapt-Releases, `Contents: Read and write`. Rotacionar antes do vencimento.

`scripts/native-build-worker.mjs` só publica arquivos finais, sem código ou credenciais, em prereleases `personalized-<hash>` do Vapt-Releases. Nunca marca essas releases como latest: os downloads genéricos continuam apontando à versão oficial. SHA-256 retornado pelo GitHub deve conferir; o app verifica novamente antes de abrir o instalador. O Android também verifica a assinatura durante a instalação. No Windows, os instaladores continuam sem certificado Authenticode, como a distribuição anterior.

## Build local de validação

Os ícones usam recorte central proporcional (`cover`), sem barras brancas ou margens artificiais. A imagem preenche a camada de fundo do ícone adaptativo Android; o sistema aplica seu próprio formato. Imagens retangulares podem perder conteúdo nas extremidades. Transparência é composta sobre a cor dominante da imagem. A revisão de ícone faz parte da chave de cache: corrigir apenas a composição não reutiliza instaladores antigos nem exige logout por mudança da versão base.

`node apps/web/scripts/build-apps.mjs --job <manifest.json>` cria um checkout temporário em `.native-builds/`, gera o Android pelo Capacitor fixado no lockfile e usa `sharp` para os ícones. Não altera packageId, fontes ou configurações do checkout original. O manifesto contém `id`, `appId`, `name`, `logoId`, `version`. A versão precisa corresponder ao package.json. Assinatura Android e SDK/JDK devem estar configurados.

## Release base

Gerar e validar instaladores genéricos antes de anunciar a nova versão da API. Publicar a release genérica primeiro; depois enviar o commit com a versão e a API. Não reaproveitar o mesmo número de versão para código diferente em produção, pois o cache de personalização usa esse número.
