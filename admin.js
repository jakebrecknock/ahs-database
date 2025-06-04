import { db } from './firebase.js';
import {
  collection,
  getDocs,
  deleteDoc,
  doc
} from 'https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js';

async function loadQuotes() {
  const querySnapshot = await getDocs(collection(db, "quotes"));
  const list = document.getElementById("quote-list");
  list.innerHTML = "";

  querySnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const card = document.createElement("div");
    card.className = "quote-card";
    card.innerHTML = `
      <h3>${data.name || "Unnamed"}</h3>
      <p><strong>Email:</strong> ${data.email || "N/A"}</p>
      <p><strong>Estimate:</strong> $${data.total || "0.00"}</p>
      <button onclick="deleteQuote('${docSnap.id}')">Delete</button>
    `;
    list.appendChild(card);
  });
}

window.deleteQuote = async function(id) {
  await deleteDoc(doc(db, "quotes", id));
  loadQuotes();
};

window.exportToCSV = function() {
  const cards = document.querySelectorAll('.quote-card');
  const rows = [["Name", "Email", "Estimate"]];

  cards.forEach(card => {
    const name = card.querySelector("h3").innerText;
    const email = card.querySelector("p:nth-of-type(1)").innerText.split(": ")[1];
    const total = card.querySelector("p:nth-of-type(2)").innerText.split(": ")[1];
    rows.push([name, email, total]);
  });

  const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "quotes.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

document.getElementById("searchBox").addEventListener("input", function() {
  const filter = this.value.toLowerCase();
  document.querySelectorAll(".quote-card").forEach(card => {
    card.style.display = card.innerText.toLowerCase().includes(filter) ? "" : "none";
  });
});

loadQuotes();