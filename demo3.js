// Fetch API
fetch("https://jsonplaceholder.typicode.com/todos/1")
  .then(res => res.json())
  .then(console.log);

// IntersectionObserver
const observer = new IntersectionObserver(entries => {
  console.log("Element visible?", entries[0].isIntersecting);
});

// Risky pattern
eval("console.log('Oops eval')");
var unusedVar;

// CSS Grid example
const style = "display: grid; grid-template-columns: 1fr 1fr;";
document.body.style = style;

// Async function (modern JS)
async function loadData() {
  const res = await fetch("https://api.example.com/items");
  return res.json();
}
