import { db } from './firebase.js';
import {
  collection,
  getDocs,
  getDoc,
  deleteDoc,
  doc,
  updateDoc
} from 'https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js';

// Password Protection
const ADMIN_PASSWORD = "AHS-ADMIN"; // Change this to your desired password
function checkAuth() {
  const storedAuth = localStorage.getItem('handymanAuth');
  if (storedAuth === ADMIN_PASSWORD) return true;
  
  const password = prompt("Please enter the admin password:");
  if (password === ADMIN_PASSWORD) {
    localStorage.setItem('handymanAuth', password);
    return true;
  }
  
  alert("Incorrect password. Access denied.");
  window.location.href = "about:blank"; // Redirect to blank page
  return false;
}

// Format phone number with hyphens
function formatPhoneNumber(phone) {
  if (!phone) return '';
  // Remove all non-digit characters
  const cleaned = ('' + phone).replace(/\D/g, '');
  // Format as xxx-xxx-xxxx
  const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
  if (match) {
    return match[1] + '-' + match[2] + '-' + match[3];
  }
  return phone; // Return original if not 10 digits
}

// Format currency
const formatMoney = (num) => parseFloat(num || 0).toLocaleString('en-US', {
  style: 'currency',
  currency: 'USD'
});

// Search quotes by name, location, or project
async function searchQuotes(searchText) {
  const quotesRef = collection(db, "quotes");
  const snapshot = await getDocs(quotesRef);
  
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(quote => {
      const searchStr = `${quote.name||''} ${quote.location||''} ${quote.project||''}`.toLowerCase();
      return searchStr.includes(searchText.toLowerCase());
    });
}

// Sort quotes based on selected option
function sortQuotes(quotes, sortOption) {
  switch(sortOption) {
    case 'date-newest':
      return [...quotes].sort((a, b) => b.timestamp?.toDate() - a.timestamp?.toDate());
    case 'date-oldest':
      return [...quotes].sort((a, b) => a.timestamp?.toDate() - b.timestamp?.toDate());
    case 'price-high':
      return [...quotes].sort((a, b) => (b.total || 0) - (a.total || 0));
    case 'price-low':
      return [...quotes].sort((a, b) => (a.total || 0) - (b.total || 0));
    case 'name-asc':
      return [...quotes].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    case 'name-desc':
      return [...quotes].sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    default:
      return quotes;
  }
}

// Calculate materials total
function calcMaterialsTotal(materials) {
  if (!materials) return 0;
  return Object.values(materials).reduce((total, item) => 
    total + (item.price * item.quantity), 0);
}

