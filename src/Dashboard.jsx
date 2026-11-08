import { useCallback, useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { ApiError, getJson, postJson } from './api.js';
import './Dashboard.css';

const ACCOUNT_STATUSES = {
  ACTIVE: 'Активен',
  BLOCKED: 'Заблокирован',
  CLOSED: 'Закрыт',
};

const TRANSACTION_TYPES = {
  TOP_UP: { label: 'Пополнение', sign: '+', className: 'income' },
  CHARGE: { label: 'Списание', sign: '−', className: 'expense' },
  REFUND: { label: 'Возврат', sign: '+', className: 'income' },
};

const TARIFFS = [
  {
    name: 'Поминутный',
    description: 'Без абонентской платы: платите только за использованную связь.',
    speed: '2,5 ₽ / минута',
    price: '2,5 ₽',
    period: 'за минуту',
    accent: 'purple',
    features: ['SMS — 2,5 ₽', '1 ГБ — 15 ₽ в день'],
  },
  {
    name: 'Посуточный',
    description: 'Пакет начисляется только в те дни, когда вы пользуетесь связью.',
    speed: '1 ГБ + 30 минут',
    price: '25 ₽',
    period: 'в сутки',
    accent: 'orange',
    features: ['10 SMS', 'Безлимит внутри сети'],
  },
  {
    name: 'Старт',
    description: 'Всё необходимое для общения и повседневных задач.',
    speed: '5 ГБ + 100 минут',
    price: '350 ₽',
    period: 'в месяц',
    accent: 'blue',
    features: ['50 SMS', 'Безлимит внутри сети', 'Безлимит на мессенджеры'],
  },
  {
    name: 'Детский',
    description: 'Связь для ребёнка с дополнительной заботой родителей.',
    speed: '20 ГБ + 300 минут',
    price: '450 ₽',
    period: 'в месяц',
    accent: 'purple',
    action: '−20% при подключении к семейной группе',
    features: ['100 SMS', 'Родительский контроль', 'Геолокация ребёнка'],
  },
  {
    name: 'Базовый',
    description: 'Сбалансированный тариф для общения и интернета.',
    speed: '10 ГБ + 200 минут',
    price: '550 ₽',
    period: 'в месяц',
    accent: 'blue',
    features: ['200 SMS', 'Безлимит внутри сети', 'Защита от спама'],
  },
  {
    name: 'Онлайн',
    description: 'Больше интернета для видео, соцсетей и мессенджеров.',
    speed: '30 ГБ + 500 минут',
    price: '650 ₽',
    period: 'в месяц',
    accent: 'orange',
    action: 'Цена заморожена на год',
    features: ['100 SMS', 'Безлимит на мессенджеры, соцсети и видео'],
  },
  {
    name: 'Оптимальный',
    description: 'Большой пакет минут и интернета для активного общения.',
    speed: '50 ГБ + 800 минут',
    price: '800 ₽',
    oldPrice: '940 ₽',
    period: 'в месяц',
    accent: 'purple',
    popular: true,
    action: '−15% первые 3 месяца',
    features: ['300 SMS', 'Онлайн-кинотеатр', 'Перенос остатков ГБ и минут'],
  },
  {
    name: 'Безлимитный',
    description: 'Безлимитный интернет для тех, кто всегда онлайн.',
    speed: 'Безлимит ГБ + 1500 минут',
    price: '950 ₽',
    period: '30 дней',
    accent: 'orange',
    action: '−5% при автоплатеже',
    features: ['500 SMS', 'Раздача интернета — 30 ГБ', '5G без доплаты'],
  },
  {
    name: 'Для устройств',
    description: 'Отдельный тариф для модемов, роутеров и планшетов.',
    speed: '60 ГБ',
    price: '700 ₽',
    period: 'в месяц',
    accent: 'blue',
    features: ['Раздача без ограничений', 'Подходит для роутеров'],
  },
  {
    name: 'Семейный',
    description: 'Общий пакет связи для всей семьи на одном тарифе.',
    speed: 'Безлимит ГБ + 2500 минут',
    price: '1 250 ₽',
    period: '30 дней',
    accent: 'purple',
    features: ['1000 SMS', '+2 номера в группе бесплатно', 'Родительский контроль'],
  },
  {
    name: 'Премиум',
    description: 'Максимальные возможности и приоритетная поддержка.',
    speed: 'Безлимит ГБ и минут',
    price: '2 000 ₽',
    period: 'в месяц',
    accent: 'orange',
    features: ['Безлимит SMS', '5 ГБ в роуминге', 'Онлайн-кинотеатр и музыка', '+3 номера бесплатно'],
  },
];

const PENDING_PAYMENT_KEY = 'pendingPaymentId';
const PAYMENT_POLL_INTERVAL = 3000;
const PAYMENT_POLL_ATTEMPTS = 20;

function formatMoney(value, currency = 'RUB') {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDate(value) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatProfilePhone(phone = '') {
  const digits = phone.replace(/\D/g, '');
  if (digits.length !== 11) return phone;
  return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9)}`;
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 5) return 'Доброй ночи';
  if (hour < 12) return 'Доброе утро';
  if (hour < 18) return 'Добрый день';
  if (hour < 23) return 'Добрый вечер';
  return 'Доброй ночи';
}

function Dashboard({ onLogout }) {
  const [currentPage, setCurrentPage] = useState('home');
  const [tariffIndex, setTariffIndex] = useState(0);
  const [profile, setProfile] = useState(null);
  const [account, setAccount] = useState(undefined);
  const [transactions, setTransactions] = useState([]);
  const [amount, setAmount] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const idempotencyKeyRef = useRef('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [paymentMessage, setPaymentMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleError = useCallback((requestError) => {
    if (requestError instanceof ApiError && requestError.status === 401) {
      onLogout();
      return;
    }
    setError(requestError.message || 'Не удалось загрузить данные');
  }, [onLogout]);

  const loadData = useCallback(async (showLoader = true) => {
    if (showLoader) setIsLoading(true);
    setError('');

    try {
      const [user, userAccount] = await Promise.all([
        getJson('/api/users/me', { auth: true }),
        getJson('/api/billing/accounts/me', { auth: true }).catch((requestError) => {
          if (requestError instanceof ApiError && requestError.status === 404) return null;
          throw requestError;
        }),
      ]);

      setProfile(user);
      setAccount(userAccount);

      if (userAccount) {
        try {
          const history = await getJson('/api/billing/accounts/me/transactions?size=6', {
            auth: true,
          });
          setTransactions(history.content || []);
        } catch (historyError) {
          setTransactions([]);
          handleError(historyError);
        }
      } else {
        setTransactions([]);
      }
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setIsLoading(false);
    }
  }, [handleError]);

  const checkPendingPayment = useCallback(async () => {
    const paymentId = localStorage.getItem(PENDING_PAYMENT_KEY);
    if (!paymentId) return 'NONE';

    try {
      const payment = await getJson(`/api/billing/payments/${paymentId}`, { auth: true });

      if (payment.status === 'SUCCEEDED') {
        localStorage.removeItem(PENDING_PAYMENT_KEY);
        setPaymentMessage('');
        await loadData(false);
        setNotice('Баланс успешно пополнен');
        return 'SUCCEEDED';
      }

      if (payment.status === 'CANCELED') {
        localStorage.removeItem(PENDING_PAYMENT_KEY);
        setPaymentMessage('');
        setError('Платёж отменён. Деньги на баланс не зачислены.');
        return 'CANCELED';
      }

      if (payment.status === 'REFUND_REQUIRED') {
        localStorage.removeItem(PENDING_PAYMENT_KEY);
        setPaymentMessage('');
        setError('Платёж оплачен, но счёт закрыт. Обратитесь в поддержку для возврата.');
        return 'REFUND_REQUIRED';
      }

      setPaymentMessage('Платёж обрабатывается. Баланс обновится после подтверждения оплаты.');
      return 'PENDING';
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 404) {
        localStorage.removeItem(PENDING_PAYMENT_KEY);
      }
      handleError(requestError);
      return 'ERROR';
    }
  }, [handleError, loadData]);

  useEffect(() => {
    const timer = window.setTimeout(loadData, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  useEffect(() => {
    if (!localStorage.getItem(PENDING_PAYMENT_KEY)) return undefined;

    if (window.location.pathname === '/payments/return') {
      window.history.replaceState({}, '', '/');
    }

    let isActive = true;
    let timer;

    const pollPayment = async (attempt = 0) => {
      const status = await checkPendingPayment();
      if (!isActive || status !== 'PENDING') return;

      if (attempt + 1 < PAYMENT_POLL_ATTEMPTS) {
        timer = window.setTimeout(() => pollPayment(attempt + 1), PAYMENT_POLL_INTERVAL);
      } else {
        setPaymentMessage('Платёж ещё обрабатывается. Обновите страницу немного позже.');
      }
    };

    pollPayment();

    return () => {
      isActive = false;
      window.clearTimeout(timer);
    };
  }, [checkPendingPayment]);

  useEffect(() => {
    if (!notice) return undefined;

    const timer = window.setTimeout(() => setNotice(''), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const openAccount = async () => {
    setIsSubmitting(true);
    setError('');

    try {
      await postJson('/api/billing/accounts', undefined, { auth: true });
      await loadData(false);
      setNotice('Лицевой счёт открыт');
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const topUpAccount = async (event) => {
    event.preventDefault();
    const normalizedAmount = amount.trim().replace(',', '.');

    if (!/^\d+(\.\d{1,2})?$/.test(normalizedAmount) || Number(normalizedAmount) <= 0) {
      setError('Введите сумму больше нуля, не более двух знаков после запятой');
      return;
    }

    setIsSubmitting(true);
    setError('');
    setNotice('');

    let paymentKey = idempotencyKeyRef.current || idempotencyKey;
    if (!paymentKey) {
      paymentKey = crypto.randomUUID();
      idempotencyKeyRef.current = paymentKey;
      setIdempotencyKey(paymentKey);
    }

    try {
      const payment = await postJson(
        '/api/billing/payments',
        { amount: Number(normalizedAmount) },
        {
          auth: true,
          headers: { 'Idempotency-Key': paymentKey },
        },
      );

      if (payment.confirmationUrl?.startsWith('/api/')) {
        const confirmedPayment = await postJson(payment.confirmationUrl, undefined, { auth: true });
        if (confirmedPayment.status !== 'SUCCEEDED') {
          throw new Error('Не удалось подтвердить пополнение баланса');
        }
      } else if (payment.confirmationUrl) {
        let confirmationUrl;
        try {
          confirmationUrl = new URL(payment.confirmationUrl);
        } catch {
          throw new Error('Сервис оплаты вернул некорректную ссылку');
        }

        if (!['http:', 'https:'].includes(confirmationUrl.protocol)) {
          throw new Error('Сервис оплаты вернул некорректную ссылку');
        }

        localStorage.setItem(PENDING_PAYMENT_KEY, payment.id);
        window.location.assign(confirmationUrl.href);
        return;
      } else {
        throw new Error('Сервис оплаты не вернул ссылку для подтверждения');
      }

      setAmount('');
      setIdempotencyKey('');
      idempotencyKeyRef.current = '';
      await loadData(false);
      setNotice('Баланс успешно пополнен');
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const logout = async () => {
    const refreshToken = localStorage.getItem('refreshToken');

    try {
      if (refreshToken) await postJson('/api/auth/logout', { refreshToken });
    } catch {
      // Локальный выход должен работать, даже если сервер недоступен
    } finally {
      localStorage.removeItem(PENDING_PAYMENT_KEY);
      onLogout();
    }
  };

  if (isLoading) {
    return <div className="dashboard-loader">Загружаем личный кабинет…</div>;
  }

  const displayName = profile?.firstName || profile?.username || '';

  return (
    <div className="dashboard-page">
      <Helmet>
        <title>Главная</title>
      </Helmet>

      <header className="dashboard-header">
        <div className="header-content">
          <img className="dashboard-logo" src="/rostelecom-logo.png" alt="Ростелеком" />
          <nav className="dashboard-nav" aria-label="Навигация по странице">
            <button
              className={currentPage === 'home' ? 'nav-active' : ''}
              type="button"
              onClick={() => setCurrentPage('home')}
            >
              Главная
            </button>
            <button
              className={currentPage === 'tariffs' ? 'nav-active' : ''}
              type="button"
              onClick={() => setCurrentPage('tariffs')}
            >
              Тарифы
            </button>
          </nav>
          <div className="header-user">
            <div className="profile-avatar" aria-label="Профиль" title={formatProfilePhone(profile?.phone)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="8" r="4" />
                <path d="M4.5 20C5.2 15.9 7.7 14 12 14C16.3 14 18.8 15.9 19.5 20" />
              </svg>
            </div>
            <button className="logout-button" type="button" onClick={logout}>Выйти</button>
          </div>
        </div>
      </header>

      <main id="dashboard" className="dashboard-main" hidden={currentPage !== 'home'}>
        <div className="welcome-row">
          <div>
            <p className="eyebrow">Личный кабинет</p>
            <h1>{getGreeting()}{displayName ? `, ${displayName}` : ''}!</h1>
            <p>Здесь можно проверить баланс и пополнить лицевой счёт.</p>
          </div>
          <button
            className="refresh-button"
            type="button"
            onClick={() => {
              setNotice('');
              loadData().then(checkPendingPayment);
            }}
          >
            Обновить
          </button>
        </div>

        {error && <div className="dashboard-alert error-alert" role="alert">{error}</div>}
        {notice && <div className="dashboard-alert success-alert" role="status">{notice}</div>}
        {paymentMessage && <div className="dashboard-alert info-alert" role="status">{paymentMessage}</div>}

        {!account ? (
          <section className="empty-account-card">
            <div className="empty-account-icon">₽</div>
            <h2>У вас пока нет лицевого счёта</h2>
            <p>Откройте его, чтобы пополнять баланс и смотреть историю операций.</p>
            <button type="button" onClick={openAccount} disabled={isSubmitting}>
              {isSubmitting ? 'Открываем…' : 'Открыть счёт'}
            </button>
          </section>
        ) : (
          <>
            <div className="dashboard-grid">
              <section className="balance-card">
                <div className="balance-card-top">
                  <span>Текущий баланс</span>
                  <span className={`account-status status-${account.status?.toLowerCase()}`}>
                    {ACCOUNT_STATUSES[account.status] || account.status}
                  </span>
                </div>
                <strong className="balance-value">
                  {formatMoney(account.balance, account.currency)}
                </strong>
                <div className="account-number">
                  <span>Лицевой счёт</span>
                  <strong>{account.number}</strong>
                </div>
              </section>

              <section id="top-up" className="top-up-card">
                <div>
                  <p className="card-label">Пополнение</p>
                  <h2>Пополнить баланс</h2>
                  <p>Деньги поступят на лицевой счёт сразу после подтверждения.</p>
                </div>
                <form onSubmit={topUpAccount}>
                  <div className="amount-field">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="500"
                      value={amount}
                      onChange={(event) => {
                        setAmount(event.target.value.replace(/[^\d.,]/g, ''));
                        setIdempotencyKey('');
                        idempotencyKeyRef.current = '';
                        setError('');
                        setNotice('');
                      }}
                      aria-label="Сумма пополнения"
                      disabled={isSubmitting || account.status === 'CLOSED'}
                    />
                    <span>₽</span>
                  </div>
                  <button type="submit" disabled={isSubmitting || account.status === 'CLOSED'}>
                    {isSubmitting ? 'Подождите…' : 'Пополнить'}
                  </button>
                </form>
              </section>
            </div>

            <section id="transactions" className="transactions-card">
              <div className="section-heading">
                <div>
                  <p className="card-label">История</p>
                  <h2>Последние операции</h2>
                </div>
                <span>{transactions.length} из последних</span>
              </div>

              {transactions.length === 0 ? (
                <div className="empty-transactions">Операций пока нет</div>
              ) : (
                <div className="transactions-list">
                  {transactions.map((transaction) => {
                    const type = TRANSACTION_TYPES[transaction.type] || {
                      label: transaction.description || 'Операция',
                      sign: '',
                      className: '',
                    };

                    return (
                      <div className="transaction-row" key={transaction.id}>
                        <div className={`transaction-icon ${type.className}`}>{type.sign || '•'}</div>
                        <div className="transaction-info">
                          <strong>{transaction.description || type.label}</strong>
                          <span>{formatDate(transaction.createdAt)}</span>
                        </div>
                        <strong className={`transaction-amount ${type.className}`}>
                          {type.sign}{formatMoney(transaction.amount, account.currency)}
                        </strong>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <main className="dashboard-main tariffs-page" hidden={currentPage !== 'tariffs'}>
        <p className="eyebrow">Услуги</p>
        <div className="tariffs-heading">
          <div>
            <h1>Тарифы</h1>
            <p>Выберите подходящий вариант для дома и связи.</p>
          </div>
          <span className="tariffs-counter">
            {tariffIndex + 1}–{Math.min(tariffIndex + 4, TARIFFS.length)} / {TARIFFS.length}
          </span>
        </div>
        <section className="tariffs-carousel" aria-label="Доступные тарифы">
          <button
            className="tariffs-arrow"
            type="button"
            aria-label="Предыдущий тариф"
            onClick={() => setTariffIndex((current) => (
              current === 0 ? TARIFFS.length - 4 : current - 1
            ))}
          >
            ‹
          </button>
          <div className="tariffs-viewport">
            <div
              className="tariffs-track"
              style={{ '--tariff-index': tariffIndex }}
            >
              {TARIFFS.map((tariff) => (
                <article className={`tariff-card tariff-${tariff.accent}`} key={tariff.name}>
                  {tariff.popular && <span className="tariff-badge">Популярный</span>}
                  <p className="card-label">Тариф</p>
                  <h2>{tariff.name}</h2>
                  <p className="tariff-description">{tariff.description}</p>
                  <strong className="tariff-speed">{tariff.speed}</strong>
                  <ul className="tariff-features">
                    {tariff.features.map((feature) => <li key={feature}>{feature}</li>)}
                  </ul>
                  <div className="tariff-price">
                    <strong>{tariff.price}</strong>
                    {tariff.oldPrice && <del>{tariff.oldPrice}</del>}
                    <span>{tariff.period}</span>
                  </div>
                  {tariff.action && <p className="tariff-action">{tariff.action}</p>}
                  <button className="tariff-button" type="button">Подробнее</button>
                </article>
              ))}
            </div>
          </div>
          <button
            className="tariffs-arrow"
            type="button"
            aria-label="Следующий тариф"
            onClick={() => setTariffIndex((current) => (
              current === TARIFFS.length - 4 ? 0 : current + 1
            ))}
          >
            ›
          </button>
        </section>
      </main>
    </div>
  );
}

export default Dashboard;
