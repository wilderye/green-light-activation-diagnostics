export function injectMessageButtons({ root = document, onClick, hasRecord } = {}) {
  const messages = root.querySelectorAll?.('#chat .mes[mesid][is_user="false"], .mes[mesid][is_user="false"]') ?? [];

  for (const message of messages) {
    if (message.getAttribute?.('is_user') === 'true') continue;

    const container = message.querySelector?.('.extraMesButtons');
    if (!container) continue;

    const messageId = Number(message.getAttribute('mesid'));
    const swipeId = Number(message.getAttribute('swipeid') ?? 0);
    const existing = container.querySelector?.('.green-light-diagnostics-button');
    if (existing) {
      existing.dataset.hasRecord = hasRecord?.({ messageId, swipeId }) ? 'true' : 'false';
      continue;
    }

    const ownerDocument = message.ownerDocument ?? root.ownerDocument ?? document;
    const button = ownerDocument.createElement('div');
    button.className = 'mes_button green-light-diagnostics-button fa-solid fa-traffic-light';
    button.title = '绿灯激活诊断';
    button.dataset.hasRecord = hasRecord?.({ messageId, swipeId }) ? 'true' : 'false';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      onClick?.({ messageId, swipeId });
    });
    container.prepend(button);
  }
}

export function observeMessages({ root = document, onMutation } = {}) {
  const target = root.querySelector?.('#chat');
  if (!target || typeof MutationObserver === 'undefined') return () => {};

  const observer = new MutationObserver(() => onMutation?.());
  observer.observe(target, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['is_user', 'swipeid'],
  });

  return () => observer.disconnect();
}
