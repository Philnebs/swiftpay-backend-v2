import express from "express";
const app = express();

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/banks", (req, res) => {
  res.json({ 
    status: "success", 
    data: [
      { name: "GTBank", code: "058" },
      { name: "Access Bank", code: "044" },
      { name: "First Bank", code: "011" }
    ]
  });
});

const Flutterwave = require('flutterwave-node-v3');
const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);

// 1. CREATE PAYMENT LINK FOR FUNDING
app.post('/api/fund-wallet', async (req, res) => {
  try {
    const { userId, amount, email, name } = req.body;

    const payload = {
      tx_ref: `SWIFTPAY-${userId}-${Date.now()}`,
      amount: amount,
      currency: "NGN",
      redirect_url: "https://swiftpay.onrender.com/payment-success",
      customer: {
        email: email,
        name: name,
      },
      customizations: {
        title: "Fund SwiftPay Wallet",
        description: "Add money to your SwiftPay wallet",
        logo: "https://your-logo-url.com/logo.png"
      }
    };

    const response = await flw.Payment.initiate(payload);
    res.json({ link: response.data.link });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. WEBHOOK - THIS IS WHERE WE CREDIT WALLET
app.post('/api/webhook/flutterwave', async (req, res) => {
  const secretHash = process.env.FLW_SECRET_HASH;
  const signature = req.headers["verif-hash"];

  if (signature!== secretHash) {
    return res.status(401).end();
  }

  const payload = req.body;

  if (payload.event === "charge.completed" && payload.data.status === "successful") {
    const { tx_ref, amount, customer } = payload.data;

    // Extract userId from tx_ref: SWIFTPAY-userId-timestamp
    const userId = tx_ref.split('-')[1];

    // CREDIT USER WALLET HERE
    // await db.users.updateBalance(userId, amount);
    console.log(`Credited ${amount} to user ${userId}`);
  }

  res.status(200).end();
});

app.post("/api/resolve-account", (req, res) => {
  const { accountNumber, bankCode } = req.body;
  console.log("Resolving:", accountNumber, bankCode);
  
  if (accountNumber.length === 10) {
    res.json({ 
      status: "success", 
      accountName: "TEST USER " + accountNumber.slice(-4) 
    });
  } else {
    res.status(400).json({ status: "error", message: "Invalid account number" });
  }
});

app.post("/api/transfer", (req, res) => {
  const { amount, bankCode, accountNumber, accountName } = req.body;
  console.log("Transfer:", req.body);
  
  res.json({ 
    status: "success", 
    message: `Transfer of ₦${amount} to ${accountName} successful`,
    reference: "SP" + Date.now()
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
