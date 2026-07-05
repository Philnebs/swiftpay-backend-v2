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
