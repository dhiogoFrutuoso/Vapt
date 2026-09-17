# Publicação dos instaladores

O código do Vapt continua privado. Os instaladores assinados ficam em
`builds/vapt.apk` e `builds/vapt-setup.exe`, na raiz deste projeto, e são
publicados também como assets de uma release no repositório público
[`Vapt-Releases`](https://github.com/dhiogoFrutuoso/Vapt-Releases).

Links estáveis para a última release:

- Android: `https://github.com/dhiogoFrutuoso/Vapt-Releases/releases/latest/download/vapt.apk`
- Windows: `https://github.com/dhiogoFrutuoso/Vapt-Releases/releases/latest/download/vapt-setup.exe`

Para preparar a próxima versão:

1. Atualize `apps/web/package.json` e o lockfile. O `versionCode` Android
   deve superar o do APK já distribuído.
2. Assine o Android com a mesma chave usada anteriormente. Durante a migração
   dos APKs antigos assinados com a chave de depuração desta máquina, use
   explicitamente `VAPT_LEGACY_DEBUG_SIGNING=true`; trocar a chave impede a
   instalação sobre o aplicativo existente.
3. Execute `npm run deploy:apps -w apps/web`. O script compila, verifica ID do
   pacote, versão e assinatura, e só então atualiza os arquivos em `builds/`
   e `apps/api/src/config/nativeRelease.ts`.
4. Execute `npm run release:publish` na raiz. O script envia somente os dois
   instaladores à branch `main` de `Vapt-Releases` e cria a release pública
   não preliminar, mantendo exatamente os nomes acima. O espelho na branch é
   necessário porque versões antigas do Windows precisam de uma URL direta,
   sem redirecionamento para um asset sem `.exe`.
5. Verifique os dois links de download e a versão do APK. Só depois envie o
   commit privado do Vapt que atualiza a API e o site. Isso evita avisar os
   funcionários de uma versão ainda indisponível.

`releases/` é apenas uma área temporária local. O site não embute os binários
em `apps/web/public/downloads/` nem depende de assets privados do GitHub.
