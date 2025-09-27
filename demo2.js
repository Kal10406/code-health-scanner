// Dangerous eval usage
eval("console.log('This is unsafe')");

// Unused variable
var unusedVar;

// Deprecated API usage
document.write("Hello World");

// InnerHTML assignment without sanitization
const div = document.createElement("div");
div.innerHTML = "<img src='x' onerror='alert(1)'>";
document.body.appendChild(div);

// Mixed old JS syntax
var x = 10;
var y = 20;
