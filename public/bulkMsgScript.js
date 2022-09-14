const form = document.querySelector("form");
console.log(form);
const number = document.getElementById("number").value;
const message = document.getElementById("message").value;

const btn = document.getElementById("btn");

async function postData(url = "", formData) {
  const response = await fetch(url, {
    method: "POST",

    body: formData, // body data type must match "Content-Type" header
  });
  return response; // parses JSON response into native JavaScript objects
}

form.addEventListener("submit", function (e) {
  console.log("form submitted");

  e.preventDefault();
  const number = e.target.number.value;
  const message = e.target.messages.value;
  const message2 = e.target.message2.value;
  const salutation = e.target.salutation.value;

  const file = e.target.uploadFile.files[0];
  // make numbers as array

  const arrayOfNum = number.split(",");

  // e.target.messages.value = "";
  // e.target.number.value = "";
  // e.target.message2.value = "";
  // e.target.salutation.value = "";
  // make all data as form
  const formData = new FormData();

  formData.append("number", JSON.stringify(arrayOfNum));
  formData.append("message", message);
  formData.append("message2", message2);
  formData.append("salutation", salutation);
  formData.append("file", file);
  // https://whatsapp-2-0.herokuapp.com/send-bulkmsg
  // "http://localhost:8000/send-bulkmsg"
  postData("https://whatsapp-2-0.herokuapp.com/send-bulkmsg", formData).then(
    (data) => {
      data.json().then((data) => {
        console.log("data response ==> ", data);
        check(data.message);
      });
      // console.log(data); // JSON data parsed by `data.json()` call
      // check(data);
    }
  );
});

// remove success message after 3 second

function successMessage(data) {
  document.querySelector(".alert").classList.remove("hide");
  document.querySelector(".alert").innerHTML = data;
  setTimeout(function () {
    document.querySelector(".alert").classList.add("hide");
  }, 5000);
}

function check(data) {
  console.log("data funcitno check", data);
  if (data) {
    successMessage(data);
  }
}
