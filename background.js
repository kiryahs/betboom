// background.js

let isActive = true;
let pendingBets = {}; // Объект для хранения информации о ставках по ticketId

// Опциональный режим отладки
const DEBUG = false; // Установите в true для включения дополнительных логов

// Функция для логирования сообщений, активна только при DEBUG = true
function debugLog(...args) {
    if (DEBUG) {
        console.log(...args);
    }
}

// Функция для отправки сообщения в Telegram
async function sendToTelegram(message) {
    const TELEGRAM_TOKEN = "";  // Замените на ваш новый токен
    const CHAT_IDS = [""];  // Укажите здесь свои chat_id

    for (const chatId of CHAT_IDS) {
        try {
            const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: message
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                debugLog(`Ошибка отправки сообщения для chat_id ${chatId}: ${errorText}`);
            }
            // Успешная отправка может быть пропущена для минимизации логов
        } catch (error) {
            debugLog(`Ошибка при отправке сообщения для chat_id ${chatId}:`, error);
        }
    }
}

// Функция для создания уведомлений
function createNotification(title, message) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'images.png', // Убедитесь, что иконка присутствует и указана правильно
        title: title,
        message: message
    }, function(notificationId) {
        // Можно опустить логирование уведомления для минимизации консоли
    });
}

// Функция для очистки pendingBets каждые 2 часа (7200000 миллисекунд)
function clearPendingBets() {
    pendingBets = {};
    debugLog("pendingBets был очищен.");
}

// Устанавливаем интервал очистки pendingBets каждые 2 часа
setInterval(clearPendingBets, 2 * 60 * 60 * 1000);

// Обработка сообщений от content.js и popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "processBet") {
        if (!isActive) {
            sendResponse({ status: "disabled" });
            return;
        }

        const betInfo = request.betInfo;
        const ticketId = betInfo.ticketId;

        // Проверяем, не существует ли уже эта ставка в pendingBets
        if (pendingBets.hasOwnProperty(ticketId)) {
            sendResponse({ status: "already processing" });
            return;
        }

        pendingBets[ticketId] = betInfo;

        // Извлекаем данные для уведомления
        const eventMatch = betInfo.message.match(/Событие: (.+)\n/);
        const stakeMatch = betInfo.message.match(/Ставка: (.+)\n/);
        const oddsMatch = betInfo.message.match(/КФ: (.+)\n/);
        const amountMatch = betInfo.message.match(/Сумма: (.+)\n/);
        const betboomLinkMatch = betInfo.message.match(/Ссылка на BetBoom: (.+)\n/);

        const event = eventMatch ? eventMatch[1] : "Неизвестно";
        const stake = stakeMatch ? stakeMatch[1] : "Неизвестно";
        const odds = oddsMatch ? oddsMatch[1] : "Неизвестно";
        const amount = amountMatch ? amountMatch[1] : "Неизвестно";
        const betboomLink = betboomLinkMatch ? betboomLinkMatch[1] : "Ссылка на BetBoom не найдена";

        // Создаём уведомление с информацией о ставке
        const notificationMessage = `Событие: ${event}\nСтавка: ${stake}\nКФ: ${odds}\nСумма: ${amount}\nСсылка на BetBoom: ${betboomLink}`;
        createNotification("Новая ставка на BetBoom", notificationMessage);

        // Отправляем уведомление в Telegram
        sendToTelegram(notificationMessage).then(() => {
            // Удаляем ставку из pendingBets после успешной отправки
            delete pendingBets[ticketId];
        }).catch((error) => {
            // Создаём уведомление об ошибке
            createNotification("Ошибка отправки в Telegram", `Не удалось отправить ставку "${event}" в Telegram.`);
        });

        sendResponse({ status: "betInfo received" });
    } else if (request.action === "openFonBet") {
        if (!isActive) {
            sendResponse({ status: "disabled" });
            return;
        }

        const betInfo = request.matchInfo;

        // Открываем новую вкладку FonBet для каждой новой ставки
        chrome.tabs.create({ url: "https://fon.bet/" }, (tab) => {
            const fonBetTabId = tab.id;
            debugLog(`FonBet был открыт с ID вкладки ${tab.id}.`);

            // Ждём загрузки вкладки FonBet
            chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo, tab) {
                if (tabId === fonBetTabId && changeInfo.status === 'complete') {
                    // Когда вкладка FonBet загрузилась, отправляем информацию о матче
                    chrome.tabs.sendMessage(fonBetTabId, {
                        action: "inputMatchInfo",
                        matchInfo: betInfo // Отправляем информацию о матче
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            // Создаем уведомление об ошибке
                            createNotification("Ошибка", "Не удалось отправить сообщение во вкладку FonBet.");
                        }
                        // Можно опустить успешное логирование
                    });
                    // Удаляем слушатель, чтобы он не срабатывал повторно
                    chrome.tabs.onUpdated.removeListener(listener);
                }
            });
        });
        sendResponse({ status: "ok" });
        return true; // Указывает, что ответ может быть отправлен асинхронно
    } else if (request.action === "sendTelegramMessage") {
        const ticketId = request.ticketId;
        const eventUrl = request.message;

        if (pendingBets.hasOwnProperty(ticketId)) {
            const betInfo = pendingBets[ticketId];

            if (eventUrl !== "событие не найдено") {
                const telegramMessage = `Ссылка на событие: ${eventUrl}`;
                sendToTelegram(telegramMessage).then(() => {
                    // Удаляем ставку из pendingBets после успешной отправки
                    delete pendingBets[ticketId];
                }).catch((error) => {
                    // Создаём уведомление об ошибке
                    createNotification("Ошибка отправки в Telegram", `Не удалось отправить ссылку для ставки с ID ${ticketId} в Telegram.`);
                });
            } else {
                // Создаём уведомление, если событие не найдено
                createNotification("Событие не найдено", `Событие для ставки с ID ${ticketId} не найдено на FonBet.`);
                // Удаляем ставку из pendingBets
                delete pendingBets[ticketId];
            }
        } else {
            // Логирование ошибок может быть полезным для отладки
            console.error("Информация о ставке не найдена для ticketId:", ticketId);
        }
        sendResponse({ status: "ok" });
        return true; // Указывает, что ответ может быть отправлен асинхронно
    } else if (request.action === "enable") {
        isActive = true;
        // Оставляем минимальное логирование
        debugLog('Расширение включено.');
        sendResponse({ status: "enabled" });
    } else if (request.action === "disable") {
        isActive = false;
        // Оставляем минимальное логирование
        debugLog('Расширение выключено.');
        sendResponse({ status: "disabled" });
    } else if (request.action === "clearSentIds") {
        // Очищаем sentIds из chrome.storage.local
        chrome.storage.local.remove('sentIds', () => {
            if (chrome.runtime.lastError) {
                console.error("Ошибка при очистке sentIds:", chrome.runtime.lastError);
                sendResponse({ status: "failure" });
            } else {
                debugLog("sentIds успешно очищены.");
                sendResponse({ status: "success" });
            }
        });
        return true; // Указывает, что ответ может быть отправлен асинхронно
    } else if (request.action === "getStatus") {
        sendResponse({ isActive });
    }
});
