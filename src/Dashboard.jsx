import { useCallback, useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { ApiError, getJson, postJson } from './api.js';
import TariffsPage from './TariffsPage.jsx';
import ProfilePage from './ProfilePage.jsx';
import SpeedTestPage from './SpeedTestPage.jsx';
import { mergeTariffData } from './tariffData.js';
import { formatMoney, formatDate, formatProfilePhone } from './formatters.js';
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

function extractPagedItems(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.content)) return data.content;

  const embedded = data?._embedded;
  if (embedded && typeof embedded === 'object') {
    return Object.values(embedded).find(Array.isArray) || [];
  }

  return [];
}

const PENDING_PAYMENT_KEY = 'pendingPaymentId';
const PENDING_TARIFF_SWITCH_KEY = 'pendingTariffSwitch';
const PAYMENT_POLL_INTERVAL = 3000;
const PAYMENT_POLL_ATTEMPTS = 20;

function getPendingTariffSwitch() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_TARIFF_SWITCH_KEY) || 'null');
  } catch {
    localStorage.removeItem(PENDING_TARIFF_SWITCH_KEY);
    return null;
  }
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
  const [tariffs, setTariffs] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [tariffsMessage, setTariffsMessage] = useState('');
  const [isTariffsLoading, setIsTariffsLoading] = useState(true);
  const [isSubscriptionsLoading, setIsSubscriptionsLoading] = useState(true);
  const [subscriptionsError, setSubscriptionsError] = useState('');
  const [submittingTariffId, setSubmittingTariffId] = useState('');
  const [pendingCancellation, setPendingCancellation] = useState(null);
  const reconcilingSwitchRef = useRef(false);
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

  const showPage = (page) => {
    setError('');
    setCurrentPage(page);
    loadData(false);
    if (page === 'tariffs' || page === 'profile') loadSubscriptions();
  };

  const handleError = useCallback((requestError) => {
    if (requestError instanceof ApiError && requestError.status === 401
      && !localStorage.getItem('refreshToken')) {
      onLogout();
      return;
    }
    setError(requestError.message || 'Не удалось загрузить данные');
  }, [onLogout]);

  const loadTariffs = useCallback(async () => {
    setIsTariffsLoading(true);
    setTariffsMessage('');

    try {
      const response = await getJson('/api/services/tariffs?size=20&sort=createdAt,asc');
      const apiTariffs = extractPagedItems(response);
      setTariffs(apiTariffs.map(mergeTariffData));
      if (apiTariffs.length === 0) setTariffsMessage('Активных тарифов пока нет.');
    } catch {
      setTariffs([]);
      setTariffsMessage('Не удалось загрузить тарифы. Попробуйте обновить страницу.');
    } finally {
      setIsTariffsLoading(false);
    }
  }, []);

  const loadSubscriptions = useCallback(async () => {
    try {
      const response = await getJson('/api/services/subscriptions/my?size=20', { auth: true });
      let items = extractPagedItems(response);
      let savedSwitch = getPendingTariffSwitch();
      let previous = items.find((item) => item.id === savedSwitch?.previousId);
      if (savedSwitch && (!previous || previous.userId !== savedSwitch.userId)) {
        localStorage.removeItem(PENDING_TARIFF_SWITCH_KEY);
        savedSwitch = null;
      }
      if (!savedSwitch) {
        const active = items.filter((item) => item.status === 'ACTIVE')
          .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt));
        const current = active[0]?.lastChargeTransactionId ? active[0] : null;
        previous = active.find((item) => current && item.id !== current.id
          && item.tariffCategory === current.tariffCategory && item.userId === current.userId);
        if (previous) {
          savedSwitch = { userId: previous.userId, previousId: previous.id, nextTariffId: current.tariffId };
          localStorage.setItem(PENDING_TARIFF_SWITCH_KEY, JSON.stringify(savedSwitch));
        }
      }
      const next = items.find((item) => item.tariffId === savedSwitch?.nextTariffId && item.status !== 'CANCELED');

      if (savedSwitch && previous?.userId === savedSwitch.userId && !reconcilingSwitchRef.current) {
        if (previous.status === 'CANCELED') {
          localStorage.removeItem(PENDING_TARIFF_SWITCH_KEY);
          setPendingCancellation(null);
          setError('');
        } else if (previous.status === 'ACTIVE' && next?.status === 'ACTIVE' && next.lastChargeTransactionId) {
          reconcilingSwitchRef.current = true;
          try {
            await postJson(`/api/services/subscriptions/${previous.id}/cancel?immediate=true`, undefined, { auth: true });
            localStorage.removeItem(PENDING_TARIFF_SWITCH_KEY);
            setPendingCancellation(null);
            setError('');
            const refreshed = await getJson('/api/services/subscriptions/my?size=20', { auth: true });
            items = extractPagedItems(refreshed);
            setNotice(`Тариф изменён на «${next.tariffName}».`);
          } catch {
            const refreshed = await getJson('/api/services/subscriptions/my?size=20', { auth: true }).catch(() => null);
            if (refreshed) items = extractPagedItems(refreshed);
            if (items.some((item) => item.id === previous.id && item.status === 'CANCELED')) {
              localStorage.removeItem(PENDING_TARIFF_SWITCH_KEY);
              setPendingCancellation(null);
              setError('');
            } else {
              setPendingCancellation({ previous, nextName: next.tariffName });
              setError(`Не удалось отключить прежний тариф. Повторим автоматически.`);
            }
          } finally {
            reconcilingSwitchRef.current = false;
          }
        }
      }
      setSubscriptions(items);
      setSubscriptionsError('');
      return items;
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) handleError(requestError);
      else setSubscriptionsError('Не удалось проверить подключённые тарифы. Обновите страницу.');
      return null;
    } finally {
      setIsSubscriptionsLoading(false);
    }
  }, [handleError]);

  const finishTariffSwitch = async (previous, nextName) => {
    try {
      await postJson(`/api/services/subscriptions/${previous.id}/cancel?immediate=true`, undefined, { auth: true });
      localStorage.removeItem(PENDING_TARIFF_SWITCH_KEY);
      setPendingCancellation(null);
      return true;
    } catch {
      const latest = await loadSubscriptions();
      if (latest?.some((item) => item.id === previous.id && item.status === 'CANCELED')) {
        localStorage.removeItem(PENDING_TARIFF_SWITCH_KEY);
        setPendingCancellation(null);
        return true;
      }
      setPendingCancellation({ previous, nextName });
      setError(`Не удалось отключить прежний тариф. Повторим автоматически.`);
      return false;
    }
  };

  const subscribeToTariff = async (tariff, previousSubscription = null) => {
    if (!tariff.id || submittingTariffId || isSubscriptionsLoading || subscriptionsError || pendingCancellation) return;
    if (subscriptions.some((item) => item.tariffId === tariff.id && item.status !== 'CANCELED')) return;

    setSubmittingTariffId(tariff.id);
    setError('');
    setNotice('');
    let subscriptionRequested = false;

    try {
      if (previousSubscription) {
        const latest = await loadSubscriptions();
        if (!latest) {
          setError('Не удалось проверить текущий тариф. Попробуйте ещё раз.');
          return;
        }
        previousSubscription = latest.find((item) => item.id === previousSubscription.id && item.status === 'ACTIVE');
        if (!previousSubscription) {
          setError('Текущий тариф изменился. Обновите страницу и проверьте подписки.');
          return;
        }
      }

      const freshTariff = await getJson(`/api/services/tariffs/${tariff.id}`);
      if (!freshTariff.active || Number(freshTariff.price) !== Number(tariff.price)) {
        await loadTariffs();
        setError('Условия тарифа изменились. Проверьте их перед подключением.');
        return;
      }

      const freshAccount = await getJson('/api/billing/accounts/me', { auth: true });
      setAccount(freshAccount);
      if (freshAccount?.status !== 'ACTIVE') {
        setError('Лицевой счёт недоступен для списания.');
        return;
      }
      const missingAmount = Number(freshTariff.price) - Number(freshAccount.balance);
      if (Number.isFinite(missingAmount) && missingAmount > 0) {
        setError(`Недостаточно средств. Пополните баланс на ${formatMoney(missingAmount, freshAccount.currency)}.`);
        return;
      }

      subscriptionRequested = true;
      if (previousSubscription) {
        localStorage.setItem(PENDING_TARIFF_SWITCH_KEY, JSON.stringify({
          userId: previousSubscription.userId,
          previousId: previousSubscription.id,
          nextTariffId: tariff.id,
        }));
      }
      const subscription = await postJson(
        '/api/services/subscriptions',
        { tariffId: tariff.id },
        { auth: true },
      );
      setSubscriptions((current) => [subscription, ...current]);
      if (subscription.status === 'ACTIVE' && subscription.lastChargeTransactionId) {
        if (!previousSubscription || await finishTariffSwitch(previousSubscription, tariff.name)) {
          setNotice(previousSubscription
            ? `Тариф изменён на «${tariff.name}». Оплата списана с баланса.`
            : `Тариф «${tariff.name}» подключён. Оплата списана с баланса.`);
        }
      } else {
        setError('Тариф ожидает оплаты. Проверьте состояние подписки в профиле.');
      }
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        handleError(requestError);
      } else if (!subscriptionRequested) {
        handleError(requestError);
      } else {
        const current = await loadSubscriptions();
        const existing = current?.find((item) => item.tariffId === tariff.id && item.status !== 'CANCELED');
        if (existing?.status === 'ACTIVE' && existing.lastChargeTransactionId) {
          const oldTariff = previousSubscription && current.find((item) => item.id === previousSubscription.id && item.status === 'ACTIVE');
          if (!oldTariff || await finishTariffSwitch(oldTariff, tariff.name)) {
            setNotice(previousSubscription
              ? `Тариф изменён на «${tariff.name}». Оплата списана с баланса.`
              : `Тариф «${tariff.name}» подключён. Оплата списана с баланса.`);
          }
        } else if (existing?.status === 'SUSPENDED') {
          setError(`Тариф «${tariff.name}» ожидает оплаты. Повторное подключение не требуется: сервис попробует списать оплату автоматически.`);
        } else {
          localStorage.removeItem(PENDING_TARIFF_SWITCH_KEY);
          setError(requestError.message?.replace(tariff.id, tariff.name) || 'Не удалось подключить тариф.');
        }
      }
    } finally {
      await loadData(false);
      await loadSubscriptions();
      setSubmittingTariffId('');
    }
  };

  const cancelSuspendedTariff = async (subscription) => {
    if (submittingTariffId) return;
    setSubmittingTariffId(subscription.tariffId);
    setError('');
    setNotice('');
    try {
      await postJson(`/api/services/subscriptions/${subscription.id}/cancel?immediate=true`, undefined, { auth: true });
      const savedSwitch = getPendingTariffSwitch();
      if (savedSwitch?.nextTariffId === subscription.tariffId && savedSwitch.userId === subscription.userId) {
        localStorage.removeItem(PENDING_TARIFF_SWITCH_KEY);
      }
      await loadSubscriptions();
      setNotice(`Ожидание оплаты тарифа «${subscription.tariffName}» отменено.`);
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setSubmittingTariffId('');
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadTariffs();
      loadSubscriptions();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSubscriptions, loadTariffs]);

  useEffect(() => {
    if (!getPendingTariffSwitch() && !pendingCancellation && subscriptions.filter((item) => item.status === 'ACTIVE').length < 2) return undefined;
    const timer = window.setInterval(loadSubscriptions, 15000);
    return () => window.clearInterval(timer);
  }, [loadSubscriptions, pendingCancellation, subscriptions]);

  const loadData = useCallback(async (showLoader = true) => {
    if (showLoader) setIsLoading(true);
    if (showLoader) setError('');

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
  const activeSubscriptions = subscriptions.filter((subscription) => subscription.status === 'ACTIVE')
    .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt));
  const activeSubscription = activeSubscriptions[0];
  const suspendedSubscriptions = subscriptions.filter((subscription) => subscription.status === 'SUSPENDED');

  return (
    <div className="dashboard-page">
      <Helmet>
        <title>{currentPage === 'speedtest' ? 'Тест скорости' : currentPage === 'profile' ? 'Профиль' : currentPage === 'tariffs' ? 'Тарифы' : 'Главная'}</title>
      </Helmet>

      <header className="dashboard-header">
        <div className="header-content">
          <img className="dashboard-logo" src="/rostelecom-logo.png" alt="Ростелеком" />
          <nav className="dashboard-nav" aria-label="Навигация по странице">
            <button
              className={currentPage === 'home' ? 'nav-active' : ''}
              type="button"
              onClick={() => showPage('home')}
            >
              Главная
            </button>
            <button
              className={currentPage === 'tariffs' ? 'nav-active' : ''}
              type="button"
              onClick={() => showPage('tariffs')}
            >
              Тарифы
            </button>
            <button
              className={currentPage === 'speedtest' ? 'nav-active' : ''}
              type="button"
              onClick={() => showPage('speedtest')}
            >
              Тест скорости
            </button>
          </nav>
          <div className="header-user">
            <button
              className="profile-avatar"
              type="button"
              aria-label="Открыть профиль"
              title={formatProfilePhone(profile?.phone)}
              onClick={() => showPage('profile')}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="8" r="4" />
                <path d="M4.5 20C5.2 15.9 7.7 14 12 14C16.3 14 18.8 15.9 19.5 20" />
              </svg>
            </button>
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
              loadSubscriptions();
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

      <TariffsPage
        hidden={currentPage !== 'tariffs'}
        tariffs={tariffs}
        subscriptions={subscriptions}
        suspendedSubscriptions={suspendedSubscriptions}
        activeSubscription={activeSubscription}
        tariffsMessage={tariffsMessage}
        isTariffsLoading={isTariffsLoading}
        isSubscriptionsLoading={isSubscriptionsLoading}
        subscriptionsError={subscriptionsError}
        submittingTariffId={submittingTariffId}
        pendingCancellation={pendingCancellation}
        error={error}
        notice={notice}
        onSubscribe={subscribeToTariff}
        onCancelSuspended={cancelSuspendedTariff}
      />

      <ProfilePage
        hidden={currentPage !== 'profile'}
        profile={profile}
        account={account}
        activeSubscription={activeSubscription}
        suspendedSubscriptions={suspendedSubscriptions}
        isSubscriptionsLoading={isSubscriptionsLoading}
        subscriptionsError={subscriptionsError}
      />
      {currentPage === 'speedtest' && <SpeedTestPage key={profile?.id || 'loading'} userId={profile?.id} />}
    </div>
  );
}

export default Dashboard;
