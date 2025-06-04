import { db } from './firebase.js';
import {
  collection,
  getDocs,
  getDoc,
  deleteDoc,
  doc,
  updateDoc
} from 'https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js';

// Load all quotes from Firestore
async function loadQuotes() {
  try {
    const querySnapshot = await getDocs(collection(db, "quotes"));
    const list = document.getElementById("quote-list");
    list.innerHTML = "";

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const card = document.createElement("div");
      card.className = "quote-card";
      card.dataset.id = docSnap.id;
      card.innerHTML = `
        <div class="quote-content">
          <h3>${data.name || "Unnamed"}</h3>
          <p><strong>Email:</strong> ${data.email || "N/A"}</p>
          <p><strong>Estimate:</strong> $${data.total || "0.00"}</p>
          <p><strong>Details:</strong> ${data.details || "No details provided"}</p>
          <p><strong>Date:</strong> ${new Date(data.timestamp?.toDate()).toLocaleString() || "Unknown date"}</p>
        </div>
        <div class="quote-actions">
          <button class="edit-btn" onclick="editQuote('${docSnap.id}')">Edit</button>
          <button class="delete-btn" onclick="deleteQuote('${docSnap.id}')">Delete</button>
        </div>
      `;
      list.appendChild(card);
    });
  } catch (error) {
    console.error("Error loading quotes:", error);
  }
}

// Edit a specific quote
window.editQuote = async function(id) {
  try {
    const docRef = doc(db, "quotes", id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      console.error("No such document!");
      return;
    }

    const data = docSnap.data();
    const card = document.querySelector(`.quote-card[data-id="${id}"]`);
    
    card.querySelector('.quote-content').innerHTML = `
      <form class="edit-form" onsubmit="saveQuote('${id}'); return false;">
        <label for="edit-name-${id}">Name:</label>
        <input type="text" id="edit-name-${id}" value="${data.name || ''}" required>
        
        <label for="edit-email-${id}">Email:</label>
        <input type="email" id="edit-email-${id}" value="${data.email || ''}" required>
        
        <label for="edit-total-${id}">Estimate ($):</label>
        <input type="number" id="edit-total-${id}" value="${data.total || ''}" step="0.01" required>
        
        <label for="edit-details-${id}">Details:</label>
        <textarea id="edit-details-${id}" required>${data.details || ''}</textarea>
        
        <div class="form-buttons">
          <button type="submit" class="save-btn">Save</button>
          <button type="button" class="cancel-btn" onclick="cancelEdit('${id}')">Cancel</button>
        </div>
      </form>
    `;
  } catch (error) {
    console.error("Error editing quote:", error);
  }
};

// Save edited quote
window.saveQuote = async function(id) {
  try {
    const name = document.getElementById(`edit-name-${id}`).value;
    const email = document.getElementById(`edit-email-${id}`).value;
    const total = document.getElementById(`edit-total-${id}`).value;
    const details = document.getElementById(`edit-details-${id}`).value;

    await updateDoc(doc(db, "quotes", id), {
      name,
      email,
      total: parseFloat(total),
      details,
      lastUpdated: new Date()
    });

    loadQuotes();
  } catch (error) {
    console.error("Error saving quote:", error);
    alert("Failed to save changes. Please try again.");
  }
};

// Cancel editing
window.cancelEdit = function(id) {
  loadQuotes();
};

// Delete a quote
window.deleteQuote = async function(id) {
  if (confirm("Are you sure you want to delete this quote?")) {
    try {
      await deleteDoc(doc(db, "quotes", id));
      loadQuotes();
    } catch (error) {
      console.error("Error deleting quote:", error);
    }
  }
};

// Export to CSV
window.exportToCSV = async function() {
  try {
    const querySnapshot = await getDocs(collection(db, "quotes"));
    const rows = [["Name", "Email", "Estimate", "Details", "Date"]];
    
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      rows.push([
        data.name || "",
        data.email || "",
        `$${data.total || "0.00"}`,
        data.details || "",
        new Date(data.timestamp?.toDate()).toLocaleString() || ""
      ]);
    });

    const csvContent = "data:text/csv;charset=utf-8," + 
      rows.map(e => e.map(field => `"${field.replace(/"/g, '""')}"`).join(",")).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `quotes_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error("Error exporting to CSV:", error);
  }
};

// Search functionality
document.getElementById("searchBox").addEventListener("input", function() {
  const filter = this.value.toLowerCase();
  document.querySelectorAll(".quote-card").forEach(card => {
    const text = card.textContent.toLowerCase();
    card.style.display = text.includes(filter) ? "" : "none";
  });
});

// Initialize the page
document.addEventListener('DOMContentLoaded', () => {
  loadQuotes();
});
