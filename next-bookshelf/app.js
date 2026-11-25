const initialBooks = [
  { title: "모순", author: "양귀자", area: "연남동", requested: false },
  { title: "불편한 편의점", author: "김호연", area: "망원동", requested: false },
  { title: "아몬드", author: "손원평", area: "합정동", requested: false },
  { title: "작별인사", author: "김영하", area: "성산동", requested: true },
];

const find = (selector) => document.querySelector(selector);
const search = find("#search");
const available = find("#available");
const list = find("#books");
const status = find("#status");
const form = find("#add-form");
const addDialog = find("#add-dialog");
const storageKey = "next-bookshelf-v1";

function loadBooks() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(saved) && saved.every((book) =>
      book && ["title", "author", "area"].every((key) => typeof book[key] === "string") &&
      typeof book.requested === "boolean"
    )) {
      return saved;
    }
  } catch {
    // The initial catalog also works when browser storage is unavailable.
  }
  return initialBooks;
}

let books = loadBooks();

function save(message) {
  let feedback = message;
  try {
    localStorage.setItem(storageKey, JSON.stringify(books));
  } catch {
    feedback += " 저장 공간에 접근할 수 없어 이 화면에서만 적용됩니다.";
  }
  render();
  status.textContent = feedback;
}

function render() {
  const query = search.value.trim().toLocaleLowerCase("ko");
  const visible = books.filter((book) =>
    (!available.checked || !book.requested) &&
    [book.title, book.author].some((value) => value.toLocaleLowerCase("ko").includes(query))
  );
  find("#count").textContent = visible.length + "권";
  list.replaceChildren();

  if (visible.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "조건에 맞는 책이 없어요. 검색어나 필터를 바꿔 보세요.";
    list.append(empty);
    return;
  }

  for (const book of visible) {
    const row = document.createElement("li");
    const details = document.createElement("div");
    const title = document.createElement("h3");
    const meta = document.createElement("p");
    const button = document.createElement("button");

    title.textContent = book.title;
    meta.textContent = book.author + " / " + book.area;
    button.textContent = book.requested ? "신청 완료" : "교환 신청";
    button.setAttribute("aria-label", book.title + " " + button.textContent);
    button.disabled = book.requested;
    button.addEventListener("click", () => {
      if (window.confirm(book.title + " 교환을 신청할까요?")) {
        books = books.map((item) => item === book ? { ...item, requested: true } : item);
        save("이 브라우저에 교환 신청을 기록했어요.");
        search.focus();
      }
    });

    details.append(title, meta);
    row.append(details, button);
    list.append(row);
  }
}

search.addEventListener("input", render);
available.addEventListener("change", render);
find("#open-add").addEventListener("click", () => addDialog.showModal());
find("#cancel-add").addEventListener("click", () => addDialog.close());
find("#open-report").addEventListener("click", () => find("#report").showModal());
form.addEventListener("input", (event) => event.target.setCustomValidity(""));
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const entry = { requested: false };

  for (const field of ["title", "author", "area"]) {
    const input = form.elements.namedItem(field);
    entry[field] = input.value.trim();
    if (!entry[field]) {
      input.setCustomValidity("공백 이외의 내용을 입력해 주세요.");
      input.reportValidity();
      return;
    }
  }

  books = [entry, ...books];
  search.value = "";
  save("책을 등록했어요.");
  form.reset();
  addDialog.close();
});

render();
