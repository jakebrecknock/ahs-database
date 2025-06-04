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

// Format numbers as accounting format (x,xxx.00)
function formatAccounting(num) {
  return parseFloat(num).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// Load quotes with filtering
async function loadQuotes(filterField = '', filterValue = '') {
  try {
    let q;
    const quotesCollection = collection(db, "quotes");
    
    if (filterField && filterValue) {
      if (['total', 'labor', 'materialsTotal', 'discount', 'fees'].includes(filterField)) {
        const numValue = parseFloat(filterValue);
        if (!isNaN(numValue)) {
          q = query(quotesCollection, where(filterField, "==", numValue));
        } else {
          q = quotesCollection;
        }
      } else {
        q = query(quotesCollection, 
          where(filterField, ">=", filterValue),
          where(filterField, "<=", filterValue + '\uf8ff')
        );
      }
    } else {
      q = quotesCollection;
    }

    const querySnapshot = await getDocs(q);
    const list = document.getElementById("quote-list");
    list.innerHTML = "";

    if (querySnapshot.empty) {
      list.innerHTML = '<div class="no-results">No estimates found matching your criteria</div>';
      return;
    }

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const card = document.createElement("div");
      card.className = "quote-card";
      card.dataset.id = docSnap.id;
      
      const materialsList = data.materials ? 
        Object.entries(data.materials).map(([name, details]) => `
          <div class="material-item">
            <span>${name}</span>
            <span>Qty: ${details.quantity}</span>
            <span>$${formatAccounting(details.price)} ($${formatAccounting(details.quantity * details.price)})</span>
          </div>
        `).join('') : '<p>No materials specified</p>';
      
      const discountAmount = data.discount ? (data.total * data.discount / 100) : 0;
      const subtotal = data.total - discountAmount + (data.fees || 0);
      
      card.innerHTML = `
        <div class="quote-content">
          <div class="quote-header">
            <h3>${data.name || "Unnamed"}</h3>
            <span class="location">${data.location || "No location"}</span>
          </div>
          <div class="quote-details">
            <p><strong>Email:</strong> ${data.email || "N/A"}</p>
            <p><strong>Phone:</strong> ${data.phone || "N/A"}</p>
            <p><strong>Project:</strong> ${data.project || "Not specified"}</p>
            <p><strong>Date:</strong> ${new Date(data.timestamp?.toDate()).toLocaleString() || "Unknown"}</p>
          </div>
          <div class="pricing-details">
            <div class="materials-list">
              <h4>Materials</h4>
              ${materialsList}
            </div>
            <div class="price-summary">
              <p><strong>Materials Total:</strong> $${formatAccounting(data.materialsTotal || 0)}</p>
              <p><strong>Labor:</strong> $${formatAccounting(data.labor || 0)}</p>
              ${data.discount ? `<p><strong>Discount (${data.discount}%):</strong> -$${formatAccounting(discountAmount)}</p>` : ''}
              ${data.fees ? `<p><strong>Fees:</strong> +$${formatAccounting(data.fees)}</p>` : ''}
              <p class="total-price"><strong>Total Estimate:</strong> $${formatAccounting(subtotal)}</p>
              ${data.days ? `<p><strong>Estimated Days:</strong> ${data.days}</p>` : ''}
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
    console.error("Error loading quotes:", error);
    document.getElementById("quote-list").innerHTML = 
      '<div class="error">Error loading estimates. Please try again.</div>';
  }
}

// Delete quote with confirmation
window.deleteQuote = async function(id) {
  if (!confirm("Are you sure you want to permanently delete this estimate?")) return;
  
  try {
    await deleteDoc(doc(db, "quotes", id));
    loadQuotes();
  } catch (error) {
    console.error("Error deleting quote:", error);
    alert("Failed to delete estimate. Please try again.");
  }
};

// Edit quote with correct default values
window.editQuote = async function(id) {
  try {
    const docRef = doc(db, "quotes", id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      alert("Estimate not found!");
      return;
    }

    const data = docSnap.data();
    const card = document.querySelector(`.quote-card[data-id="${id}"]`);
    
    const materialsFields = data.materials ? 
      Object.entries(data.materials).map(([name, details], index) => `
        <div class="material-edit" data-index="${index}">
          <input type="text" value="${name}" placeholder="Material name" required>
          <input type="number" value="${details.quantity}" placeholder="Qty" min="1" step="1" required>
          <input type="number" value="${details.price}" placeholder="Price" min="0" step="0.01" required>
          <button type="button" class="remove-material" onclick="removeMaterialField(this)"><i class="fas fa-times"></i></button>
        </div>
      `).join('') : '';
    
    card.querySelector('.quote-content').innerHTML = `
      <form class="edit-form" onsubmit="saveQuote('${id}'); return false;">
        <div class="form-section">
          <h4>Client Information</h4>
          <label>Name: <input type="text" value="${data.name || ''}" required></label>
          <label>Email: <input type="email" value="${data.email || ''}" required></label>
          <label>Phone: <input type="tel" value="${data.phone || ''}"></label>
          <label>Location: <input type="text" value="${data.location || ''}" required></label>
        </div>
        
        <div class="form-section">
          <h4>Project Details</h4>
          <label>Project Type: <input type="text" value="${data.project || ''}" id="project-input" required></label>
        </div>
        
        <div class="form-section">
          <h4>Materials</h4>
          <div id="materials-container">
            ${materialsFields}
          </div>
          <button type="button" class="add-material" onclick="addMaterialField()"><i class="fas fa-plus"></i> Add Material</button>
        </div>
        
        <div class="form-section">
          <h4>Pricing</h4>
          <label>Labor Cost: $<input type="number" value="${data.labor || ''}" min="0" step="0.01" id="labor-input" required></label>
          <label>Discount (%): <input type="number" value="${data.discount || 0}" min="0" max="100" step="1" id="discount-input"></label>
          <label>Fees ($): <input type="number" value="${data.fees || 0}" min="0" step="0.01" id="fees-input"></label>
        </div>
        
        <div class="form-section">
          <h4>Job Details</h4>
          <label>Estimated Days: <input type="number" value="${data.days || 1}" min="1" step="1" id="days-input"></label>
          <label>Number of Workers: <input type="number" value="${data.workers || 1}" min="1" step="1" id="workers-input"></label>
        </div>
        
        <div class="form-buttons">
          <button type="submit" class="save-btn"><i class="fas fa-save"></i> Save Changes</button>
          <button type="button" class="cancel-btn" onclick="cancelEdit('${id}')"><i class="fas fa-times"></i> Cancel</button>
        </div>
      </form>
    `;
  } catch (error) {
    console.error("Error editing quote:", error);
    alert("Failed to load estimate for editing. Please try again.");
  }
};

// Cancel editing - fixed functionality
window.cancelEdit = function(id) {
  loadQuotes();
};

// Add new material field
window.addMaterialField = function() {
  const container = document.getElementById('materials-container');
  const newIndex = container.querySelectorAll('.material-edit').length;
  
  const div = document.createElement('div');
  div.className = 'material-edit';
  div.dataset.index = newIndex;
  div.innerHTML = `
    <input type="text" placeholder="Material name" required>
    <input type="number" placeholder="Qty" min="1" step="1" required>
    <input type="number" placeholder="Price" min="0" step="0.01" required>
    <button type="button" class="remove-material" onclick="removeMaterialField(this)"><i class="fas fa-times"></i></button>
  `;
  container.appendChild(div);
};

// Remove material field
window.removeMaterialField = function(button) {
  button.closest('.material-edit').remove();
};

// Save quote with all details
window.saveQuote = async function(id) {
  try {
    const form = document.querySelector(`.quote-card[data-id="${id}"] .edit-form`);
    
    // Collect materials
    const materials = {};
    let materialsTotal = 0;
    
    form.querySelectorAll('.material-edit').forEach(item => {
      const inputs = item.querySelectorAll('input');
      const name = inputs[0].value;
      const quantity = parseFloat(inputs[1].value);
      const price = parseFloat(inputs[2].value);
      
      materials[name] = {
        quantity: quantity,
        price: price,
        total: quantity * price
      };
      
      materialsTotal += quantity * price;
    });
    
    const labor = parseFloat(document.getElementById('labor-input').value);
    const discount = parseFloat(document.getElementById('discount-input').value) || 0;
    const fees = parseFloat(document.getElementById('fees-input').value) || 0;
    const days = parseInt(document.getElementById('days-input').value) || 1;
    const workers = parseInt(document.getElementById('workers-input').value) || 1;
    const project = document.getElementById('project-input').value;
    
    const subtotal = materialsTotal + labor;
    const discountAmount = subtotal * discount / 100;
    const total = subtotal - discountAmount + fees;
    
    await updateDoc(doc(db, "quotes", id), {
      name: form.querySelector('input[type="text"]').value,
      email: form.querySelector('input[type="email"]').value,
      phone: form.querySelector('input[type="tel"]').value,
      location: form.querySelectorAll('input[type="text"]')[1].value,
      project: project,
      materials,
      materialsTotal,
      labor,
      discount,
      fees,
      days,
      workers,
      total,
      lastUpdated: new Date()
    });
    
    loadQuotes();
  } catch (error) {
    console.error("Error saving quote:", error);
    alert("Failed to save changes. Please try again.");
  }
};

// Filter functionality
window.applyFilter = function() {
  const filterField = document.getElementById('filter-field').value;
  const filterValue = document.getElementById('filter-value').value.trim();
  
  if (filterField && filterValue) {
    loadQuotes(filterField, filterValue);
  } else {
    loadQuotes();
  }
};

// Reset filters
window.resetFilters = function() {
  document.getElementById('filter-field').value = '';
  document.getElementById('filter-value').value = '';
  loadQuotes();
};

// Export to PDF
window.exportToPDF = async function(id) {
  try {
    const docRef = doc(db, "quotes", id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      alert("Estimate not found!");
      return;
    }

    const data = docSnap.data();
    const discountAmount = data.discount ? (data.total * data.discount / 100) : 0;
    const subtotal = data.total - discountAmount + (data.fees || 0);
    
    // Create a new window with the quote content
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Estimate #${id}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #B7410E; }
          .header { display: flex; justify-content: space-between; margin-bottom: 20px; }
          .details { margin-bottom: 20px; }
          .materials-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .materials-table th, .materials-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          .materials-table th { background-color: #f2f2f2; }
          .summary { float: right; width: 300px; border: 1px solid #ddd; padding: 15px; }
          .total { font-weight: bold; font-size: 1.2em; margin-top: 10px; }
          .footer { margin-top: 40px; font-size: 0.9em; color: #666; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Handyman Estimate</h1>
          <div>Date: ${new Date(data.timestamp?.toDate()).toLocaleDateString()}</div>
        </div>
        
        <div class="details">
          <p><strong>Client:</strong> ${data.name || "Unnamed"}</p>
          <p><strong>Location:</strong> ${data.location || "No location"}</p>
          <p><strong>Project:</strong> ${data.project || "Not specified"}</p>
          <p><strong>Contact:</strong> ${data.email || "N/A"} | ${data.phone || "N/A"}</p>
        </div>
        
        <h3>Materials</h3>
        <table class="materials-table">
          <thead>
            <tr>
              <th>Material</th>
              <th>Quantity</th>
              <th>Unit Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${data.materials ? Object.entries(data.materials).map(([name, details]) => `
              <tr>
                <td>${name}</td>
                <td>${details.quantity}</td>
                <td>$${formatAccounting(details.price)}</td>
                <td>$${formatAccounting(details.quantity * details.price)}</td>
              </tr>
            `).join('') : '<tr><td colspan="4">No materials specified</td></tr>'}
          </tbody>
        </table>
        
        <div class="summary">
          <h3>Summary</h3>
          <p>Materials Total: $${formatAccounting(data.materialsTotal || 0)}</p>
          <p>Labor: $${formatAccounting(data.labor || 0)}</p>
          ${data.discount ? `<p>Discount (${data.discount}%): -$${formatAccounting(discountAmount)}</p>` : ''}
          ${data.fees ? `<p>Fees: +$${formatAccounting(data.fees)}</p>` : ''}
          <p class="total">Total Estimate: $${formatAccounting(subtotal)}</p>
          
          <h3>Job Details</h3>
          <p>Estimated Days: ${data.days || 1}</p>
          <p>Number of Workers: ${data.workers || 1}</p>
        </div>
        
        <div class="footer">
          <p>Thank you for your business!</p>
          <p>Generated on ${new Date().toLocaleString()}</p>
        </div>
        
        <script>
          // Print the document after it loads
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 500);
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  } catch (error) {
    console.error("Error generating PDF:", error);
    alert("Failed to generate PDF. Please try again.");
  }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadQuotes();
  document.getElementById('filter-button').addEventListener('click', applyFilter);
  document.getElementById('reset-button').addEventListener('click', resetFilters);
});