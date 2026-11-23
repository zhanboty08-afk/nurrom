(function () {
  'use strict';

  const root = document.getElementById('root');
  if (!root) return;

  let failureShown = false;

  function showFailure(message) {
    if (failureShown) return;
    failureShown = true;

    const container = document.createElement('main');
    container.className = 'container d-flex align-items-center justify-content-center min-vh-100 py-5';

    const card = document.createElement('section');
    card.className = 'alert alert-danger shadow-sm';
    card.setAttribute('role', 'alert');

    const title = document.createElement('h1');
    title.className = 'h5';
    title.textContent = 'Не удалось загрузить админку';

    const detail = document.createElement('p');
    detail.className = 'mb-3';
    detail.textContent = message;

    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn btn-dark';
    retry.textContent = 'Обновить страницу';
    retry.addEventListener('click', function () {
      window.location.reload();
    });

    card.append(title, detail, retry);
    container.append(card);
    root.replaceChildren(container);
  }

  window.addEventListener('error', function (event) {
    const script = event.target;
    if (!(script instanceof HTMLScriptElement)) {
      if (!window.adminAppMounted && event.message) {
        const source = event.filename
          ? new URL(event.filename, window.location.href).pathname.split('/').pop() + ':' + event.lineno
          : 'скрипт админки';
        showFailure('Ошибка JavaScript в ' + source + ': ' + event.message);
      }
      return;
    }

    let source = 'скрипт админки';
    try {
      source = new URL(script.src, window.location.href).hostname || source;
    } catch {
      // Keep the generic local script label.
    }
    showFailure('Не удалось загрузить локальный компонент (' + source + '). Проверьте файлы проекта, затем обновите страницу.');
  }, true);

  window.setTimeout(function () {
    if (window.adminAppMounted) return;
    const librariesReady = window.React && window.ReactDOM && window.htm && window.supabase;
    showFailure(librariesReady
      ? 'Приложение не запустилось. Проверьте ошибку JavaScript в консоли браузера.'
      : 'Не загрузились локальные библиотеки. Проверьте папку assets/vendor и обновите страницу.');
  }, 8000);
})();
