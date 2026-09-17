# Instaladores do Vapt

O site distribui os binários versionados em `apps/web/public/downloads/`:
`vapt.apk` e `vapt.exe`. O diretório `releases/` guarda apenas cópias locais
temporárias. A publicação ocorre ao enviar o commit ao repositório conectado
à Vercel; não depende de um GitHub Release separado.

Para preparar uma atualização:

1. Incremente `apps/web/package.json` e a versão do workspace no lockfile.
   O `versionCode` Android deve ser maior que o APK publicado.
2. Configure a mesma chave Android das instalações anteriores via
   `VAPT_ANDROID_KEYSTORE_*`. Apenas na migração dos APKs antigos assinados
   com a chave de depuração desta máquina, use explicitamente
   `VAPT_LEGACY_DEBUG_SIGNING=true`. Não use outra chave: a instalação por
   cima do app anterior falhará.
3. Execute `npm run deploy:apps -w apps/web`. A rotina compila Windows e
   Android release, compara ID do pacote, assinatura e versão do APK anterior,
   e só então troca os downloads públicos locais.
4. Confirme `git diff`, faça commit e push. Verifique o download real no site
   e só depois aumente a versão mínima em `/api/admin/app/version`. Nunca
   force a atualização para um arquivo ainda não disponível.

`npm run build:android -w apps/web` gera só um APK **debug para testes**;
ele não altera o download público.
