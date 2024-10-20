// fonbet_content.js

(function() {
    // Константы для управления повторными попытками
    const MAX_RETRIES = 3; // Максимальное количество попыток
    const RETRY_DELAY = 2000; // Задержка между попытками в миллисекундах (2 секунды)
    const INPUT_DELAY = 1000; // Задержка перед вводом названия события (1 секунда)
    const SEARCH_RESULTS_DELAY = 1500; // Задержка после ввода для загрузки результатов поиска (1.5 секунды)

    // Опциональный режим отладки
    const DEBUG = false; // Установите в true для включения дополнительных логов

    // Функция для логирования сообщений, активна только при DEBUG = true
    function debugLog(...args) {
        if (DEBUG) {
            console.log(...args);
        }
    }

    // Функция для отправки сообщения в background.js для отправки в Telegram
    function sendEventUrlToBackground(eventUrl, betId) {
        // Отправляем сообщение только при необходимости
        chrome.runtime.sendMessage({
            action: "sendTelegramMessage",
            message: eventUrl,
            ticketId: betId
        }, function(response) {
            // Обработка ответа при необходимости
        });
    }

    // Функция для наблюдения за появлением элемента на странице
    function observeForElement(selector, callback) {
        const observer = new MutationObserver(() => {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
                observer.disconnect(); // Останавливаем наблюдатель после нахождения элемента
                callback();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Слушаем сообщения от background.js
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        if (request.action === "inputMatchInfo") {
            const matchInfo = request.matchInfo;
            const ticketId = matchInfo.ticketId;
            const eventName = matchInfo.matchText;

            debugLog(`Получено сообщение для поиска события: "${eventName}" с ticketId: ${ticketId}`);

            // Начинаем процесс поиска с первой попыткой
            searchEventWithRetries(eventName, ticketId, MAX_RETRIES);

            sendResponse({ status: "searchEvent processing started" });
        }
    });

    // Функция для выполнения поиска с повторными попытками
    function searchEventWithRetries(eventName, ticketId, retriesLeft) {
        debugLog(`Попытка поиска события. Осталось попыток: ${retriesLeft}`);

        // Ждём появления элемента "Поиск событий"
        observeForElement('.search--wDIDt .placeholder--bGRNV', () => {
            const searchPlaceholder = document.querySelector('.search--wDIDt .placeholder--bGRNV');
            if (searchPlaceholder) {
                clickSearchPlaceholder(searchPlaceholder, () => {
                    // Ждём появления строки поиска
                    observeForElement('input.input--R2VmT', () => {
                        const searchInput = document.querySelector('input.input--R2VmT');
                        if (searchInput) {
                            // Добавляем задержку перед вводом названия события
                            setTimeout(() => {
                                inputEventName(eventName, searchInput, () => {
                                    // Ждём задержку для загрузки результатов поиска
                                    setTimeout(() => {
                                        processSearchResults(eventName, ticketId, retriesLeft);
                                    }, SEARCH_RESULTS_DELAY);
                                });
                            }, INPUT_DELAY);
                        } else {
                            handleRetryOrFail(eventName, ticketId, retriesLeft);
                        }
                    });
                });
            } else {
                handleRetryOrFail(eventName, ticketId, retriesLeft);
            }
        });
    }

    // Функция для обработки результатов поиска с повторными попытками
    function processSearchResults(eventName, ticketId, retriesLeft) {
        debugLog(`Обработка результатов поиска для события: "${eventName}" с ticketId: ${ticketId}`);
        const eventItems = document.querySelectorAll('.event-item--jju6N');
        let foundEvent = false;

        for (const eventItem of eventItems) {
            const eventTitleElement = eventItem.querySelector('.teams--O8Dvf');
            if (eventTitleElement) {
                const eventTitle = eventTitleElement.textContent.trim();
                debugLog(`Проверка события: "${eventTitle}"`);

                // Извлекаем все содержимое внутри скобок
                const matches = eventTitle.match(/\((.*?)\)/g);
                if (matches && matches.length >= 2) {
                    const extractedNames = matches.map(m => m.slice(1, -1).trim()).join(' ');
                    debugLog(`Извлечённые имена из скобок: ${extractedNames}`);

                    // Сравниваем извлечённые имена с eventName
                    if (extractedNames === eventName) {
                        foundEvent = true;
                        debugLog(`Событие "${eventName}" найдено. Выполняется клик.`);

                        // Клик по элементу с data-testid="btn.eventItem"
                        const btnEventItem = eventItem.querySelector('[data-testid="btn.eventItem"]');
                        if (btnEventItem) {
                            btnEventItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            btnEventItem.click();
                            debugLog(`Клик по элементу с data-testid="btn.eventItem" выполнен.`);
                        } else {
                            // Если конкретный элемент не найден, кликаем по всему eventItem
                            eventItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            eventItem.click();
                            debugLog(`Клик по всему элементу события выполнен.`);
                        }

                        // Ждём изменения URL или загрузки страницы события
                        waitForUrlChange(ticketId, () => {
                            const eventUrl = window.location.href;
                            debugLog("Событие найдено и страница загружена. URL:", eventUrl);
                            // Отправляем ссылку и ticketId в background.js
                            sendEventUrlToBackground(eventUrl, ticketId);
                        });

                        // Прекращаем перебор, так как событие найдено
                        break;
                    }
                }
            }
        }

        if (!foundEvent) {
            debugLog(`Событие "${eventName}" не найдено.`);
            handleRetryOrFail(eventName, ticketId, retriesLeft);
        }
    }

    // Функция для обработки повторных попыток или окончательного отказа
    function handleRetryOrFail(eventName, ticketId, retriesLeft) {
        if (retriesLeft > 1) {
            debugLog(`Попытка не удалась. Осталось попыток: ${retriesLeft - 1}. Повторный поиск через ${RETRY_DELAY / 1000} секунд.`);
            setTimeout(() => {
                searchEventWithRetries(eventName, ticketId, retriesLeft - 1);
            }, RETRY_DELAY);
        } else {
            debugLog(`Все попытки поиска события "${eventName}" исчерпаны. Отправка сообщения о неудаче.`);
            // Отправляем сообщение "событие не найдено" с ticketId
            sendEventUrlToBackground("событие не найдено", ticketId);
        }
    }

    // Функция для клика по элементу "Поиск событий"
    function clickSearchPlaceholder(searchPlaceholder, callback) {
        const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
        searchPlaceholder.dispatchEvent(clickEvent);
        debugLog("Клик по элементу 'Поиск событий' выполнен.");
        if (callback) callback();
    }

    // Функция для ввода названия события в строку поиска
    function inputEventName(eventName, searchInput, callback) {
        searchInput.value = eventName;
        const inputEvent = new Event('input', { bubbles: true });
        searchInput.dispatchEvent(inputEvent);
        debugLog(`Введено название события в поиск: "${eventName}"`);
        if (callback) callback();
    }

    // Функция для ожидания изменения URL
    function waitForUrlChange(ticketId, callback) {
        const initialUrl = window.location.href;
        const maxChecks = 20; // Максимальное количество проверок (10 секунд)
        let checks = 0;

        const checkUrl = () => {
            if (window.location.href !== initialUrl) {
                callback(window.location.href);
            } else {
                checks++;
                if (checks < maxChecks) {
                    setTimeout(checkUrl, 500); // Проверяем каждые 500 мс
                } else {
                    debugLog("URL не изменился в течение ожидаемого времени.");
                    sendEventUrlToBackground("событие не найдено", ticketId);
                }
            }
        };
        checkUrl();
    }

})();
