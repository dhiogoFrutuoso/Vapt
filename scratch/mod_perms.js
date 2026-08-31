import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'apps', 'web', 'src', 'pages', 'DashboardPage.tsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Add state for permissions
content = content.replace(
  "const [newRoleName, setNewRoleName] = useState('');",
  "const [newRoleName, setNewRoleName] = useState('');\n  const [newRolePermissions, setNewRolePermissions] = useState<string[]>([]);\n  const PERMISSIONS = [\n    { id: 'pedidos', label: 'Pedidos / Caixa' },\n    { id: 'entregas', label: 'Fila de Entregas' },\n    { id: 'mesas', label: 'Gestão de Mesas' },\n    { id: 'cardapio', label: 'Editar Cardápio' }\n  ];"
);

// 2. Fix handleAddRole payload
content = content.replace(
  "permissions: ['pedidos', 'entregas']",
  "permissions: newRolePermissions"
);

// 3. Fix handleAddRole reset
content = content.replace(
  "setNewRoleName('');",
  "setNewRoleName('');\n      setNewRolePermissions([]);"
);

// 4. Update the form UI
const oldForm = `<form onSubmit={handleAddRole} style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }}>
                          <input type="text" placeholder="Ex: Cozinheiro" value={newRoleName} onChange={e => setNewRoleName(e.target.value)} required style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }} />
                          <button type="submit" disabled={isAddingRole} style={{ padding: '10px', background: '#334155', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}>+</button>
                        </form>`;

const newForm = `<form onSubmit={handleAddRole} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '1.5rem', backgroundColor: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                          <input type="text" placeholder="Nome da função (Ex: Cozinheiro)" value={newRoleName} onChange={e => setNewRoleName(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                          
                          <div>
                            <strong style={{ display: 'block', fontSize: '0.85rem', color: '#334155', marginBottom: '8px' }}>Permissões de Acesso:</strong>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                              {PERMISSIONS.map(p => (
                                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer', color: '#475569' }}>
                                  <input 
                                    type="checkbox" 
                                    checked={newRolePermissions.includes(p.id)}
                                    onChange={e => {
                                      if (e.target.checked) setNewRolePermissions([...newRolePermissions, p.id]);
                                      else setNewRolePermissions(newRolePermissions.filter(id => id !== p.id));
                                    }}
                                    style={{ accentColor: '#FF6B2C' }}
                                  />
                                  {p.label}
                                </label>
                              ))}
                            </div>
                          </div>

                          <button type="submit" disabled={isAddingRole || newRolePermissions.length === 0} style={{ padding: '10px', background: '#334155', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', opacity: (isAddingRole || newRolePermissions.length === 0) ? 0.5 : 1 }}>
                            Criar Função
                          </button>
                        </form>`;

content = content.replace(oldForm, newForm);

// 5. Update the listed Roles to show their permissions
const oldRoleList = `<span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#334155' }}>{r.name}</span>`;

const newRoleList = `<div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#334155' }}>{r.name}</span>
                                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                    {r.permissions?.map(p => (
                                      <span key={p} style={{ backgroundColor: '#f1f5f9', color: '#64748b', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', textTransform: 'capitalize' }}>
                                        {PERMISSIONS.find(perm => perm.id === p)?.label || p}
                                      </span>
                                    ))}
                                  </div>
                                </div>`;

content = content.replace(oldRoleList, newRoleList);

fs.writeFileSync(file, content, 'utf8');
