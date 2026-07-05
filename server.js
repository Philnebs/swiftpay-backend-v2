import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "SwiftPay V2 is running" });
});

app.get("/api/banks", (req, res) => {
  res.json({ 
    status: "success",
    banks: [
      { name: "GTBank", code: "058" },
      { name: "Access Bank", code: "044" },
      { name: "Zenith Bank", code: "057" },
      { name: "UBA", code: "033" },
      { name: "First Bank", code: "011" }
    ]
  });
});
// MOCK ACCOUNT RESOLUTION
app.post("/api/resolve-account", (req, res) => {
  const { accountNumber, bankCode } = req.body;
  console.log("Resolving:", accountNumber, bankCode);
  
  // Mock data - replace with real Monnify/Paystack later
  if (accountNumber.length === 10) {
    res.json({ 
      status: "success", 
      accountName: "TEST USER " + accountNumber.slice(-4) 
    });
  } else {
    res.status(400).json({ status: "error", message: "Invalid account number" });
  }
});

// MOCK TRANSFER
app.post("/api/transfer", express.json(), (req, res) => {
  const { amount, bankCode, accountNumber, accountName } = req.body;
  console.log("Transfer:", req.body);

  // Mock success
  res.json({ 
    status: "success", 
    message: `Transfer of ₦${amount} to ${accountName} successful`, // <-- backticks here
    reference: "SP" + Date.now()
  });
});
