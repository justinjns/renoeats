const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const cors = require('cors');
const auth = require('basic-auth');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database setup
const db = new sqlite3.Database('./renoeats.db');

// Create tables
db.serialize(() => {
  // Menu items table
  db.run(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      price DECIMAL(5,2) NOT NULL,
      is_available INTEGER DEFAULT 1
    )
  `);

  // Orders table
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT,
      pickup_time TEXT NOT NULL,
      items_json TEXT NOT NULL,
      total DECIMAL(6,2) NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Promotions table
  db.run(`
    CREATE TABLE IF NOT EXISTS promotions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      expires_at TEXT
    )
  `);

  // Insert sample menu items
  db.get("SELECT COUNT(*) as count FROM menu_items", (err, row) => {
    if (row.count === 0) {
      const sampleItems = [
        ['Spicy Tuna Roll', 'Sushi', 'Fresh tuna with spicy mayo', 12.99, 1],
        ['Reno Burger', 'Burgers', 'Double patty with special sauce', 14.99, 1],
        ['Truffle Fries', 'Appetizers', 'Hand-cut fries with truffle oil', 6.99, 1],
        ['Miso Ramen', 'Noodles', 'Pork broth with chashu', 13.99, 1],
        ['Matcha Cheesecake', 'Desserts', 'Japanese-inspired dessert', 7.99, 1],
        ['Sapporo Beer', 'Beverages', 'Japanese import', 5.99, 1]
      ];
      
      const stmt = db.prepare("INSERT INTO menu_items (name, category, description, price, is_available) VALUES (?, ?, ?, ?, ?)");
      sampleItems.forEach(item => stmt.run(item));
      stmt.finalize();
    }
  });
});

// API Routes

// Get all menu items
app.get('/api/menu', (req, res) => {
  db.all("SELECT * FROM menu_items WHERE is_available = 1 ORDER BY category, name", (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Get active promotions
app.get('/api/promotions', (req, res) => {
  db.all("SELECT * FROM promotions WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))", (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Submit an order
app.post('/api/orders', (req, res) => {
  const { customer_name, customer_email, customer_phone, pickup_time, items, total } = req.body;
  
  // Validation
  if (!customer_name || !customer_email || !pickup_time || !items || !total) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const items_json = JSON.stringify(items);
  
  db.run(
    "INSERT INTO orders (customer_name, customer_email, customer_phone, pickup_time, items_json, total) VALUES (?, ?, ?, ?, ?, ?)",
    [customer_name, customer_email, customer_phone, pickup_time, items_json, total],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      const orderId = this.lastID;
      
      // Send confirmation email
      sendConfirmationEmail(orderId, customer_name, customer_email, pickup_time, items, total);
      
      res.json({ success: true, orderId: orderId });
    }
  );
});

// Admin authentication middleware
function requireAuth(req, res, next) {
  const user = auth(req);
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASS || 'RenoEats2026';
  
  if (!user || user.name !== adminUser || user.pass !== adminPass) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Access"');
    return res.status(401).send('Access denied');
  }
  next();
}

// Get all orders (admin only)
app.get('/api/admin/orders', requireAuth, (req, res) => {
  db.all("SELECT * FROM orders ORDER BY created_at DESC", (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Update order status (admin only)
app.put('/api/admin/orders/:id', requireAuth, (req, res) => {
  const { status } = req.body;
  const { id } = req.params;
  
  db.run("UPDATE orders SET status = ? WHERE id = ?", [status, id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ success: true });
  });
});

// Create/update promotion (admin only)
app.post('/api/admin/promotions', requireAuth, (req, res) => {
  const { title, content, is_active, expires_at } = req.body;
  
  db.run(
    "INSERT INTO promotions (title, content, is_active, expires_at) VALUES (?, ?, ?, ?)",
    [title, content, is_active || 1, expires_at || null],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ success: true, id: this.lastID });
    }
  );
});

// Email configuration
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

function sendConfirmationEmail(orderId, name, email, pickupTime, items, total) {
  // Format items for email
  const itemsList = items.map(item => 
    `<li>${item.quantity}x ${item.name} - $${(item.price * item.quantity).toFixed(2)}</li>`
  ).join('');
  
  const mailOptions = {
    from: process.env.EMAIL_USER || 'orders@renoeats.com',
    to: email,
    subject: `Reno Eats Order #${orderId} - Confirmed!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Thank you, ${name}!</h2>
        <p>Your order has been received and is being prepared.</p>
        
        <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Order #${orderId}</h3>
          <p><strong>Pickup Time:</strong> ${new Date(pickupTime).toLocaleString()}</p>
          <ul>${itemsList}</ul>
          <p><strong>Total: $${total.toFixed(2)}</strong></p>
        </div>
        
        <p><strong>Pickup Address:</strong><br>
        123 Reno Street<br>
        Reno, NV 89501</p>
        
        <p>Please have your order number ready when you arrive.</p>
        
        <p>See you soon!<br>
        <strong>Reno Eats Team</strong></p>
      </div>
    `
  };
  
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log('Email error:', error);
    } else {
      console.log('Email sent:', info.response);
    }
  });
}

// Serve admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Reno Eats server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to see your website`);
});