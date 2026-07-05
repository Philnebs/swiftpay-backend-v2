import dotenv from "dotenv";
dotenv.config();
import express from "express";
const app = express();


// IMPORTANT: Webhook must come BEFORE express.json and use raw
app.use('/api/webhook/flutterwave', express.raw({type: 'application/json'}));
app.use(express.json());


app.get("/api/debug", (req, res) => {
  res.json({
    hasPublicKey: !!process.env.FLW_PUBLIC_KEY,
    hasSecretKey: !!process.env.FLW_SECRET_KEY,
    hasSecretHash: !!process.env.FLW_SECRET_HASH
  });
});

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

// 1. CREATE PAYMENT LINK FOR FUNDING - FIXED VERSION
app.post('/api/fund-wallet', async (req, res) => {
  try {
    const { userId, amount, email, name } = req.body;

    if (!userId || !amount || !email || !name) {
      return res.status(400).json({ error: "Missing userId, amount, email, or name" });
    }

    const tx_ref = `SWIFTPAY-${userId}-${Date.now()}`;

    const response = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.FLW_SECRET_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        tx_ref: tx_ref,
        amount: amount,
        currency: "NGN",
        redirect_url: "https://swiftpay.onrender.com/payment-success",
        payment_options: "card, banktransfer, ussd",
        customer: {
          email: email,
          name: name,
          phone_number: "08000000"
        },
        customizations: {
          title: "Fund SwiftPay Wallet",
          description: "Add money to your SwiftPay wallet",
          logo: "https://your-logo-url.com/logo.png"
        }
      })
    });

    const data = await response.json();

    if (data.status === "success") {
      res.json({ 
        status: "success",
        link: data.data.link 
      });
    } else {
      res.status(400).json({ error: data.message });
    }

  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Payment initiation failed" });
  }
});

// 2. WEBHOOK - THIS IS WHERE WE CREDIT WALLET
app.post('/api/webhook/flutterwave', async (req, res) => {
  const secretHash = process.env.FLW_SECRET_HASH;
  const signature = req.headers["verif-hash"];

  if (!signature || signature !== secretHash) {
    return res.status(401).json({error: "Unauthorized"});
  }

  // IMPORTANT: because we used express.raw, we need to parse it
  const payload = JSON.parse(req.body.toString());

  if (payload.event === "charge.completed" && payload.data.status === "successful") {
    const { tx_ref, amount } = payload.data;
    const userId = tx_ref.split('-')[1];

    console.log(`✅ Credited ${amount} to user ${userId}`);
    // HERE: await db.users.updateBalance(userId, amount);
  }

  res.status(200).send("OK");
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
