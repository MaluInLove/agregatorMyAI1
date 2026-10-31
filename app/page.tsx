export default function HomePage() {
  return (
    <main>
      <section className="card" aria-labelledby="stand-title">
        <p className="eyebrow">Этап 0 · локальный стенд</p>
        <h1 id="stand-title">Интеграция AI-агрегатора</h1>
        <p>
          Стенд запускается только на этом компьютере. Здесь появятся запуск тестовых задач,
          история и техническая диагностика после настройки очереди и адаптера Polza.
        </p>
        <dl>
          <div>
            <dt>Веб-приложение</dt>
            <dd>готово к локальному запуску</dd>
          </div>
          <div>
            <dt>Worker</dt>
            <dd>запускается отдельным процессом</dd>
          </div>
          <div>
            <dt>Хранилище</dt>
            <dd>var/storage</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
