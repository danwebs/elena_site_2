/* Подстановка текущего года в подвал — для служебных страниц,
   где не подключается основной скрипт main.js. */
(function () {
  "use strict";
  var y = document.getElementById("year");
  if (y) y.textContent = String(new Date().getFullYear());
})();
