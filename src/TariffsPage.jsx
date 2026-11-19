import { useEffect, useRef, useState } from 'react';
import { formatMoney } from './formatters.js';
import { getTariffOptions, allowanceText, allowanceChange,
  TARIFF_CATEGORY_LABELS, TARIFF_CATEGORY_ACCENTS, TARIFF_ACCENTS, BILLING_PERIOD_LABELS } from './tariffData.js';
import './TariffsPage.css';

function TariffsPage({
  hidden, tariffs, subscriptions, suspendedSubscriptions, activeSubscription,
  tariffsMessage, isTariffsLoading, isSubscriptionsLoading, subscriptionsError,
  submittingTariffId, pendingCancellation, error, notice, onSubscribe, onCancelSuspended,
}) {
  const [tariffIndex, setTariffIndex] = useState(0);
  const [switchTarget, setSwitchTarget] = useState(null);
  const switchDialogRef = useRef(null);

  useEffect(() => {
    if (switchTarget && switchDialogRef.current && !switchDialogRef.current.open) {
      switchDialogRef.current.showModal();
    }
  }, [switchTarget]);

  const currentOptions = getTariffOptions(activeSubscription);
  const selectedOptions = getTariffOptions(switchTarget);
  const currentFeatures = currentOptions?.features || [];
  const selectedFeatures = selectedOptions?.features || [];
  const comparedFeatures = [...new Set([...currentFeatures, ...selectedFeatures])];
  const lastTariffIndex = Math.max(0, tariffs.length - 4);

  return (
    <>
      <main className="dashboard-main tariffs-page" hidden={hidden}>
        <p className="eyebrow">Услуги</p>
        <div className="tariffs-heading">
          <div>
            <h1>Тарифы</h1>
            <p>Выберите подходящий вариант для дома и связи.</p>
          </div>
          <span className="tariffs-counter">
            {tariffIndex + 1}–{Math.min(tariffIndex + 4, tariffs.length)} / {tariffs.length}
          </span>
        </div>
        {error && <div className="dashboard-alert error-alert" role="alert">{error}</div>}
        {notice && <div className="dashboard-alert success-alert" role="status">{notice}</div>}
        {subscriptionsError && <div className="dashboard-alert error-alert" role="alert">{subscriptionsError}</div>}
        {suspendedSubscriptions.length > 1 && (
          <div className="dashboard-alert info-alert" role="status">
            Ожидают оплаты: {suspendedSubscriptions.map((item) => item.tariffName).join(', ')}. Отмените ненужные тарифы: бэкенд может списать деньги за каждый из них.
          </div>
        )}
        {tariffsMessage && <div className="dashboard-alert info-alert" role="status">{tariffsMessage}</div>}
        {isTariffsLoading ? (
          <div className="tariffs-loading">Загружаем тарифы…</div>
        ) : tariffs.length === 0 ? (
          <div className="tariffs-empty-state">
            <h2>Тарифов пока нет</h2>
            <p>Активные предложения появятся здесь после добавления в бэкенде.</p>
          </div>
        ) : (
        <section className="tariffs-carousel" aria-label="Доступные тарифы">
          <button
            className="tariffs-arrow"
            type="button"
            aria-label="Предыдущий тариф"
            onClick={() => setTariffIndex((current) => (current === 0 ? lastTariffIndex : current - 1))}
          >
            ‹
          </button>
          <div className="tariffs-viewport">
            <div
              className="tariffs-track"
              style={{ '--tariff-index': tariffIndex }}
            >
              {tariffs.map((tariff) => {
                const connected = subscriptions.find((item) => item.tariffId === tariff.id && item.status === 'ACTIVE');
                const suspended = suspendedSubscriptions.find((item) => item.tariffId === tariff.id);
                return <article className={`tariff-card tariff-${TARIFF_ACCENTS[tariff.name] || TARIFF_CATEGORY_ACCENTS[tariff.category] || 'purple'}`} key={tariff.id || tariff.name}>
                  <p className="card-label">{TARIFF_CATEGORY_LABELS[tariff.category] || 'Тариф'}</p>
                  <h2>{tariff.name}</h2>
                  <p className="tariff-description">{tariff.description || 'Описание тарифа пока не указано.'}</p>
                  <strong className="tariff-speed">{tariff.speed || BILLING_PERIOD_LABELS[tariff.billingPeriod] || tariff.billingPeriod}</strong>
                  {tariff.features?.length > 0 && (
                    <ul className="tariff-features">
                      {tariff.features.map((feature) => <li key={feature}>{feature}</li>)}
                    </ul>
                  )}
                  <div className="tariff-price">
                    <strong>{formatMoney(tariff.price, tariff.currency)}</strong>
                    <span>{BILLING_PERIOD_LABELS[tariff.billingPeriod] || tariff.billingPeriod}</span>
                  </div>
                  {suspended ? (
                    <div className="tariff-card-actions">
                      <span>Ожидает оплаты</span>
                      <button className="tariff-button" type="button" disabled={Boolean(submittingTariffId)} onClick={() => onCancelSuspended(suspended)}>
                        {submittingTariffId === tariff.id ? 'Отменяем…' : 'Отменить ожидание'}
                      </button>
                    </div>
                  ) : (
                    <button
                      className="tariff-button"
                      type="button"
                      disabled={!tariff.id || Boolean(submittingTariffId) || isSubscriptionsLoading || Boolean(subscriptionsError) || Boolean(connected) || Boolean(pendingCancellation)}
                      onClick={() => activeSubscription ? setSwitchTarget(tariff) : onSubscribe(tariff)}
                    >
                      {connected ? 'Подключён' : submittingTariffId === tariff.id ? 'Подключаем…' : 'Подключить'}
                    </button>
                  )}
                </article>
              })}
            </div>
          </div>
          <button
            className="tariffs-arrow"
            type="button"
            aria-label="Следующий тариф"
            onClick={() => setTariffIndex((current) => (current === lastTariffIndex ? 0 : current + 1))}
          >
            ›
          </button>
        </section>
        )}
      </main>

      {switchTarget && activeSubscription && (
        <dialog ref={switchDialogRef} className="tariff-switch-dialog" onClose={() => setSwitchTarget(null)} aria-labelledby="tariff-switch-title">
          <button className="tariff-switch-close" type="button" aria-label="Закрыть" onClick={() => setSwitchTarget(null)}>×</button>
          <p className="card-label">Смена тарифа</p>
          <h2 id="tariff-switch-title">{activeSubscription.tariffName} → {switchTarget.name}</h2>
          <div className="tariff-switch-comparison">
            {[
              ['Гигабайты', 'gigabytes', 'ГБ'],
              ['Минуты', 'minutes', 'минут'],
              ['СМС', 'sms', 'SMS'],
            ].map(([label, field, unit]) => {
              const previous = currentOptions?.[field];
              const next = selectedOptions?.[field];
              const change = allowanceChange(previous, next);
              return (
                <div className="tariff-switch-row" key={field}>
                  <span>{label}</span>
                  <strong className={`tariff-switch-${change}`}>
                    {previous === next && (Number.isFinite(previous) || previous === Infinity)
                      ? `Не меняется (${allowanceText(next, unit)})`
                      : `${allowanceText(previous, unit)} → ${allowanceText(next, unit)}`}
                  </strong>
                </div>
              );
            })}
          </div>
          <h3>Дополнительные возможности</h3>
          <ul className="tariff-switch-features">
            {comparedFeatures.map((feature) => {
              const change = !selectedFeatures.includes(feature) ? 'removed' : !currentFeatures.includes(feature) ? 'added' : 'neutral';
              return <li className={`tariff-switch-${change}`} key={feature}>{change === 'added' ? '+ ' : change === 'removed' ? '− ' : '✓ '}{feature}</li>;
            })}
          </ul>
          <p className="tariff-switch-payment">После подтверждения спишется {formatMoney(switchTarget.price, switchTarget.currency)}. Остаток прежнего периода не пересчитывается.</p>
          <p className="tariff-switch-question">Точно хотите изменить тариф?</p>
          <div className="tariff-switch-buttons">
            <button type="button" onClick={() => setSwitchTarget(null)}>Нет, оставить</button>
            <button type="button" onClick={() => {
              const nextTariff = switchTarget;
              setSwitchTarget(null);
              onSubscribe(nextTariff, activeSubscription);
            }}>Да, изменить</button>
          </div>
        </dialog>
      )}
    </>
  );
}

export default TariffsPage;
