import { Resend } from 'resend';
import { env } from '../config/env.js';

/**
 * E-mail transacional via Resend.
 *
 * Sem `RESEND_API_KEY` o envio fica desligado e o conteudo vai para o log do
 * servidor. Isso e deliberado: o fluxo de recuperacao continua testavel em
 * desenvolvimento sem depender de servico externo nem de dominio verificado,
 * e a ausencia de chave nunca derruba a API.
 */

let client: Resend | null = null;

function resend(): Resend | null {
  if (!env.mail.enabled) return null;
  if (!client) client = new Resend(env.mail.resendApiKey);
  return client;
}

/**
 * Template do codigo de recuperacao.
 *
 * Escrito em HTML de tabela com estilo inline de proposito: cliente de e-mail
 * nao e navegador. Gmail e Outlook descartam <style> em <head>, ignoram flex e
 * grid, e o Outlook desktop renderiza com o motor do Word. Tabela com atributos
 * e a unica coisa que chega igual nos tres.
 */
/** Exportado para permitir pre-visualizar o template sem disparar envio. */
export function resetCodeTemplate(code: string, minutes: number): string {
  const digits = code
    .split('')
    .map(
      (d) =>
        `<span style="display:inline-block;padding:0 6px;font-family:'Courier New',monospace;font-size:34px;font-weight:700;letter-spacing:2px;color:#ffffff;">${d}</span>`
    )
    .join('');

  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#FAF8F5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FAF8F5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background-color:#ffffff;border-radius:24px;padding:40px 32px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">

          <tr>
            <td align="center" style="padding-bottom:8px;">
              <span style="font-size:26px;font-weight:800;color:#111111;letter-spacing:-0.5px;">Vapt</span>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <span style="font-size:13px;color:#999999;">aplicativos rápidos</span>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding-bottom:10px;">
              <span style="font-size:20px;font-weight:700;color:#111111;">Recuperação de senha</span>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <span style="font-size:15px;line-height:1.55;color:#666666;">
                Use o código abaixo para criar uma nova senha.<br>Ele vale por ${minutes} minutos.
              </span>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding-bottom:28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background-color:#F95D2A;border-radius:16px;">
                <tr><td align="center" style="padding:20px 24px;">${digits}</td></tr>
              </table>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding-bottom:24px;">
              <span style="font-size:13px;line-height:1.6;color:#999999;">
                Se você não pediu esta recuperação, ignore este e-mail.<br>
                Sua senha atual continua valendo e nada foi alterado.
              </span>
            </td>
          </tr>

          <tr>
            <td align="center" style="border-top:1px solid #eeeeee;padding-top:22px;">
              <span style="font-size:12px;color:#bbbbbb;">
                Este é um e-mail automático — não responda.
              </span>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Versao em texto puro: alguns clientes so mostram isto, e evita cair em spam. */
function resetCodeText(code: string, minutes: number): string {
  return [
    'Vapt — Recuperação de senha',
    '',
    `Seu código: ${code}`,
    `Ele vale por ${minutes} minutos.`,
    '',
    'Se você não pediu esta recuperação, ignore este e-mail.',
  ].join('\n');
}

export async function sendResetCodeEmail(to: string, code: string, minutes: number): Promise<void> {
  const mailer = resend();

  if (!mailer) {
    console.warn(
      `[mail] RESEND_API_KEY ausente. Codigo de recuperacao para ${to}: ${code} (valido por ${minutes} min).`
    );
    return;
  }

  const { error } = await mailer.emails.send({
    from: env.mail.from,
    to,
    subject: `${code} é o seu código de recuperação — Vapt`,
    html: resetCodeTemplate(code, minutes),
    text: resetCodeText(code, minutes),
  });

  if (error) {
    /*
     * Nao propagamos o erro: a rota responde igual existindo ou nao a conta,
     * para nao virar um oraculo de e-mails cadastrados. O log fica para o
     * operador investigar (dominio nao verificado, chave invalida, quota).
     */
    console.error('[mail] Falha ao enviar o codigo de recuperacao.', error);
  }
}
