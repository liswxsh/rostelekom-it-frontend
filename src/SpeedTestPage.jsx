import { useEffect, useRef, useState } from 'react';
import './SpeedTestPage.css';

const TEST_SERVER = {
  name: 'Amsterdam, Netherlands (Sharktech)',
  server: 'https://amsspeed.sharktech.net/',
  dlURL: 'backend/garbage.php',
  ulURL: 'backend/empty.php',
  pingURL: 'backend/empty.php',
  getIpURL: 'backend/getIP.php',
};

let scriptPromise;

function loadLibreSpeed() {
  if (window.Speedtest) return Promise.resolve(window.Speedtest);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/librespeed/speedtest.js';
      script.onload = () => {
        if (window.Speedtest) resolve(window.Speedtest);
        else {
          scriptPromise = null;
          reject(new Error('Не удалось загрузить модуль теста скорости.'));
        }
      };
      script.onerror = () => {
        script.remove();
        scriptPromise = null;
        reject(new Error('Не удалось загрузить модуль теста скорости.'));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

function showNumber(value) {
  if (value == null || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number.toFixed(1).replace('.', ',') : '—';
}

function Metric({ label, value, unit }) {
  return (
    <div className="speedtest-metric">
      <span>{label}</span>
      <strong>{value == null ? '—' : showNumber(value)}</strong>
      <small>{unit}</small>
    </div>
  );
}

function SpeedTestPage() {
  const testRef = useRef(null);
  const failedRef = useRef(false);
  const mountedRef = useRef(true);
  const [status, setStatus] = useState('ready');
  const [result, setResult] = useState({});
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      testRef.current?.abort();
      testRef.current = null;
    };
  }, []);

  const startTest = async () => {
    if (status === 'running' || status === 'preparing') return;
    setError('');
    setResult({});
    failedRef.current = false;
    setProgress(0);
    setStatus('preparing');

    try {
      const check = await fetch(`${TEST_SERVER.server}${TEST_SERVER.pingURL}?cors=true`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
      if (!check.ok) throw new Error('Сервер тестирования сейчас недоступен. Попробуйте позже.');

      const Speedtest = await loadLibreSpeed();
      if (!mountedRef.current) return;
      if (!Speedtest) throw new Error('Не удалось загрузить модуль теста скорости.');

      const test = new Speedtest();
      test.setParameter('test_order', 'D_P_U');
      test.setParameter('time_dl_max', 8);
      test.setParameter('time_ul_max', 8);
      test.setParameter('getIp_ispInfo', false);
      test.setParameter('telemetry_level', 'none');
      test.addTestPoint({ ...TEST_SERVER });
      test.setSelectedServer({ ...TEST_SERVER });

      test.onupdate = (data) => {
        if (!mountedRef.current) return;
        if ([data.dlStatus, data.ulStatus, data.pingStatus].includes('Fail')) failedRef.current = true;
        setResult({
          download: data.dlStatus,
          upload: data.ulStatus,
          ping: data.pingStatus,
          jitter: data.jitterStatus,
          phase: data.testState,
        });
        const phaseProgress = data.testState === 1 ? data.dlProgress / 3
          : data.testState === 2 ? (1 + data.pingProgress) / 3
            : data.testState === 3 ? (2 + data.ulProgress) / 3 : 0;
        setProgress(Math.min(100, Math.max(0, phaseProgress * 100)));
      };
      test.onend = (aborted) => {
        if (!mountedRef.current) return;
        testRef.current = null;
        const failed = failedRef.current;
        setStatus(aborted || failed ? 'ready' : 'done');
        setProgress(aborted || failed ? 0 : 100);
        if (failed) setError('Не удалось закончить измерение. Проверьте подключение и попробуйте ещё раз.');
      };
      testRef.current = test;
      setStatus('running');
      test.start();
    } catch (requestError) {
      if (!mountedRef.current) return;
      testRef.current = null;
      setStatus('ready');
      setError(requestError.message || 'Не удалось запустить тест. Проверьте подключение к интернету.');
    }
  };

  const stopTest = () => testRef.current?.abort();
  const phaseLabel = status === 'preparing' ? 'Подключаемся к серверу…'
    : status === 'running' ? ({ 1: 'Проверяем загрузку', 2: 'Измеряем задержку', 3: 'Проверяем отдачу' }[result.phase] || 'Начинаем тест…')
      : status === 'done' ? 'Тест завершён' : 'Готов к тесту';
  const currentSpeed = result.phase === 3 ? result.upload : result.download;

  return (
    <main className="dashboard-main speedtest-page">
      <div className="speedtest-heading">
        <p className="eyebrow">Проверка соединения</p>
        <h1>Тест скорости интернета</h1>
        <p>Проверьте скорость загрузки, отдачи и задержку соединения.</p>
      </div>

      <div className="speedtest-server">
        <span className="speedtest-server-icon" aria-hidden="true">◎</span>
        <div><span>Сервер тестирования</span><strong>{TEST_SERVER.name}</strong></div>
      </div>

      <section className="speedtest-panel" aria-label="Результаты теста скорости">
        <div className="speedtest-gauge" role="status" aria-live="polite">
          <svg viewBox="0 0 300 220" aria-hidden="true">
            <path d="M 55 195 A 110 110 0 1 1 245 195" pathLength="100" className="speedtest-gauge-track" />
            {progress > 0 && <path d="M 55 195 A 110 110 0 1 1 245 195" pathLength="100" className="speedtest-gauge-fill" style={{ strokeDasharray: `${progress} 100` }} />}
          </svg>
          <div className="speedtest-gauge-value">
            <strong>{status === 'running' ? showNumber(currentSpeed) : status === 'done' ? showNumber(result.download) : '—'}</strong>
            <span>Мбит/с</span>
            <b>{phaseLabel}</b>
          </div>
        </div>

        <div className="speedtest-results">
          <div className="speedtest-main-metrics">
            <Metric label="Загрузка" value={result.download} unit="Мбит/с" />
            <Metric label="Отдача" value={result.upload} unit="Мбит/с" />
          </div>
          <div className="speedtest-extra-metrics">
            <Metric label="Ping" value={result.ping} unit="мс" />
            <Metric label="Jitter" value={result.jitter} unit="мс" />
          </div>
        </div>

        {error && <p className="speedtest-error" role="alert">{error}</p>}
        <button className="speedtest-start" type="button" onClick={status === 'running' ? stopTest : startTest} disabled={status === 'preparing'}>
          {status === 'running' ? 'Остановить тест' : status === 'preparing' ? 'Подключаемся…' : status === 'done' ? 'Проверить ещё раз' : 'Начать тест'}
        </button>
        <p className="speedtest-note">Во время теста будет передаваться трафик через сервер Sharktech. Результат зависит от нагрузки на сеть и расстояния до сервера.</p>
      </section>
    </main>
  );
}

export default SpeedTestPage;
