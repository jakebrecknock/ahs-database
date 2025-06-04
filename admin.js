// admin.js
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

// Load all quotes with filtering
async function loadQuotes(filterField = '', filterValue = '') {
  try {
    let q;
    if (filterField && filterValue) {
      q = query(collection(db, "quotes"), where(filterField, ">=", filterValue), where(filterField, "<=", filterValue + '\uf8ff'));
    } else {
      q = collection(db, "quotes");
    }

    const querySnapshot = await getDocs(q);
    const list = document.getElementById("quote-list");
    list.innerHTML = "";

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const card = document.createElement("div");
      card.className = "quote-card";
      card.dataset.id = docSnap.id;
      
      // Format materials list
      const materialsList = data.materials ? 
        Object.entries(data.materials).map(([name, details]) => `
          <div class="material-item">
            <span>${name}</span>
            <span>Qty: ${details.quantity}</span>
            <span>$${details.price} ($${details.quantity * details.price})</span>
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
              <p><strong>Materials Total:</strong> $${data.materialsTotal || "0.00"}</p>
              <p><strong>Labor:</strong> $${data.labor || "0.00"}</p>
              <p class="total-price"><strong>Total Estimate:</strong> $${data.total || "0.00"}</p>
            </div>
          </div>
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

// Edit quote functionality
window.editQuote = async function(id) {
  try {
    const docRef = doc(db, "quotes", id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) return;

    const data = docSnap.data();
    const card = document.querySelector(`.quote-card[data-id="${id}"]`);
    
    // Format materials for editing
    const materialsFields = data.materials ? 
      Object.entries(data.materials).map(([name, details], index) => `
        <div class="material-edit" data-index="${index}">
          <input type="text" value="${name}" placeholder="Material name" required>
          <input type="number" value="${details.quantity}" placeholder="Qty" min="1" step="1" required>
          <input type="number" value="${details.price}" placeholder="Price" min="0" step="0.01" required>
          <button type="button" class="remove-material" onclick="removeMaterialField(this)">×</button>
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
          <h4>Service Details</h4>
          <label>Service Provided: <input type="text" value="${data.service || ''}" required></label>
        </div>
        
        <div class="form-section">
          <h4>Materials</h4>
          <div id="materials-container">
            ${materialsFields}
          </div>
          <button type="button" class="add-material" onclick="addMaterialField()">+ Add Material</button>
        </div>
        
        <div class="form-section">
          <h4>Pricing</h4>
          <label>Labor Cost: $<input type="number" value="${data.labor || ''}" min="0" step="0.01" required></label>
        </div>
        
        <div class="form-buttons">
          <button type="submit" class="save-btn">Save Changes</button>
          <button type="button" class="cancel-btn" onclick="cancelEdit('${id}')">Cancel</button>
        </div>
      </form>
    `;
  } catch (error) {
    console.error("Error editing quote:", error);
  }
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
    <button type="button" class="remove-material" onclick="removeMaterialField(this)">×</button>
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
    const formData = new FormData(form);
    
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
    
    const labor = parseFloat(form.querySelector('input[type="number"]').value);
    const total = materialsTotal + labor;
    
    await updateDoc(doc(db, "quotes", id), {
      name: form.querySelector('input[type="text"]').value,
      email: form.querySelector('input[type="email"]').value,
      phone: form.querySelector('input[type="tel"]').value,
      location: form.querySelectorAll('input[type="text"]')[1].value,
      service: form.querySelectorAll('input[type="text"]')[2].value,
      materials,
      materialsTotal,
      labor,
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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadQuotes();
  document.getElementById('filter-button').addEventListener('click', applyFilter);
});

