import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'apps', 'web', 'src', 'components', 'phone', 'DeliveryView.tsx');
let content = fs.readFileSync(file, 'utf8');

// Update Props
content = content.replace(
  'onAdvance: (id: string) => void;',
  'onAdvance: (id: string) => void;\n  onRevert: (id: string) => void;\n  onCancel: (id: string) => void;'
);

// Update component signature
content = content.replace(
  'export function DeliveryView({ orders, interactive, onAdvance }: Props) {',
  'export function DeliveryView({ orders, interactive, onAdvance, onRevert, onCancel }: Props) {'
);

// Add the buttons to the render loop
const oldActions = `              <div className="phone__delivery-actions">
                <a className="phone__sheet-btn" href={mapsUrl(order.address)} target="_blank" rel="noreferrer">
                  🗺️ {copy.deliveryMaps}
                </a>
                <button
                  type="button"
                  className="phone__sheet-btn is-primary"
                  onClick={() => onAdvance(order.id)}
                  disabled={!interactive || order.status === 'entregue'}
                >
                  {copy.deliveryActions[order.status]}
                </button>
              </div>
            </li>`;

const newActions = `              <div className="phone__delivery-actions">
                <a className="phone__sheet-btn" href={mapsUrl(order.address)} target="_blank" rel="noreferrer" style={{ backgroundColor: '#e2e8f0', color: '#334155' }}>
                  🗺️ {copy.deliveryMaps}
                </a>
                <button
                  type="button"
                  className="phone__sheet-btn is-primary"
                  onClick={() => onAdvance(order.id)}
                  disabled={!interactive || order.status === 'entregue'}
                >
                  {copy.deliveryActions[order.status]}
                </button>
              </div>
              {order.status !== 'entregue' && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Voltar pedido para a Recepção? O entregador não verá mais este pedido.')) onRevert(order.id);
                    }}
                    style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', color: '#475569', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    ↩️ P/ Recepção
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Tem certeza que deseja EXCLUIR este pedido permanentemente?')) onCancel(order.id);
                    }}
                    style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #fecaca', backgroundColor: '#fef2f2', color: '#ef4444', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    🗑️ Excluir
                  </button>
                </div>
              )}
            </li>`;

content = content.replace(oldActions, newActions);

fs.writeFileSync(file, content, 'utf8');
