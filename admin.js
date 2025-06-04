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

// Format currency
const formatMoney = (num) => parseFloat(num || 0).toLocaleString('en-US', {
  style: 'currency',
  currency: 'USD'
});

// Search all fields for text
async function searchQuotes(searchText) {
  const quotesRef = collection(db, "quotes");
  const snapshot = await getDocs(quotesRef);
  const results = [];
  
  snapshot.forEach(doc => {
    const data = doc.data();
    const searchStr = JSON.stringify(data).toLowerCase();
    if (searchStr.includes(searchText.toLowerCase())) {
      results.push({ id: doc.id, ...data });
    }
  });
  
  return results;
}

// Calculate materials total
function calcMaterialsTotal(materials) {
  if (!materials) return 0;
  return Object.values(materials).reduce((total, item) => 
    total + (item.price * item.quantity), 0);
}

// Load quotes with optional search
async function loadQuotes(searchTerm = '') {
  try {
    const list = document.getElementById("quote-list");
    list.innerHTML = "<div class='loading'>Loading estimates...</div>";
    
    const quotes = searchTerm 
      ? await searchQuotes(searchTerm)
      : (await getDocs(collection(db, "quotes"))).docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (quotes.length === 0) {
      list.innerHTML = `<div class="no-results">${searchTerm ? 'No matches found' : 'No estimates yet'}</div>`;
      return;
    }

    list.innerHTML = '';
    quotes.forEach(quote => {
      const materialsTotal = calcMaterialsTotal(quote.materials);
      const labor = quote.labor || (quote.total - materialsTotal);
      const discountAmount = (quote.discount || 0) * quote.total / 100;
      const finalTotal = quote.total - discountAmount + (quote.fees || 0);
      
      const card = document.createElement("div");
      card.className = "quote-card";
      card.dataset.id = quote.id;
      card.innerHTML = `
        <div class="quote-content">
          <div class="quote-header">
            <h3>${quote.name || "Unnamed Client"}</h3>
            <span class="project-badge">${quote.project || "No Project"}</span>
          </div>
          
          <div class="quote-meta">
            <span><i class="fas fa-calendar"></i> ${new Date(quote.timestamp?.toDate()).toLocaleDateString()}</span>
            <span><i class="fas fa-map-marker-alt"></i> ${quote.location || "No Location"}</span>
          </div>
          
          <div class="materials-section">
            <h4><i class="fas fa-box-open"></i> Materials</h4>
            <div class="materials-list">
              ${quote.materials ? Object.entries(quote.materials).map(([name, item]) => `
                <div class="material-item">
                  <span>${name}</span>
                  <span class="material-qty">${item.quantity} × ${formatMoney(item.price)}</span>
                  <span class="material-total">${formatMoney(item.quantity * item.price)}</span>
                </div>
              `).join('') : '<p>No materials listed</p>'}
            </div>
          </div>
          
          <div class="price-summary">
            <div class="price-row">
              <span>Materials</span>
              <span>${formatMoney(materialsTotal)}</span>
            </div>
            <div class="price-row">
              <span>Labor</span>
              <span>${formatMoney(labor)}</span>
            </div>
            ${quote.discount ? `
            <div class="price-row discount">
              <span>Discount (${quote.discount}%)</span>
              <span>-${formatMoney(discountAmount)}</span>
            </div>` : ''}
            ${quote.fees ? `
            <div class="price-row fees">
              <span>Fees</span>
              <span>+${formatMoney(quote.fees)}</span>
            </div>` : ''}
            <div class="price-row total">
              <span>Total</span>
              <span>${formatMoney(finalTotal)}</span>
            </div>
          </div>
          
          <div class="job-details">
            <div class="detail-item">
              <i class="fas fa-clock"></i>
              <span>${quote.days || 1} day${quote.days !== 1 ? 's' : ''}</span>
            </div>
            <div class="detail-item">
              <i class="fas fa-users"></i>
              <span>${quote.workers || 1} worker${quote.workers !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>
        
        <div class="quote-actions">
          <button class="edit-btn" onclick="editQuote('${quote.id}')">
            <i class="fas fa-edit"></i> Edit
          </button>
          <button class="pdf-btn" onclick="generatePDF('${quote.id}')">
            <i class="fas fa-file-pdf"></i> PDF
          </button>
          <button class="delete-btn" onclick="deleteQuote('${quote.id}')">
            <i class="fas fa-trash"></i> Delete
          </button>
        </div>
      `;
      list.appendChild(card);
    });
  } catch (error) {
    console.error("Error loading quotes:", error);
    document.getElementById("quote-list").innerHTML = 
      '<div class="error"><i class="fas fa-exclamation-triangle"></i> Failed to load estimates</div>';
  }
}

