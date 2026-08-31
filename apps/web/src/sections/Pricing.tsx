import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Reveal } from '../components/Reveal';
import { SectionHeading } from '../components/SectionHeading';
import { TbCheck, TbMinus, TbShieldCheck } from 'react-icons/tb';
import { pricing, site, whatsappLink } from '../data/content';
import { fallbackPlans } from '../data/plans.fallback';
import { api, type Plan } from '../lib/api';
import { brl, brlCompact } from '../lib/format';

const COMMISSION_RATE = 0.23;

export function Pricing() {
  const [plans, setPlans] = useState<Plan[]>(fallbackPlans);
  const [annual, setAnnual] = useState(false);
  const [revenue, setRevenue] = useState(30000);

  useEffect(() => {
    let alive = true;
    api
      .getPlans()
      .then((data) => {
        if (alive && data.length > 0) setPlans(data);
      })
      .catch(() => {
        /* mantem o fallback local: a secao de preco nunca fica vazia */
      });
    return () => {
      alive = false;
    };
  }, []);

  const fullPlanPrice = useMemo(() => {
    const complete = plans.find((p) => p.highlighted) ?? plans[plans.length - 1];
    return annual ? complete.annualPrice : complete.monthlyPrice;
  }, [plans, annual]);

  const commission = revenue * COMMISSION_RATE;
  const savings = Math.max(0, commission - fullPlanPrice);

  return (
    <section className="pricing section" id="planos">
      <div className="container">
        <SectionHeading eyebrow={pricing.eyebrow} title={pricing.title} subtitle={pricing.subtitle} />

        {/* ---------------- Calculadora de comissao ---------------- */}
        <Reveal className="calc">
          <div className="calc__head">
            <h3>{pricing.calculator.title}</h3>
            <p>{pricing.calculator.subtitle}</p>
          </div>

          <div className="calc__slider">
            <label htmlFor="calc-revenue">{pricing.calculator.revenueLabel}</label>
            <strong>{brlCompact(revenue)}</strong>
            <input
              id="calc-revenue"
              type="range"
              min={5000}
              max={150000}
              step={1000}
              value={revenue}
              onChange={(e) => setRevenue(Number(e.target.value))}
            />
            <div className="calc__scale">
              <span>{brlCompact(5000)}</span>
              <span>{brlCompact(150000)}</span>
            </div>
          </div>

          <div className="calc__result">
            <div className="calc__box calc__box--bad">
              <span>{pricing.calculator.commissionLabel}</span>
              <strong>- {brlCompact(commission)}</strong>
            </div>
            <div className="calc__box">
              <span>{pricing.calculator.vaptappLabel}</span>
              <strong>- {brl(fullPlanPrice)}</strong>
            </div>
            <div className="calc__box calc__box--good">
              <span>{pricing.calculator.savingsLabel}</span>
              <strong>+ {brlCompact(savings)}</strong>
              <small>
                {pricing.calculator.yearLabel} {brlCompact(savings * 12)}
              </small>
            </div>
          </div>

          <div className="calc__foot">
            <p>{pricing.calculator.footnote}</p>
            <Link className="btn btn--primary" to="/register">
              {pricing.calculator.cta}
            </Link>
          </div>
        </Reveal>

        {/* ---------------- Toggle mensal/anual ---------------- */}
        <div className="billing-toggle" role="group" aria-label="Periodicidade de cobrança">
          <button type="button" className={!annual ? 'is-active' : ''} onClick={() => setAnnual(false)}>
            {pricing.monthlyLabel}
          </button>
          <button type="button" className={annual ? 'is-active' : ''} onClick={() => setAnnual(true)}>
            {pricing.annualLabel}
            <span className="billing-toggle__badge">{pricing.annualBadge}</span>
          </button>
        </div>

        {/* ---------------- Cards de plano ---------------- */}
        <div className="plans">
          {plans.map((plan, index) => (
            <Reveal
              as="article"
              key={plan.slug}
              delay={index * 100}
              className={`plan ${plan.highlighted ? 'plan--featured' : ''}`}
            >
              {plan.badge && <span className="plan__badge">{plan.badge}</span>}
              <h3>{plan.name}</h3>
              <p className="plan__tagline">{plan.tagline}</p>

              <div className="plan__price">
                <span className="plan__currency">R$</span>
                <strong>{annual ? plan.annualPrice : plan.monthlyPrice}</strong>
                <span className="plan__period">{pricing.perMonth}</span>
              </div>
              <p className="plan__price-note">
                {annual ? `${pricing.annualNote} · ${brl((annual ? plan.annualPrice : plan.monthlyPrice) * 12)}` : 'sem fidelidade, cancele quando quiser'}
              </p>

              <Link
                className={`btn ${plan.highlighted ? 'btn--primary' : 'btn--outline'} btn--block`}
                to={`/register?plano=${encodeURIComponent(plan.name)}`}
              >
                {plan.ctaLabel}
              </Link>

              <ul className="plan__features">
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <span aria-hidden="true" style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: '6px' }}><TbCheck /></span>
                    {feature}
                  </li>
                ))}
                {plan.notIncluded.map((feature) => (
                  <li key={feature} className="is-disabled">
                    <span aria-hidden="true" style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: '6px' }}><TbMinus /></span>
                    {feature}
                  </li>
                ))}
              </ul>

              {plan.comparison && <p className="plan__comparison">{plan.comparison}</p>}
            </Reveal>
          ))}
        </div>

        {/* ---------------- Incluso em todos + garantia ---------------- */}
        <div className="pricing__extra">
          <Reveal className="included">
            <h3>{pricing.includedTitle}</h3>
            <ul>
              {pricing.included.map((item) => (
                <li key={item}>
                  <span aria-hidden="true" style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: '6px' }}><TbCheck /></span> {item}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={120} className="guarantee">
            <span aria-hidden="true" style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: '6px' }}><TbShieldCheck /></span>
            <h3>{pricing.guarantee.title}</h3>
            <p>{pricing.guarantee.text}</p>
          </Reveal>
        </div>

        <p className="pricing__footnote">
          {pricing.ctaFootnote}{' '}
          <a
            href={whatsappLink(`Olá! Tenho mais de uma unidade e quero um plano do ${site.name} sob medida.`)}
            target="_blank"
            rel="noreferrer"
          >
            Falar com o time
          </a>
        </p>
      </div>
    </section>
  );
}
