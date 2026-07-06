import dotenv from "dotenv";
dotenv.config();
import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import fetch from "node-fetch";

const app = express();

// 1. CONNECT TO MONGODB
mongoose.connect(process.env.MONGO_URL).then(() => console.log("MongoDB Connected")).catch(err => console.log(err));

// USER MODEL
const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  phone: String,
  password: String,
  accountNumber: String,
  accountBank: String,
  balance: { type: Number, default: 0 }
});
const User = mongoose.model("User", UserSchema);

// IMPORTANT: Webhook must come BEFORE express.json and use raw
app.use('/api/webhook/flutterwave', express.raw({type: 'application/json'}));
app.use(express.json());

app.get("/api/debug", (req, res) => {
  res.json({ hasPublicKey:!!process.env.FLW_PUBLIC_KEY, hasSecretKey:!!process.env.FLW_SECRET_KEY, hasSecretHash:!!process.env.FLW_SECRET_HASH });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// 2. SIGNUP ROUTE
app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: "User already exists" });
    const hashedPassword = await bcrypt.hash(password, 10);

    const flwResponse = await fetch("https://api.flutterwave.com/v3/virtual-account-numbers", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.FLW_SECRET_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, bvn: "00000", phonenumber: phone, firstname: name.split(' ')[0], lastname: name.split(' ').slice(1).join(' ') || name.split(' ')[0], narration: "SwiftPay Wallet" })
    });
    const flwData = await flwResponse.json();
    if(flwData.status!== "success") return res.status(400).json({error: flwData.message});

    const newUser = new User({ name, email, phone, password: hashedPassword, accountNumber: flwData.data.account_number, accountBank: flwData.data.bank_name, balance: 0 });
    await newUser.save();
    res.status(201).json({ status: "success", message: "User created", accountNumber: flwData.data.account_number, bankName: flwData.data.bank_name, user: newUser });

  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Signup failed" });
  }
});

// 3. LOGIN ROUTE
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Invalid credentials" });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });
    res.status(200).json({ status: "success", message: "Login successful", user: { id: user._id, name: user.name, accountNumber: user.accountNumber, accountBank: user.accountBank, balance: user.balance } });
  } catch (error) {
    res.status(500).json({ error: "Login failed" });
  }
});

app.get("/api/banks", (req, res) => {
  res.json({ status: "success", data: [ { name: "GTBank", code: "058" }, { name: "Access Bank", code: "044" }, { name: "First Bank", code: "011" } ] });
});

// 4. FUND WALLET
app.post('/api/fund-wallet', async (req, res) => {
  try {
    const { userId, amount, email, name } = req.body;
    if (!userId ||!amount ||!email ||!name) { return res.status(400).json({ error: "Missing userId, amount, email, or name" }); }
    const tx_ref = `SWIFTPAY-${userId}-${Date.now()}`;
    const response = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.FLW_SECRET_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ tx_ref: tx_ref, amount: amount, currency: "NGN", redirect_url: "https://swiftpay.onrender.com/payment-success", payment_options: "card, banktransfer, ussd", customer: { email: email, name: name, phone_number: "08000000" }, customizations: { title: "Fund SwiftPay Wallet", description: "Add money to your SwiftPay wallet", logo: "https://your-logo-url.com/logo.png" } })
    });
    const data = await response.json();
    if (data.status === "success") { res.json({ status: "success", link: data.data.link }); } 
    else { res.status(400).json({ error: data.message }); }
  } catch (error) { console.log(error); res.status(500).json({ error: "Payment initiation failed" }); }
});

// 5. WEBHOOK - CREDIT WALLET
app.post('/api/webhook/flutterwave', async (req, res) => {
  const secretHash = process.env.FLW_SECRET_HASH;
  const signature = req.headers["verif-hash"];
  if (!signature || signature!== secretHash) { return res.status(401).json({error: "Unauthorized"}); }
  const payload = JSON.parse(req.body.toString());
  if (payload.event === "charge.completed" && payload.data.status === "successful") {
    const { tx_ref, amount } = payload.data;
    const userId = tx_ref.split('-')[1];
    await User.findByIdAndUpdate(userId, { $inc: { balance: amount } });
    console.log(`Credited ${amount} to user ${userId}`);
  }
  res.status(200).send("OK");
});

// 6. RESOLVE ACCOUNT
app.post("/api/resolve-account", async (req, res) => {
  const { accountNumber, bankCode } = req.body;
  const response = await fetch(`https://api.flutterwave.com/v3/accounts/resolve`, {
    method: "POST", headers: { "Authorization": `Bearer ${process.env.FLW_SECRET_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ account_number: accountNumber, account_bank: bankCode })
  });
  const data = await response.json();
  res.json(data);
});

// 7. TRANSFER
app.post("/api/transfer", (req, res) => {
  const { amount, bankCode, accountNumber, accountName } = req.body;
  console.log("Transfer:", req.body);
  res.json({ status: "success", message: `Transfer of ₦${amount} to ${accountName} successful`, reference: "SP" + Date.now() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
