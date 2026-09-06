# releases/

Instaladores prontos para publicar. **O conteúdo desta pasta não é versionado** —
só este arquivo é.

O `.exe` tem ~78 MB. Um binário desse tamanho no histórico do Git fica lá para
sempre: `git clone` passa a baixá-lo mesmo depois de removido, e cada nova
versão soma outros 78 MB que ninguém consegue apagar sem reescrever o
histórico. Por isso os binários moram no GitHub Releases, e aqui só de
passagem.

## Como gerar

```bash
npm run build:win     -w apps/web    # gera o .exe (Electron + NSIS)
npm run build:android -w apps/web    # gera o .apk (Capacitor + Gradle)
npm run deploy:apps        -w apps/web    # copia os dois para cá com nome estável
```

Ou tudo de uma vez:

```bash
npm run build:all -w apps/web
```

Ao final a pasta contém exatamente dois arquivos:

| arquivo | plataforma |
|---|---|
| `vapt-setup.exe` | Windows (instalador NSIS) |
| `vapt.apk` | Android |

## Como publicar

1. No repositório **público** de downloads: *Releases → Create a new release*.
2. Crie a tag da versão (`v1.0.0`, `v1.1.0`, ...).
3. Arraste os dois arquivos desta pasta para os *assets* do release.

**Os nomes dos arquivos não podem mudar entre versões.** As URLs do site usam
`/releases/latest/download/vapt-setup.exe`, que resolve sempre para o release
mais recente — mas casa pelo nome do arquivo. É por isso que o nome não leva
número de versão: a versão fica na tag, e as variáveis de ambiente do site são
configuradas uma única vez.

## Atenção: o repositório precisa ser público

URLs de assets de release em repositório **privado** exigem token de
autenticação. A página `/download` é pública e não tem token, então o download
falharia para todo mundo.

O repositório do código-fonte pode continuar privado — crie um segundo
repositório, público, contendo apenas os releases. Nenhuma linha de código
precisa ir para ele.