// Edit quote with materials editing
window.editQuote = async function(id) {
  try {
    const docRef = doc(db, "quotes", id);
    const docSnap = await getDoc(docRef);
    const data = docSnap.data();
    const materialsTotal = calcMaterialsTotal(data.materials);
    const labor = data.labor || (data.total - materialsTotal);
    
    const card = document.querySelector(`.quote-card[data-id="${id}"]`);
    card.querySelector('.quote-content').innerHTML = `
      <form class="edit-form" onsubmit="saveQuote('${id}'); return false;">
        <h3>Edit Estimate</h3>
        
        <div class="form-group">
          <label>Project Name</label>
          <input type="text" value="${data.project || ''}" required>
        </div>
        
        <div class="form-group">
          <label>Labor Cost</label>
          <input type="number" value="${labor}" min="0" step="0.01" required>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label>Discount (%)</label>
            <input type="number" value="${data.discount || 0}" min="0" max="100">
          </div>
          <div class="form-group">
            <label>Fees ($)</label>
            <input type="number" value="${data.fees || 0}" min="0" step="0.01">
          </div>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label>Days Needed</label>
            <input type="number" value="${data.days || 1}" min="1">
          </div>
          <div class="form-group">
            <label>Workers</label>
            <input type="number" value="${data.workers || 1}" min="1">
          </div>
        </div>
        
        <div class="materials-edit">
          <h4><i class="fas fa-boxes"></i> Materials</h4>
          <div id="materials-container">
            ${data.materials ? Object.entries(data.materials).map(([name, item]) => `
              <div class="material-edit-item">
                <input type="text" value="${name}" placeholder="Material name">
                <input type="number" value="${item.quantity}" min="1" placeholder="Qty">
                <input type="number" value="${item.price}" min="0" step="0.01" placeholder="Price">
                <button type="button" class="remove-material" onclick="this.closest('.material-edit-item').remove()">
                  <i class="fas fa-times"></i>
                </button>
              </div>
            `).join('') : ''}
          </div>
          <button type="button" class="add-material" onclick="addMaterialField()">
            <i class="fas fa-plus"></i> Add Material
          </button>
        </div>
        
        <div class="form-actions">
          <button type="submit" class="save-btn">
            <i class="fas fa-save"></i> Save Changes
          </button>
          <button type="button" class="cancel-btn" onclick="cancelEdit('${id}')">
            <i class="fas fa-times"></i> Cancel
          </button>
        </div>
      </form>
    `;
  } catch (error) {
    console.error("Error editing quote:", error);
    alert("Failed to load estimate for editing");
  }
};

// Add new material field
window.addMaterialField = function() {
  const container = document.getElementById('materials-container');
  const div = document.createElement('div');
  div.className = 'material-edit-item';
  div.innerHTML = `
    <input type="text" placeholder="Material name">
    <input type="number" min="1" placeholder="Qty" value="1">
    <input type="number" min="0" step="0.01" placeholder="Price">
    <button type="button" class="remove-material" onclick="this.closest('.material-edit-item').remove()">
      <i class="fas fa-times"></i>
    </button>
  `;
  container.appendChild(div);
};

// Save quote with materials
window.saveQuote = async function(id) {
  try {
    const form = document.querySelector(`.quote-card[data-id="${id}"] .edit-form`);
    const materials = {};
    
    // Collect materials data
    form.querySelectorAll('.material-edit-item').forEach(item => {
      const inputs = item.querySelectorAll('input');
      const name = inputs[0].value.trim();
      if (name) {
        materials[name] = {
          quantity: parseInt(inputs[1].value) || 1,
          price: parseFloat(inputs[2].value) || 0
        };
      }
    });
    
    // Calculate new totals
    const materialsTotal = Object.values(materials).reduce((sum, item) => 
      sum + (item.price * item.quantity), 0);
    const labor = parseFloat(form.querySelector('input[type="number"]').value);
    const discount = parseFloat(form.querySelectorAll('input[type="number"]')[1].value) || 0;
    const fees = parseFloat(form.querySelectorAll('input[type="number"]')[2].value) || 0;
    const total = materialsTotal + labor;
    const finalTotal = total - (total * discount / 100) + fees;
    
    await updateDoc(doc(db, "quotes", id), {
      project: form.querySelector('input[type="text"]').value,
      materials,
      materialsTotal,
      labor,
      discount,
      fees,
      total: finalTotal,
      days: parseInt(form.querySelectorAll('input[type="number"]')[3].value) || 1,
      workers: parseInt(form.querySelectorAll('input[type="number"]')[4].value) || 1,
      lastUpdated: new Date()
    });
    
    loadQuotes();
  } catch (error) {
    console.error("Error saving quote:", error);
    alert("Failed to save changes");
  }
};

