// Global variables
let menuItems = [];
let cart = [];
let currentFilter = 'all';

// API URL - change this when deploying
const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'https://your-backend-url.onrender.com';

// Load menu when page loads
document.addEventListener('DOMContentLoaded', () => {
    loadMenu();
    loadPromotions();
    setupEventListeners();
    setDefaultPickupTime();
});

function setupEventListeners() {
    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => {
                b.classList.remove('bg-red-600', 'text-white');
                b.classList.add('bg-gray-200');
            });
            btn.classList.add('bg-red-600', 'text-white');
            btn.classList.remove('bg-gray-200');
            currentFilter = btn.dataset.category;
            displayMenu();
        });
    });
    
    // Checkout button
    document.getElementById('checkout-btn')?.addEventListener('click', showCheckoutModal);
    
    // Modal close
    document.getElementById('close-modal')?.addEventListener('click', hideCheckoutModal);
    
    // Order form submit
    document.getElementById('order-form')?.addEventListener('submit', submitOrder);
}

function setDefaultPickupTime() {
    const pickupInput = document.getElementById('pickup-time');
    if (pickupInput) {
        const now = new Date();
        now.setHours(now.getHours() + 1);
        now.setMinutes(0);
        const formatted = now.toISOString().slice(0, 16);
        pickupInput.value = formatted;
    }
}

async function loadMenu() {
    try {
        const response = await fetch(`${API_URL}/api/menu`);
        menuItems = await response.json();
        displayMenu();
    } catch (error) {
        console.error('Error loading menu:', error);
        document.getElementById('menu-grid').innerHTML = '<p class="text-center col-span-3">Error loading menu. Please try again later.</p>';
    }
}

function displayMenu() {
    const filteredItems = currentFilter === 'all' 
        ? menuItems 
        : menuItems.filter(item => item.category === currentFilter);
    
    const menuGrid = document.getElementById('menu-grid');
    
    if (filteredItems.length === 0) {
        menuGrid.innerHTML = '<p class="text-center col-span-3">No items found in this category.</p>';
        return;
    }
    
    menuGrid.innerHTML = filteredItems.map(item => `
        <div class="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
            <div class="flex justify-between items-start mb-2">
                <h3 class="text-xl font-bold">${escapeHtml(item.name)}</h3>
                <span class="text-red-600 font-bold">$${item.price.toFixed(2)}</span>
            </div>
            <p class="text-gray-600 mb-4">${escapeHtml(item.description)}</p>
            <button onclick="addToCart(${item.id})" class="w-full bg-red-600 text-white py-2 rounded hover:bg-red-700 transition">
                Add to Order
            </button>
        </div>
    `).join('');
}

function addToCart(itemId) {
    const item = menuItems.find(i => i.id === itemId);
    if (!item) return;
    
    const existingItem = cart.find(i => i.id === itemId);
    if (existingItem) {
        existingItem.quantity++;
    } else {
        cart.push({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: 1
        });
    }
    
    updateCartDisplay();
}

function updateCartDisplay() {
    const cartItemsDiv = document.getElementById('cart-items');
    const cartTotalDiv = document.getElementById('cart-total');
    
    if (cart.length === 0) {
        cartItemsDiv.innerHTML = '<p class="text-gray-500 text-center">Your cart is empty</p>';
        cartTotalDiv.classList.add('hidden');
        return;
    }
    
    cartItemsDiv.innerHTML = cart.map(item => `
        <div class="flex justify-between items-center border-b pb-2">
            <div>
                <span class="font-medium">${escapeHtml(item.name)}</span>
                <div class="text-sm text-gray-600">$${item.price.toFixed(2)} each</div>
            </div>
            <div class="flex items-center space-x-3">
                <button onclick="updateQuantity(${item.id}, -1)" class="text-gray-500 hover:text-red-600">−</button>
                <span class="w-8 text-center">${item.quantity}</span>
                <button onclick="updateQuantity(${item.id}, 1)" class="text-gray-500 hover:text-red-600">+</button>
                <button onclick="removeFromCart(${item.id})" class="text-red-600 ml-2">×</button>
            </div>
        </div>
    `).join('');
    
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    document.getElementById('total-amount').textContent = total.toFixed(2);
    cartTotalDiv.classList.remove('hidden');
}

function updateQuantity(itemId, change) {
    const item = cart.find(i => i.id === itemId);
    if (item) {
        item.quantity += change;
        if (item.quantity <= 0) {
            removeFromCart(itemId);
        } else {
            updateCartDisplay();
        }
    }
}

function removeFromCart(itemId) {
    cart = cart.filter(i => i.id !== itemId);
    updateCartDisplay();
}

function showCheckoutModal() {
    if (cart.length === 0) {
        alert('Please add items to your cart first.');
        return;
    }
    document.getElementById('checkout-modal').classList.remove('hidden');
    document.getElementById('checkout-modal').classList.add('flex');
}

function hideCheckoutModal() {
    document.getElementById('checkout-modal').classList.add('hidden');
    document.getElementById('checkout-modal').classList.remove('flex');
}

async function submitOrder(e) {
    e.preventDefault();
    
    const name = document.getElementById('customer-name').value;
    const email = document.getElementById('customer-email').value;
    const phone = document.getElementById('customer-phone').value;
    const pickupTime = document.getElementById('pickup-time').value;
    
    if (!name || !email || !pickupTime) {
        alert('Please fill in all required fields.');
        return;
    }
    
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    const orderData = {
        customer_name: name,
        customer_email: email,
        customer_phone: phone,
        pickup_time: pickupTime,
        items: cart,
        total: total
    };
    
    try {
        const response = await fetch(`${API_URL}/api/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert(`Order placed! Order #${result.orderId}\nConfirmation sent to ${email}`);
            cart = [];
            updateCartDisplay();
            hideCheckoutModal();
            document.getElementById('order-form').reset();
            setDefaultPickupTime();
        } else {
            alert('Error placing order. Please try again.');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error connecting to server. Please try again.');
    }
}

async function loadPromotions() {
    try {
        const response = await fetch(`${API_URL}/api/promotions`);
        const promotions = await response.json();
        
        if (promotions.length > 0) {
            const banner = document.getElementById('promo-banner');
            const promoText = document.getElementById('promo-text');
            promoText.textContent = `${promotions[0].title}: ${promotions[0].content}`;
            banner.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error loading promotions:', error);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}