// Load quotes with optional search and sort
async function loadQuotes(searchTerm = '', sortOption = 'date-newest') {
  try {
    const list = document.getElementById("quote-list");
    list.innerHTML = "<div class='loading'><i class='fas fa-spinner fa-spin'></i> Loading estimates...</div>";
    
    let quotes = searchTerm 
      ? await searchQuotes(searchTerm)
      : (await getDocs(collection(db, "quotes"))).docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Sort the quotes
    quotes = sortQuotes(quotes, sortOption);

    if (quotes.length === 0) {
      list.innerHTML = `<div class="no-results"><i class="fas fa-info-circle"></i> ${searchTerm ? 'No matches found' : 'No estimates yet'}</div>`;
      return;
    }

    list.innerHTML = '';
    quotes.forEach(quote => {
      const materialsTotal = calcMaterialsTotal(quote.materials);
      const labor = quote.labor || (quote.total - materialsTotal);
      const discountAmount = (quote.discount || 0) * (materialsTotal + labor + (quote.fees || 0)) / 100;
      const finalTotal = (materialsTotal + labor + (quote.fees || 0)) - discountAmount;
      
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
            <span><i class="fas fa-map-marker-alt"></i> ${quote.location || "No Location"}</span>
            <span><i class="fas fa-calendar"></i> ${new Date(quote.timestamp?.toDate()).toLocaleDateString()}</span>
          </div>
          
          <div class="contact-info">
            ${quote.email ? `<p><i class="fas fa-envelope"></i> ${quote.email}</p>` : ''}
            ${quote.phone ? `<p><i class="fas fa-phone"></i> ${formatPhoneNumber(quote.phone)}</p>` : ''}
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
          <button class="action-btn edit-btn" onclick="editQuote('${quote.id}')">
            <i class="fas fa-edit"></i> Edit
          </button>
          <button class="action-btn pdf-btn" onclick="window.generatePDF('${quote.id}')">
            <i class="fas fa-file-pdf"></i> PDF
          </button>
          <button class="action-btn delete-btn" onclick="deleteQuote('${quote.id}')">
            <i class="fas fa-trash"></i> Delete
          </button>
        </div>
      `;
      list.appendChild(card);
    });
  } catch (error) {
    console.error("Error:", error);
    document.getElementById("quote-list").innerHTML = 
      '<div class="error"><i class="fas fa-exclamation-triangle"></i> Failed to load estimates</div>';
  }
}

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
        <h3><i class="fas fa-edit"></i> Edit Estimate</h3>
        
        <div class="form-section">
          <h4>Client Information</h4>
          <div class="form-group">
            <label><i class="fas fa-user"></i> Client Name</label>
            <input type="text" value="${data.name || ''}" id="name-input" required>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label><i class="fas fa-envelope"></i> Email</label>
              <input type="email" value="${data.email || ''}" id="email-input">
            </div>
            <div class="form-group">
              <label><i class="fas fa-phone"></i> Phone</label>
              <input type="tel" value="${formatPhoneNumber(data.phone) || ''}" id="phone-input" pattern="[0-9]{3}-[0-9]{3}-[0-9]{4}" placeholder="123-456-7890">
            </div>
          </div>
          <div class="form-group">
            <label><i class="fas fa-map-marker-alt"></i> Location</label>
            <input type="text" value="${data.location || ''}" id="location-input" required>
          </div>
        </div>
        
        <div class="form-section">
          <h4>Project Details</h4>
          <div class="form-group">
            <label><i class="fas fa-project-diagram"></i> Project Name</label>
            <input type="text" value="${data.project || ''}" id="project-input" required>
          </div>
        </div>
        
        <div class="form-section">
          <h4>Materials</h4>
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
        
        <div class="form-section">
          <h4>Pricing</h4>
          <div class="form-group">
            <label><i class="fas fa-tools"></i> Labor Cost</label>
            <input type="number" value="${labor}" min="0" step="0.01" id="labor-input" required>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label><i class="fas fa-percentage"></i> Discount (%)</label>
              <input type="number" value="${data.discount || 0}" min="0" max="100" id="discount-input">
            </div>
            <div class="form-group">
              <label><i class="fas fa-dollar-sign"></i> Fees ($)</label>
              <input type="number" value="${data.fees || 0}" min="0" step="0.01" id="fees-input">
            </div>
          </div>
        </div>
        
        <div class="form-section">
          <h4>Job Details</h4>
          <div class="form-row">
            <div class="form-group">
              <label><i class="fas fa-calendar-day"></i> Days Needed</label>
              <input type="number" value="${data.days || 1}" min="1" id="days-input">
            </div>
            <div class="form-group">
              <label><i class="fas fa-users"></i> Workers</label>
              <input type="number" value="${data.workers || 1}" min="1" id="workers-input">
            </div>
          </div>
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

    // Add phone number formatting
    const phoneInput = card.querySelector('#phone-input');
    phoneInput.addEventListener('input', function(e) {
      // Remove non-digit characters
      let value = this.value.replace(/\D/g, '');
      // Format as xxx-xxx-xxxx
      if (value.length > 3 && value.length <= 6) {
        value = value.slice(0, 3) + '-' + value.slice(3);
      } else if (value.length > 6) {
        value = value.slice(0, 3) + '-' + value.slice(3, 6) + '-' + value.slice(6, 10);
      }
      this.value = value;
    });
  } catch (error) {
    console.error("Error:", error);
    alert("Failed to load estimate for editing");
  }
};

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

window.saveQuote = async function(id) {
  try {
    const form = document.querySelector(`.quote-card[data-id="${id}"] .edit-form`);
    const materials = {};
    
    form.querySelectorAll('.material-edit-item').forEach(item => {
      const inputs = item.querySelectorAll('input');
      const name = inputs[0].value.trim();
      if (name) {
        materials[name] = {
          quantity: parseFloat(inputs[1].value) || 1,
          price: parseFloat(inputs[2].value) || 0
        };
      }
    });
    
    const materialsTotal = Object.values(materials).reduce((sum, item) => 
      sum + (item.price * item.quantity), 0);
    const labor = parseFloat(document.getElementById('labor-input').value);
    const discount = parseFloat(document.getElementById('discount-input').value) || 0;
    const fees = parseFloat(document.getElementById('fees-input').value) || 0;
    
    const subtotal = materialsTotal + labor;
    const discountAmount = (subtotal + fees) * discount / 100;
    const total = (subtotal + fees) - discountAmount;
    
    // Clean phone number before saving (remove hyphens)
    const phone = document.getElementById('phone-input').value.replace(/\D/g, '');
    
    await updateDoc(doc(db, "quotes", id), {
      name: document.getElementById('name-input').value.trim(),
      email: document.getElementById('email-input').value.trim(),
      phone: phone,
      location: document.getElementById('location-input').value.trim(),
      project: document.getElementById('project-input').value.trim(),
      materials,
      materialsTotal,
      labor,
      discount,
      fees,
      days: parseInt(document.getElementById('days-input').value) || 1,
      workers: parseInt(document.getElementById('workers-input').value) || 1,
      total,
      lastUpdated: new Date()
    });
    
    loadQuotes();
  } catch (error) {
    console.error("Error:", error);
    alert("Failed to save changes");
  }
};

window.cancelEdit = function(id) {
  loadQuotes();
};

window.deleteQuote = async function(id) {
  if (!confirm("Permanently delete this estimate?")) return;
  try {
    await deleteDoc(doc(db, "quotes", id));
    loadQuotes();
  } catch (error) {
    console.error("Error:", error);
    alert("Failed to delete estimate");
  }
};

window.generatePDF = async function(id) {
  try {
    const docRef = doc(db, "quotes", id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      alert("Estimate not found!");
      return;
    }

    const data = docSnap.data();
    const materialsTotal = calcMaterialsTotal(data.materials);
    const labor = data.labor || (data.total - materialsTotal);
    const discountAmount = (data.discount || 0) * (materialsTotal + labor) / 100;
    const finalTotal = (materialsTotal + labor) - discountAmount + (data.fees || 0);
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Estimate #${id.substring(0, 8)}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500&display=swap');
          body { font-family: 'Roboto', sans-serif; padding: 25px; color: #333; line-height: 1.6; }
          .header { display: flex; justify-content: space-between; margin-bottom: 20px; }
          .company { color: #B7410E; font-size: 24px; font-weight: 500; }
          .address { font-size: 14px; color: #666; margin-top: 5px; }
          .title { font-size: 28px; color: #B7410E; margin: 25px 0; border-bottom: 2px solid #FF7F50; padding-bottom: 10px; }
          .client-info { margin-bottom: 30px; }
          .client-info p { margin: 8px 0; }
          .section-title { background: #FF7F50; color: white; padding: 10px 15px; margin: 25px 0 15px; border-radius: 4px; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th { background: #f5f5f5; text-align: left; padding: 12px; font-weight: 500; }
          td { padding: 12px; border-bottom: 1px solid #eee; }
          .total-row { font-weight: bold; font-size: 1.1em; }
          .job-details { display: flex; gap: 20px; margin-top: 30px; }
          .detail-box { border: 1px solid #ddd; padding: 15px; border-radius: 6px; flex: 1; text-align: center; }
          .footer { margin-top: 50px; font-size: 14px; text-align: center; color: #777; border-top: 1px solid #eee; padding-top: 20px; }
          .text-center { text-align: center; }
          .material-name { width: 40%; }
          .material-numbers { width: 20%; text-align: right; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="company">ACE Handyman Services</div>
            <div class="address">207 N. Harlem Ave., Oak Park IL., 60302</div>
          </div>
          <div>Estimate #${id.substring(0, 8)}</div>
        </div>
        
        <h1 class="title">Project Estimate</h1>
        
        <div class="client-info">
          <p><strong>Client:</strong> ${data.name || "Not specified"}</p>
          <p><strong>Project:</strong> ${data.project || "General work"}</p>
          <p><strong>Location:</strong> ${data.location || "Not specified"}</p>
          ${data.email ? `<p><strong>Email:</strong> ${data.email}</p>` : ''}
          ${data.phone ? `<p><strong>Phone:</strong> ${formatPhoneNumber(data.phone)}</p>` : ''}
          <p><strong>Date:</strong> ${new Date(data.timestamp?.toDate()).toLocaleDateString()}</p>
        </div>
        
        <div class="section-title">Materials</div>
        <table>
          <thead>
            <tr>
              <th class="material-name">Item</th>
              <th class="material-numbers">Qty</th>
              <th class="material-numbers">Unit Price</th>
              <th class="material-numbers">Total</th>
            </tr>
          </thead>
          <tbody>
            ${data.materials ? Object.entries(data.materials).map(([name, item]) => `
              <tr>
                <td>${name}</td>
                <td class="material-numbers">${item.quantity}</td>
                <td class="material-numbers">${formatMoney(item.price)}</td>
                <td class="material-numbers">${formatMoney(item.price * item.quantity)}</td>
              </tr>
            `).join('') : '<tr><td colspan="4" class="text-center">No materials specified</td></tr>'}
          </tbody>
        </table>
        
        <div class="section-title">Summary</div>
        <table>
          <tr>
            <td>Materials Subtotal</td>
            <td class="material-numbers">${formatMoney(materialsTotal)}</td>
          </tr>
          <tr>
            <td>Labor</td>
            <td class="material-numbers">${formatMoney(labor)}</td>
          </tr>
          ${data.discount ? `
          <tr>
            <td>Discount (${data.discount}%)</td>
            <td class="material-numbers">-${formatMoney(discountAmount)}</td>
          </tr>` : ''}
          ${data.fees ? `
          <tr>
            <td>Fees</td>
            <td class="material-numbers">+${formatMoney(data.fees)}</td>
          </tr>` : ''}
          <tr class="total-row">
            <td>TOTAL ESTIMATE</td>
            <td class="material-numbers">${formatMoney(finalTotal)}</td>
          </tr>
        </table>
        
        <div class="job-details">
          <div class="detail-box">
            <strong>Estimated Duration</strong><br>
            ${data.days || 1} day${data.days !== 1 ? 's' : ''}
          </div>
          <div class="detail-box">
            <strong>Workers Required</strong><br>
            ${data.workers || 1}
          </div>
        </div>
        
        <div class="footer">
          <p>Thank you for choosing ACE Handyman Services!</p>
          <p>Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
        </div>
      </body>
      </html>
    `;

    // Create a Blob with the HTML content
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    
    // Create a download link and trigger it
    const a = document.createElement('a');
    a.href = url;
    a.download = `ACE_Estimate_${id.substring(0, 8)}.html`; // Saves as HTML file that can be opened in Word
    document.body.appendChild(a);
    a.click();
    
    // Clean up
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  } catch (error) {
    console.error("Error generating PDF:", error);
    alert("Failed to generate document");
  }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  if (!checkAuth()) return;
  
  loadQuotes();
  
  // Search functionality
  const searchInput = document.getElementById('search-input');
  const searchBtn = document.getElementById('search-button');
  
  searchBtn.addEventListener('click', () => {
    if (searchInput.value.trim()) {
      loadQuotes(searchInput.value.trim(), document.getElementById('sort-select').value);
    }
  });
  
  document.getElementById('reset-button').addEventListener('click', () => {
    searchInput.value = '';
    loadQuotes('', document.getElementById('sort-select').value);
  });
  
  searchInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') searchBtn.click();
  });
  
  // Sort functionality
  document.getElementById('sort-select').addEventListener('change', (e) => {
    loadQuotes(searchInput.value.trim(), e.target.value);
  });
});