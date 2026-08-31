import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'apps', 'web', 'src', 'components', 'phone', 'CheckoutSheet.tsx');
let content = fs.readFileSync(file, 'utf8');

const warningBanner = `
      <div style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
        <strong style={{ color: '#c2410c', display: 'block', fontSize: '0.9rem', marginBottom: '4px' }}>Aviso Importante:</strong>
        <p style={{ color: '#9a3412', fontSize: '0.85rem', margin: 0, lineHeight: '1.4' }}>
          O valor acima <strong>não é o total final</strong>, pois a <strong>taxa de entrega</strong> será calculada pelo nosso time. 
          O seu pedido será encaminhado para o nosso WhatsApp, onde o atendente informará o valor do frete e enviará a chave PIX (caso seja a forma de pagamento escolhida).
        </p>
      </div>
`;

content = content.replace(
  '<div className="phone__sheet-total is-final">',
  warningBanner + '      <div className="phone__sheet-total is-final">'
);

fs.writeFileSync(file, content, 'utf8');
