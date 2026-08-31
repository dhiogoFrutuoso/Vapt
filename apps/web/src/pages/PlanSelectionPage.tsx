import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, type Plan, type AppProjectFull } from '../lib/api';

export function PlanSelectionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [app, setApp] = useState<AppProjectFull | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        if (!id) return;
        const [appData, plansData] = await Promise.all([
          api.getApp(id),
          api.getPlans()
        ]);
        setApp(appData);
        setPlans(plansData);
      } catch (err) {
        console.error(err);
        alert('Erro ao carregar dados.');
        navigate('/painel');
      } finally {
        setLoading(false);
      }
    }
    void loadData();
  }, [id, navigate]);

  async function handleSelectPlan(planName: string) {
    if (!id) return;
    try {
      const res = await api.requestPlan(id, planName);
      // Redirecionar para o WhatsApp
      window.location.href = res.whatsappUrl;
    } catch (err) {
      console.error(err);
      alert('Erro ao selecionar o plano.');
    }
  }

  if (loading || !app) {
    return (
      <div className="container" style={{ padding: '4rem 0', textAlign: 'center' }}>
        <p>Carregando planos...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '4rem 2rem', maxWidth: '1000px', margin: '0 auto' }}>
      <button onClick={() => navigate(`/painel/app/${app._id}`)} className="btn btn--ghost" style={{ marginBottom: '2rem' }}>← Voltar para o editor</button>
      
      <h1 style={{ fontSize: '2rem', marginBottom: '1rem', textAlign: 'center' }}>Escolha um plano para {app.name}</h1>
      <p style={{ textAlign: 'center', marginBottom: '3rem', color: 'var(--text-muted)' }}>Você será redirecionado para o WhatsApp para finalizar a contratação com o nosso time.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
        {plans.map(plan => (
          <div key={plan.slug} style={{ border: plan.highlighted ? `2px solid ${app.brand.primaryColor}` : '1px solid var(--border-color)', borderRadius: '16px', padding: '2rem', position: 'relative', display: 'flex', flexDirection: 'column' }}>
            {plan.highlighted && (
              <span style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', backgroundColor: app.brand.primaryColor, color: '#fff', padding: '0.25rem 1rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                Recomendado
              </span>
            )}
            <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{plan.name}</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', minHeight: '48px' }}>{plan.tagline}</p>
            <div style={{ marginBottom: '2rem' }}>
              <span style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>R$ {plan.monthlyPrice}</span><span style={{ color: 'var(--text-muted)' }}>/mês</span>
            </div>
            
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 2rem 0', flex: 1 }}>
              {plan.features.map((feature, i) => (
                <li key={i} style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                  <span style={{ color: '#22c55e' }}>✓</span> {feature}
                </li>
              ))}
              {plan.notIncluded.map((feature, i) => (
                <li key={`not-${i}`} style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem', color: 'var(--text-muted)' }}>
                  <span>✗</span> {feature}
                </li>
              ))}
            </ul>

            <button 
              onClick={() => void handleSelectPlan(plan.name)}
              style={{ width: '100%', padding: '1rem', borderRadius: '8px', border: 'none', backgroundColor: plan.highlighted ? app.brand.primaryColor : '#f1f5f9', color: plan.highlighted ? '#fff' : 'var(--text-color)', fontWeight: 'bold', cursor: 'pointer' }}
            >
              {plan.ctaLabel}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