// Cancel editing
window.cancelEdit = function(id) {
  loadQuotes();
};

// Delete quote
window.deleteQuote = async function(id) {
  if (!confirm("Permanently delete this estimate?")) return;
  try {
    await deleteDoc(doc(db, "quotes", id));
    loadQuotes();
  } catch (error) {
    console.error("Error deleting quote:", error);
    alert("Failed to delete estimate");
  }
};

// Generate PDF
window.generatePDF = async function(id) {
  const docRef = doc(db, "quotes", id);
  const docSnap = await getDoc(docRef);
  const data = docSnap.data();
  
  const materialsTotal = calcMaterialsTotal(data.materials);
  const labor = data.labor || (data.total - materialsTotal);
  const discountAmount = (data.discount || 0) * data.total / 100;
  const finalTotal = data.total - discountAmount + (data.fees || 0);
  
  const win = window.open('', '_blank');
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Estimate #${id}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500&display=swap');
        body { font-family: 'Roboto', sans-serif; padding: 20px; color: #333; }
        .header { display: flex; justify-content: space-between; margin-bottom: 20px; }
        .company { color: #B7410E; font-size: 24px; font-weight: 500; }
        .title { font-size: 28px; color: #B7410E; margin: 20px 0; }
        .client-info { margin-bottom: 30px; }
        .section-title { background: #FF7F50; color: white; padding: 8px 12px; margin: 15px 0; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th { background: #f5f5f5; text-align: left; padding: 10px; }
        td { padding: 10px; border-bottom: 1px solid #eee; }
        .total-row { font-weight: bold; font-size: 1.1em; }
        .footer { margin-top: 40px; font-size: 12px; text-align: center; color: #777; }
        .job-details { display: flex; gap: 20px; margin-top: 20px; }
        .detail-box { border: 1px solid #ddd; padding: 10px; border-radius: 5px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="company">Handyman Pro</div>
        <div>Estimate #${id.substring(0, 8)}</div>
      </div>
      
      <h1 class="title">Project Estimate</h1>
      
      <div class="client-info">
        <p><strong>Client:</strong> ${data.name || "Not specified"}</p>
        <p><strong>Project:</strong> ${data.project || "General work"}</p>
        <p><strong>Date:</strong> ${new Date(data.timestamp?.toDate()).toLocaleDateString()}</p>
      </div>
      
      <div class="section-title">Materials</div>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Quantity</th>
            <th>Unit Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${data.materials ? Object.entries(data.materials).map(([name, item]) => `
            <tr>
              <td>${name}</td>
              <td>${item.quantity}</td>
              <td>${formatMoney(item.price)}</td>
              <td>${formatMoney(item.price * item.quantity)}</td>
            </tr>
          `).join('') : '<tr><td colspan="4">No materials specified</td></tr>'}
        </tbody>
      </table>
      
      <div class="section-title">Summary</div>
      <table>
        <tr>
          <td>Materials Subtotal</td>
          <td>${formatMoney(materialsTotal)}</td>
        </tr>
        <tr>
          <td>Labor</td>
          <td>${formatMoney(labor)}</td>
        </tr>
        ${data.discount ? `
        <tr>
          <td>Discount (${data.discount}%)</td>
          <td>-${formatMoney(discountAmount)}</td>
        </tr>` : ''}
        ${data.fees ? `
        <tr>
          <td>Fees</td>
          <td>+${formatMoney(data.fees)}</td>
        </tr>` : ''}
        <tr class="total-row">
          <td>TOTAL ESTIMATE</td>
          <td>${formatMoney(finalTotal)}</td>
        </tr>
      </table>
      
      <div class="job-details">
        <div class="detail-box">
          <strong>Estimated Duration:</strong> ${data.days || 1} day${data.days !== 1 ? 's' : ''}
        </div>
        <div class="detail-box">
          <strong>Workers:</strong> ${data.workers || 1}
        </div>
      </div>
      
      <div class="footer">
        <p>Thank you for your business!</p>
        <p>Generated on ${new Date().toLocaleDateString()}</p>
      </div>
      
      <script>
        setTimeout(() => {
          window.print();
          window.close();
        }, 300);
      </script>
    </body>
    </html>
  `);
  win.document.close();
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadQuotes();
  
  // Simple search functionality
  const searchInput = document.getElementById('search-input');
  const searchBtn = document.getElementById('search-button');
  const resetBtn = document.getElementById('reset-button');
  
  searchBtn.addEventListener('click', () => {
    if (searchInput.value.trim()) {
      loadQuotes(searchInput.value.trim());
    }
  });
  
  resetBtn.addEventListener('click', () => {
    searchInput.value = '';
    loadQuotes();
  });
  
  searchInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') searchBtn.click();
  });
});