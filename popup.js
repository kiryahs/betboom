// popup.js

document.addEventListener('DOMContentLoaded', function() {
    const toggleSwitch = document.getElementById('toggleSwitch');
    const clearButton = document.getElementById('clearButton');

    // Загрузка состояния переключателя из chrome.storage.local
    chrome.storage.local.get('isEnabled', function(data) {
        toggleSwitch.checked = data.isEnabled !== undefined ? data.isEnabled : true; // По умолчанию включен
    });

    // Обработка изменения состояния переключателя
    toggleSwitch.addEventListener('change', function() {
        const isEnabled = this.checked;
        
        // Сохранение состояния в chrome.storage.local
        chrome.storage.local.set({ 'isEnabled': isEnabled }, function() {
            console.log('Состояние переключателя сохранено: ', isEnabled);
        });

        // Отправка сообщения в background.js
        chrome.runtime.sendMessage({ action: isEnabled ? "enable" : "disable" });
    });

    // Обработка нажатия на кнопку очистки sentIds
    clearButton.addEventListener('click', function() {
        if (confirm("Вы уверены, что хотите очистить список обработанных ставок?")) {
            // Отправка сообщения в background.js для очистки sentIds
            chrome.runtime.sendMessage({ action: "clearSentIds" }, function(response) {
                if (response && response.status === "success") {
                    alert("Список обработанных ставок успешно очищен.");
                } else {
                    alert("Не удалось очистить список обработанных ставок.");
                }
            });
        }
    });
});

// Установка значения по умолчанию при первом открытии
chrome.storage.local.get('isEnabled', function(data) {
    if (data.isEnabled === undefined) { // Если значение не установлено
        chrome.storage.local.set({ 'isEnabled': true }); // Устанавливаем по умолчанию в true
    }
});
