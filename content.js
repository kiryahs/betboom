// content.js

(function() {
    // Флаг для отслеживания, была ли кнопка "Ставки" нажата
    let isButtonClicked = false;

    // Массив для хранения отправленных ID с ограничением размера
    let sentIds = [];
    const MAX_SENT_IDS = 100; // Максимальное количество хранимых ticketId

    // Загрузка sentIds из chrome.storage.local
    chrome.storage.local.get(['sentIds'], (result) => {
        sentIds = result.sentIds || [];
        // console.log(`Загруженные sentIds: ${sentIds.length}`); // Минимизируем логирование
        // После загрузки sentIds начинаем наблюдение
        initialize();
    });

    function initialize() {
        // Функция для наблюдения за появлением элемента на странице
        function observeForElement(selector, callback) {
            const observer = new MutationObserver((mutationsList, observer) => {
                const targetElement = document.querySelector(selector);
                if (targetElement) {
                    // console.log(`Элемент найден по селектору: ${selector}`); // Минимизируем логирование
                    observer.disconnect(); // Останавливаем наблюдатель после нахождения элемента
                    callback(targetElement);
                }
            });

            // Начинаем наблюдать за всем телом документа
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }

        // Функция для клика по иконке поиска
        function clickSearchIcon() {
            const searchIcon = document.querySelector('.search--wDIDt');

            if (searchIcon) {
                // Прокручиваем элемент в центр экрана
                searchIcon.scrollIntoView({ behavior: 'smooth', block: 'center' });

                // Создаём событие клика
                const clickEvent = new MouseEvent('click', {
                    view: window,
                    bubbles: true,
                    cancelable: true
                });

                searchIcon.dispatchEvent(clickEvent); // Инициируем событие клика
                // console.log("Клик на иконку поиска был произведён."); // Минимизируем логирование
            } else {
                // console.log("Иконка поиска не найдена."); // Минимизируем логирование
            }
        }

        // Добавляем наблюдение за появлением иконки поиска
        observeForElement('.search--wDIDt', clickSearchIcon);

        // Функция для ожидания и клика по кнопке "Ставки"
        function waitAndClickBetButton() {
            observeForElement('.WVGYF.IwXJ3 button.kFUHI.Qkgdd:not(.RULxZ)', (betButton) => {
                clickBetButton(betButton);
            });
        }

        // Запускаем функцию ожидания и клика по кнопке "Ставки"
        waitAndClickBetButton();
    }

    // Функция для нажатия на кнопку "Ставки"
    function clickBetButton(betButton) {
        if (isButtonClicked) return; // Если кнопка уже нажата, ничего не делаем

        // Создаём событие клика
        const clickEvent = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true
        });
        betButton.dispatchEvent(clickEvent); // Инициируем событие клика
        isButtonClicked = true; // Устанавливаем флаг, что кнопка нажата

        // Ждём 2 секунды, чтобы дать время открыть ставки
        setTimeout(processAllBets, 2000);
    }

    // Функция для обработки всех ставок
    function processAllBets() {
        const bets = document.querySelectorAll('.LJbWp'); // Селектор для всех ставок

        if (bets.length === 0) {
            // Используем MutationObserver для отслеживания появления ставок
            observeForBets();
            return;
        }

        // Перебираем все ставки
        let currentBetIndex = 0;

        const processNextBet = () => {
            if (currentBetIndex < bets.length) {
                const betElement = bets[currentBetIndex];
                // Убираем задержку между обработкой ставок для ускорения
                checkAndProcessBet(betElement, () => {
                    currentBetIndex++;
                    processNextBet(); // Рекурсивный вызов для следующей ставки
                });
            } else {
                isButtonClicked = false; // Сбрасываем флаг после обработки всех ставок
            }
        };

        processNextBet(); // Запускаем обработку ставок
    }

    // Функция для наблюдения за появлением ставок
    function observeForBets() {
        const observer = new MutationObserver((mutationsList, observer) => {
            const bets = document.querySelectorAll('.LJbWp');
            if (bets.length > 0) {
                observer.disconnect();
                processAllBets();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function checkAndProcessBet(betElement, callback) {
        // Кликаем по ставке, чтобы получить информацию и проверить ticketId
        clickOutcome(betElement, (shouldProceed, extractedInfo) => {
            if (shouldProceed && extractedInfo) {
                // Отправляем информацию в background.js
                sendBetInfoToBackground(extractedInfo);
    
                // Отправляем сообщение в background.js для открытия FonBet и передачи информации о матче
                chrome.runtime.sendMessage({
                    action: "openFonBet",
                    matchInfo: extractedInfo // Отправляем всю собранную информацию
                });
    
                // Добавляем ID в массив и сохраняем
                addSentId(extractedInfo.ticketId);
            }
            // Важно вызывать callback после завершения обработки
            callback();
        });
    }
    

    function clickOutcome(betElement, callback) {
        // Находим элемент "Исход" внутри текущей ставки
        const outcomeElement = betElement.querySelector('.EjJAs.Gx3Id.RkxlK, .EjJAs.Gx3Id.RkxlK.elgdk'); // Селектор для элемента "Исход"
    
        if (outcomeElement) {
            const clickEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true
            });
            outcomeElement.dispatchEvent(clickEvent); // Инициируем событие клика
    
            // Ждём 1 секунду, чтобы дать время открыть окно с билетами
            setTimeout(() => {
                // Извлекаем информацию до перехода на другую страницу
                extractInfoBeforeTransition((shouldProceed, extractedInfo) => {
                    if (shouldProceed && extractedInfo) {
                        // Теперь вызываем clickExtraButton
                        clickExtraButton(() => {
                            callback(true, extractedInfo); // После завершения продолжаем обработку
                        });
                    } else {
                        callback(shouldProceed, extractedInfo); // Если не нужно продолжать, переходим к следующей ставке
                    }
                });
            }, 1000);
        } else {
            callback(false, null); // Переходим к следующей ставке
        }
    }
    

    // Функция для извлечения информации перед переходом на другую страницу
    function extractInfoBeforeTransition(callback) {
        // Извлекаем данные о событии
        const eventElement = document.querySelector('.nv5GX .TXSiv'); // Селектор для события
        const stakeElement = document.querySelector('.nRewp span'); // Селектор для ставки
        const oddsElement = document.querySelector('.Go8Sz.j0wis span'); // Селектор для коэффициента
        const amountElement = document.querySelector('._1Hc_3 ._CP4J'); // Селектор для суммы
        const ticketIdElement = document.querySelector('.fMOV5 .x_Cef'); // Селектор для ID билета

        let message = ""; // Создаем переменную для сообщения
        let ticketId = ""; // Переменная для ID билета
        let matchText = ""; // Переменная для текста внутри скобок

        if (eventElement) {
            const eventName = eventElement.textContent.trim(); // Извлекаем текстовое содержимое (событие)
            message += "Событие: " + eventName + "\n"; // Добавляем к сообщению

            // Извлекаем текст внутри скобок
            const matches = eventName.match(/\((.*?)\)/g);
            if (matches && matches.length >= 2) {
                // Извлекаем оба содержимого внутри скобок
                const extractedNames = matches.map(m => m.slice(1, -1).trim()).join(' ');
                matchText = extractedNames;
                // console.log(`Извлечённые имена из скобок: ${matchText}`); // Минимизируем логирование
            }
        } else {
            // console.log("Событие не найдено."); // Минимизируем логирование
        }

        if (stakeElement) {
            const stakeText = stakeElement.textContent.trim(); // Извлекаем текст ставки
            message += "Ставка: " + stakeText + "\n"; // Добавляем к сообщению
        } else {
            // console.log("Ставка не найдена."); // Минимизируем логирование
        }

        if (oddsElement) {
            const odds = oddsElement.textContent.trim(); // Извлекаем коэффициент
            message += "КФ: " + odds + "\n"; // Добавляем к сообщению
        } else {
            // console.log("КФ не найден."); // Минимизируем логирование
        }

        if (amountElement) {
            const amount = amountElement.textContent.trim(); // Извлекаем сумму
            message += "Сумма: " + amount + "\n"; // Добавляем к сообщению
        } else {
            // console.log("Сумма не найдена."); // Минимизируем логирование
        }

        if (ticketIdElement) {
            ticketId = ticketIdElement.textContent.trim(); // Извлекаем ID билета
            // console.log(`Извлечён ticketId: ${ticketId}`); // Минимизируем логирование
        } else {
            // console.log("ID билета не найден."); // Минимизируем логирование
        }

        // Проверяем, был ли этот ID уже обработан
        if (sentIds.includes(ticketId)) {
            // console.log(`Ставка с ID ${ticketId} уже была обработана. Пропускаем.`); // Минимизируем логирование
            callback(false, null); // Не нужно продолжать обработку
            return;
        }

        // Сохраняем извлечённую информацию
        if (eventElement && stakeElement && oddsElement && amountElement && ticketIdElement) {
            const extractedInfo = { message, ticketId, matchText };
            callback(true, extractedInfo); // Передаем флаг и данные
        } else {
            // console.log("Не удалось получить все данные до перехода, пропуск отправки сообщения."); // Минимизируем логирование
            callback(false, null); // Не удалось извлечь данные, переходим к следующей ставке
        }
    }

    // Функция для отправки информации в background.js
    function sendBetInfoToBackground(betInfo) {
        // Добавляем ссылку на BetBoom
        const betboomLink = window.location.href;
        betInfo.message += `Ссылка на BetBoom: ${betboomLink}\n`;

        chrome.runtime.sendMessage({
            action: "processBet",
            betInfo: betInfo // Вся собранная информация о ставке
        }, function(response) {
            // Можно опустить логирование ответа
        });
    }

    function clickExtraButton(callback) {
        const extraButton = document.querySelector('.vC1Nw'); // Обновлённый селектор
        if (extraButton) {
            extraButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
            setTimeout(() => {
                extraButton.click(); // Используем метод click()
                console.log("Дополнительная кнопка была нажата.");
    
                // Ждём 1 секунду, чтобы страница успела перейти, а затем выполняем дальнейшие действия
                setTimeout(() => {
                    if (window.extractedInfo) {
                        const currentURL = window.location.href;
                        window.extractedInfo.message += "\nСсылка на событие: " + currentURL;
    
                        if (!sentIds.includes(window.extractedInfo.ticketId)) {
                            // Отправляем в Telegram
                            sendToTelegram(window.extractedInfo.message);
    
                            // Отправляем информацию в background.js для дальнейшей обработки
                            sendBetInfoToBackground(window.extractedInfo);
    
                            // Отправляем сообщение в background.js для открытия FonBet и передачи информации о матче
                            chrome.runtime.sendMessage({
                                action: "openFonBet",
                                matchInfo: window.extractedInfo // Отправляем всю собранную информацию
                            });
    
                            // Добавляем ID в массив и сохраняем
                            addSentId(window.extractedInfo.ticketId);
                        } else {
                            console.log(`ID билета ${window.extractedInfo.ticketId} уже был отправлен, пропускаем.`);
                        }
                    } else {
                        console.log("Не удалось отправить информацию, так как данные не были собраны.");
                    }
                    callback();
                }, 1000); // Увеличьте задержку, если страница не успевает загрузиться
            }, 200);
        } else {
            console.log("Дополнительная кнопка не найдена.");
            callback();
        }
    }
    
    
    // Функция для добавления нового ticketId и сохранения в chrome.storage.local
    function addSentId(ticketId) {
        sentIds.push(ticketId);
        // Ограничиваем размер массива до MAX_SENT_IDS
        if (sentIds.length > MAX_SENT_IDS) {
            sentIds.shift(); // Удаляем самый старый ID
        }
        chrome.storage.local.set({ sentIds }, () => {
            // Можно опустить логирование добавления ID
        });
    }

    // Функция для очистки ID каждые 2 часа (7200000 миллисекунд)
    function clearSentIds() {
        chrome.storage.local.remove('sentIds', () => {
            sentIds = [];
            // console.log("Список отправленных ID был очищен."); // Минимизируем логирование
        });
    }

    // Функция для обновления страницы
    function refreshPage() {
        // Разрываем связь с window.opener перед обновлением
        if (window.opener) {
            window.opener = null;
        }
        location.reload(); // Обновляем страницу
        // console.log("Страница была обновлена."); // Минимизируем логирование
    }

    // Устанавливаем интервал обновления страницы каждые 10 секунд (10000 миллисекунд)
    setInterval(refreshPage, 10000);

    // Устанавливаем интервал очистки ID каждые 2 часа (7200000 миллисекунд)
    setInterval(clearSentIds, 2 * 60 * 60 * 1000); // 2 часа в миллисекундах

})();
