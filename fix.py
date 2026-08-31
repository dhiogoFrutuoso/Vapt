import sys

content = """      {/* -------------------------- A comanda --------------------------- */}
      {mode === 'comanda' && (
        <>
          <ul className="phone__sheet-items">
            {items.length === 0 && <li className="is-empty">{copy.orderEmpty}</li>}
            {items.map((item, index) => (
              <li key={`${item.name}-${index}`}>
                <span>{item.name}</span>
                <span className="phone__sheet-right">
                  {brl(item.price)}
                  <button type="button" onClick={() => onRemoveItem(index)} aria-label={`Remover ${item.name}`}>
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>

          <div className="phone__sheet-total">
            <span>Subtotal</span>
            <span>{brl(subtotal)}</span>
          </div>
          {ticket.serviceFeeRate > 0 && (
            <div className="phone__sheet-total">
              <span>{copy.serviceFee} ({Math.round(ticket.serviceFeeRate * 100)}%)</span>
              <span>{brl(service)}</span>
            </div>
          )}
          <div className="phone__sheet-total is-final">
            <span>Total</span>
            <strong>{brl(total)}</strong>
          </div>

          {ticket.status === 'pagamento' ? (
            <div className="sheet-pay">
              <span className="sheet-pay__title">{copy.choosePayment}</span>

              {!isSplitMode ? (
                <>
                  <div className="phone__pay">
                    {copy.payments.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={isSplitMode ? (splits.some(s => s.method === option.value) ? 'is-active' : '') : (splits[0].method === option.value ? 'is-active' : '')}
                        onClick={() => handleMethodToggle(option.value as PaymentMethod)}
                      >
                        <span aria-hidden="true" style={{ fontSize: '1.2rem', marginBottom: '4px' }}>
                          <IconRenderer name={option.iconName as string} />
                        </span>
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {splits.length === 1 && splits[0].method === 'dinheiro' && (
                    <div className="phone__field" style={{ marginTop: '12px' }}>
                      <label htmlFor="fw-ordersheet-change">{copy.changeLabel}</label>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#666', fontSize: '1rem', pointerEvents: 'none', zIndex: 2 }}>R$</span>
                        <MoneyInput
                          value={splits[0].amount}
                          onChange={(val) => setSplits([{ method: 'dinheiro', amount: val }])}
                        />
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    className="phone__split-toggle"
                    onClick={() => setIsSplitMode(true)}
                  >
                    Vou pagar com mais de um meio de pagamento (Ex: uma parte pix, e o resto em dinheiro)
                  </button>
                </>
              ) : (
                <div className="split-pay">
                  {splits.map((split, index) => (
                    <div key={index} className="split-pay__row">
                      <select
                        className="split-pay__select"
                        value={split.method}
                        onChange={(e) => updateSplit(index, { method: e.target.value as PaymentMethod })}
                      >
                        <option value="pix">PIX</option>
                        <option value="cartao">Cartão</option>
                        <option value="dinheiro">Dinheiro</option>
                      </select>
                      <div className="split-pay__input-wrapper">
                        <span className="split-pay__input-prefix">R$</span>
                        <MoneyInput
                          value={split.amount}
                          onChange={(val) => updateSplit(index, { amount: val })}
                        />
                      </div>
                      {splits.length > 1 && (
                        <button
                          type="button"
                          className="split-pay__remove"
                          onClick={() => removeSplit(index)}
                          title="Remover"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}

                  {remaining > 0.01 && (
                    <p style={{ fontSize: '0.8rem', color: '#f59e0b', margin: '4px 0' }}>
                      Falta: {brl(remaining)}
                    </p>
                  )}
                  {splitsTotal > total + 0.01 && (
                    <p style={{ fontSize: '0.8rem', color: '#ef4444', margin: '4px 0' }}>
                      Excede o total em {brl(splitsTotal - total)}
                    </p>
                  )}

                  <div className="split-pay__actions">
                    <button
                      type="button"
                      className="split-pay__add-btn"
                      onClick={addSplit}
                    >
                      + Adicionar forma
                    </button>
                    <button
                      type="button"
                      className="split-pay__cancel-btn"
                      onClick={() => {
                        setIsSplitMode(false);
                        setSplits([{ method: 'pix', amount: total }]);
                      }}
                    >
                      Cancelar divisão
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                className="phone__sheet-btn is-primary is-block"
                onClick={() => onConfirmPayment(splits)}
                disabled={!isValid}
                style={{ marginTop: '8px' }}
              >
                {copy.confirmPayment}
              </button>
            </div>
          ) : (
            <div className="phone__sheet-actions">
              <button type="button" className="phone__sheet-btn" onClick={() => setMode('cardapio')}>
                + {copy.addItem}
              </button>
              <button
                type="button"
                className="phone__sheet-btn is-primary"
                onClick={onRequestPayment}
                disabled={subtotal === 0}
              >
                {copy.closeTable}
              </button>
            </div>
          )}

          <button type="button" className="sheet-cancel" onClick={handleCancel}>
            🗑 {copy.cancelOrder}
          </button>
        </>
      )}
      {ConfirmElement}
    </div>
  );
}
"""

with open('apps/web/src/components/phone/OrderSheet.tsx', 'a', encoding='utf-8') as f:
    f.write(content)
