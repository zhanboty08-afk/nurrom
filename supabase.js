const SUPABASE_URL = "https://oatdwzgynoomatositdw.supabase.co";
const SUPABASE_KEY = "sb_publishable_DiN4czv6LaIxykylFncjxg_fqo2bGRl";
const SUPABASE_REQUEST_TIMEOUT_MS = 15000;

function fetchWithTimeout(input, init = {}) {
    const controller = new AbortController();
    const requestSignal = typeof Request !== 'undefined' && input instanceof Request
        ? input.signal
        : undefined;
    const originalSignal = init.signal || requestSignal;
    const requestUrl = input?.url || input?.href || String(input);
    const requestMethod = String(init.method || input?.method || 'GET').toUpperCase();
    const timeoutMs = requestUrl.includes('/storage/v1/object/') && requestMethod !== 'GET'
        ? 60000
        : SUPABASE_REQUEST_TIMEOUT_MS;
    const timeoutSeconds = Math.round(timeoutMs / 1000);
    let timedOut = false;
    let timeoutId;
    let cleanedUp = false;

    const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        clearTimeout(timeoutId);
        originalSignal?.removeEventListener('abort', abortFromOriginal);
    };

    const abortFromOriginal = () => {
        controller.abort(originalSignal.reason);
        cleanup();
    };

    timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort(new Error(`Supabase request timed out after ${timeoutSeconds} seconds.`));
    }, timeoutMs);

    if (originalSignal?.aborted) abortFromOriginal();
    else originalSignal?.addEventListener('abort', abortFromOriginal, { once: true });

    return fetch(input, { ...init, signal: controller.signal })
        .then((response) => {
            const bodyMethods = ['arrayBuffer', 'blob', 'formData', 'json', 'text'];
            let wrappedMethods = 0;

            bodyMethods.forEach((method) => {
                if (typeof response[method] !== 'function') return;
                const readBody = response[method].bind(response);
                Object.defineProperty(response, method, {
                    configurable: true,
                    value: (...args) => readBody(...args)
                        .catch((error) => {
                            if (timedOut) {
                                throw new Error(`Supabase не ответил за ${timeoutSeconds} секунд. Проверьте соединение и настройки проекта.`);
                            }
                            throw error;
                        })
                        .finally(cleanup)
                });
                wrappedMethods += 1;
            });

            if (!response.body || wrappedMethods === 0) cleanup();
            return response;
        })
        .catch((error) => {
            cleanup();
            if (timedOut) {
                throw new Error(`Supabase не ответил за ${timeoutSeconds} секунд. Проверьте соединение и настройки проекта.`);
            }
            throw error;
        });
}

// Public Kazakhstan WhatsApp number in international format, digits only (+7 707 251 96 74).
// This must be public for WhatsApp click-to-chat links to reach the store.
const WHATSAPP_ORDER_NUMBER = "77072519674";

const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    { global: { fetch: fetchWithTimeout } }
);
