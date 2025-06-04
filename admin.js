import { db } from './firebase.js';
import {
  collection,
  getDocs,
  getDoc,
  deleteDoc,
  doc,
  updateDoc,
  query,
  where
} from 'https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js';

function formatAccounting(num) {
  return parseFloat(num || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

async function loadQuotes(filterField = '', filterValue = '') {
  try {
    let q = collection(db, "quotes");
    
    if (filterField && filterValue) {
      if (['total', 'labor', 'materialsTotal', 'discount', 'fees'].includes(filterField)) {
        const numValue = parseFloat(filterValue);
        if (!isNaN(numValue)) q = query(q, where(filterField, "==", numValue));
      } else {
        q = query(q, 
          where(filterField, ">=", filterValue),
          where(filterField, "<=", filterValue + '\uf8ff')
        );
      }
    }

    const querySnapshot = await getDocs(q);
    const list = document.getElementById("quote-list");
    list.innerHTML = "";

    if (querySnapshot.empty) {
      list.innerHTML = '<div class="no-results">No estimates found</div>';
      return;
    }

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const materialsTotal = calculateMaterialsTotal(data.materials);
      const labor = data.labor || (data.total - materialsTotal);
      const discountAmount = (data.discount || 0) * data.total / 100;
      const finalTotal = data.total - discountAmount + (data.fees || 0);

      const card = document.createElement("div");
      card.className = "quote-card";
      card.dataset.id = docSnap.id;
      
      card.innerHTML = `
        <div class="quote-content">
          <div class="quote-header">
            <h3>${data.name || "Unnamed"}</h3>
            <span class="location">${data.location || "No location"}</span>
          </div>
          <div class="quote-details">
            <p><strong>Project:</strong> ${data.project || "Not specified"}</p>
            <p><strong>Date:</strong> ${new Date(data.timestamp?.toDate()).toLocaleString() || "Unknown"}</p>
          </div>
          <div class="pricing-details">
            <div class="materials-list">
              <h4>Materials</h4>
              ${data.materials ? Object.entries(data.materials).map(([name, details]) => `
                <div class="material-item">
                  <span>${name}</span>
                  <span>Qty: ${details.quantity}</span>
                  <span>$${formatAccounting(details.price)}</span>
                </div>
              `).join('') : '<p>No materials</p>'}
            </div>
            <div class="price-summary">
              <p><strong>Materials:</strong> $${formatAccounting(materialsTotal)}</p>
              <p><strong>Labor:</strong> $${formatAccounting(labor)}</p>
              ${data.discount ? `<p><strong>Discount (${data.discount}%):</strong> -$${formatAccounting(discountAmount)}</p>` : ''}
              ${data.fees ? `<p><strong>Fees:</strong> +$${formatAccounting(data.fees)}</p>` : ''}
              <p class="total-price"><strong>Total:</strong> $${formatAccounting(finalTotal)}</p>
              ${data.days ? `<p><strong>Days:</strong> ${data.days}</p>` : ''}
              ${data.workers ? `<p><strong>Workers:</strong> ${data.workers}</p>` : ''}
            </div>
          </div>
        </div>
        <div class="quote-actions">
          <button class="edit-btn" onclick="editQuote('${docSnap.id}')"><i class="fas fa-edit"></i> Edit</button>
          <button class="delete-btn" onclick="deleteQuote('${docSnap.id}')"><i class="fas fa-trash"></i> Delete</button>
          <button class="pdf-btn" onclick="exportToPDF('${docSnap.id}')"><i class="fas fa-file-pdf"></i> PDF</button>
        </div>
      `;
      list.appendChild(card);
    });
  } catch (error) {
    console.error("Error:", error);
    document.getElementById("quote-list").innerHTML = 
      '<div class="error">Error loading estimates</div>';
  }
}

function calculateMaterialsTotal(materials) {
  if (!materials) return 0;
  return Object.values(materials).reduce((sum, item) => 
    sum + (item.price * item.quantity), 0);
}

window.editQuote = async function(id) {
  try {
    const docRef = doc(db, "quotes", id);
    const docSnap = await getDoc(docRef);
    const data = docSnap.data();
    const materialsTotal = calculateMaterialsTotal(data.materials);
    const labor = data.labor || (data.total - materialsTotal);

    const card = document.querySelector(`.quote-card[data-id="${id}"]`);
    card.querySelector('.quote-content').innerHTML = `
      <form class="edit-form" onsubmit="saveQuote('${id}'); return false;">
        <div class="form-section">
          <h4>Project Details</h4>
          <label>Project: <input type="text" value="${data.project || ''}" id="project-input" required></label>
        </div>
        
        <div class="form-section">
          <h4>Pricing</h4>
          <label>Labor Cost: $<input type="number" value="${labor}" min="0" step="0.01" id="labor-input" required></label>
          <label>Discount (%): <input type="number" value="${data.discount || 0}" min="0" max="100" step="1" id="discount-input"></label>
          <label>Fees ($): <input type="number" value="${data.fees || 0}" min="0" step="0.01" id="fees-input"></label>
        </div>
        
        <div class="form-section">
          <h4>Job Details</h4>
          <label>Days: <input type="number" value="${data.days || 1}" min="1" id="days-input"></label>
          <label>Workers: <input type="number" value="${data.workers || 1}" min="1" id="workers-input"></label>
        </div>
        
        <div class="form-buttons">
          <button type="submit" class="save-btn"><i class="fas fa-save"></i> Save</button>
          <button type="button" class="cancel-btn" onclick="cancelEdit('${id}')"><i class="fas fa-times"></i> Cancel</button>
        </div>
      </form>
    `;
  } catch (error) {
    console.error("Error:", error);
    alert("Error loading quote");
  }
};

window.saveQuote = async function(id) {
  try {
    const form = document.querySelector(`.quote-card[data-id="${id}"] .edit-form`);
    const docRef = doc(db, "quotes", id);
    
    await updateDoc(docRef, {
      project: document.getElementById('project-input').value,
      labor: parseFloat(document.getElementById('labor-input').value),
      discount: parseFloat(document.getElementById('discount-input').value) || 0,
      fees: parseFloat(document.getElementById('fees-input').value) || 0,
      days: parseInt(document.getElementById('days-input').value) || 1,
      workers: parseInt(document.getElementById('workers-input').value) || 1,
      lastUpdated: new Date()
    });
    
    loadQuotes();
  } catch (error) {
    console.error("Error:", error);
    alert("Error saving quote");
  }
};

window.exportToPDF = function(id) {
  const card = document.querySelector(`.quote-card[data-id="${id}"]`);
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html>
      <head>
        <title>Estimate ${id}</title>
        <style>
          body { font-family: Arial; padding: 20px; }
          h1 { color: #B7410E; }
          .header { display: flex; justify-content: space-between; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { border: 1px solid #ddd; padding: 8px; }
          .total { font-weight: bold; font-size: 1.2em; }
        </style>
      </head>
      <body>
        ${card.querySelector('.quote-content').outerHTML}
        <script>
          setTimeout(() => {
            window.print();
            window.close();
          }, 500);
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadQuotes();
  document.getElementById('filter-button').addEventListener('click', () => {
    loadQuotes(
      document.getElementById('filter-field').value,
      document.getElementById('filter-value').value
    );
  });
  document.getElementById('reset-button').addEventListener('click', () => {
    document.getElementById('filter-field').value = '';
    document.getElementById('filter-value').value = '';
    loadQuotes();
  });
});