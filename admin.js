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
import { jsPDF } from 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

// Format numbers as accounting format (x,xxx.00)
function formatAccounting(num) {
  return parseFloat(num || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// Calculate labor cost (total - materials - fees + discount)
function calculateLabor(total, materialsTotal, fees, discount) {
  return (total || 0) - (materialsTotal || 0) - (fees || 0) + (discount || 0);
}

// Generate PDF for individual estimate
window.generatePDF = function(id, data) {
  const doc = new jsPDF();
  
  // PDF Header
  doc.setFontSize(18);
  doc.setTextColor(183, 65, 14);
  doc.text('Handyman Services Estimate', 105, 20, null, null, 'center');
  
  // Client Information
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text(`Client: ${data.name || 'Unnamed'}`, 20, 40);
  doc.text(`Email: ${data.email || 'N/A'}`, 20, 50);
  doc.text(`Phone: ${data.phone || 'N/A'}`, 20, 60);
  doc.text(`Location: ${data.location || 'No location'}`, 20, 70);
  doc.text(`Service: ${data.service || 'Not specified'}`, 20, 80);
  
  // Pricing Details
  doc.text('Materials:', 20, 100);
  let materialsY = 110;
  if (data.materials) {
    Object.entries(data.materials).forEach(([name, details]) => {
      doc.text(`${name}: ${details.quantity} x $${formatAccounting(details.price)} = $${formatAccounting(details.quantity * details.price)}`, 25, materialsY);
      materialsY += 10;
    });
  }
  
  doc.text(`Materials Subtotal: $${formatAccounting(data.materialsTotal)}`, 20, materialsY + 10);
  doc.text(`Labor: $${formatAccounting(data.labor)} (${data.workers || 1} workers x ${data.days || 1} days)`, 20, materialsY + 20);
  doc.text(`Fees: $${formatAccounting(data.fees)}`, 20, materialsY + 30);
  doc.text(`Discount: $${formatAccounting(data.discount)}`, 20, materialsY + 40);
  doc.setFontSize(14);
  doc.text(`Total Estimate: $${formatAccounting(data.total)}`, 20, materialsY + 55);
  
  // Save the PDF
  doc.save(`Estimate-${data.name || 'Unnamed'}-${new Date().toISOString().slice(0,10)}.pdf`);
};

// Load quotes with filtering
async function loadQuotes(filterField = '', filterValue = '') {
  try {
    let q;
    const quotesCollection = collection(db, "quotes");
    
    if (filterField && filterValue) {
      if (['total', 'labor', 'materialsTotal', 'fees', 'discount'].includes(filterField)) {
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
      
      card.innerHTML = `
        <div class="quote-content">
          <div class="quote-header">
            <h3>${data.name || "Unnamed"}</h3>
            <span class="location">${data.location || "No location"}</span>
          </div>
          <div class="quote-details">
            <p><strong>Email:</strong> ${data.email || "N/A"}</p>
            <p><strong>Phone:</strong> ${data.phone || "N/A"}</p>
            <p><strong>Service:</strong> ${data.service || "Not specified"}</p>
            <p><strong>Date:</strong> ${new Date(data.timestamp?.toDate()).toLocaleString() || "Unknown"}</p>
          </div>
          <div class="pricing-details">
            <div class="materials-list">
              <h4>Materials</h4>
              ${materialsList}
            </div>
            <div class="price-summary">
              <p><strong>Materials Total:</strong> $${formatAccounting(data.materialsTotal)}</p>
              <p><strong>Labor:</strong> $${formatAccounting(data.labor)} (${data.workers || 1} workers × ${data.days || 1} days)</p>
              <p><strong>Fees:</strong> $${formatAccounting(data.fees)}</p>
              <p><strong>Discount:</strong> $${formatAccounting(data.discount)}</p>
              <p class="total-price"><strong>Total Estimate:</strong> $${formatAccounting(data.total)}</p>
            </div>
          </div>
        </div>
        <div class="quote-actions">
          <button class="edit-btn" onclick="editQuote('${docSnap.id}')"><i class="fas fa-edit"></i> Edit</button>
          <button class="delete-btn" onclick="deleteQuote('${docSnap.id}')"><i class="fas fa-trash"></i> Delete</button>
          <button class="pdf-btn" onclick="generatePDF('${docSnap.id}', ${JSON.stringify(data).replace(/"/g, '&quot;')})"><i class="fas fa-file-pdf"></i> PDF</button>
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

// Edit quote with all new fields
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
    
    // Service type dropdown options
    const serviceTypes = ['Minor Job', 'Intermediate Job', 'Major Job'];
    const serviceOptions = serviceTypes.map(type => 
      `<option value="${type}" ${data.service === type ? 'selected' : ''}>${type}</option>`
    ).join('');
    
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
          <h4>Service Details</h4>
          <label>Service Type:
            <select id="service-input" required>
              <option value="">-- Select Service Type --</option>
              ${serviceOptions}
            </select>
          </label>
        </div>
        
        <!-- Rest of your form remains the same -->
        ${card.querySelector('.quote-content').innerHTML.includes('materials-container') ? '' : `
        <div class="form-section">
          <h4>Materials</h4>
          <div id="materials-container">
            ${materialsFields}
          </div>
          <button type="button" class="add-material" onclick="addMaterialField()"><i class="fas fa-plus"></i> Add Material</button>
        </div>
        
        <div class="form-section">
          <h4>Labor Details</h4>
          <label>Number of Workers: <input type="number" value="${data.workers || 1}" min="1" step="1" id="workers-input" required></label>
          <label>Number of Days: <input type="number" value="${data.days || 1}" min="1" step="1" id="days-input" required></label>
          <label>Labor Cost: $<input type="number" value="${formatAccounting(data.labor || calculateLabor(data.total, data.materialsTotal, data.fees, data.discount))}" min="0" step="0.01" id="labor-input" required></label>
        </div>
        
        <div class="form-section">
          <h4>Additional Costs</h4>
          <label>Fees: $<input type="number" value="${formatAccounting(data.fees || 0)}" min="0" step="0.01" id="fees-input" required></label>
          <label>Discount: $<input type="number" value="${formatAccounting(data.discount || 0)}" min="0" step="0.01" id="discount-input" required></label>
        </div>
        `}
        
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

// Save quote with all new fields
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
    const service = document.getElementById('service-input').value;
    const workers = parseInt(document.getElementById('workers-input').value);
    const days = parseInt(document.getElementById('days-input').value);
    const fees = parseFloat(document.getElementById('fees-input').value);
    const discount = parseFloat(document.getElementById('discount-input').value);
    
    const total = materialsTotal + labor + fees - discount;
    
    await updateDoc(doc(db, "quotes", id), {
      name: form.querySelector('input[type="text"]').value,
      email: form.querySelector('input[type="email"]').value,
      phone: form.querySelector('input[type="tel"]').value,
      location: form.querySelectorAll('input[type="text"]')[1].value,
      service: service,
      workers: workers,
      days: days,
      materials,
      materialsTotal,
      labor,
      fees,
      discount,
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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadQuotes();
  document.getElementById('filter-button').addEventListener('click', applyFilter);
  document.getElementById('reset-button').addEventListener('click', resetFilters);
});