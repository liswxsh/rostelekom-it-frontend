import { formatMoney } from './formatters.js';

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

function mergeTariffData(apiTariff) {
  const localTariff = TARIFFS.find((tariff) => tariff.name === apiTariff.name) || {};
  return {
    ...localTariff,
    ...apiTariff,
    accent: localTariff.accent || 'purple',
    features: localTariff.features || [],
    description: apiTariff.description || localTariff.description || 'Тариф для связи и интернета.',
    period: apiTariff.billingPeriod === 'MONTH' ? 'в месяц' : localTariff.period,
    priceLabel: formatMoney(apiTariff.price, apiTariff.currency),
  };
}

function getTariffOptions(tariff) {
  const details = TARIFFS.find((item) => item.name === tariff?.name || item.name === tariff?.tariffName);
  if (!details) return null;

  const speed = details.speed;
  const sms = details.features.find((feature) => /^(\d+|Безлимит) SMS$/i.test(feature));
  return {
    gigabytes: /Безлимит\s+ГБ/i.test(speed) ? Infinity : Number(speed.match(/(\d+)\s*ГБ/i)?.[1] ?? NaN),
    minutes: /Безлимит\s+(?:ГБ\s+и\s+)?минут/i.test(speed) ? Infinity : Number(speed.match(/(\d+)\s*минут/i)?.[1] ?? NaN),
    sms: sms?.startsWith('Безлимит') ? Infinity : Number(sms?.match(/\d+/)?.[0] ?? NaN),
    features: details.features.filter((feature) => feature !== sms),
  };
}

function allowanceText(value, unit) {
  if (value === Infinity) return 'Безлимит';
  if (!Number.isFinite(value)) return 'Не указано';
  return `${value} ${unit}`;
}

function allowanceChange(previous, next) {
  if (!Number.isFinite(previous) && previous !== Infinity) return 'neutral';
  if (!Number.isFinite(next) && next !== Infinity) return 'neutral';
  if (next > previous) return 'added';
  if (next < previous) return 'removed';
  return 'neutral';
}

const TARIFF_CATEGORY_LABELS = {
  INTERNET: 'Интернет',
  TV: 'Телевидение',
  MOBILE: 'Мобильная связь',
};

const TARIFF_CATEGORY_ACCENTS = {
  INTERNET: 'blue',
  TV: 'orange',
  MOBILE: 'purple',
};

const TARIFF_ACCENTS = {
  Старт: 'blue',
  Детский: 'purple',
  Базовый: 'blue',
  Онлайн: 'orange',
  Оптимальный: 'purple',
  'Для устройств': 'blue',
  Премиум: 'orange',
};

const BILLING_PERIOD_LABELS = {
  MONTH: 'в месяц',
};

export { mergeTariffData, getTariffOptions, allowanceText, allowanceChange,
  TARIFF_CATEGORY_LABELS, TARIFF_CATEGORY_ACCENTS, TARIFF_ACCENTS, BILLING_PERIOD_LABELS };
